// @ts-ignore
const { contextBridge, ipcRenderer } = require('electron');

const api = {
  checkForUpdate: () => ipcRenderer.invoke('app:check-for-update'),
  getCoreStatus: () => ipcRenderer.invoke('get-core-status'),
  getProviderStatuses: () => ipcRenderer.invoke('get-provider-statuses'),
  getRequestLogs: (limit?: number, offset?: number) => ipcRenderer.invoke('get-request-logs', { limit, offset }),
  clearRequestLogs: () => ipcRenderer.invoke('clear-request-logs'),
  terminateRequest: (logId: string) => ipcRenderer.invoke('logs:terminate-request', logId),
  terminateAllPendingRequests: () => ipcRenderer.invoke('logs:terminate-all-pending'),
  getBlindedSecrets: () => ipcRenderer.invoke('get-blinded-secrets'),
  clearVaultSecrets: () => ipcRenderer.invoke('clear-vault-secrets'),
  clearBrowserStorage: () => ipcRenderer.invoke('storage:clear-browser-storage'),
  purgeAllData: () => ipcRenderer.invoke('storage:purge-all-data'),
  getConfig: () => ipcRenderer.invoke('get-config'),
  updateConfig: (config: any) => ipcRenderer.invoke('update-config', config),
  updateBalancedMode: (balanced: boolean) => ipcRenderer.invoke('config:update-balanced-mode', balanced),
  updateDoubleAgent: (config: any) => ipcRenderer.invoke('config:update-double-agent', config),
  toggleDoubleAgent: (enabled?: boolean) => ipcRenderer.invoke('config:toggle-double-agent', enabled),
  toggleDoubleAgentMode: (mode: string, enabled?: boolean) => ipcRenderer.invoke('config:toggle-double-agent-mode', { mode, enabled }),
  updateRecallConfig: (config: any) => ipcRenderer.invoke('config:update-recall', config),
  toggleRecall: (enabled?: boolean) => ipcRenderer.invoke('recall:toggle', enabled),
  toggleRecallMode: (mode: string, enabled?: boolean) => ipcRenderer.invoke('recall:toggle-mode', { mode, enabled }),
  toggleAgentGuard: (mode: string, enabled?: boolean) => ipcRenderer.invoke('config:toggle-agent-guard', { mode, enabled }),
  updateAgentGuard: (config: any) => ipcRenderer.invoke('config:update-agent-guard', config),
  getModeRoutes: () => ipcRenderer.invoke('get-mode-routes'),
  getRouteMatrix: () => ipcRenderer.invoke('get-route-matrix'),
  updateModeRoute: (mode: string, config: any, pipeline?: 'main' | 'co') => ipcRenderer.invoke('update-mode-route', { mode, config, pipeline }),
  resetModeRoutes: () => ipcRenderer.invoke('reset-mode-routes'),

  // Model Registry & Settings
  getModelsState: () => ipcRenderer.invoke('models:get-state'),
  updateProviderConfig: (providerId: string, config: any) => ipcRenderer.invoke('models:update-config', { providerId, config }),
  toggleModel: (providerId: string, modelId: string, userEnabled: boolean) => ipcRenderer.invoke('models:toggle-model', { providerId, modelId, userEnabled }),
  toggleService: (providerId: string, serviceEnabled: boolean) => ipcRenderer.invoke('models:toggle-service', { providerId, serviceEnabled }),
  resyncModels: (providerId?: string) => ipcRenderer.invoke('models:resync', providerId),
  selectDirectory: () => ipcRenderer.invoke('settings:select-directory'),
  applyPort: (newPort: number) => ipcRenderer.invoke('settings:apply-port', newPort),

  // Local Media Streaming & Handling
  openMediaFile: (filePath: string) => ipcRenderer.invoke('media:open-file', filePath),
  showMediaInFolder: (filePath: string) => ipcRenderer.invoke('media:show-in-folder', filePath),
  getMediaData: (filePath: string) => ipcRenderer.invoke('media:get-file-data', filePath),
  getMediaUrl: (filePath: string) => {
    if (!filePath) return '';
    let clean = filePath.trim().replace(/^['"]|['"]$/g, '');
    if (clean.startsWith('file://')) {
      clean = clean.replace(/^file:\/\//i, '');
      if (process.platform === 'win32' && /^\/[a-zA-Z]:/.test(clean)) {
        clean = clean.slice(1);
      }
    }
    const formatted = clean.startsWith('/') ? clean : '/' + clean;
    return 'transgentic-media://' + formatted;
  },

  openProviderDrawer: (providerId: string) => ipcRenderer.invoke('open-provider-drawer', providerId),
  closeProviderDrawer: () => ipcRenderer.invoke('close-provider-drawer'),
  setMode: (mode: string) => ipcRenderer.invoke('set-mode', mode),
  setCompactMode: (compact: boolean) => ipcRenderer.invoke('set-compact-mode', compact),
  toggleWindowPin: () => ipcRenderer.invoke('toggle-window-pin'),
  minimizeWindow: () => ipcRenderer.invoke('minimize-window'),
  hideToTray: () => ipcRenderer.invoke('hide-to-tray'),
  reloadProvider: (providerId: string) => ipcRenderer.invoke('reload-provider', providerId),
  openProviderWindow: (providerId: string, partitionKey?: string) => ipcRenderer.invoke('open-provider-window', providerId, partitionKey),
  openSystemBrowser: (providerId: string) => ipcRenderer.invoke('open-system-browser', providerId),
  openExternalUrl: (url: string) => ipcRenderer.invoke('open-external-url', url),
  executePrompt: (prompt: string, mode?: string, provider?: string, model?: string) =>
    ipcRenderer.invoke('execute-prompt', { prompt, mode, provider, model }),
  getThreadSessions: () => ipcRenderer.invoke('threads:get-sessions'),
  clearThreadSessions: (params?: any) => ipcRenderer.invoke('threads:clear-sessions', params),
  getServicesManifest: () => ipcRenderer.invoke('services:get-manifest'),
  toggleExperimentalService: (serviceId: string, enabled: boolean) => ipcRenderer.invoke('services:toggle-experimental', { serviceId, enabled }),
  updateServiceManifest: (serviceId: string, updates: any) => ipcRenderer.invoke('services:update-manifest', { serviceId, updates }),
  getServiceConflicts: () => ipcRenderer.invoke('services:get-conflicts'),
  addCustomApiProvider: (entry: { name: string; baseUrl: string; apiKey?: string; defaultModelId?: string }) =>
    ipcRenderer.invoke('services:add-api-provider', entry),
  updateCustomApiProvider: (serviceId: string, entry: { name?: string; baseUrl?: string; apiKey?: string; defaultModelId?: string }) =>
    ipcRenderer.invoke('services:update-api-provider', { serviceId, entry }),
  deleteProvider: (serviceId: string) => ipcRenderer.invoke('services:delete-provider', serviceId),
  updateServiceTitle: (serviceId: string, title: string) => ipcRenderer.invoke('services:update-title', { serviceId, title }),

  // Multi-Account Profile Registry
  getAccounts: () => ipcRenderer.invoke('accounts:get-all'),
  getAccountsForProvider: (providerId: string) => ipcRenderer.invoke('accounts:get-for-provider', providerId),
  addAccount: (providerId: string, alias: string) => ipcRenderer.invoke('accounts:add', { providerId, alias }),
  updateAccountAlias: (providerId: string, accountId: string, alias: string) => ipcRenderer.invoke('accounts:update-alias', { providerId, accountId, alias }),
  setMainAccount: (providerId: string, accountId: string) => ipcRenderer.invoke('accounts:set-main', { providerId, accountId }),
  setActiveAccount: (providerId: string, accountId: string) => ipcRenderer.invoke('accounts:set-active', { providerId, accountId }),
  reorderAccounts: (providerId: string, accountIds: string[]) => ipcRenderer.invoke('accounts:reorder', { providerId, accountIds }),
  deleteAccount: (providerId: string, accountId: string) => ipcRenderer.invoke('accounts:delete', { providerId, accountId }),

  // Local LLM Configuration & Testing
  fetchLocalLlmModels: (baseUrl: string, preset: string) => ipcRenderer.invoke('localllm:fetch-models', { baseUrl, preset }),
  testLocalLlmConnection: (config: any) => ipcRenderer.invoke('localllm:test-connection', config),
  updateLocalLlmConfig: (config: any) => ipcRenderer.invoke('localllm:update-config', config),

  // DOM Watchdog & Self-Healing Engine
  auditProviderDom: (providerId: string) => ipcRenderer.invoke('healing:audit-provider', providerId),
  healProviderDom: (providerId: string) => ipcRenderer.invoke('healing:heal-provider', providerId),
  getHealingStatus: () => ipcRenderer.invoke('healing:get-status'),
  updateHealingConfig: (config: any) => ipcRenderer.invoke('healing:update-config', config),

  // Custom Recipe Management Engine
  getRecipes: () => ipcRenderer.invoke('recipes:get-all'),
  installRecipe: (recipe: any, cookies?: any[]) => ipcRenderer.invoke('recipes:install', { recipe, cookies }),
  deleteRecipe: (recipeId: string) => ipcRenderer.invoke('recipes:delete', recipeId),
  detectRecipeSelectors: (domSnippet: string, url: string, title?: string) =>
    ipcRenderer.invoke('recipes:detect', { domSnippet, url, title }),
  getInspectorScript: () => ipcRenderer.invoke('recipes:get-inspector-script'),
  resetRecipeToDefault: (providerId: string) => ipcRenderer.invoke('recipes:reset-to-default', providerId),
  rollbackRecipe: (providerId: string, version: string) => ipcRenderer.invoke('recipes:rollback', { providerId, version }),
  getRecipeHistory: (providerId: string) => ipcRenderer.invoke('recipes:get-history', providerId),
  onHealingUpdated: (callback: (reports: any) => void) => {
    const handler = (_: any, reports: any) => callback(reports);
    ipcRenderer.on('healing-reports-updated', handler);
    return () => ipcRenderer.removeListener('healing-reports-updated', handler);
  },

  onAccountsUpdated: (callback: (accounts: any) => void) => {
    const handler = (_: any, accounts: any) => callback(accounts);
    ipcRenderer.on('accounts-updated', handler);
    return () => ipcRenderer.removeListener('accounts-updated', handler);
  },

  onThreadsUpdated: (callback: (sessions: any) => void) => {
    const handler = (_: any, sessions: any) => callback(sessions);
    ipcRenderer.on('threads-updated', handler);
    return () => ipcRenderer.removeListener('threads-updated', handler);
  },

  onServicesManifestUpdated: (callback: (manifest: any) => void) => {
    const handler = (_: any, manifest: any) => callback(manifest);
    ipcRenderer.on('services-manifest-updated', handler);
    return () => ipcRenderer.removeListener('services-manifest-updated', handler);
  },

  onCoreStatusUpdate: (callback: (status: any) => void) => {
    const handler = (_: any, status: any) => callback(status);
    ipcRenderer.on('core-status-updated', handler);
    return () => ipcRenderer.removeListener('core-status-updated', handler);
  },

  onProviderStatusUpdate: (callback: (statuses: any) => void) => {
    const handler = (_: any, statuses: any) => callback(statuses);
    ipcRenderer.on('provider-status-updated', handler);
    return () => ipcRenderer.removeListener('provider-status-updated', handler);
  },

  onRequestLogAdded: (callback: (log: any) => void) => {
    const handler = (_: any, log: any) => callback(log);
    ipcRenderer.on('request-log-added', handler);
    return () => ipcRenderer.removeListener('request-log-added', handler);
  },

  onMcpLog: (callback: (log: any) => void) => {
    const handler = (_: any, log: any) => callback(log);
    ipcRenderer.on('request-log-added', handler);
    return () => ipcRenderer.removeListener('request-log-added', handler);
  },

  onBlindedSecretAdded: (callback: (secret: any) => void) => {
    const handler = (_: any, secret: any) => callback(secret);
    ipcRenderer.on('blinded-secret-added', handler);
    return () => ipcRenderer.removeListener('blinded-secret-added', handler);
  },

  onModelsUpdated: (callback: (registry: any) => void) => {
    const handler = (_: any, registry: any) => callback(registry);
    ipcRenderer.on('models-updated', handler);
    return () => ipcRenderer.removeListener('models-updated', handler);
  },

  onConfigUpdated: (callback: (config: any) => void) => {
    const handler = (_: any, config: any) => callback(config);
    ipcRenderer.on('config-updated', handler);
    return () => ipcRenderer.removeListener('config-updated', handler);
  },

  onRouteMatrixUpdated: (callback: (matrix: any) => void) => {
    const handler = (_: any, matrix: any) => callback(matrix);
    ipcRenderer.on('route-matrix-updated', handler);
    return () => ipcRenderer.removeListener('route-matrix-updated', handler);
  },

  // MCP Client Authentication
  getMasterToken: () => ipcRenderer.invoke('auth:get-token'),
  regenerateMasterToken: () => ipcRenderer.invoke('auth:regenerate-token'),
  verifyMasterToken: (token: string) => ipcRenderer.invoke('auth:verify-token', token),
  onTokenUpdated: (callback: (token: string) => void) => {
    const handler = (_: any, token: string) => callback(token);
    ipcRenderer.on('auth-token-updated', handler);
    return () => ipcRenderer.removeListener('auth-token-updated', handler);
  },

  // Session Synchronization & Extension
  syncSession: (payload: any) => ipcRenderer.invoke('auth:sync-session', payload),
  openExtensionDirectory: () => ipcRenderer.invoke('auth:open-extension-directory'),
  downloadExtensionZip: () => ipcRenderer.invoke('auth:download-extension-zip'),
  onSessionSynced: (callback: (data: any) => void) => {
    const handler = (_: any, data: any) => callback(data);
    ipcRenderer.on('auth:session-synced', handler);
    return () => ipcRenderer.removeListener('auth:session-synced', handler);
  },
};

// Safely expose API to renderer
try {
  contextBridge.exposeInMainWorld('transgenticApi', api);
} catch (error) {
  // Fallback for non-isolated contexts if any
  (window as any).transgenticApi = api;
}
