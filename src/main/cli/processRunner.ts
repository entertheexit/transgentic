import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { StringDecoder } from 'node:string_decoder';
import fs from 'node:fs';

// Return fixed messages, never native log contents: diagnostics may contain
// credentials, request text, or project data.
export function cliDiagnosticMessage(text: string): string | undefined {
  if (/individual quota reached|quota (?:has been )?exhausted|insufficient_quota/i.test(text)) return 'CLI provider quota exhausted. Wait for the account quota to reset or select another model/account in the native CLI.';
  if (/authentication required|not logged in|not signed in|invalid_grant|login required/i.test(text)) return 'CLI authentication required. Sign in using its native CLI, then recheck.';
  if (/sandbox_init.*operation not permitted/i.test(text)) return 'CLI permission sandbox could not start. Restart Transgentic outside a nested process sandbox.';
  if (/failed to initialize thread persistence.*operation not permitted/i.test(text)) return 'CLI could not initialize native thread storage under the permission sandbox. Check CLI compatibility.';
  return undefined;
}

function diagnosticTail(file: string): string {
  let fd: number | undefined;
  try {
    fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
    const stat = fs.fstatSync(fd);
    if (!stat.isFile()) return '';
    const size = Math.min(stat.size, 8192);
    const buffer = Buffer.alloc(size);
    const count = fs.readSync(fd, buffer, 0, size, stat.size - size);
    return buffer.subarray(0, count).toString('utf8');
  } catch { return ''; }
  finally { if (fd !== undefined) fs.closeSync(fd); }
}

export class JsonLineDecoder {
  private decoder = new StringDecoder('utf8');
  private buffer = '';
  constructor(private receive: (value: any) => void, private maxBytes = 4 * 1024 * 1024) {}
  push(chunk: Buffer) {
    this.buffer += this.decoder.write(chunk);
    if (Buffer.byteLength(this.buffer) > this.maxBytes) throw new Error('CLI protocol event exceeds the size limit.');
    let end: number;
    while ((end = this.buffer.indexOf('\n')) >= 0) {
      const line = this.buffer.slice(0, end).trim(); this.buffer = this.buffer.slice(end + 1);
      if (line) this.receive(JSON.parse(line));
    }
  }
  finish() {
    this.buffer += this.decoder.end();
    if (this.buffer.trim()) this.receive(JSON.parse(this.buffer));
    this.buffer = '';
  }
}

export class CliProcess {
  readonly child: ChildProcessWithoutNullStreams;
  readonly closed: Promise<void>;
  private pending = new Map<number, { resolve: (v: any) => void; reject: (e: Error) => void }>();
  private sequence = 0;
  private stopped = false;
  private completed = false;
  private failure?: Error;
  private timer: ReturnType<typeof setTimeout>;
  private killTimer?: ReturnType<typeof setTimeout>;
  private diagnosticTimer?: ReturnType<typeof setInterval>;
  private stderr = '';
  private handlers = new Set<(event: any) => void>();
  private failureHandlers = new Set<(error: Error) => void>();
  onRequest?: (method: string, params: any) => Promise<any>;
  constructor(command: string, args: string[], options: { cwd: string; env: NodeJS.ProcessEnv; timeoutMs: number; signal?: AbortSignal; diagnosticFile?: string }) {
    this.child = spawn(command, args, { cwd: options.cwd, env: options.env, shell: false, windowsHide: true, detached: process.platform !== 'win32', stdio: ['pipe', 'pipe', 'pipe'] });
    const decoder = new JsonLineDecoder(event => this.receive(event));
    this.timer = setTimeout(() => this.fail(new Error('CLI request timed out.')), options.timeoutMs);
    if (options.diagnosticFile) {
      const diagnosticFile = options.diagnosticFile;
      this.diagnosticTimer = setInterval(() => {
        const quotaFailure = diagnosticTail(diagnosticFile).split('\n').find(line =>
          /^[IWEF]\d{4} .*\brun\.go:\d+\] Run: attempt \d+ failed \(RESOURCE_EXHAUSTED \(code 429\): Individual quota reached\b/.test(line));
        // Startup logs can include transient authentication states before the
        // cached login finishes, and prompt text can mention quota errors. Only
        // a native hard-quota retry diagnostic is terminal mid-run.
        if (quotaFailure) this.fail(new Error(cliDiagnosticMessage(quotaFailure)!));
      }, 1000);
      this.diagnosticTimer.unref();
    }
    const abort = () => { const err = new Error('CLI request cancelled.'); err.name = 'AbortError'; this.fail(err); };
    options.signal?.addEventListener('abort', abort, { once: true });
    if (options.signal?.aborted) abort();
    this.child.stdout.on('data', chunk => { try { decoder.push(chunk); } catch { this.fail(new Error('CLI emitted invalid structured output.')); } });
    this.child.stderr.on('data', chunk => { this.stderr = (this.stderr + chunk.toString()).slice(-8192); });
    this.child.stdin.on('error', () => this.fail(new Error('CLI input stream closed unexpectedly.')));
    this.child.on('error', () => this.fail(new Error('CLI executable could not be started.')));
    this.closed = new Promise(resolve => this.child.on('close', code => {
      clearTimeout(this.timer);
      clearInterval(this.diagnosticTimer);
      options.signal?.removeEventListener('abort', abort);
      if (!this.stopped) {
        try { decoder.finish(); } catch { this.fail(new Error('CLI output ended with an invalid event.')); }
        if (code !== 0) this.fail(new Error(cliDiagnosticMessage(this.stderr) || `CLI process exited unsuccessfully (${code ?? 'signal'}). Check the native CLI installation and logs.`));
        else if (!this.completed) this.fail(new Error('CLI process ended before completion.'), false);
      }
      resolve();
    }));
  }
  markComplete() { this.completed = true; }
  async waitForExit() { await this.closed; if (this.failure) throw this.failure; }
  private receive(event: any) {
    if (!event || typeof event !== 'object') throw new Error('Invalid CLI event.');
    if (event.method && event.id !== undefined) {
      void Promise.resolve().then(() => this.onRequest ? this.onRequest(event.method, event.params) : Promise.reject(new Error('Unsupported CLI callback.')))
        .then(result => this.write({ jsonrpc: '2.0', id: event.id, result }))
        .catch(() => this.write({ jsonrpc: '2.0', id: event.id, error: { code: -32601, message: 'Operation is unavailable under the configured CLI permissions.' } }));
    } else if (typeof event.id === 'number' && this.pending.has(event.id)) {
      const promise = this.pending.get(event.id)!; this.pending.delete(event.id);
      if (event.error) promise.reject(new Error('CLI protocol request failed. Check CLI authentication, model and compatibility.'));
      else promise.resolve(event.result);
    } else for (const receive of this.handlers) receive(event);
  }
  write(value: any) { if (!this.stopped && !this.child.stdin.destroyed) this.child.stdin.write(JSON.stringify(value) + '\n'); }
  request(method: string, params: any): Promise<any> {
    if (this.failure) return Promise.reject(this.failure);
    const id = ++this.sequence;
    return new Promise((resolve, reject) => { this.pending.set(id, { resolve, reject }); this.write({ jsonrpc: '2.0', id, method, params }); });
  }
  onEvent(handler: (event: any) => void) { this.handlers.add(handler); return () => this.handlers.delete(handler); }
  onFailure(handler: (err: Error) => void) { this.failureHandlers.add(handler); if (this.failure) handler(this.failure); return () => this.failureHandlers.delete(handler); }
  private fail(error: Error, terminate = true) {
    if (this.failure || this.stopped) return;
    this.failure = error;
    for (const p of this.pending.values()) p.reject(error); this.pending.clear();
    for (const handler of this.failureHandlers) handler(error);
    if (terminate) this.stop();
  }
  stop() {
    if (this.stopped) return; this.stopped = true; clearTimeout(this.timer);
    clearInterval(this.diagnosticTimer);
    for (const p of this.pending.values()) p.reject(this.failure || new Error('CLI process stopped.')); this.pending.clear();
    const kill = (signal: NodeJS.Signals) => {
      try { if (this.child.pid && process.platform !== 'win32') process.kill(-this.child.pid, signal); else this.child.kill(signal); } catch {}
    };
    kill('SIGTERM');
    this.killTimer = setTimeout(() => kill('SIGKILL'), 1500); this.killTimer.unref();
  }
}
