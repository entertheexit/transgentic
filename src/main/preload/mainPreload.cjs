const { contextBridge, ipcRenderer } = require('electron');

const api = {
  checkForUpdate: () => ipcRenderer.invoke('app:check-for-update'),
  getCoreStatus: () => ipcRenderer.invoke('get-core-status'),
  getProviderStatuses: () => ipcRenderer.invoke('get-provider-statuses'),
  getRequestLogs: (limit, offset) => ipcRenderer.invoke('get-request-logs', { limit, offset }),
  clearRequestLogs: () => ipcRenderer.invoke('clear-request-logs'),
  terminateRequest: (logId) => ipcRenderer.invoke('logs:terminate-request', logId),
  terminateAllPendingRequests: () => ipcRenderer.invoke('logs:terminate-all-pending'),
  getBlindedSecrets: () => ipcRenderer.invoke('get-blinded-secrets'),
  clearVaultSecrets: () => ipcRenderer.invoke('clear-vault-secrets'),
  clearBrowserStorage: () => ipcRenderer.invoke('storage:clear-browser-storage'),
  purgeAllData: () => ipcRenderer.invoke('storage:purge-all-data'),
  getConfig: () => ipcRenderer.invoke('get-config'),
  updateConfig: (config) => ipcRenderer.invoke('update-config', config),
  updateBalancedMode: (balanced) => ipcRenderer.invoke('config:update-balanced-mode', balanced),
  updateDoubleAgent: (config) => ipcRenderer.invoke('config:update-double-agent', config),
  toggleDoubleAgent: (enabled) => ipcRenderer.invoke('config:toggle-double-agent', enabled),
  toggleDoubleAgentMode: (mode, enabled) => ipcRenderer.invoke('config:toggle-double-agent-mode', { mode, enabled }),
  updateRecallConfig: (config) => ipcRenderer.invoke('config:update-recall', config),
  toggleRecall: (enabled) => ipcRenderer.invoke('recall:toggle', enabled),
  toggleRecallMode: (mode, enabled) => ipcRenderer.invoke('recall:toggle-mode', { mode, enabled }),
  toggleAgentGuard: (mode, enabled) => ipcRenderer.invoke('config:toggle-agent-guard', { mode, enabled }),
  updateAgentGuard: (config) => ipcRenderer.invoke('config:update-agent-guard', config),
  getModeRoutes: () => ipcRenderer.invoke('get-mode-routes'),
  getRouteMatrix: () => ipcRenderer.invoke('get-route-matrix'),
  updateModeRoute: (mode, config, pipeline) => ipcRenderer.invoke('update-mode-route', { mode, config, pipeline }),
  resetModeRoutes: () => ipcRenderer.invoke('reset-mode-routes'),
  
  // Model Registry & Settings
  getModelsState: () => ipcRenderer.invoke('models:get-state'),
  updateProviderConfig: (providerId, config) => ipcRenderer.invoke('models:update-config', { providerId, config }),
  toggleModel: (providerId, modelId, userEnabled) => ipcRenderer.invoke('models:toggle-model', { providerId, modelId, userEnabled }),
  toggleService: (providerId, serviceEnabled) => ipcRenderer.invoke('models:toggle-service', { providerId, serviceEnabled }),
  resyncModels: (providerId) => ipcRenderer.invoke('models:resync', providerId),
  selectDirectory: () => ipcRenderer.invoke('settings:select-directory'),
  applyPort: (newPort) => ipcRenderer.invoke('settings:apply-port', newPort),

  // Local Media Streaming & Handling
  openMediaFile: (filePath) => ipcRenderer.invoke('media:open-file', filePath),
  showMediaInFolder: (filePath) => ipcRenderer.invoke('media:show-in-folder', filePath),
  getMediaData: (filePath) => ipcRenderer.invoke('media:get-file-data', filePath),
  getMediaUrl: (filePath) => {
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

  openProviderDrawer: (providerId) => ipcRenderer.invoke('open-provider-drawer', providerId),
  closeProviderDrawer: () => ipcRenderer.invoke('close-provider-drawer'),
  setMode: (mode) => ipcRenderer.invoke('set-mode', mode),
  setCompactMode: (compact) => ipcRenderer.invoke('set-compact-mode', compact),
  toggleWindowPin: () => ipcRenderer.invoke('toggle-window-pin'),
  minimizeWindow: () => ipcRenderer.invoke('minimize-window'),
  hideToTray: () => ipcRenderer.invoke('hide-to-tray'),
  reloadProvider: (providerId) => ipcRenderer.invoke('reload-provider', providerId),
  openProviderWindow: (providerId, partitionKey) => ipcRenderer.invoke('open-provider-window', providerId, partitionKey),
  openSystemBrowser: (providerId) => ipcRenderer.invoke('open-system-browser', providerId),
  openExternalUrl: (url) => ipcRenderer.invoke('open-external-url', url),
  executePrompt: (prompt, mode, provider, model) => ipcRenderer.invoke('execute-prompt', { prompt, mode, provider, model }),
  getThreadSessions: () => ipcRenderer.invoke('threads:get-sessions'),
  clearThreadSessions: (params) => ipcRenderer.invoke('threads:clear-sessions', params),
  getServicesManifest: () => ipcRenderer.invoke('services:get-manifest'),
  toggleExperimentalService: (serviceId, enabled) => ipcRenderer.invoke('services:toggle-experimental', { serviceId, enabled }),
  updateServiceManifest: (serviceId, updates) => ipcRenderer.invoke('services:update-manifest', { serviceId, updates }),
  getServiceConflicts: () => ipcRenderer.invoke('services:get-conflicts'),
  addCustomApiProvider: (entry) => ipcRenderer.invoke('services:add-api-provider', entry),
  updateCustomApiProvider: (serviceId, entry) => ipcRenderer.invoke('services:update-api-provider', { serviceId, entry }),
  deleteProvider: (serviceId) => ipcRenderer.invoke('services:delete-provider', serviceId),
  updateServiceTitle: (serviceId, title) => ipcRenderer.invoke('services:update-title', { serviceId, title }),

  // Multi-Account Profile Registry
  getAccounts: () => ipcRenderer.invoke('accounts:get-all'),
  getAccountsForProvider: (providerId) => ipcRenderer.invoke('accounts:get-for-provider', providerId),
  addAccount: (providerId, alias) => ipcRenderer.invoke('accounts:add', { providerId, alias }),
  updateAccountAlias: (providerId, accountId, alias) => ipcRenderer.invoke('accounts:update-alias', { providerId, accountId, alias }),
  setMainAccount: (providerId, accountId) => ipcRenderer.invoke('accounts:set-main', { providerId, accountId }),
  setActiveAccount: (providerId, accountId) => ipcRenderer.invoke('accounts:set-active', { providerId, accountId }),
  reorderAccounts: (providerId, accountIds) => ipcRenderer.invoke('accounts:reorder', { providerId, accountIds }),
  deleteAccount: (providerId, accountId) => ipcRenderer.invoke('accounts:delete', { providerId, accountId }),

  // Local LLM Configuration & Testing
  fetchLocalLlmModels: (baseUrl, preset) => ipcRenderer.invoke('localllm:fetch-models', { baseUrl, preset }),
  testLocalLlmConnection: (config) => ipcRenderer.invoke('localllm:test-connection', config),
  updateLocalLlmConfig: (config) => ipcRenderer.invoke('localllm:update-config', config),

  // DOM Watchdog & Self-Healing Engine
  auditProviderDom: (providerId) => ipcRenderer.invoke('healing:audit-provider', providerId),
  healProviderDom: (providerId) => ipcRenderer.invoke('healing:heal-provider', providerId),
  getHealingStatus: () => ipcRenderer.invoke('healing:get-status'),
  updateHealingConfig: (config) => ipcRenderer.invoke('healing:update-config', config),

  // Custom Recipe Management Engine
  getRecipes: () => ipcRenderer.invoke('recipes:get-all'),
  installRecipe: (recipe, cookies) => ipcRenderer.invoke('recipes:install', { recipe, cookies }),
  deleteRecipe: (recipeId) => ipcRenderer.invoke('recipes:delete', recipeId),
  detectRecipeSelectors: (domSnippet, url, title) =>
    ipcRenderer.invoke('recipes:detect', { domSnippet, url, title }),
  getInspectorScript: () => ipcRenderer.invoke('recipes:get-inspector-script'),
  resetRecipeToDefault: (providerId) => ipcRenderer.invoke('recipes:reset-to-default', providerId),
  rollbackRecipe: (providerId, version) => ipcRenderer.invoke('recipes:rollback', { providerId, version }),
  getRecipeHistory: (providerId) => ipcRenderer.invoke('recipes:get-history', providerId),
  onHealingUpdated: (callback) => {
    const handler = (_, reports) => callback(reports);
    ipcRenderer.on('healing-reports-updated', handler);
    return () => ipcRenderer.removeListener('healing-reports-updated', handler);
  },

  onAccountsUpdated: (callback) => {
    const handler = (_, accounts) => callback(accounts);
    ipcRenderer.on('accounts-updated', handler);
    return () => ipcRenderer.removeListener('accounts-updated', handler);
  },

  onThreadsUpdated: (callback) => {
    const handler = (_, sessions) => callback(sessions);
    ipcRenderer.on('threads-updated', handler);
    return () => ipcRenderer.removeListener('threads-updated', handler);
  },

  onServicesManifestUpdated: (callback) => {
    const handler = (_, manifest) => callback(manifest);
    ipcRenderer.on('services-manifest-updated', handler);
    return () => ipcRenderer.removeListener('services-manifest-updated', handler);
  },

  onCoreStatusUpdate: (callback) => {
    const handler = (_, status) => callback(status);
    ipcRenderer.on('core-status-updated', handler);
    return () => ipcRenderer.removeListener('core-status-updated', handler);
  },

  onProviderStatusUpdate: (callback) => {
    const handler = (_, statuses) => callback(statuses);
    ipcRenderer.on('provider-status-updated', handler);
    return () => ipcRenderer.removeListener('provider-status-updated', handler);
  },

  onRequestLogAdded: (callback) => {
    const handler = (_, log) => callback(log);
    ipcRenderer.on('request-log-added', handler);
    return () => ipcRenderer.removeListener('request-log-added', handler);
  },

  onMcpLog: (callback) => {
    const handler = (_, log) => callback(log);
    ipcRenderer.on('request-log-added', handler);
    return () => ipcRenderer.removeListener('request-log-added', handler);
  },

  onBlindedSecretAdded: (callback) => {
    const handler = (_, secret) => callback(secret);
    ipcRenderer.on('blinded-secret-added', handler);
    return () => ipcRenderer.removeListener('blinded-secret-added', handler);
  },

  onModelsUpdated: (callback) => {
    const handler = (_, registry) => callback(registry);
    ipcRenderer.on('models-updated', handler);
    return () => ipcRenderer.removeListener('models-updated', handler);
  },

  onConfigUpdated: (callback) => {
    const handler = (_, config) => callback(config);
    ipcRenderer.on('config-updated', handler);
    return () => ipcRenderer.removeListener('config-updated', handler);
  },

  onRouteMatrixUpdated: (callback) => {
    const handler = (_, matrix) => callback(matrix);
    ipcRenderer.on('route-matrix-updated', handler);
    return () => ipcRenderer.removeListener('route-matrix-updated', handler);
  },

  // MCP Client Authentication
  getMasterToken: () => ipcRenderer.invoke('auth:get-token'),
  regenerateMasterToken: () => ipcRenderer.invoke('auth:regenerate-token'),
  verifyMasterToken: (token) => ipcRenderer.invoke('auth:verify-token', token),
  onTokenUpdated: (callback) => {
    const handler = (_, token) => callback(token);
    ipcRenderer.on('auth-token-updated', handler);
    return () => ipcRenderer.removeListener('auth-token-updated', handler);
  },

  // Session Synchronization & Extension
  syncSession: (payload) => ipcRenderer.invoke('auth:sync-session', payload),
  openExtensionDirectory: () => ipcRenderer.invoke('auth:open-extension-directory'),
  downloadExtensionZip: () => ipcRenderer.invoke('auth:download-extension-zip'),
  onSessionSynced: (callback) => {
    const handler = (_, data) => callback(data);
    ipcRenderer.on('auth:session-synced', handler);
    return () => ipcRenderer.removeListener('auth:session-synced', handler);
  },
};

// Safely expose API to renderer
try {
  contextBridge.exposeInMainWorld('transgenticApi', api);
} catch (error) {
  // Fallback for non-isolated contexts if any
  window.transgenticApi = api;
}
