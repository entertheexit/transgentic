import { describe, it, expect } from 'vitest';
import { CliProcess, cliDiagnosticMessage } from '../src/main/cli/processRunner.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { adapterArgs, executeAdapter } from '../src/main/cli/adapters.js';
const policy = { cwd: process.cwd(), allowProjectEditing: false, allowCommands: false };
function launch(script: string, signal?: AbortSignal) {
  return new CliProcess(process.execPath, ['-e', script], { cwd: process.cwd(), env: {}, timeoutMs: 2000, signal });
}
describe('CLI process completion and cancellation', () => {
  it('classifies native failures without returning log contents or credentials', () => {
    expect(cliDiagnosticMessage('Individual quota reached. secret-token')).toContain('quota exhausted');
    expect(cliDiagnosticMessage('failed to initialize thread persistence: Operation not permitted')).toContain('thread storage');
    expect(cliDiagnosticMessage('sandbox_init: Operation not permitted')).toContain('sandbox could not start');
    expect(cliDiagnosticMessage('Failed to read auth configuration')).toBeUndefined();
    expect(cliDiagnosticMessage('not logged in secret-token')).not.toContain('secret-token');
    expect(cliDiagnosticMessage('429 temporarily rate limited, retrying')).toBeUndefined();
  });
  it('stops hard quota retries from a request-scoped native log', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tg-cli-diagnostic-'));
    const file = path.join(root, 'native.log');
    fs.writeFileSync(file, 'I0930 04:49:36.115980 80 run.go:387] Run: attempt 1 failed (RESOURCE_EXHAUSTED (code 429): Individual quota reached. private request text), retrying in 4s');
    const proc = new CliProcess(process.execPath, ['-e', 'setInterval(()=>{}, 1000)'], { cwd: root, env: {}, timeoutMs: 5000, diagnosticFile: file });
    try {
      await expect(executeAdapter('cli_antigravity', proc, { prompt: 'x', policy })).rejects.toThrow('quota exhausted');
      await proc.closed;
    } finally { proc.stop(); await proc.closed; fs.rmSync(root, { recursive: true, force: true }); }
  });
  it.each([false, true])('ignores transient login messages and diagnostic symlinks (symlink=%s)', async symlink => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tg-cli-diagnostic-'));
    const file = path.join(root, 'native.log');
    const outside = path.join(root, 'other.log');
    fs.writeFileSync(outside, 'Individual quota reached.');
    if (symlink) fs.symlinkSync(outside, file);
    else fs.writeFileSync(file, 'not logged in; loading cached login\nUser prompt: explain Individual quota reached.');
    const proc = new CliProcess(process.execPath, ['-e', `process.stdin.resume(); setTimeout(()=>{console.log(JSON.stringify({type:'turn.completed'}));},1200);`], { cwd: root, env: {}, timeoutMs: 5000, diagnosticFile: file });
    try { await executeAdapter('cli_codex', proc, { prompt: 'x', policy }); await proc.waitForExit(); }
    finally { proc.stop(); await proc.closed; fs.rmSync(root, { recursive: true, force: true }); }
  });
  it('passes image attachments through Codex native --image flags and references documents read-only', () => {
    const attachments: any[] = [
      { path: '/scratch/ref.png', name: 'ref.png', mimeType: 'image/png', kind: 'image', size: 1, sha256: 'a' },
      { path: '/scratch/spec.pdf', name: 'spec.pdf', mimeType: 'application/pdf', kind: 'document', size: 1, sha256: 'b' },
    ];
    const args = adapterArgs('cli_codex', { prompt: 'inspect', policy, attachments });
    expect(args).toContain('--image=/scratch/ref.png');
    expect(args).not.toContain('/scratch/spec.pdf');
  });
  it('does not mistake reconnect notices for terminal Codex failures', async () => {
    const proc = launch(`process.stdin.resume(); console.log(JSON.stringify({type:'error',message:'Reconnecting 1/5'}));console.log(JSON.stringify({type:'thread.started',thread_id:'owned'}));console.log(JSON.stringify({type:'item.completed',item:{type:'agent_message',text:'answer'}}));console.log(JSON.stringify({type:'turn.completed'}));`);
    try { expect(await executeAdapter('cli_codex', proc, { prompt: 'x', policy })).toMatchObject({ text: 'answer', sessionId: 'owned' }); await proc.waitForExit(); }
    finally { proc.stop(); }
  });
  it('rejects a failed exit even after a terminal result', async () => {
    const proc = launch(`process.stdin.resume();console.log(JSON.stringify({type:'turn.completed'}));process.exitCode=2;`);
    try { await executeAdapter('cli_codex', proc, { prompt: 'x', policy }); await expect(proc.waitForExit()).rejects.toThrow('unsuccessfully'); }
    finally { proc.stop(); }
  });
  it('rejects a partial answer without a completion event', async () => {
    const proc = launch(`process.stdin.resume();console.log(JSON.stringify({type:'item.completed',item:{type:'agent_message',text:'partial'}}));`);
    try { await expect(executeAdapter('cli_codex', proc, { prompt: 'x', policy })).rejects.toThrow('before completion'); }
    finally { proc.stop(); }
  });
  it('cancels the owned process promptly', async () => {
    const controller = new AbortController(); const proc = launch('setInterval(()=>{}, 1000)', controller.signal);
    const task = executeAdapter('cli_codex', proc, { prompt: 'x', policy }); controller.abort();
    await expect(task).rejects.toMatchObject({ name: 'AbortError' }); await proc.closed;
    expect(proc.child.signalCode).toBe('SIGTERM');
  });
});
describe('Grok ACP adapter', () => {
  it('uses an explicit session and denies ungranted edits and host callbacks', async () => {
    let event: (event: any) => void = () => {};
    const calls: string[] = [];
    const proc: any = {
      onEvent(fn: any) { event = fn; return () => {}; },
      async request(method: string, params: any) {
        calls.push(method);
        if (method === 'initialize') { expect(params.clientCapabilities).toEqual({ fs: { readTextFile: false, writeTextFile: false }, terminal: false }); return { authMethods: [{ id: 'cached_token' }] }; }
        if (method === 'session/load') { expect(params.sessionId).toBe('owned'); expect(params.mcpServers).toEqual([]); return {}; }
        if (method === 'session/prompt') {
          expect(await proc.onRequest('session/request_permission', { toolCall: { kind: 'edit' }, options: [{ kind: 'allow_once', optionId: 'yes' }] })).toEqual({ outcome: { outcome: 'cancelled' } });
          await expect(proc.onRequest('fs/read_text_file', {})).rejects.toThrow('not exposed');
          await expect(proc.onRequest('fs/write_text_file', {})).rejects.toThrow('not exposed');
          event({ method: 'session/update', params: { sessionId: 'other', update: { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'wrong scope' } } } });
          event({ method: 'session/update', params: { sessionId: 'owned', update: { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'answer' } } } });
          return { stopReason: 'end_turn' };
        }
        return {};
      },
    };
    expect(await executeAdapter('cli_grok', proc, { prompt: 'x', policy, sessionId: 'owned' })).toEqual({ text: 'answer', sessionId: 'owned', permissionDenied: true });
    expect(calls).toEqual(['initialize', 'authenticate', 'session/load', 'session/prompt']);
  });

  it('negotiates ACP image capability before sending native image blocks', async () => {
    const calls: any[] = [];
    const proc: any = {
      onEvent() { return () => {}; },
      async request(method: string, params: any) {
        calls.push([method, params]);
        if (method === 'initialize') return { agentCapabilities: { promptCapabilities: { image: true } } };
        if (method === 'session/new') return { sessionId: 'vision' };
        if (method === 'session/prompt') return { stopReason: 'end_turn' };
        return {};
      },
    };
    const imagePath = new URL(import.meta.url).pathname;
    await executeAdapter('cli_grok', proc, { prompt: 'inspect', policy, attachments: [{ path: imagePath, name: 'source.png', mimeType: 'image/png', kind: 'image', size: 1, sha256: 'a' }] });
    const prompt = calls.find(([method]) => method === 'session/prompt')[1].prompt;
    expect(prompt.some((block: any) => block.type === 'image' && block.mimeType === 'image/png')).toBe(true);
  });
});
