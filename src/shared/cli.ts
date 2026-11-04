import type { ServiceManifestEntry, TaskMode } from './types.js';

export const CLI_IDS = ['cli_codex', 'cli_claude_code', 'cli_antigravity', 'cli_grok'] as const;
export type CliProviderId = typeof CLI_IDS[number];
export const isCliProvider = (id: unknown): id is CliProviderId => typeof id === 'string' && (CLI_IDS as readonly string[]).includes(id);
export const CLI_DEFINITIONS = {
  cli_codex: { name: 'Codex CLI', executable: 'codex', company: 'OpenAI', docs: 'https://learn.chatgpt.com/docs/non-interactive-mode', login: 'codex login' },
  cli_claude_code: { name: 'Claude Code CLI', executable: 'claude', company: 'Anthropic', docs: 'https://code.claude.com/docs/en/setup', login: 'claude auth login' },
  cli_antigravity: { name: 'Antigravity CLI', executable: 'agy', company: 'Google', docs: 'https://antigravity.google/docs/cli/install/', login: 'agy' },
  cli_grok: { name: 'Grok CLI', executable: 'grok', company: 'xAI', docs: 'https://docs.x.ai/build/overview', login: 'grok login' },
} as const;
export interface CliPermissions { allowProjectEditing: boolean; allowCommands: boolean }
export const NO_CLI_PERMISSIONS: CliPermissions = { allowProjectEditing: false, allowCommands: false };
export type CliWorkMode = 'provider' | 'agentic';
export interface CliServiceConfig extends CliPermissions {
  executablePath?: string;
  model?: string;
  timeoutSeconds: number;
  workMode: CliWorkMode;
}
export interface CliWorkspace {
  id: string; name: string; path: string;
  grants: Partial<Record<CliProviderId, CliPermissions>>;
  allowMcp: boolean;
}
export interface CliConfig { services: Partial<Record<CliProviderId, CliServiceConfig>>; workspaces: CliWorkspace[] }
export interface CliRequestOptions { workspaceId?: string; allowProjectEditing?: boolean; allowCommands?: boolean }
export interface CliStatus {
  provider: CliProviderId; state: 'not_checked' | 'missing' | 'incompatible' | 'available' | 'ready' | 'busy' | 'authentication_required' | 'quota_exhausted' | 'error';
  executablePath?: string; version?: string; message?: string; checkedAt?: number; resetAt?: number;
}
export interface CliModelOption { id: string; name: string }
export interface CliModelDiscovery {
  provider: CliProviderId;
  state: 'available' | 'unsupported' | 'error';
  models: CliModelOption[];
  message?: string;
  fetchedAt: number;
}
export interface CliState { config: CliConfig; statuses: Partial<Record<CliProviderId, CliStatus>>; sandboxAvailable: boolean }
export const defaultCliService = (): CliServiceConfig => ({ ...NO_CLI_PERMISSIONS, timeoutSeconds: 300, workMode: 'provider' });
export function cliSupportsMode(mode: TaskMode): boolean { return mode === 'general' || mode === 'writing' || mode === 'coding'; }
export function builtInCliServices(): Record<string, ServiceManifestEntry> {
  return Object.fromEntries(CLI_IDS.map(id => [id, {
    id, name: CLI_DEFINITIONS[id].name, company: CLI_DEFINITIONS[id].company,
    providerType: 'cli', enabled: false, hidden: false, url: CLI_DEFINITIONS[id].docs,
    partition: '', defaultModelId: 'default', supportsModelRouting: true,
    accentColor: 'cyan', iconName: 'Terminal',
    models: [{ id: 'default', displayName: 'CLI default', enabled: true, userEnabled: true,
      discoveredAvailable: false, modes: ['general', 'coding'] }],
  } satisfies ServiceManifestEntry]));
}

export function cliQuotaStatus(message: string, now = Date.now()): Partial<CliStatus> | undefined {
  if (!/individual quota reached|quota (?:has been )?exhausted|insufficient_quota/i.test(message)) return undefined;
  const duration = message.match(/resets? in\s+(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?/i);
  const seconds = duration ? Number(duration[1] || 0) * 3600 + Number(duration[2] || 0) * 60 + Number(duration[3] || 0) : 0;
  return { state: 'quota_exhausted', message: 'Quota exhausted', resetAt: seconds > 0 ? now + seconds * 1000 : undefined };
}
