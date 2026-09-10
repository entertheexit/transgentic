import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import type { CliConfig, CliPermissions, CliProviderId, CliRequestOptions } from '../../shared/cli.js';
import { defaultCliService } from '../../shared/cli.js';

export interface ExecutionPolicy extends CliPermissions { cwd: string; workspaceId?: string }
export function resolvePolicy(config: CliConfig, id: CliProviderId, request: CliRequestOptions, desktop: boolean, scratch: string, reviewer = false): ExecutionPolicy {
  const service = config.services[id] || defaultCliService();
  if (service.workMode !== 'agentic') {
    if (request.workspaceId || request.allowProjectEditing === true || request.allowCommands === true) {
      throw new Error('This CLI is in Provider Mode and cannot access host projects, files, or commands.');
    }
    return { cwd: scratch, allowProjectEditing: false, allowCommands: false };
  }
  const workspace = request.workspaceId ? config.workspaces.find(w => w.id === request.workspaceId) : undefined;
  if (request.workspaceId && (!workspace || (!desktop && !workspace.allowMcp))) throw new Error('CLI workspace is unavailable or has not been granted to MCP clients.');
  if (workspace && fs.realpathSync(workspace.path) !== workspace.path) throw new Error('CLI workspace path changed. Register it again in Settings.');
  const grants = workspace?.grants[id];
  return {
    cwd: workspace?.path || scratch, workspaceId: workspace?.id,
    allowProjectEditing: !reviewer && Boolean(workspace && service.allowProjectEditing && grants?.allowProjectEditing && request.allowProjectEditing !== false),
    allowCommands: !reviewer && Boolean(workspace && service.allowCommands && grants?.allowCommands && request.allowCommands !== false),
  };
}

/** No best-effort fallback: native command flags are not a filesystem boundary. */
export function sandboxAvailable(): boolean { return process.platform === 'darwin' && fs.existsSync('/usr/bin/sandbox-exec'); }
const quote = (value: string) => JSON.stringify(value);
export function validatedMacUserKeychainPaths(output: string, home = os.homedir()): string[] {
  const keychainRoot = path.join(home, 'Library', 'Keychains');
  const candidates = output.split(/\r?\n/).map(line => line.trim()).filter(Boolean).flatMap(line => {
    try { const value = JSON.parse(line); return typeof value === 'string' ? [value] : []; }
    catch { return []; }
  });
  return Array.from(new Set(candidates)).filter(candidate => {
    if (!path.isAbsolute(candidate) || !/\.keychain(?:-db)?$/i.test(candidate)) return false;
    const relative = path.relative(keychainRoot, candidate);
    return relative !== '' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative);
  });
}

export function macSandboxProfile(executable: string, policy: ExecutionPolicy, scratch: string, nativeStorage: string[], gatewayPort = 58420, trustedAuthExecutables: readonly string[] = [], trustedAuthReadFiles: readonly string[] = [], nativeRuntimeRoots: readonly string[] = []): string {
  const readRoots = ['/System', '/usr', '/bin', '/sbin', '/Library', '/Applications', '/dev', '/private/etc', '/private/var/db', scratch, policy.cwd, ...nativeStorage, ...nativeRuntimeRoots];
  const readable = [...readRoots.map(p => `(subpath ${quote(p)})`), ...trustedAuthReadFiles.map(p => `(literal ${quote(p)})`)].join(' ');
  const runtimeWrites = nativeStorage.flatMap(root => ['sessions', 'archived_sessions', 'log', 'logs', 'cache', 'tmp', '.tmp', 'projects', 'debug', 'todos', 'conversations', 'brain', 'implicit', 'knowledge', 'crashes', 'shell_snapshots', 'sqlite', 'state', 'rollout-migrations', 'ipc', 'process_manager'].map(name => path.join(root, name)));
  const writable = [scratch, ...runtimeWrites, ...nativeRuntimeRoots, ...(policy.allowProjectEditing ? [policy.cwd] : [])].map(p => `(subpath ${quote(p)})`).join(' ');
  // Authentication helpers must be fixed, application-owned absolute paths. Never
  // populate this list from persisted CLI settings or provider output.
  const executableAllowList = [executable, ...trustedAuthExecutables].map(value => `(literal ${quote(value)})`).join(' ');
  // The native executable is always readable, but unrelated files next to it are not.
  return `(version 1)
(allow default)
(deny file-read-data (require-not (require-any ${readable} (literal "/") (literal ${quote(executable)}))))
(deny file-write* (require-not (require-any ${writable} ${nativeStorage.map(root => `(literal ${quote(root)})`).join(' ')} ${nativeStorage.map(root => `(regex #${quote('^' + root.replace(/[.*+?^${}()|[\]\\]/g, c => '[' + c + ']') + '/(installation_id|auth[.]json|models_cache[.]json|session_index[.]jsonl|history[.]jsonl|cli[.]log|[a-z_]+[0-9]*[.](sqlite|db)(-shm|-wal)?)$')})`).join(' ')} (literal "/dev/null"))))
(deny file-write* (literal ${quote(executable)}) ${nativeStorage.flatMap(root => ['bin', 'packages', 'plugins', 'skills', 'updater'].map(name => `(subpath ${quote(path.join(root, name))})`)).join(' ')})
${policy.allowCommands ? '' : `(deny process-exec (require-not (require-any ${executableAllowList})))`}
(deny file-read-data ${nativeStorage.flatMap(root => ['plugins', 'skills', 'rules'].map(name => `(subpath ${quote(path.join(root, name))})`)).join(' ') || '(literal "/__transgentic_no_native_plugins__")'})
(deny network-outbound (remote ip "localhost:${gatewayPort}"))
(deny network-outbound (require-all (remote unix-socket) (require-not (literal "/private/var/run/mDNSResponder"))))
(deny file-read-data file-write* (regex #"/(config\\.toml|settings\\.json|settings\\.local\\.json|mcp_config\\.json|mcp\\.json)$"))
(deny file-read-data file-write* (subpath ${quote(path.join(os.homedir(), '.codex', 'memories'))}) (subpath ${quote(path.join(os.homedir(), '.codex', 'automations'))}))
`;
}

export function sandboxInvocation(executable: string, args: string[], policy: ExecutionPolicy, scratch: string, nativeStorage: string[], gatewayPort = 58420, trustedAuthExecutables: readonly string[] = [], trustedAuthReadFiles: readonly string[] = [], nativeRuntimeRoots: readonly string[] = []) {
  if (!sandboxAvailable()) throw new Error('CLI execution requires the macOS process sandbox. This platform is not yet supported; permissions will not be relaxed.');
  return { command: '/usr/bin/sandbox-exec', args: ['-p', macSandboxProfile(executable, policy, scratch, nativeStorage, gatewayPort, trustedAuthExecutables, trustedAuthReadFiles, nativeRuntimeRoots), executable, ...args] };
}

/** No inherited API keys, gateway tokens, loader overrides, proxies or shell startup configuration. */
export function cliEnvironment(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const key of ['HOME', 'USER', 'LOGNAME', 'PATH', 'LANG', 'LC_ALL', 'TMPDIR', 'SystemRoot', 'USERPROFILE']) {
    if (process.env[key]) env[key] = process.env[key];
  }
  env.NO_COLOR = '1'; env.TERM = 'dumb';
  return env;
}
