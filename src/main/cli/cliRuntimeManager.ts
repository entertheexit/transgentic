import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { execFile, execFileSync } from 'node:child_process';
import { promisify } from 'node:util';
import { app } from 'electron';
import { CLI_IDS, CLI_DEFINITIONS, defaultCliService, isCliProvider, type CliConfig, type CliModelDiscovery, type CliModelOption, type CliProviderId, type CliRequestOptions, type CliState, type CliStatus, type CliServiceConfig } from '../../shared/cli.js';
import { cliEnvironment, resolvePolicy, sandboxAvailable, sandboxInvocation, validatedMacUserKeychainPaths } from './executionPolicy.js';
import { CliProcess } from './processRunner.js';
import { adapterArgs, executeAdapter, type CliResult } from './adapters.js';
import { throwIfCancelled } from '../mcp/clientContext.js';
import { AccountQueueManager } from '../queue/accountQueue.js';

const execFileAsync = promisify(execFile);
const ANTIGRAVITY_MACOS_AUTH_EXECUTABLES = ['/usr/bin/security'] as const;
function antigravityMacosAuthReadFiles(): string[] {
  if (process.platform !== 'darwin') return [];
  try {
    const output = execFileSync('/usr/bin/security', ['list-keychains', '-d', 'user'], {
      encoding: 'utf8', timeout: 5000, env: cliEnvironment(), windowsHide: true,
    });
    return validatedMacUserKeychainPaths(output);
  } catch { return []; }
}

const MODEL_ID = /^[a-z0-9][a-z0-9._:/-]{0,199}$/i;
const MODEL_LIST_HEADERS = new Set(['available', 'default', 'display', 'id', 'model', 'models', 'name', 'slug']);

function normalizeModelOptions(items: Array<{ id?: unknown; name?: unknown }>): CliModelOption[] {
  const models: CliModelOption[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    const id = typeof item.id === 'string' ? item.id.trim() : '';
    if (!MODEL_ID.test(id) || MODEL_LIST_HEADERS.has(id.toLowerCase()) || seen.has(id)) continue;
    seen.add(id);
    const rawName = typeof item.name === 'string' ? item.name.replace(/\s+/g, ' ').trim() : '';
    models.push({ id, name: (rawName || id).slice(0, 200) });
    if (models.length >= 200) break;
  }
  return models;
}

export function parseCliModelText(output: string): CliModelOption[] {
  const lines = output.replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, '').split(/\r?\n/);
  const candidates: Array<{ id: string; name: string }> = [];
  for (const rawLine of lines) {
    const line = rawLine.trim().replace(/^[>*•]\s*/, '');
    if (!line || /^(?:error|warning|usage|flags?):/i.test(line)) continue;
    const columns = line.split(/\t+|\s{2,}/).map(value => value.trim()).filter(Boolean);
    if (!columns.length) continue;
    const firstParts = columns[0].split(/\s+/);
    const id = firstParts[0];
    if (!MODEL_ID.test(id) || MODEL_LIST_HEADERS.has(id.toLowerCase())) continue;
    const inlineName = firstParts.slice(1).join(' ');
    candidates.push({ id, name: columns.slice(1).join(' · ') || inlineName || id });
  }
  return normalizeModelOptions(candidates);
}

export function parseCodexModelList(items: unknown): CliModelOption[] {
  if (!Array.isArray(items)) return [];
  return normalizeModelOptions(items.map((item: any) => ({ id: item?.model || item?.id, name: item?.displayName || item?.model || item?.id })));
}
export function normalizeCliConfig(input?: CliConfig): CliConfig {
  return {
    services: Object.fromEntries(CLI_IDS.map(id => {
      const c = input?.services?.[id];
      const workMode = c?.workMode === 'agentic' ? 'agentic' : 'provider';
      return [id, { ...defaultCliService(),
        executablePath: typeof c?.executablePath === 'string' ? c.executablePath : undefined,
        model: typeof c?.model === 'string' ? c.model.slice(0, 200) : undefined,
        workMode,
        allowCommands: workMode === 'agentic' && c?.allowCommands === true,
        allowProjectEditing: workMode === 'agentic' && c?.allowProjectEditing === true,
        timeoutSeconds: Math.max(10, Math.min(1800, Number(c?.timeoutSeconds) || 300)),
      }];
    })),
    workspaces: (Array.isArray(input?.workspaces) ? input!.workspaces : []).filter(w => w && typeof w.id === 'string' && typeof w.path === 'string' && path.isAbsolute(w.path)).map(w => ({
      id: w.id, path: w.path, name: String(w.name || path.basename(w.path)), allowMcp: w.allowMcp === true,
      grants: Object.fromEntries(CLI_IDS.map(id => [id, { allowCommands: w.grants?.[id]?.allowCommands === true, allowProjectEditing: w.grants?.[id]?.allowProjectEditing === true }])),
    })),
  };
}
export function resolveExecutable(id: CliProviderId, configured?: string): string | undefined {
  const binary = CLI_DEFINITIONS[id].executable;
  const candidates = configured ? [configured] : [...(process.env.PATH || '').split(path.delimiter), path.join(os.homedir(), '.local/bin'), '/opt/homebrew/bin', '/usr/local/bin'].filter(Boolean).map(p => path.join(p, binary));
  for (const candidate of candidates) {
    try {
      if (!path.isAbsolute(candidate)) continue;
      fs.accessSync(candidate, fs.constants.X_OK);
      const real = fs.realpathSync(candidate);
      if (!fs.statSync(real).isFile() || /\.(cmd|bat|ps1)$/i.test(real)) continue;
      return real;
    } catch {}
  }
}

export class CliRuntimeManager {
  private gatewayPort = 58420;
  setGatewayPort(port: number) { if (Number.isInteger(port) && port > 0 && port < 65536 && port !== this.gatewayPort) { this.dispose(); this.gatewayPort = port; } }
  private config: CliConfig = normalizeCliConfig();
  private statuses: Partial<Record<CliProviderId, CliStatus>> = {};
  private active = new Map<string, { provider: CliProviderId; controller: AbortController }>();
  private sessions = new Map<string, { id: string; lastUsed: number }>();
  private modelCatalogCache = new Map<CliProviderId, { fingerprint: string; result: CliModelDiscovery; expiresAt: number }>();
  private modelCatalogRequests = new Map<CliProviderId, Promise<CliModelDiscovery>>();
  private listeners = new Set<() => void>();
  setConfig(config?: CliConfig) {
    const next = normalizeCliConfig(config);
    if (JSON.stringify(next) !== JSON.stringify(this.config)) {
      this.dispose(); this.sessions.clear(); this.statuses = {}; this.config = next; this.emit();
    }
  }
  getState(): CliState { return { config: structuredClone(this.config), statuses: structuredClone(this.statuses), sandboxAvailable: sandboxAvailable() }; }
  getServiceConfig(id: CliProviderId): CliServiceConfig { return structuredClone(this.config.services[id] || defaultCliService()); }
  onUpdate(fn: () => void) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  private emit() { for (const listener of this.listeners) listener(); }
  private setStatus(id: CliProviderId, values: Partial<CliStatus>) { this.statuses[id] = { provider: id, state: 'not_checked', ...this.statuses[id], ...values }; this.emit(); }
  available(id: CliProviderId): boolean { return sandboxAvailable() && !['missing', 'incompatible', 'authentication_required'].includes(this.statuses[id]?.state || '') && Boolean(resolveExecutable(id, this.config.services[id]?.executablePath)); }
  identity(id: CliProviderId) { return { id: `${id}_native`, alias: `${CLI_DEFINITIONS[id].name} native login` }; }
  getStatuses() {
    return Object.fromEntries(CLI_IDS.map(id => {
      const s = this.statuses[id];
      return [id, { id, name: CLI_DEFINITIONS[id].name, url: CLI_DEFINITIONS[id].docs, partition: '',
        state: s?.state === 'busy' ? 'busy' as const : s?.state === 'ready' ? 'ready' as const : 'disconnected' as const,
        isAuthenticated: s?.state === 'ready' || s?.state === 'busy', rateLimitCount: 0, cliStatus: s?.state || 'not_checked', message: s?.message }];
    }));
  }
  async probe(id: CliProviderId): Promise<CliStatus> {
    const executable = resolveExecutable(id, this.config.services[id]?.executablePath);
    if (!executable) { this.setStatus(id, { state: 'missing', message: 'Select an installed native executable.', checkedAt: Date.now() }); return this.statuses[id]!; }
    try {
      const { stdout, stderr } = await execFileAsync(executable, id === 'cli_codex' ? ['exec', '--help'] : ['--help'], { timeout: 10000, maxBuffer: 256 * 1024, env: cliEnvironment(), windowsHide: true });
      const help = stdout + stderr;
      const compatible = id === 'cli_codex' ? /ignore-user-config/.test(help) && /ignore-rules/.test(help) && /json/.test(help) : id === 'cli_claude_code' ? /safe-mode/.test(help) && /output-format/.test(help) : id === 'cli_antigravity' ? /output-format/.test(help) && /disable-slash-commands/.test(help) : /agent/.test(help);
      this.setStatus(id, { state: compatible && sandboxAvailable() ? 'available' : 'incompatible', executablePath: executable,
        version: undefined, checkedAt: Date.now(),
        message: !sandboxAvailable() ? 'Process sandbox unavailable on this platform.' : compatible ? 'Executable detected. Test Connection verifies native sign-in and protocol compatibility.' : 'This CLI version lacks required automation options. Update the native CLI.' });
    } catch { this.setStatus(id, { state: 'incompatible', executablePath: executable, message: 'Could not inspect this executable within 10 seconds.', checkedAt: Date.now() }); }
    return this.statuses[id]!;
  }
  async discoverModels(id: CliProviderId, force = false): Promise<CliModelDiscovery> {
    const unsupported = (): CliModelDiscovery => ({ provider: id, state: 'unsupported', models: [], message: 'This CLI does not expose a stable model-list command.', fetchedAt: Date.now() });
    if (id === 'cli_claude_code') return unsupported();
    const executable = resolveExecutable(id, this.config.services[id]?.executablePath);
    if (!executable) return { provider: id, state: 'error', models: [], message: 'Install or select this CLI to discover models.', fetchedAt: Date.now() };
    let fingerprint = executable;
    try { fingerprint = `${executable}:${fs.statSync(executable).mtimeMs}`; } catch {}
    const cached = this.modelCatalogCache.get(id);
    if (!force && cached?.fingerprint === fingerprint && cached.expiresAt > Date.now()) return structuredClone(cached.result);
    const pending = this.modelCatalogRequests.get(id);
    if (pending) return structuredClone(await pending);
    const request = this.discoverModelsUncached(id, executable).then(result => {
      this.modelCatalogCache.set(id, { fingerprint, result, expiresAt: Date.now() + (result.state === 'available' ? 10 * 60_000 : 30_000) });
      return result;
    }).finally(() => this.modelCatalogRequests.delete(id));
    this.modelCatalogRequests.set(id, request);
    return structuredClone(await request);
  }
  private async discoverModelsUncached(id: CliProviderId, executable: string): Promise<CliModelDiscovery> {
    const fetchedAt = Date.now();
    if (!sandboxAvailable()) return { provider: id, state: 'error', models: [], message: 'Model discovery requires the CLI permission sandbox on this platform.', fetchedAt };
    const base = app?.getPath ? path.join(app.getPath('userData'), 'cli-runs') : path.join(os.tmpdir(), 'transgentic-cli-runs');
    fs.mkdirSync(base, { recursive: true, mode: 0o700 });
    const scratch = fs.realpathSync(fs.mkdtempSync(path.join(base, 'models-')));
    const nativeStorage = [path.join(os.homedir(), id === 'cli_codex' ? '.codex' : id === 'cli_grok' ? '.grok' : '.gemini/antigravity-cli')];
    const trustedAuthExecutables = id === 'cli_antigravity' && process.platform === 'darwin' ? ANTIGRAVITY_MACOS_AUTH_EXECUTABLES : [];
    const trustedAuthReadFiles = id === 'cli_antigravity' ? antigravityMacosAuthReadFiles() : [];
    const nativeRuntimeRoots = id === 'cli_antigravity' ? [path.join(os.homedir(), '.gemini', 'config', 'projects')] : [];
    const policy = { cwd: scratch, allowProjectEditing: false, allowCommands: false };
    let proc: CliProcess | undefined;
    try {
      let models: CliModelOption[] = [];
      if (id === 'cli_codex') {
        const launch = sandboxInvocation(executable, ['app-server', '--stdio'], policy, scratch, nativeStorage, this.gatewayPort, [], [], [], true);
        proc = new CliProcess(launch.command, launch.args, { cwd: scratch, env: { ...cliEnvironment(), TMPDIR: scratch }, timeoutMs: 20_000 });
        await proc.request('initialize', { clientInfo: { name: 'transgentic', title: 'Transgentic', version: '1.0.1' }, capabilities: { experimentalApi: true, requestAttestation: false } });
        proc.write({ method: 'initialized' });
        let cursor: string | null = null;
        const items: unknown[] = [];
        for (let page = 0; page < 5; page++) {
          const response = await proc.request('model/list', { cursor, limit: 100, includeHidden: false });
          if (Array.isArray(response?.data)) items.push(...response.data);
          cursor = typeof response?.nextCursor === 'string' && response.nextCursor ? response.nextCursor : null;
          if (!cursor) break;
        }
        models = parseCodexModelList(items);
        proc.markComplete();
      } else {
        const args = id === 'cli_antigravity' ? ['models'] : ['--no-auto-update', 'models'];
        const launch = sandboxInvocation(executable, args, policy, scratch, nativeStorage, this.gatewayPort, trustedAuthExecutables, trustedAuthReadFiles, nativeRuntimeRoots, true);
        const result = await execFileAsync(launch.command, launch.args, { cwd: scratch, env: { ...cliEnvironment(), TMPDIR: scratch }, encoding: 'utf8', timeout: 20_000, maxBuffer: 1024 * 1024, windowsHide: true });
        models = parseCliModelText(result.stdout);
      }
      if (!models.length) return { provider: id, state: 'error', models: [], message: 'The CLI returned no selectable models. You can enter a model manually.', fetchedAt };
      return { provider: id, state: 'available', models, fetchedAt };
    } catch {
      return { provider: id, state: 'error', models: [], message: 'Could not fetch this CLI model list. You can enter a model manually.', fetchedAt };
    } finally {
      if (proc) { proc.stop(); await proc.closed; }
      fs.rmSync(scratch, { recursive: true, force: true });
    }
  }
  cancelProvider(id: CliProviderId) { for (const job of this.active.values()) if (job.provider === id) job.controller.abort(); }
  dispose() { for (const job of this.active.values()) job.controller.abort(); }
  clearSessions(prefix?: string) { for (const key of this.sessions.keys()) if (!prefix || key.includes(prefix)) this.sessions.delete(key); }
  async testConnection(id: CliProviderId): Promise<string> {
    const reqId = `cli_connection_test_${crypto.randomUUID()}`;
    const result = await this.execute(id, 'Reply with exactly: Transgentic connection ready.', {
      reqId,
      conversationKey: reqId,
      newThread: true,
      desktop: true,
    });
    return result.text;
  }
  async testEnabledConnections(ids: readonly CliProviderId[]): Promise<void> {
    await Promise.allSettled(Array.from(new Set(ids)).map(id => this.testConnection(id)));
  }
  async execute(id: CliProviderId, prompt: string, options: {
    reqId: string; conversationKey: string; newThread?: boolean; model?: string; request?: CliRequestOptions; desktop?: boolean; reviewer?: boolean; signal?: AbortSignal; progress?: (message: string) => void; beforeStart?: (signal: AbortSignal) => Promise<void>;
  }): Promise<CliResult> {
    throwIfCancelled(options.signal);
    const controller = new AbortController();
    const abort = () => controller.abort(); options.signal?.addEventListener('abort', abort, { once: true });
    this.active.set(options.reqId, { provider: id, controller });
    try {
      const executeQueued = async () => {
        throwIfCancelled(controller.signal);
        const config = structuredClone(this.config);
        const executable = resolveExecutable(id, config.services[id]?.executablePath);
        if (!executable) throw new Error('CLI executable is missing. Configure it in Settings → CLI Services.');
        if (!this.statuses[id] || this.statuses[id]?.executablePath !== executable) await this.probe(id);
        if (this.statuses[id]?.state === 'incompatible') throw new Error(this.statuses[id]?.message);
        throwIfCancelled(controller.signal);
        const base = app?.getPath ? path.join(app.getPath('userData'), 'cli-runs') : path.join(os.tmpdir(), 'transgentic-cli-runs');
        fs.mkdirSync(base, { recursive: true, mode: 0o700 });
        const scratch = fs.realpathSync(fs.mkdtempSync(path.join(base, 'run-')));
        let proc: CliProcess | undefined;
        let mayHaveSideEffects = false;
        try {
          const policy = resolvePolicy(config, id, options.request || {}, options.desktop === true, scratch, options.reviewer);
          const nativeStorage = [path.join(os.homedir(), id === 'cli_codex' ? '.codex' : id === 'cli_claude_code' ? '.claude' : id === 'cli_grok' ? '.grok' : '.gemini/antigravity-cli')];
          const fingerprint = crypto.createHash('sha256').update(JSON.stringify([executable, fs.statSync(executable).mtimeMs, config.services[id], options.model, policy.workspaceId, policy.allowCommands, policy.allowProjectEditing])).digest('hex');
          const key = JSON.stringify([id, options.conversationKey, fingerprint]);
          for (const [k, s] of this.sessions) if (Date.now() - s.lastUsed > 86400000) this.sessions.delete(k);
          if (options.newThread) this.sessions.delete(key);
          const previous = this.sessions.get(key);
          const model = options.model && options.model !== 'default' ? options.model : config.services[id]?.model || undefined;
          const input = { prompt, model, sessionId: previous?.id, policy, progress: options.progress };
          // Antigravity reads its cached Google login through the macOS Keychain
          // client. This fixed helper is distinct from provider-requested project
          // commands, which remain denied by the outer sandbox.
          const trustedAuthExecutables = id === 'cli_antigravity' && process.platform === 'darwin'
            ? ANTIGRAVITY_MACOS_AUTH_EXECUTABLES
            : [];
          const trustedAuthReadFiles = id === 'cli_antigravity' ? antigravityMacosAuthReadFiles() : [];
          const nativeRuntimeRoots = id === 'cli_antigravity'
            ? [path.join(os.homedir(), '.gemini', 'config', 'projects')]
            : [];
          const launch = sandboxInvocation(executable, adapterArgs(id, input), policy, scratch, nativeStorage, this.gatewayPort, trustedAuthExecutables, trustedAuthReadFiles, nativeRuntimeRoots);
          await options.beforeStart?.(controller.signal);
          throwIfCancelled(controller.signal);
          this.setStatus(id, { state: 'busy', message: undefined });
          mayHaveSideEffects = policy.allowProjectEditing || policy.allowCommands;
          proc = new CliProcess(launch.command, launch.args, { cwd: policy.cwd, env: { ...cliEnvironment(), TMPDIR: scratch }, timeoutMs: (config.services[id]?.timeoutSeconds || 300) * 1000, signal: controller.signal });
          const result = await executeAdapter(id, proc, input);
          if (id !== 'cli_grok') await proc.waitForExit();
          throwIfCancelled(controller.signal);
          if (!result.text.trim()) throw new Error('CLI returned no answer.');
          if (result.permissionDenied) throw new Error('CLI could not perform an operation under the configured permissions. Review the activity and permission settings.');
          if (result.sessionId) this.sessions.set(key, { id: result.sessionId, lastUsed: Date.now() });
          this.setStatus(id, { state: 'ready', message: undefined });
          return { ...result, wasNewChat: !previous };
        } catch (error) {
          const err = error as Error & { noFallback?: boolean };
          if (mayHaveSideEffects) { err.noFallback = true; err.message += ' Project actions may already have occurred. Inspect the workspace before retrying; Transgentic will not replay this request on a fallback.'; }
          this.setStatus(id, { state: err.name === 'AbortError' ? 'available' : /authentication required|not logged in/i.test(err.message) ? 'authentication_required' : 'error', message: err.name === 'AbortError' ? 'Request stopped.' : err.message });
          throw err;
        } finally { if (proc) { proc.stop(); await proc.closed; } fs.rmSync(scratch, { recursive: true, force: true }); }
      };
      const queued = AccountQueueManager.runTask(`${id}_native`, options.reqId, () => options.request?.workspaceId
        ? AccountQueueManager.runTask(`cli_workspace_${options.request.workspaceId}`, `${options.reqId}_workspace`, executeQueued)
        : executeQueued());
      let cancelWait: () => void = () => {};
      const cancelled = new Promise<never>((_, reject) => { cancelWait = () => { const err = new Error('CLI request cancelled.'); err.name = 'AbortError'; reject(err); }; controller.signal.addEventListener('abort', cancelWait, { once: true }); if (controller.signal.aborted) cancelWait(); });
      try { return await Promise.race([queued, cancelled]); } finally { controller.signal.removeEventListener('abort', cancelWait); }
    } finally { options.signal?.removeEventListener('abort', abort); this.active.delete(options.reqId); }
  }
  validateServiceUpdates(id: unknown, updates: any): { id: CliProviderId; config: CliConfig } {
    if (!isCliProvider(id) || !updates || typeof updates !== 'object') throw new Error('Invalid CLI settings.');
    const allowed = ['executablePath', 'model', 'allowProjectEditing', 'allowCommands', 'timeoutSeconds', 'workMode'];
    if (Object.keys(updates).some(k => !allowed.includes(k))) throw new Error('Unsupported CLI setting.');
    for (const key of ['allowProjectEditing', 'allowCommands']) if (key in updates && typeof updates[key] !== 'boolean') throw new Error('CLI permissions must be booleans.');
    if ('workMode' in updates && updates.workMode !== 'provider' && updates.workMode !== 'agentic') throw new Error('Invalid CLI work mode.');
    const current = this.config.services[id] || defaultCliService();
    const nextMode = updates.workMode === 'agentic' ? 'agentic' : updates.workMode === 'provider' ? 'provider' : current.workMode;
    if (nextMode !== 'agentic' && (updates.allowProjectEditing === true || updates.allowCommands === true)) throw new Error('Project permissions require Agentic Mode.');
    if (updates.executablePath && !path.isAbsolute(updates.executablePath)) throw new Error('Select an absolute executable path.');
    const merged = { ...current, ...updates } as CliServiceConfig;
    if (merged.workMode !== 'agentic') Object.assign(merged, { allowProjectEditing: false, allowCommands: false });
    return { id, config: normalizeCliConfig({ ...this.config, services: { ...this.config.services, [id]: merged } }) };
  }
}
export const globalCliRuntime = new CliRuntimeManager();
