export * from './types/recipe.js';
import type { CustomRecipe } from './types/recipe.js';

export type ProviderId = 'chatgpt' | 'claude' | 'gemini' | 'grok' | 'localllm' | (string & {});

export const MODE_SCHEMA_VERSION = 2 as const;
export const TASK_MODES = ['general', 'coding', 'image', 'video', 'music'] as const;
export type RouteMode = typeof TASK_MODES[number];
export type TaskMode = RouteMode | 'writing' | 'audio';
export type AcceptedTaskMode = TaskMode;
export type TaskIntent = 'writing' | 'audio';

export const AUDIO_MODE_UNAVAILABLE_MESSAGE =
  'Audio providers are not available yet. Audio is reserved for narration, speech, voiceover, TTS, podcasts, and sound effects. Use Music mode for songs, tracks, soundtracks, beats, melodies, jingles, and BGM.';

export function normalizeTaskMode(mode?: AcceptedTaskMode | string | null): TaskMode {
  if (mode === 'writing') return 'writing';
  if (mode === 'audio') return 'audio';
  return (TASK_MODES as readonly string[]).includes(mode || '') ? mode as RouteMode : 'general';
}

/** Writing is a backend task mode that deliberately shares General's route and policy settings. */
export function normalizeRouteMode(mode?: AcceptedTaskMode | string | null): RouteMode {
  const taskMode = normalizeTaskMode(mode);
  if (taskMode === 'audio') {
    throw new Error(AUDIO_MODE_UNAVAILABLE_MESSAGE);
  }
  return taskMode === 'writing' ? 'general' : taskMode;
}

export function normalizeModeFlags(
  input?: Partial<Record<AcceptedTaskMode, boolean>> | null,
  fallback = true,
): Record<RouteMode, boolean> {
  const source = input || {};
  const hasGeneral = Object.prototype.hasOwnProperty.call(source, 'general');
  return {
    general: hasGeneral ? source.general ?? fallback : source.writing ?? fallback,
    coding: source.coding ?? fallback,
    image: source.image ?? fallback,
    video: source.video ?? fallback,
    music: source.music ?? source.audio ?? fallback,
  };
}

export type ProviderStatusState = 'ready' | 'rate_limited' | 'disconnected' | 'busy' | 'cooling_down';

export interface ProviderStatus {
  id: ProviderId;
  name: string;
  url: string;
  state: ProviderStatusState;
  partition: string;
  lastActive?: number;
  rateLimitedUntil?: number;
  rateLimitCount: number;
  modelName?: string;
  isAuthenticated: boolean;
}

export type CoreStatusState = 'idle' | 'routing' | 'processing' | 'fallback' | 'rate_limited';

export interface CoreStatus {
  state: CoreStatusState;
  activeProvider?: ProviderId;
  activeMode: TaskMode;
  currentTaskDescription?: string;
  requestCount: number;
  totalTokensProtected: number;
  activeVaultSecrets: number;
  port: number;
  uptimeSeconds: number;
}

export interface McpRequestLog {
  modeSchemaVersion?: typeof MODE_SCHEMA_VERSION;
  id: string;
  timestamp: number;
  mode: TaskMode;
  intent?: TaskIntent;
  targetProvider: ProviderId;
  fallbackProvider?: ProviderId;
  modelUsed?: string;
  status: 'pending' | 'success' | 'fallback' | 'failed';
  outcome?: 'completed' | 'partial' | 'failed' | 'cancelled' | 'handoff';
  maskedSecretsCount: number;
  promptSnippet: string;
  promptText?: string;
  responseSnippet?: string;
  responseText?: string;
  mediaPath?: string;
  durationMs?: number;
  error?: string;
  balancedModeApplied?: boolean;
  autoClassified?: boolean;
  isQuickPrompt?: boolean;
  autoRollover?: boolean;
  presetPromptsAttached?: boolean;
  accountProfileId?: string;
  accountAlias?: string;
  isMicroTask?: boolean;
  microTaskCategory?: 'regex' | 'types' | 'docstring' | 'test_stubs' | 'helper_fn';
  bypassedWebviewDispatch?: boolean;
  bypassedCloudDispatch?: boolean;
  localZeroLeakApplied?: boolean;
  localZeroLeakCount?: number;
  localCompactApplied?: boolean;
  localCompactOriginalChars?: number;
  localCompactDistilledChars?: number;
}

export interface BlindedTokenMap {
  token: string;
  type: 'api_key' | 'ip' | 'email' | 'jwt' | 'generic_secret';
  detectedAt: number;
  samplePreview: string;
}

export interface ProviderModelRouteConfig {
  defaultModelId?: string;
  fallbackModelIds?: string[];
}

export interface ModePipelineConfig {
  cliWorkspaces?: Partial<Record<import('./cli.js').CliProviderId, string>>;
  defaultService: string;             // e.g., "chatgpt", "claude", "localllm"
  fallbackChain: string[];            // Ordered provider IDs
  modelRouting?: Record<string, any>;
  mode?: RouteMode;
  primary?: ProviderId;
  fallbacks?: ProviderId[];
  outputFormat?: 'prose_markdown' | 'json_code' | 'file_download';
  providerModels?: Partial<Record<ProviderId, ProviderModelRouteConfig>>;
}

export interface RouteMatrix {
  modeSchemaVersion?: typeof MODE_SCHEMA_VERSION;
  main: {
    general: ModePipelineConfig;
    coding: ModePipelineConfig;
    image: ModePipelineConfig;
    video: ModePipelineConfig;
    music: ModePipelineConfig;
  };
  co: {
    general: ModePipelineConfig;
    coding: ModePipelineConfig;
    image: ModePipelineConfig;
    video: ModePipelineConfig;
    music: ModePipelineConfig;
  };
}

export interface doubleAgentConfig {
  enabled: boolean;                   // Master toggle (independent)
  includeLocalLlm: boolean;
  completionReviewEnabled?: boolean;  // Explicit Co-route review for text-only completion requests
  modes?: Record<RouteMode, boolean>;  // Per-route toggle for Double Agent; Writing uses General
}

export interface ModeRouteConfig {
  cliWorkspaces?: Partial<Record<import('./cli.js').CliProviderId, string>>;
  mode: RouteMode;
  primary: ProviderId;
  fallbacks: ProviderId[];
  outputFormat: 'prose_markdown' | 'json_code' | 'file_download';
  providerModels?: Partial<Record<ProviderId, ProviderModelRouteConfig>>;
  defaultService?: string;
  fallbackChain?: string[];
  modelRouting?: Record<string, any>;
}

export type FallbackRouteRule = ModeRouteConfig;

export interface ModelEntry {
  id: string;
  displayName: string;
  discoveredAvailable: boolean; // Detected from live web UI
  userEnabled: boolean;         // User manual checkbox override
  requiresTier?: string;
  lastSeen?: string;
  mode?: RouteMode;
  modes?: RouteMode[];
}

export interface ProviderConfig {
  serviceEnabled: boolean;      // Global toggle for the entire service
  activeSelectionMode: 'hybrid' | 'lock_active_session';
  allowMcpOverride: boolean;    // Toggle: Allow MCP tool argument to override preset
  defaultModelId: string;       // Default model chosen in Transgentic settings
  hourlyLimit?: number;         // Safe hourly request quota for subscription package (e.g. 30/hr)
  cooldownSeconds?: number;     // Minimum inter-message cooldown in seconds (e.g. 6s)
  models: ModelEntry[];
}

export interface RegistryStore {
  chatgpt: ProviderConfig;
  claude: ProviderConfig;
  gemini: ProviderConfig;
  grok: ProviderConfig;
  [key: string]: ProviderConfig | undefined;
}

export interface CodingModeConfig {
  balancedMode: boolean; // default: true
  primaryProvider?: ProviderId;
  fallbackProviders?: string[];
}

export interface RecallModesConfig {
  general: boolean;
  coding: boolean;
  image: boolean;
  video: boolean;
  music: boolean;
}

export const DEFAULT_RECALL_MODES: RecallModesConfig = {
  general: true,
  coding: true,
  image: true,
  video: true,
  music: true,
};

export interface RecallConfig {
  enabled: boolean;          // Master toggle in Settings
  strategy: 'single-pass' | 'two-stage'; // single-pass default for speed
  autoTriggerKeywords: boolean;
  completionEnabled?: boolean; // Explicit Recall opt-in for text-only completion requests
  modes?: RecallModesConfig; // Per-mode enabling (general, coding, image, video, music)
}

export function isRecallEnabledForMode(
  config?: TransgenticConfig | RecallConfig,
  mode: TaskMode = 'general'
): boolean {
  if (!config) return false;
  const recallCfg: RecallConfig | undefined = 'recall' in config
    ? (config as TransgenticConfig).recall
    : (config as RecallConfig);
  if (!recallCfg || !recallCfg.enabled) return false;
  if (!recallCfg.modes) return true;
  return recallCfg.modes[normalizeRouteMode(mode)] ?? true;
}

export interface AgentHaltGuardConfig {
  general: boolean;
  coding: boolean;
  image: boolean;
  video: boolean;
  music: boolean;
}

export const DEFAULT_AGENT_HALT_GUARD: AgentHaltGuardConfig = {
  general: true,
  coding: true,
  image: true,
  video: true,
  music: true,
};

export function isAgentHaltGuardEnabled(
  config?: TransgenticConfig,
  mode: TaskMode = 'general'
): boolean {
  if (!config) return true;
  if (typeof config.agentHaltGuard === 'boolean') {
    return config.agentHaltGuard;
  }
  if (config.agentHaltGuard && typeof config.agentHaltGuard === 'object') {
    return config.agentHaltGuard[normalizeRouteMode(mode)] ?? true;
  }
  return true;
}

export interface LocalLLMConfig {
  enabled: boolean;                 // Master toggle (does not erase settings on false)
  preset: 'ollama' | 'lmstudio' | 'custom';
  baseUrl: string;                  // e.g. "http://127.0.0.1:11434"
  selectedModel: string;            // e.g. "qwen2.5-coder:7b", "deepseek-coder:6.7b"
  temperature: number;              // default: 0.2
  contextLength: number;            // default: 8192
  localMicroTask?: boolean;         // Offload micro-tasks to Local LLM after Turn 1 in Balanced Mode if in fallback chain
  localZeroLeak?: boolean;          // Ephemeral secret masking before Cloud AI Webview dispatch & reverse restoration
  localCompact?: boolean;           // Context distillation for prompts exceeding character threshold before Cloud AI
  completionCompact?: boolean;      // Explicit Local LLM compaction for text-only completion requests
  compactThresholdChars?: number;   // Character threshold to trigger Local Compact (default: 4000)
}

export type DoubleAgentConfig = doubleAgentConfig;

export interface HealingConfig {
  autoHealingEnabled: boolean;      // Toggle in Settings
  checkIntervalMinutes: number;     // default: 60
  checkOnPageLoad: boolean;         // Run quick audit on did-finish-load
  checkModelSelector: boolean;      // default: true (Audit model switcher dropdowns)
}

export const DEFAULT_LOCAL_LLM_CONFIG: LocalLLMConfig = {
  enabled: false,
  preset: 'ollama',
  baseUrl: 'http://127.0.0.1:11434',
  selectedModel: '',
  temperature: 0.2,
  contextLength: 8192,
  localMicroTask: false,
  localZeroLeak: false,
  localCompact: false,
  completionCompact: false,
  compactThresholdChars: 4000,
};

export const DEFAULT_HEALING_CONFIG: HealingConfig = {
  autoHealingEnabled: true,
  checkIntervalMinutes: 60,
  checkOnPageLoad: true,
  checkModelSelector: true,
};

export interface TransgenticConfig {
  modeSchemaVersion?: typeof MODE_SCHEMA_VERSION;
  cli?: import('./cli.js').CliConfig;
  serverAccess?: {
    lanEnabled: boolean;
    advertisedAddress: string;
  };
  port: number;
  defaultMode: TaskMode;
  interMessageCooldownMs: number; // Enforced delay between consecutive calls (default: 6000ms)
  textJitterMinMs: number;        // Randomized human thinking jitter min (default: 3000ms)
  textJitterMaxMs: number;        // Randomized human thinking jitter max (default: 8000ms)
  mediaJitterMinMs: number;       // Randomized media generation jitter min (default: 12000ms)
  mediaJitterMaxMs: number;       // Randomized media generation jitter max (default: 25000ms)
  autoFallbackEnabled: boolean;
  dataBlindingEnabled: boolean;
  assetsDir: string;
  balancedMode?: boolean;         // Synced between Hub header and Settings
  doubleAgent?: doubleAgentConfig;
  routes?: RouteMatrix;
  coding?: CodingModeConfig;
  recall?: RecallConfig;
  agentHaltGuard?: AgentHaltGuardConfig | boolean;
  localLLM?: LocalLLMConfig;
  healing?: HealingConfig;
}

export interface ServiceModelDef {
  id: string;
  displayName: string;
  enabled: boolean;
  discoveredAvailable?: boolean;
  userEnabled?: boolean;
  requiresTier?: string;
  mode?: RouteMode;
  modes?: RouteMode[];
}

export interface ServiceThemeConfig {
  iconName?: string;
  accentColor?: string;
  textClass?: string;
  bgClass?: string;
  borderClass?: string;
  badgeClass?: string;
  glowClass?: string;
}

export interface ServiceManifestEntry {
  id: ProviderId;
  name: string;
  company: string;
  enabled: boolean;
  hidden?: boolean;
  experimental?: boolean;
  providerType?: 'api' | 'webview' | 'cli';
  apiKey?: string;
  baseUrl?: string;
  supportsModelRouting?: boolean;
  disclaimer?: string;
  url: string;
  partition: string;
  defaultModelId: string;
  accentColor?: string;
  iconName?: string;
  theme?: ServiceThemeConfig;
  models: ServiceModelDef[];
}

export interface ServicesManifest {
  modeSchemaVersion?: typeof MODE_SCHEMA_VERSION;
  version: string;
  services: Record<string, ServiceManifestEntry>;
}

export interface ServiceRouteConflict {
  mode: RouteMode;
  role: 'primary' | 'fallback';
  provider: ProviderId;
  providerName: string;
  reason: 'service_disabled' | 'service_hidden';
}

export type AccountProfileStatus = 'ready' | 'rate_limited' | 'unauthenticated' | 'error';

export interface AccountProfile {
  id: string;                  // Unique UUID (e.g., "acc_chatgpt_01")
  alias: string;               // User-defined label (e.g., "Personal Plus", "Work Account")
  provider: ProviderId;
  partitionKey: string;        // e.g., "persist:transgentic_chatgpt_acc_01"
  isMain: boolean;             // Designated primary account
  priorityIndex: number;       // Sort order (0 = first choice, 1 = fallback, etc.)
  status: AccountProfileStatus;
  rateLimitedUntil?: number;   // Timestamp when cooldown expires
  createdAt: number;
  lastUsedAt?: number;
}

export interface ProviderAccountStore {
  activeAccountId: string;
  accounts: AccountProfile[];
}

export type AccountRegistryStore = Record<string, ProviderAccountStore>;

export interface IpcApi {
  getCliState?: () => Promise<import('./cli.js').CliState>;
  configureCli?: (id: import('./cli.js').CliProviderId, updates: Partial<import('./cli.js').CliServiceConfig>) => Promise<import('./cli.js').CliState>;
  probeCli?: (id: import('./cli.js').CliProviderId) => Promise<import('./cli.js').CliState>;
  fetchCliModels?: (id: import('./cli.js').CliProviderId, force?: boolean) => Promise<import('./cli.js').CliModelDiscovery>;
  testCli?: (id: import('./cli.js').CliProviderId) => Promise<string>;
  selectCliExecutable?: (id: import('./cli.js').CliProviderId) => Promise<import('./cli.js').CliState>;
  addCliWorkspace?: () => Promise<import('./cli.js').CliState>;
  updateCliWorkspace?: (id: string, updates: Pick<import('./cli.js').CliWorkspace, 'grants' | 'allowMcp'>) => Promise<import('./cli.js').CliState>;
  removeCliWorkspace?: (id: string) => Promise<import('./cli.js').CliState>;
  getCoreStatus: () => Promise<CoreStatus>;
  getProviderStatuses: () => Promise<Record<ProviderId, ProviderStatus>>;
  getRequestLogs: (limit?: number, offset?: number) => Promise<{ logs: McpRequestLog[]; total: number }>;
  clearRequestLogs: () => Promise<void>;
  terminateRequest?: (logId: string) => Promise<boolean>;
  terminateAllPendingRequests?: () => Promise<number>;
  getBlindedSecrets: () => Promise<BlindedTokenMap[]>;
  clearVaultSecrets: () => Promise<void>;
  getConfig: () => Promise<TransgenticConfig>;
  updateConfig: (config: Partial<TransgenticConfig>) => Promise<TransgenticConfig>;
  updateBalancedMode?: (balanced: boolean) => Promise<TransgenticConfig>;
  updateDoubleAgent?: (config: Partial<doubleAgentConfig>) => Promise<TransgenticConfig>;
  toggleDoubleAgent?: (enabled?: boolean) => Promise<boolean>;
  toggleDoubleAgentMode?: (mode: RouteMode, enabled?: boolean) => Promise<boolean>;
  updateRecallConfig?: (config: Partial<RecallConfig>) => Promise<TransgenticConfig>;
  toggleRecall?: (enabled?: boolean) => Promise<boolean>;
  toggleRecallMode?: (mode: RouteMode, enabled?: boolean) => Promise<boolean>;
  toggleAgentGuard?: (mode: RouteMode, enabled?: boolean) => Promise<boolean>;
  updateAgentGuard?: (config: any) => Promise<any>;
  getModeRoutes: () => Promise<Record<RouteMode, ModeRouteConfig>>;
  getRouteMatrix?: () => Promise<RouteMatrix>;
  updateModeRoute: (mode: RouteMode, config: Partial<ModeRouteConfig> | Partial<ModePipelineConfig>, pipeline?: 'main' | 'co') => Promise<any>;
  resetModeRoutes: () => Promise<any>;
  getModelsState: () => Promise<RegistryStore>;
  updateProviderConfig: (providerId: ProviderId, config: Partial<ProviderConfig>) => Promise<ProviderConfig>;
  toggleModel: (providerId: ProviderId, modelId: string, userEnabled: boolean) => Promise<RegistryStore>;
  toggleService: (providerId: ProviderId, serviceEnabled: boolean) => Promise<RegistryStore>;
  resyncModels: (providerId?: ProviderId) => Promise<RegistryStore>;
  selectDirectory: () => Promise<string | null>;
  applyPort: (newPort: number) => Promise<{ success: boolean; port: number; error?: string }>;
  getNetworkInterfaces?: () => Promise<Array<{ name: string; address: string }>>;
  applyNetworkAccess?: (lanEnabled: boolean, advertisedAddress: string) => Promise<{ success: boolean; port: number; serverAccess?: { lanEnabled: boolean; advertisedAddress: string }; error?: string }>;
  openProviderDrawer: (providerId: ProviderId) => Promise<void>;
  closeProviderDrawer: () => Promise<void>;
  setMode: (mode: TaskMode) => Promise<void>;
  setCompactMode?: (compact: boolean) => Promise<{ isCompact: boolean; isPinned: boolean }>;
  toggleWindowPin: () => Promise<boolean>;
  minimizeWindow: () => Promise<void>;
  hideToTray: () => Promise<void>;
  reloadProvider: (providerId: ProviderId) => Promise<void>;
  openProviderWindow: (providerId: ProviderId, partitionKey?: string) => Promise<void>;
  openSystemBrowser: (providerId: ProviderId) => Promise<void>;
  executePrompt: (prompt: string, mode?: TaskMode, preferredProvider?: ProviderId, model?: string, cliRequest?: import('./cli.js').CliRequestOptions) => Promise<any>;
  getThreadSessions: () => Promise<any[]>;
  clearThreadSessions: (params?: { providerId?: ProviderId; threadId?: string; scope?: 'quick_prompt' | 'all' }) => Promise<{ success: boolean; sessions: any[] }>;
  getServicesManifest: () => Promise<ServicesManifest>;
  toggleExperimentalService?: (serviceId: ProviderId, enabled: boolean) => Promise<ServicesManifest>;
  updateServiceManifest?: (serviceId: ProviderId, updates: Partial<ServiceManifestEntry>) => Promise<ServicesManifest>;
  getServiceConflicts: () => Promise<ServiceRouteConflict[]>;
  addCustomApiProvider?: (entry: { name: string; baseUrl: string; apiKey?: string; defaultModelId?: string }) => Promise<ServicesManifest>;
  updateCustomApiProvider?: (serviceId: ProviderId, entry: { name?: string; baseUrl?: string; apiKey?: string; defaultModelId?: string }) => Promise<ServicesManifest>;
  deleteProvider?: (serviceId: ProviderId) => Promise<ServicesManifest>;
  updateServiceTitle?: (serviceId: ProviderId, title: string) => Promise<ServicesManifest>;
  getAccounts: () => Promise<AccountRegistryStore>;
  getAccountsForProvider: (providerId: ProviderId) => Promise<ProviderAccountStore>;
  addAccount: (providerId: ProviderId, alias: string) => Promise<AccountProfile>;
  updateAccountAlias: (providerId: ProviderId, accountId: string, alias: string) => Promise<AccountProfile>;
  setMainAccount: (providerId: ProviderId, accountId: string) => Promise<ProviderAccountStore>;
  setActiveAccount: (providerId: ProviderId, accountId: string) => Promise<ProviderAccountStore>;
  reorderAccounts: (providerId: ProviderId, accountIds: string[]) => Promise<ProviderAccountStore>;
  deleteAccount: (providerId: ProviderId, accountId: string) => Promise<ProviderAccountStore>;

  // Local LLM Engine
  fetchLocalLlmModels?: (baseUrl: string, preset: string) => Promise<string[]>;
  testLocalLlmConnection?: (config: LocalLLMConfig) => Promise<{ success: boolean; latencyMs: number; message?: string }>;
  updateLocalLlmConfig?: (config: Partial<LocalLLMConfig>) => Promise<LocalLLMConfig>;

  // DOM Self-Healing & Watchdog Engine
  auditProviderDom?: (providerId: ProviderId) => Promise<any>;
  healProviderDom?: (providerId: ProviderId) => Promise<any>;
  getHealingStatus?: () => Promise<any>;
  updateHealingConfig?: (config: Partial<HealingConfig>) => Promise<HealingConfig>;

  // Recipe Management
  getRecipes?: () => Promise<CustomRecipe[]>;
  installRecipe?: (recipe: CustomRecipe, cookies?: any[]) => Promise<{ success: boolean; recipe: CustomRecipe }>;
  deleteRecipe?: (recipeId: string) => Promise<{ success: boolean }>;
  detectRecipeSelectors?: (domSnippet: string, url: string, title?: string) => Promise<{ success: boolean; recipe?: CustomRecipe; error?: string }>;
  getInspectorScript?: () => Promise<string | null>;
  resetRecipeToDefault?: (providerId: string) => Promise<{ success: boolean }>;
  rollbackRecipe?: (providerId: string, version: string) => Promise<{ success: boolean; recipe?: CustomRecipe; error?: string }>;
  getRecipeHistory?: (providerId: string) => Promise<Array<{ version: string; timestamp: number; path: string }>>;

  onCoreStatusUpdate: (callback: (status: CoreStatus) => void) => () => void;
  onProviderStatusUpdate: (callback: (statuses: Record<ProviderId, ProviderStatus>) => void) => () => void;
  onMcpLog: (callback: (log: McpRequestLog) => void) => () => void;
  onRequestLogAdded?: (callback: (log: McpRequestLog) => void) => () => void;
  onModelsUpdated?: (callback: (registry: RegistryStore) => void) => () => void;
  onThreadsUpdated?: (callback: (sessions: any[]) => void) => () => void;
  onServicesManifestUpdated?: (callback: (manifest: ServicesManifest) => void) => () => void;
  onAccountsUpdated?: (callback: (accounts: AccountRegistryStore) => void) => () => void;
  onHealingUpdated?: (callback: (status: any) => void) => () => void;
  onConfigUpdated?: (callback: (config: TransgenticConfig) => void) => () => void;
  onRouteMatrixUpdated?: (callback: (matrix: RouteMatrix) => void) => () => void;
}
