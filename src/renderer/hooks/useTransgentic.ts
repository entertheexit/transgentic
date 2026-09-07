import { useState, useEffect, useCallback } from 'react';
import {
  BlindedTokenMap,
  CoreStatus,
  McpRequestLog,
  ModeRouteConfig,
  ProviderConfig,
  ProviderId,
  ProviderStatus,
  RegistryStore,
  TaskMode,
  TransgenticConfig,
  ServicesManifest,
  ServiceManifestEntry,
  ServiceRouteConflict,
  AccountProfile,
  ProviderAccountStore,
  AccountRegistryStore,
  LocalLLMConfig,
  HealingConfig,
  RouteMatrix,
  ModePipelineConfig,
  DoubleAgentConfig,
} from '../../shared/types.js';

// Extend window definition for TypeScript
declare global {
  interface Window {
    transgenticApi?: any;
  }
}

const DEFAULT_REGISTRY: RegistryStore = {
  chatgpt: {
    serviceEnabled: true,
    activeSelectionMode: 'hybrid',
    allowMcpOverride: true,
    defaultModelId: 'gpt-4o',
    hourlyLimit: 30,
    cooldownSeconds: 6,
    models: [
      { id: 'gpt-4o', displayName: 'GPT-4o (Omni & Multimodal)', discoveredAvailable: true, userEnabled: true, requiresTier: 'Free/Plus', mode: 'general', modes: ['general', 'coding', 'writing', 'image'] },
      { id: 'o1', displayName: 'o1 (Deep Reasoning)', discoveredAvailable: true, userEnabled: true, requiresTier: 'Plus/Pro', mode: 'general', modes: ['general', 'coding', 'writing'] },
      { id: 'o3-mini', displayName: 'o3-mini (High Speed Reasoning)', discoveredAvailable: true, userEnabled: true, requiresTier: 'Free/Plus', mode: 'coding', modes: ['coding', 'general', 'writing'] },
      { id: 'gpt-4o-mini', displayName: 'GPT-4o mini (Lightweight)', discoveredAvailable: true, userEnabled: true, requiresTier: 'Free', mode: 'general', modes: ['general', 'coding', 'writing'] },
    ],
  },
  claude: {
    serviceEnabled: true,
    activeSelectionMode: 'hybrid',
    allowMcpOverride: true,
    defaultModelId: 'claude-3-5-sonnet',
    hourlyLimit: 35,
    cooldownSeconds: 6,
    models: [
      { id: 'claude-3-5-sonnet', displayName: 'Claude 3.5 Sonnet (Coding & Reasoning)', discoveredAvailable: true, userEnabled: true, requiresTier: 'Free/Pro', mode: 'coding', modes: ['general', 'coding', 'writing'] },
      { id: 'claude-3-opus', displayName: 'Claude 3 Opus (High Intelligence)', discoveredAvailable: true, userEnabled: true, requiresTier: 'Pro', mode: 'writing', modes: ['general', 'coding', 'writing'] },
      { id: 'claude-3-5-haiku', displayName: 'Claude 3.5 Haiku (Lightning Fast)', discoveredAvailable: true, userEnabled: true, requiresTier: 'Free/Pro', mode: 'general', modes: ['general', 'coding', 'writing'] },
    ],
  },
  gemini: {
    serviceEnabled: true,
    activeSelectionMode: 'hybrid',
    allowMcpOverride: true,
    defaultModelId: 'gemini-2-0-flash',
    hourlyLimit: 50,
    cooldownSeconds: 5,
    models: [
      { id: 'gemini-2-0-flash', displayName: 'Gemini 2.0 Flash (Next-Gen Multimodal)', discoveredAvailable: true, userEnabled: true, requiresTier: 'Free/Advanced', mode: 'general', modes: ['general', 'coding', 'writing', 'image', 'video', 'audio'] },
      { id: 'gemini-2-0-pro', displayName: 'Gemini 2.0 Pro Experimental', discoveredAvailable: true, userEnabled: true, requiresTier: 'Advanced', mode: 'general', modes: ['general', 'coding', 'writing', 'image', 'video', 'audio'] },
      { id: 'gemini-1-5-flash', displayName: 'Gemini 1.5 Flash (Fast)', discoveredAvailable: true, userEnabled: true, requiresTier: 'Free', mode: 'general', modes: ['general', 'coding', 'writing', 'video', 'audio'] },
      { id: 'gemini-1-5-pro', displayName: 'Gemini 1.5 Pro (2M Context)', discoveredAvailable: true, userEnabled: true, requiresTier: 'Free/Advanced', mode: 'general', modes: ['general', 'coding', 'writing', 'video', 'audio'] },
    ],
  },
  grok: {
    serviceEnabled: true,
    activeSelectionMode: 'hybrid',
    allowMcpOverride: true,
    defaultModelId: 'grok-3',
    hourlyLimit: 40,
    cooldownSeconds: 6,
    models: [
      { id: 'grok-3', displayName: 'Grok 3 (State-of-the-Art)', discoveredAvailable: true, userEnabled: true, requiresTier: 'Premium', mode: 'general', modes: ['general', 'coding', 'writing', 'video'] },
      { id: 'grok-3-think', displayName: 'Grok 3 Think / DeepSearch', discoveredAvailable: true, userEnabled: true, requiresTier: 'Premium+', mode: 'general', modes: ['general', 'coding', 'writing', 'video'] },
      { id: 'grok-2', displayName: 'Grok 2 (Speed & Coding)', discoveredAvailable: true, userEnabled: true, requiresTier: 'Premium', mode: 'coding', modes: ['general', 'coding', 'writing'] },
      { id: 'grok-2-vision', displayName: 'Grok 2 Vision / Imagine', discoveredAvailable: true, userEnabled: true, requiresTier: 'Premium', mode: 'image', modes: ['image', 'video', 'general'] },
    ],
  },
};

export function useTransgentic() {
  const [coreStatus, setCoreStatus] = useState<CoreStatus>({
    state: 'idle',
    activeMode: 'general',
    requestCount: 0,
    totalTokensProtected: 0,
    activeVaultSecrets: 0,
    port: 58420,
    uptimeSeconds: 0,
  });

  const [config, setConfig] = useState<TransgenticConfig>({
    port: 58420,
    defaultMode: 'general',
    interMessageCooldownMs: 6000,
    textJitterMinMs: 3000,
    textJitterMaxMs: 8000,
    mediaJitterMinMs: 12000,
    mediaJitterMaxMs: 25000,
    autoFallbackEnabled: true,
    dataBlindingEnabled: true,
    assetsDir: '',
    coding: {
      balancedMode: true,
      primaryProvider: 'claude',
      fallbackProviders: ['chatgpt', 'gemini', 'grok'],
    },
    localLLM: {
      enabled: false,
      preset: 'ollama',
      baseUrl: 'http://127.0.0.1:11434',
      selectedModel: '',
      temperature: 0.2,
      contextLength: 8192,
    },
    healing: {
      autoHealingEnabled: true,
      checkIntervalMinutes: 60,
      checkOnPageLoad: true,
      checkModelSelector: true,
    },
  });

  const [healingReports, setHealingReports] = useState<Record<string, any>>({});

  const [providers, setProviders] = useState<Record<ProviderId, ProviderStatus>>({
    chatgpt: { id: 'chatgpt', name: 'ChatGPT', url: 'https://chatgpt.com', state: 'disconnected', partition: 'persist:transgentic_chatgpt', rateLimitCount: 0, isAuthenticated: false },
    claude: { id: 'claude', name: 'Claude', url: 'https://claude.ai', state: 'disconnected', partition: 'persist:transgentic_claude', rateLimitCount: 0, isAuthenticated: false },
    gemini: { id: 'gemini', name: 'Gemini', url: 'https://gemini.google.com', state: 'disconnected', partition: 'persist:transgentic_gemini', rateLimitCount: 0, isAuthenticated: false },
    grok: { id: 'grok', name: 'Grok', url: 'https://grok.com', state: 'disconnected', partition: 'persist:transgentic_grok', rateLimitCount: 0, isAuthenticated: false },
    localllm: { id: 'localllm', name: 'Local LLM', url: 'http://127.0.0.1:11434', state: 'disconnected', partition: 'persist:transgentic_localllm', rateLimitCount: 0, isAuthenticated: true },
  });

  const [logs, setLogs] = useState<McpRequestLog[]>([]);
  const [totalLogsCount, setTotalLogsCount] = useState<number>(0);
  const [secrets, setSecrets] = useState<BlindedTokenMap[]>([]);
  const [registry, setRegistry] = useState<RegistryStore>(DEFAULT_REGISTRY);
  const [modeRoutes, setModeRoutes] = useState<Record<TaskMode, ModeRouteConfig>>({
    general: { mode: 'general', primary: 'chatgpt', fallbacks: ['claude', 'gemini', 'grok'], outputFormat: 'prose_markdown' },
    coding: { mode: 'coding', primary: 'claude', fallbacks: ['chatgpt', 'gemini', 'grok'], outputFormat: 'json_code' },
    writing: { mode: 'writing', primary: 'chatgpt', fallbacks: ['claude', 'grok', 'gemini'], outputFormat: 'prose_markdown' },
    image: { mode: 'image', primary: 'grok', fallbacks: ['chatgpt', 'gemini'], outputFormat: 'file_download' },
    video: { mode: 'video', primary: 'grok', fallbacks: ['gemini'], outputFormat: 'file_download' },
    audio: { mode: 'audio', primary: 'gemini', fallbacks: [], outputFormat: 'file_download' },
  });

  const [routeMatrix, setRouteMatrix] = useState<RouteMatrix | null>(null);

  const [activeDrawerProvider, setActiveDrawerProvider] = useState<ProviderId | null>(null);

  const api = typeof window !== 'undefined' ? window.transgenticApi : undefined;

  const [activeSessions, setActiveSessions] = useState<any[]>([]);
  const [servicesManifest, setServicesManifest] = useState<ServicesManifest | null>(null);
  const [serviceConflicts, setServiceConflicts] = useState<ServiceRouteConflict[]>([]);
  const [accountsRegistry, setAccountsRegistry] = useState<AccountRegistryStore | null>(null);

  useEffect(() => {
    if (!api) return;

    // Initial fetches
    api.getCoreStatus().then((s: CoreStatus) => s && setCoreStatus(s));
    api.getProviderStatuses().then((p: any) => p && setProviders(p));
    if (api.getRequestLogs) {
      api.getRequestLogs(20, 0).then((res: any) => {
        if (res && Array.isArray(res.logs)) {
          setLogs(res.logs);
          setTotalLogsCount(res.total);
        } else if (Array.isArray(res)) {
          setLogs(res);
          setTotalLogsCount(res.length);
        }
      });
    }
    api.getBlindedSecrets().then((sec: BlindedTokenMap[]) => sec && setSecrets(sec));
    if (api.getConfig) {
      api.getConfig().then((c: TransgenticConfig) => c && setConfig(c));
    }
    if (api.getRouteMatrix) {
      api.getRouteMatrix().then((matrix: RouteMatrix) => {
        if (matrix) setRouteMatrix(matrix);
      });
    }
    if (api.getModeRoutes) {
      api.getModeRoutes().then((routes: Record<TaskMode, ModeRouteConfig>) => {
        if (routes) setModeRoutes(routes);
      });
    }
    if (api.getModelsState) {
      api.getModelsState().then((r: RegistryStore) => {
        if (r) setRegistry(r);
      });
    }
    if (api.getThreadSessions) {
      api.getThreadSessions().then((s: any[]) => {
        if (Array.isArray(s)) setActiveSessions(s);
      });
    }
    if (api.getServicesManifest) {
      api.getServicesManifest().then((m: ServicesManifest) => m && setServicesManifest(m));
    }
    if (api.getServiceConflicts) {
      api.getServiceConflicts().then((c: ServiceRouteConflict[]) => c && setServiceConflicts(c));
    }
    if (api.getAccounts) {
      api.getAccounts().then((a: AccountRegistryStore) => a && setAccountsRegistry(a));
    }
    if (api.getHealingStatus) {
      api.getHealingStatus().then((res: any) => {
        if (res?.reports) setHealingReports(res.reports);
      });
    }

    // Real-time event listeners
    const unsubCore = api.onCoreStatusUpdate ? api.onCoreStatusUpdate((s: CoreStatus) => setCoreStatus(s)) : undefined;
    const unsubProv = api.onProviderStatusUpdate ? api.onProviderStatusUpdate((p: Record<ProviderId, ProviderStatus>) => setProviders(p)) : undefined;
    const logSubscriber = api.onMcpLog || api.onRequestLogAdded;
    const unsubLogs = logSubscriber ? logSubscriber((log: McpRequestLog) => {
      setLogs((prev) => {
        const idx = prev.findIndex((l) => l.id === log.id);
        if (idx !== -1) {
          const next = [...prev];
          next[idx] = log;
          return next;
        }
        return [log, ...prev.slice(0, 19)];
      });
    }) : undefined;
    const unsubModels = api.onModelsUpdated ? api.onModelsUpdated((r: RegistryStore) => setRegistry(r)) : undefined;
    const unsubThreads = api.onThreadsUpdated ? api.onThreadsUpdated((s: any[]) => {
      if (Array.isArray(s)) setActiveSessions(s);
    }) : undefined;
    const unsubManifest = api.onServicesManifestUpdated ? api.onServicesManifestUpdated((m: ServicesManifest) => {
      if (m) {
        setServicesManifest(m);
        if (api.getServiceConflicts) {
          api.getServiceConflicts().then((c: ServiceRouteConflict[]) => c && setServiceConflicts(c));
        }
      }
    }) : undefined;
    const unsubAccounts = api.onAccountsUpdated ? api.onAccountsUpdated((a: AccountRegistryStore) => {
      if (a) setAccountsRegistry(a);
    }) : undefined;
    const unsubHealing = api.onHealingUpdated ? api.onHealingUpdated((reports: any) => {
      if (reports) setHealingReports(reports);
    }) : undefined;
    const unsubSessionSynced = api.onSessionSynced ? api.onSessionSynced(() => {
      if (api.getProviderStatuses) {
        api.getProviderStatuses().then((p: any) => p && setProviders(p));
      }
      if (api.getServicesManifest) {
        api.getServicesManifest().then((m: any) => m && setServicesManifest(m));
      }
    }) : undefined;
    const unsubConfig = api.onConfigUpdated ? api.onConfigUpdated((c: TransgenticConfig) => {
      if (c) setConfig(c);
    }) : undefined;
    const unsubRouteMatrix = api.onRouteMatrixUpdated ? api.onRouteMatrixUpdated((rm: RouteMatrix) => {
      if (rm) setRouteMatrix(rm);
    }) : undefined;

    return () => {
      if (unsubCore) unsubCore();
      if (unsubProv) unsubProv();
      if (unsubLogs) unsubLogs();
      if (unsubModels) unsubModels();
      if (unsubThreads) unsubThreads();
      if (unsubManifest) unsubManifest();
      if (unsubAccounts) unsubAccounts();
      if (unsubHealing) unsubHealing();
      if (unsubSessionSynced) unsubSessionSynced();
      if (unsubConfig) unsubConfig();
      if (unsubRouteMatrix) unsubRouteMatrix();
    };
  }, [api]);

  const updateConfig = useCallback(async (newCfg: Partial<TransgenticConfig>) => {
    if (api?.updateConfig) {
      const updated = await api.updateConfig(newCfg);
      setConfig(updated);
      return updated;
    }
  }, [api]);

  const updateModeRoute = useCallback(async (mode: TaskMode, routeCfg: Partial<ModeRouteConfig> | Partial<ModePipelineConfig>, pipeline: 'main' | 'co' = 'main') => {
    if (api?.updateModeRoute) {
      await api.updateModeRoute(mode, routeCfg, pipeline);
      if (api.getRouteMatrix) {
        const matrix = await api.getRouteMatrix();
        if (matrix) setRouteMatrix(matrix);
      }
      const all = await api.getModeRoutes();
      if (all) setModeRoutes(all);
      return all;
    }
  }, [api]);

  const resetModeRoutes = useCallback(async () => {
    if (api?.resetModeRoutes) {
      const res = await api.resetModeRoutes();
      setModeRoutes(res);
      return res;
    }
  }, [api]);

  const updateProviderConfig = useCallback(async (providerId: ProviderId, provCfg: Partial<ProviderConfig>) => {
    if (api?.updateProviderConfig) {
      const updated = await api.updateProviderConfig(providerId, provCfg);
      setRegistry((prev) => ({
        ...prev,
        [providerId]: updated,
      }));
      return updated;
    }
  }, [api]);

  const toggleModel = useCallback(async (providerId: ProviderId, modelId: string, userEnabled: boolean) => {
    if (api?.toggleModel) {
      const updated = await api.toggleModel(providerId, modelId, userEnabled);
      setRegistry(updated);
      return updated;
    }
  }, [api]);

  const toggleService = useCallback(async (providerId: ProviderId, serviceEnabled: boolean) => {
    if (!api?.toggleService) return;
    try {
      const updated = await api.toggleService(providerId, serviceEnabled);
      if (updated) setRegistry(updated);
      const manifest = await api.getServicesManifest?.();
      if (manifest) setServicesManifest(manifest);
      return updated;
    } catch (err) {
      // Cancellation leaves both desktop and renderer state unchanged.
      console.warn('[Transgentic] toggleService notice:', err);
    }
  }, [api]);

  const resyncModels = useCallback(async (providerId?: ProviderId) => {
    if (api?.resyncModels) {
      const updated = await api.resyncModels(providerId);
      setRegistry(updated);
      return updated;
    }
  }, [api]);

  const selectDirectory = useCallback(async () => {
    if (api?.selectDirectory) {
      const selected = await api.selectDirectory();
      if (selected) {
        setConfig((prev) => ({ ...prev, assetsDir: selected }));
      }
      return selected;
    }
    return null;
  }, [api]);

  const applyPort = useCallback(async (newPort: number) => {
    if (api?.applyPort) {
      const res = await api.applyPort(newPort);
      if (res.success) {
        setConfig((prev) => ({ ...prev, port: res.port }));
      }
      return res;
    }
    return { success: false, port: config.port, error: 'API not available' };
  }, [api, config.port]);

  const openDrawer = useCallback((providerId: ProviderId) => {
    if (providerId.startsWith('api_')) return;
    setActiveDrawerProvider(providerId);
    api?.openProviderDrawer(providerId);
  }, [api]);

  const closeDrawer = useCallback(() => {
    setActiveDrawerProvider(null);
    api?.closeProviderDrawer();
  }, [api]);

  const setMode = useCallback((mode: TaskMode) => {
    setCoreStatus((prev) => ({ ...prev, activeMode: mode }));
    api?.setMode(mode);
  }, [api]);

  const togglePin = useCallback(async () => {
    return await api?.toggleWindowPin();
  }, [api]);

  const minimize = useCallback(() => {
    api?.minimizeWindow();
  }, [api]);

  const hideToTray = useCallback(() => {
    api?.hideToTray();
  }, [api]);

  const reloadProvider = useCallback(async (providerId: ProviderId) => {
    await api?.reloadProvider(providerId);
    if (api?.getProviderStatuses) {
      const statuses = await api.getProviderStatuses();
      if (statuses) setProviders(statuses);
    }
  }, [api]);

  const openProviderWindow = useCallback(async (providerId: ProviderId) => {
    await api?.openProviderWindow(providerId);
  }, [api]);

  const openSystemBrowser = useCallback(async (providerId: ProviderId) => {
    await api?.openSystemBrowser(providerId);
  }, [api]);

  const clearVault = useCallback(async () => {
    await api?.clearVaultSecrets();
    setSecrets([]);
  }, [api]);

  const clearBrowserStorage = useCallback(async () => {
    if (api?.clearBrowserStorage) {
      const res = await api.clearBrowserStorage();
      if (api?.getProviderStatuses) {
        const statuses = await api.getProviderStatuses();
        if (statuses) setProviders(statuses);
      }
      setActiveSessions([]);
      return res;
    }
  }, [api]);

  const purgeAllLocalStorage = useCallback(async () => {
    if (api?.purgeAllData) {
      const res = await api.purgeAllData();
      try {
        window.localStorage.clear();
      } catch {}
      setSecrets([]);
      setLogs([]);
      setTotalLogsCount(0);
      setActiveSessions([]);
      if (api?.getProviderStatuses) {
        const statuses = await api.getProviderStatuses();
        if (statuses) setProviders(statuses);
      }
      return res;
    } else {
      try {
        window.localStorage.clear();
      } catch {}
      await clearVault();
      setActiveSessions([]);
      return { success: true };
    }
  }, [api, clearVault]);

  const clearLogs = useCallback(async () => {
    if (api?.clearRequestLogs) {
      await api.clearRequestLogs();
      setLogs([]);
      setTotalLogsCount(0);
    }
  }, [api]);

  const terminateRequest = useCallback(async (logId: string) => {
    setLogs((prev) =>
      prev.map((l) =>
        l.id === logId
          ? {
              ...l,
              status: 'failed',
              error: 'Terminated by user: Request stopped',
              durationMs: Date.now() - l.timestamp,
              responseSnippet: '[Terminated by user: Request stopped]',
            }
          : l
      )
    );
    if (api?.terminateRequest) {
      return await api.terminateRequest(logId);
    }
    return false;
  }, [api]);

  const terminateAllPendingRequests = useCallback(async () => {
    setLogs((prev) =>
      prev.map((l) =>
        l.status === 'pending'
          ? {
              ...l,
              status: 'failed',
              error: 'All pending requests terminated by user',
              durationMs: Date.now() - l.timestamp,
              responseSnippet: '[Terminated by user: Request stopped]',
            }
          : l
      )
    );
    if (api?.terminateAllPendingRequests) {
      return await api.terminateAllPendingRequests();
    }
    return 0;
  }, [api]);

  const fetchMoreLogs = useCallback(async (limit = 20) => {
    if (api?.getRequestLogs) {
      const res: any = await api.getRequestLogs(limit, logs.length);
      if (res && Array.isArray(res.logs)) {
        setLogs((prev) => {
          const ids = new Set(prev.map((l) => l.id));
          const additions = res.logs.filter((l: McpRequestLog) => !ids.has(l.id));
          return [...prev, ...additions];
        });
        setTotalLogsCount(res.total);
      }
    }
  }, [api, logs.length]);

  const toggleBalancedMode = useCallback(async (enabled?: boolean) => {
    const currentVal = config.balancedMode ?? config.coding?.balancedMode ?? true;
    const nextVal = enabled !== undefined ? enabled : !currentVal;
    if (api?.updateBalancedMode) {
      await api.updateBalancedMode(nextVal);
    } else if (api?.updateConfig) {
      await api.updateConfig({
        balancedMode: nextVal,
        coding: {
          ...(config.coding || { primaryProvider: 'claude', fallbackProviders: ['chatgpt', 'gemini', 'grok'] }),
          balancedMode: nextVal,
        },
      });
    }
    setConfig((prev) => ({
      ...prev,
      balancedMode: nextVal,
      coding: {
        ...(prev.coding || { primaryProvider: 'claude', fallbackProviders: ['chatgpt', 'gemini', 'grok'] }),
        balancedMode: nextVal,
      },
    }));
    return nextVal;
  }, [api, config.balancedMode, config.coding]);

  const updateDoubleAgentConfig = useCallback(async (updates: Partial<DoubleAgentConfig>) => {
    setConfig((prev) => ({
      ...prev,
      doubleAgent: {
        ...(prev.doubleAgent || { enabled: false, includeLocalLlm: false }),
        ...updates,
      },
    }));

    if (api?.updateDoubleAgent) {
      try {
        const updated = await api.updateDoubleAgent(updates);
        if (updated) {
          setConfig((prev) => ({
            ...prev,
            doubleAgent: {
              ...(prev.doubleAgent || { enabled: false, includeLocalLlm: false }),
              ...updated,
            },
          }));
        }
        return updated;
      } catch (err) {
        console.warn('api.updateDoubleAgent failed, falling back to updateConfig', err);
      }
    }

    if (api?.updateConfig) {
      const nextDouble = {
        ...(config.doubleAgent || { enabled: false, includeLocalLlm: false }),
        ...updates,
      };
      await api.updateConfig({ doubleAgent: nextDouble });
      return nextDouble;
    }
  }, [api, config.doubleAgent]);

  const toggleDoubleAgent = useCallback(async (enabled?: boolean) => {
    const currentVal = config.doubleAgent?.enabled ?? false;
    const nextVal = enabled !== undefined ? enabled : !currentVal;

    setConfig((prev) => ({
      ...prev,
      doubleAgent: {
        ...(prev.doubleAgent || { includeLocalLlm: false }),
        enabled: nextVal,
      },
    }));

    if (api?.toggleDoubleAgent) {
      try {
        const updated = await api.toggleDoubleAgent(nextVal);
        return updated;
      } catch (err) {
        console.warn('api.toggleDoubleAgent failed, falling back to updateConfig', err);
      }
    }

    if (api?.updateConfig) {
      const nextDouble = {
        ...(config.doubleAgent || { includeLocalLlm: false }),
        enabled: nextVal,
      };
      await api.updateConfig({ doubleAgent: nextDouble });
      return nextVal;
    }
    return nextVal;
  }, [api, config.doubleAgent]);

  const toggleDoubleAgentMode = useCallback(async (mode: TaskMode, enabled?: boolean) => {
    const currentModes = config.doubleAgent?.modes || {
      general: true,
      coding: true,
      writing: true,
      image: true,
      video: true,
      audio: true,
    };
    const currentVal = currentModes[mode] ?? true;
    const nextVal = enabled !== undefined ? enabled : !currentVal;
    const nextModes = { ...currentModes, [mode]: nextVal };

    setConfig((prev) => ({
      ...prev,
      doubleAgent: {
        ...(prev.doubleAgent || { enabled: false, includeLocalLlm: false }),
        modes: nextModes,
      },
    }));

    if (api?.toggleDoubleAgentMode) {
      try {
        await api.toggleDoubleAgentMode(mode, nextVal);
        return nextVal;
      } catch (err) {
        console.warn('api.toggleDoubleAgentMode error:', err);
      }
    }

    if (api?.updateDoubleAgent) {
      try {
        await api.updateDoubleAgent({ modes: nextModes });
        return nextVal;
      } catch (err) {
        console.warn('api.updateDoubleAgent error:', err);
      }
    }

    if (api?.updateConfig) {
      await api.updateConfig({
        doubleAgent: {
          ...(config.doubleAgent || { enabled: false, includeLocalLlm: false }),
          modes: nextModes,
        },
      });
    }
    return nextVal;
  }, [api, config.doubleAgent]);

  const toggleRecall = useCallback(async (enabled?: boolean) => {
    const currentVal = config.recall?.enabled ?? true;
    const nextVal = enabled !== undefined ? enabled : !currentVal;
    if (api?.toggleRecall) {
      await api.toggleRecall(nextVal);
    } else if (api?.updateRecallConfig) {
      await api.updateRecallConfig({ enabled: nextVal });
    } else if (api?.updateConfig) {
      await api.updateConfig({
        recall: {
          ...(config.recall || { strategy: 'single-pass', autoTriggerKeywords: true }),
          enabled: nextVal,
        },
      });
    }
    setConfig((prev) => ({
      ...prev,
      recall: {
        ...(prev.recall || { strategy: 'single-pass', autoTriggerKeywords: true }),
        enabled: nextVal,
      },
    }));
    return nextVal;
  }, [api, config.recall]);

  const toggleRecallMode = useCallback(async (mode: TaskMode, enabled?: boolean) => {
    const currentModes = config.recall?.modes || {
      general: true,
      coding: true,
      writing: true,
      image: true,
      video: true,
      audio: true,
    };
    const currentVal = currentModes[mode] ?? true;
    const nextVal = enabled !== undefined ? enabled : !currentVal;
    const updatedModes = {
      ...currentModes,
      [mode]: nextVal,
    };

    if (api?.toggleRecallMode) {
      await api.toggleRecallMode(mode, nextVal);
    } else if (api?.updateRecallConfig) {
      await api.updateRecallConfig({ modes: updatedModes });
    } else if (api?.updateConfig) {
      await api.updateConfig({
        recall: {
          ...(config.recall || { enabled: true, strategy: 'single-pass', autoTriggerKeywords: true }),
          modes: updatedModes,
        },
      });
    }
    setConfig((prev) => ({
      ...prev,
      recall: {
        ...(prev.recall || { enabled: true, strategy: 'single-pass', autoTriggerKeywords: true }),
        modes: updatedModes,
      },
    }));
    return nextVal;
  }, [api, config.recall]);

  const updateRecallConfig = useCallback(async (newRecallCfg: Partial<import('../../shared/types.js').RecallConfig>) => {
    if (api?.updateRecallConfig) {
      await api.updateRecallConfig(newRecallCfg);
    } else if (api?.updateConfig) {
      await api.updateConfig({
        recall: {
          ...(config.recall || { enabled: true, strategy: 'single-pass', autoTriggerKeywords: true }),
          ...newRecallCfg,
        },
      });
    }
    setConfig((prev) => ({
      ...prev,
      recall: {
        ...(prev.recall || { enabled: true, strategy: 'single-pass', autoTriggerKeywords: true }),
        ...newRecallCfg,
      },
    }));
  }, [api, config.recall]);

  const toggleAgentGuard = useCallback(async (mode: TaskMode, enabled?: boolean) => {
    const currentMap = (typeof config.agentHaltGuard === 'object' && config.agentHaltGuard !== null)
      ? config.agentHaltGuard
      : { general: true, coding: true, writing: true, image: true, video: true, audio: true };
    const currentVal = currentMap[mode] ?? true;
    const nextVal = enabled !== undefined ? enabled : !currentVal;

    if (api?.toggleAgentGuard) {
      await api.toggleAgentGuard(mode, nextVal);
    } else if (api?.updateConfig) {
      await api.updateConfig({
        agentHaltGuard: {
          ...currentMap,
          [mode]: nextVal,
        },
      });
    }
    setConfig((prev) => ({
      ...prev,
      agentHaltGuard: {
        ...((typeof prev.agentHaltGuard === 'object' && prev.agentHaltGuard !== null)
          ? prev.agentHaltGuard
          : { general: true, coding: true, writing: true, image: true, video: true, audio: true }),
        [mode]: nextVal,
      },
    }));
    return nextVal;
  }, [api, config.agentHaltGuard]);

  const executePrompt = useCallback(async (prompt: string, mode?: TaskMode, preferredProvider?: ProviderId, model?: string) => {
    if (api?.executePrompt) {
      return await api.executePrompt(prompt, mode, preferredProvider, model);
    }
    throw new Error('API not available');
  }, [api]);

  const setCompactMode = useCallback(async (compact: boolean) => {
    if (api?.setCompactMode) {
      return await api.setCompactMode(compact);
    }
  }, [api]);

  const clearThreadSessions = useCallback(async (providerId?: ProviderId) => {
    if (api?.clearThreadSessions) {
      const res = await api.clearThreadSessions({ providerId });
      if (res?.sessions) {
        setActiveSessions(res.sessions);
      } else {
        setActiveSessions([]);
      }
      return res;
    }
  }, [api]);

  const clearServiceConflicts = useCallback(() => {
    setServiceConflicts([]);
  }, []);

  const addAccount = useCallback(async (providerId: ProviderId, alias: string) => {
    if (api?.addAccount) {
      const res = await api.addAccount(providerId, alias);
      const all = await api.getAccounts();
      if (all) setAccountsRegistry(all);
      return res;
    }
  }, [api]);

  const updateAccountAlias = useCallback(async (providerId: ProviderId, accountId: string, alias: string) => {
    if (api?.updateAccountAlias) {
      const res = await api.updateAccountAlias(providerId, accountId, alias);
      const all = await api.getAccounts();
      if (all) setAccountsRegistry(all);
      return res;
    }
  }, [api]);

  const setMainAccount = useCallback(async (providerId: ProviderId, accountId: string) => {
    if (api?.setMainAccount) {
      const updated = await api.setMainAccount(providerId, accountId);
      const all = await api.getAccounts();
      if (all) setAccountsRegistry(all);
      return updated;
    }
  }, [api]);

  const setActiveAccount = useCallback(async (providerId: ProviderId, accountId: string) => {
    if (api?.setActiveAccount) {
      const updated = await api.setActiveAccount(providerId, accountId);
      const all = await api.getAccounts();
      if (all) setAccountsRegistry(all);
      return updated;
    }
  }, [api]);

  const reorderAccounts = useCallback(async (providerId: ProviderId, accountIds: string[]) => {
    if (api?.reorderAccounts) {
      const updated = await api.reorderAccounts(providerId, accountIds);
      const all = await api.getAccounts();
      if (all) setAccountsRegistry(all);
      return updated;
    }
  }, [api]);

  const deleteAccount = useCallback(async (providerId: ProviderId, accountId: string) => {
    if (api?.deleteAccount) {
      const updated = await api.deleteAccount(providerId, accountId);
      const all = await api.getAccounts();
      if (all) setAccountsRegistry(all);
      return updated;
    }
  }, [api]);

  const toggleExperimentalService = useCallback(async (serviceId: ProviderId, enabled: boolean) => {
    try {
      if (api?.toggleExperimentalService) {
        const updated = await api.toggleExperimentalService(serviceId, enabled);
        if (updated) setServicesManifest(updated);
        setRegistry(prev => ({
          ...prev,
          [serviceId]: {
            ...(prev[serviceId] || { activeSelectionMode: 'hybrid', allowMcpOverride: true, defaultModelId: '', models: [] }),
            serviceEnabled: enabled,
          },
        }));
      } else {
        await toggleService(serviceId, enabled);
      }
      const statuses = await api?.getProviderStatuses?.();
      if (statuses) setProviders(statuses);
    } catch (err) {
      // Do not retry a rejected confirmation through another IPC route.
      console.warn('[Transgentic] Notice while toggling experimental service:', err);
    }
  }, [api, toggleService]);

  const updateServiceManifest = useCallback(async (serviceId: ProviderId, updates: Partial<ServiceManifestEntry>) => {
    if (api?.updateServiceManifest) {
      const updated = await api.updateServiceManifest(serviceId, updates);
      if (updated) {
        setServicesManifest(updated);
      }
      return updated;
    }
  }, [api]);

  const fetchLocalLlmModels = useCallback(async (baseUrl: string, preset: string) => {
    if (api?.fetchLocalLlmModels) {
      return await api.fetchLocalLlmModels(baseUrl, preset);
    }
    return [];
  }, [api]);

  const testLocalLlmConnection = useCallback(async (cfg: LocalLLMConfig) => {
    if (api?.testLocalLlmConnection) {
      return await api.testLocalLlmConnection(cfg);
    }
    return { success: false, latencyMs: 0, message: 'Local LLM API unavailable' };
  }, [api]);

  const updateLocalLlmConfig = useCallback(async (updates: Partial<LocalLLMConfig>) => {
    if (api?.updateLocalLlmConfig) {
      const updated = await api.updateLocalLlmConfig(updates);
      setConfig((prev) => ({ ...prev, localLLM: updated }));
      return updated;
    }
  }, [api]);

  const auditProviderDom = useCallback(async (providerId: ProviderId) => {
    if (api?.auditProviderDom) {
      const report = await api.auditProviderDom(providerId);
      setHealingReports((prev) => ({ ...prev, [providerId]: report }));
      return report;
    }
  }, [api]);

  const healProviderDom = useCallback(async (providerId: ProviderId) => {
    if (api?.healProviderDom) {
      const res = await api.healProviderDom(providerId);
      if (api.getHealingStatus) {
        const status = await api.getHealingStatus();
        if (status?.reports) setHealingReports(status.reports);
      }
      return res;
    }
  }, [api]);

  const updateHealingConfig = useCallback(async (updates: Partial<HealingConfig>) => {
    if (api?.updateHealingConfig) {
      const updated = await api.updateHealingConfig(updates);
      setConfig((prev) => ({ ...prev, healing: updated }));
      return updated;
    }
  }, [api]);

  const addCustomApiProvider = useCallback(async (params: { name: string; baseUrl: string; apiKey?: string; defaultModelId?: string }) => {
    if (api?.addCustomApiProvider) {
      const updated = await api.addCustomApiProvider(params);
      if (updated) setServicesManifest(updated);
      return updated;
    }
  }, [api]);

  const updateCustomApiProvider = useCallback(async (providerId: ProviderId, updates: { name?: string; baseUrl?: string; apiKey?: string; defaultModelId?: string }) => {
    if (api?.updateCustomApiProvider) {
      const updated = await api.updateCustomApiProvider(providerId, updates);
      if (updated) setServicesManifest(updated);
      return updated;
    }
  }, [api]);

  const deleteProvider = useCallback(async (providerId: ProviderId) => {
    if (api?.deleteProvider) {
      const updated = await api.deleteProvider(providerId);
      if (updated) setServicesManifest(updated);
      setRegistry((prev) => {
        const next = { ...prev };
        delete next[providerId];
        return next;
      });
      return updated;
    }
  }, [api]);

  const updateServiceTitle = useCallback(async (providerId: ProviderId, title: string) => {
    if (api?.updateServiceTitle) {
      const updated = await api.updateServiceTitle(providerId, title);
      if (updated) setServicesManifest(updated);
      return updated;
    }
  }, [api]);

  const installRecipe = useCallback(async (recipe: any) => {
    if (api?.installRecipe) {
      const result = await api.installRecipe(recipe);
      return result;
    }
  }, [api]);

  return {
    coreStatus,
    providers,
    logs,
    totalLogsCount,
    secrets,
    config,
    registry,
    modeRoutes,
    routeMatrix,
    activeDrawerProvider,
    activeSessions,
    hasActiveSession: activeSessions.length > 0,
    clearThreadSessions,
    servicesManifest,
    toggleExperimentalService,
    updateServiceManifest,
    serviceConflicts,
    clearServiceConflicts,
    accountsRegistry,
    addAccount,
    updateAccountAlias,
    setMainAccount,
    setActiveAccount,
    reorderAccounts,
    deleteAccount,
    updateConfig,
    toggleBalancedMode,
    updateDoubleAgentConfig,
    toggleDoubleAgent,
    toggleDoubleAgentMode,
    toggleRecall,
    toggleRecallMode,
    updateRecallConfig,
    toggleAgentGuard,
    updateModeRoute,
    resetModeRoutes,
    updateProviderConfig,
    toggleModel,
    toggleService,
    resyncModels,
    selectDirectory,
    applyPort,
    openDrawer,
    closeDrawer,
    setMode,
    setCompactMode,
    togglePin,
    minimize,
    hideToTray,
    reloadProvider,
    openProviderWindow,
    openSystemBrowser,
    clearVault,
    clearBrowserStorage,
    purgeAllLocalStorage,
    clearLogs,
    terminateRequest,
    terminateAllPendingRequests,
    fetchMoreLogs,
    executePrompt,
    healingReports,
    fetchLocalLlmModels,
    testLocalLlmConnection,
    updateLocalLlmConfig,
    auditProviderDom,
    healProviderDom,
    updateHealingConfig,
    addCustomApiProvider,
    updateCustomApiProvider,
    deleteProvider,
    updateServiceTitle,
    installRecipe,
  };
}
