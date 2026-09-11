import { isCliProvider } from '../shared/cli.js';
import React, { useState, useEffect, useRef } from 'react';
import { UPDATE_CHECK_INTERVAL_MS } from '../shared/release.js';
import { version as appVersion } from '../../package.json';
import { useTransgentic } from './hooks/useTransgentic.js';
import { RadialHub } from './components/RadialHub.js';
import { DrawerWebview } from './components/DrawerWebview.js';
import { LogStream } from './components/LogStream.js';
import { MemoryHubView } from './components/MemoryHubView.js';
import { RoutesSettings } from './components/RoutesSettings.js';
import { SettingsView } from './components/SettingsView.js';
import { ServiceConflictModal } from './components/ServiceConflictModal.js';
import { AccountManagerModal } from './components/AccountManagerModal.js';
import { AuthSetupModal } from './components/AuthSetupModal.js';
import { LocalLLMModal } from './components/LocalLLMModal.js';
import { ProviderId, TaskMode } from '../shared/types.js';
import type { AttachmentInput, DesktopAttachmentSelection } from '../shared/attachments.js';
import { getProviderDisplayName } from './utils/providerTheme.js';
import {
  Pin,
  Minus,
  X,
  Radio,
  Activity,
  Shield,
  Volume2,
  VolumeX,
  Zap,
  CheckCircle2,
  Bot,
  Brain,
  Sparkles,
  Cpu,
  Code2,
  PenTool,
  Image as ImageIcon,
  Video,
  Music,
  Copy,
  Check,
  Key,
  AlertTriangle,
  Globe,
  Braces,
  Github,
} from 'lucide-react';
import { soundFx } from './audio/soundFx.js';

type ActiveTab = 'hub' | 'logs' | 'mem' | 'routes' | 'settings';

export function App() {
  const {
    coreStatus,
    config,
    providers,
    logs,
    totalLogsCount,
    secrets,
    registry,
    modeRoutes,
    routeMatrix,
    activeDrawerProvider,
    setMode,
    setCompactMode,
    updateConfig,
    toggleBalancedMode,
    toggleDoubleAgent,
    toggleDoubleAgentMode,
    updateDoubleAgentConfig,
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
    applyNetworkAccess,
    openDrawer,
    closeDrawer,
    clearVault,
    clearBrowserStorage,
    purgeAllLocalStorage,
    clearLogs,
    terminateRequest,
    terminateAllPendingRequests,
    fetchMoreLogs,
    reloadProvider,
    openProviderWindow,
    openSystemBrowser,
    togglePin,
    minimize,
    hideToTray,
    executePrompt,
    selectQuickPromptFiles,
    hasActiveSession,
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
  } = useTransgentic();

  const [settingsInitialTab, setSettingsInitialTab] = useState<'general' | 'models'>('general');
  const [settingsInitialProvider, setSettingsInitialProvider] = useState<ProviderId | undefined>();
  const [activeTab, setActiveTab] = useState<ActiveTab>('hub');
  const [routesInitialPipeline, setRoutesInitialPipeline] = useState<'main' | 'co'>('main');
  const [isPinned, setIsPinned] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [showAboutModal, setShowAboutModal] = useState(false);
  const [availableUpdate, setAvailableUpdate] = useState<{ version: string; url: string } | null>(null);
  const [showUpdateDialog, setShowUpdateDialog] = useState(false);
  const [autoCheckUpdates, setAutoCheckUpdates] = useState(() => {
    try { return localStorage.getItem('transgentic_auto_check_updates') !== 'false'; }
    catch { return true; }
  });
  const notifiedUpdateVersion = useRef<string | null>(null);
  const handleAutoCheckUpdates = (enabled: boolean) => {
    setAutoCheckUpdates(enabled);
    try { localStorage.setItem('transgentic_auto_check_updates', String(enabled)); } catch { }
  };
  useEffect(() => {
    if (!autoCheckUpdates) return;
    let active = true;
    const check = (window as any).transgenticApi?.checkForUpdate;
    if (!check) return;
    const runCheck = async () => {
      try {
        const update = await check();
        if (active && update) {
          setAvailableUpdate(update);
          if (notifiedUpdateVersion.current !== update.version) {
            notifiedUpdateVersion.current = update.version;
            setShowUpdateDialog(true);
          }
        }
      } catch { }
    };
    void runCheck();
    const timer = setInterval(runCheck, UPDATE_CHECK_INTERVAL_MS);
    return () => { active = false; clearInterval(timer); };
  }, [autoCheckUpdates]);

  const openUpdateRelease = () => {
    if (!availableUpdate) return;
    const api = (window as any).transgenticApi;
    if (api?.openExternalUrl) api.openExternalUrl(availableUpdate.url);
    else window.open(availableUpdate.url, '_blank', 'noopener,noreferrer');
  };
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showLocalLLMModal, setShowLocalLLMModal] = useState<boolean>(false);
  const [isFirstLaunchAuth, setIsFirstLaunchAuth] = useState(false);
  const [showAccountModalProvider, setShowAccountModalProvider] = useState<ProviderId | null>(null);
  const [isCompactMode, setIsCompactMode] = useState(false);
  const [processingSec, setProcessingSec] = useState(0);
  const [footerEndpointType, setFooterEndpointType] = useState<'mcp' | 'sse' | 'completion'>('mcp');
  const [copiedEndpoint, setCopiedEndpoint] = useState(false);
  const [footerLanAddress, setFooterLanAddress] = useState(config.serverAccess?.advertisedAddress || '');
  const [isUpdatingFooterNetwork, setIsUpdatingFooterNetwork] = useState(false);

  const isLanSharing = config.serverAccess?.lanEnabled === true;
  const endpointHost = isLanSharing && config.serverAccess?.advertisedAddress ? config.serverAccess.advertisedAddress : '127.0.0.1';
  const footerEndpointPath = footerEndpointType === 'completion' ? 'v1' : footerEndpointType;
  const footerEndpointLabel = footerEndpointType === 'completion' ? 'Completion:' : `${footerEndpointType.toUpperCase()} Endpoint:`;
  const nextFooterEndpointLabel = footerEndpointType === 'mcp' ? 'SSE Endpoint' : footerEndpointType === 'sse' ? 'Completion' : 'MCP Endpoint';
  const currentEndpointUrl = `http://${endpointHost}:${coreStatus.port}/${footerEndpointPath}`;

  useEffect(() => {
    if (config.serverAccess?.advertisedAddress) setFooterLanAddress(config.serverAccess.advertisedAddress);
  }, [config.serverAccess?.advertisedAddress]);

  useEffect(() => {
    void (window as any).transgenticApi?.getNetworkInterfaces?.().then((items: Array<{ name: string; address: string }>) => {
      if (items?.[0]) setFooterLanAddress(current => current || items[0].address);
    }).catch(() => {});
  }, []);

  const handleToggleEndpointType = () => {
    soundFx.playClick();
    setFooterEndpointType((prev) => prev === 'mcp' ? 'sse' : prev === 'sse' ? 'completion' : 'mcp');
  };

  const handleFooterNetworkToggle = async () => {
    if (isUpdatingFooterNetwork) return;
    soundFx.playClick();
    const nextEnabled = !isLanSharing;
    const address = footerLanAddress || config.serverAccess?.advertisedAddress || '';
    if (nextEnabled && !address) {
      soundFx.playWarnTone();
      return;
    }
    setIsUpdatingFooterNetwork(true);
    try {
      const result = await applyNetworkAccess(nextEnabled, address);
      if (!result.success) throw new Error(result.error || 'Could not update local network sharing.');
      soundFx.playTaskSuccess();
    } catch {
      soundFx.playWarnTone();
    } finally {
      setIsUpdatingFooterNetwork(false);
    }
  };

  const handleCopyEndpointUrl = () => {
    soundFx.playClick();
    navigator.clipboard.writeText(currentEndpointUrl);
    setCopiedEndpoint(true);
    setTimeout(() => setCopiedEndpoint(false), 2000);
  };

  const latestLog = logs && logs.length > 0 ? logs[0] : null;
  const isProcessing = coreStatus.state === 'processing' || latestLog?.status === 'pending';
  const showUpdateIndicator = Boolean(availableUpdate) && !isProcessing;
  const activeMode = latestLog?.mode || coreStatus.activeMode || 'general';

  // Stopwatch timer for active processing
  useEffect(() => {
    let timer: NodeJS.Timeout | null = null;
    if (isProcessing) {
      setProcessingSec(0);
      timer = setInterval(() => {
        setProcessingSec((s) => s + 1);
      }, 1000);
    } else {
      setProcessingSec(0);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [isProcessing]);

  const formatTimer = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  // Check for first-time launch to display About and Auth modals
  useEffect(() => {
    try {
      const hasSeenAbout = localStorage.getItem('transgentic_onboarding_acknowledged');
      const hasSeenAuth = localStorage.getItem('transgentic_auth_acknowledged');

      if (!hasSeenAbout) {
        setShowAboutModal(true);
      }
      if (!hasSeenAuth) {
        setIsFirstLaunchAuth(true);
        setShowAuthModal(true);
      }
    } catch {
      // Ignore in storage-restricted environments
    }
  }, []);

  const handleDismissAboutModal = () => {
    soundFx.playClick();
    try {
      localStorage.setItem('transgentic_onboarding_acknowledged', 'true');
    } catch {
      // Ignore
    }
    setShowAboutModal(false);
  };

  const handleCloseAuthModal = () => {
    soundFx.playClick();
    try {
      localStorage.setItem('transgentic_auth_acknowledged', 'true');
    } catch { }
    setShowAuthModal(false);
    setIsFirstLaunchAuth(false);
  };

  const handleTogglePin = () => {
    soundFx.playClick();
    setIsPinned(!isPinned);
    togglePin();
  };

  const handleToggleSound = () => {
    const next = !soundEnabled;
    setSoundEnabled(next);
    soundFx.setEnabled(next);
  };

  const handleTabChange = (tab: ActiveTab) => {
    if (tab === 'settings') { setSettingsInitialTab('general'); setSettingsInitialProvider(undefined); }
    soundFx.playClick();
    if (tab === 'routes') {
      setRoutesInitialPipeline('main');
    }
    setActiveTab(tab);
  };

  const handleNavigateToRoutes = (pipeline: 'main' | 'co' = 'main') => {
    soundFx.playClick();
    setRoutesInitialPipeline(pipeline);
    setActiveTab('routes');
  };

  const handleSatelliteClick = (providerId: ProviderId) => {
    const s = servicesManifest?.services?.[providerId];
    if (isCliProvider(providerId) || s?.providerType === 'api' || providerId.startsWith('api_')) {
      setSettingsInitialTab('models'); setSettingsInitialProvider(providerId); setActiveTab('settings'); return;
    }
    soundFx.playDrawerSlide();
    openDrawer(providerId);
  };

  const handleSendPrompt = async (promptText: string, files: AttachmentInput[] = []) => {
    soundFx.playClick();
    try {
      const result = await executePrompt(promptText, coreStatus.activeMode, undefined, undefined, undefined, files);
      soundFx.playTaskSuccess();
      return result;
    } catch (err) {
      soundFx.playWarnTone();
      throw err;
    }
  };

  const handleToggleCompactMode = async () => {
    soundFx.playClick();
    const next = !isCompactMode;
    setIsCompactMode(next);
    if (setCompactMode) {
      const res = await setCompactMode(next);
      if (res && typeof res.isPinned === 'boolean') {
        setIsPinned(res.isPinned);
      }
    }
  };

  const handleStatusCircleClick = async () => {
    if (!showUpdateIndicator) return handleToggleCompactMode();
    if (isCompactMode) await handleToggleCompactMode();
    else soundFx.playClick();
    setShowUpdateDialog(false);
    setShowAboutModal(true);
  };

  const currentDrawerProvider = activeDrawerProvider ? {
    ...providers[activeDrawerProvider],
    url: providers[activeDrawerProvider]?.url || servicesManifest?.services?.[activeDrawerProvider]?.url || '',
    name: providers[activeDrawerProvider]?.name || servicesManifest?.services?.[activeDrawerProvider]?.name || activeDrawerProvider,
  } : null;
  const latestProviderId: ProviderId = latestLog?.targetProvider || coreStatus.activeProvider || 'chatgpt';

  const getLatestProviderIcon = (providerId: ProviderId) => {
    const isApi = providerId.startsWith('api_') || servicesManifest?.services?.[providerId]?.providerType === 'api';
    if (isApi) {
      return <Braces className="w-3.5 h-3.5 text-cyan-300" />;
    }
    const isCustomWebview = servicesManifest?.services?.[providerId]?.providerType === 'webview' || providerId.startsWith('custom_') || providerId.startsWith('webview_');
    if (isCustomWebview) {
      return <Globe className="w-3.5 h-3.5 text-teal-300" />;
    }

    switch (providerId) {
      case 'chatgpt':
        return <Bot className="w-3.5 h-3.5 text-emerald-300" />;
      case 'claude':
        return <Brain className="w-3.5 h-3.5 text-amber-300" />;
      case 'gemini':
        return <Sparkles className="w-3.5 h-3.5 text-blue-300" />;
      case 'grok':
        return <Cpu className="w-3.5 h-3.5 text-purple-300" />;
      case 'localllm':
        return <Cpu className="w-3.5 h-3.5 text-blue-300" />;
      default:
        return <Zap className="w-3.5 h-3.5 text-cyan-300" />;
    }
  };

  const getLatestProviderBg = (providerId: ProviderId) => {
    const isCustomWebview = servicesManifest?.services?.[providerId]?.providerType === 'webview' || providerId.startsWith('custom_') || providerId.startsWith('webview_');
    if (isCustomWebview) {
      return 'bg-teal-500/20 border-teal-500/40 text-teal-300 shadow-[0_0_8px_rgba(20,184,166,0.3)]';
    }

    switch (providerId) {
      case 'chatgpt':
        return 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300 shadow-[0_0_8px_rgba(16,185,129,0.3)]';
      case 'claude':
        return 'bg-amber-500/20 border-amber-500/40 text-amber-300 shadow-[0_0_8px_rgba(245,158,11,0.3)]';
      case 'gemini':
        return 'bg-blue-500/20 border-blue-500/40 text-blue-300 shadow-[0_0_8px_rgba(59,130,246,0.3)]';
      case 'grok':
        return 'bg-purple-500/20 border-purple-500/40 text-purple-300 shadow-[0_0_8px_rgba(168,85,247,0.3)]';
      case 'localllm':
        return 'bg-blue-500/20 border-blue-500/40 text-blue-300 shadow-[0_0_8px_rgba(59,130,246,0.3)]';
      default:
        return 'bg-cyan-500/20 border-cyan-500/40 text-cyan-300 shadow-[0_0_8px_rgba(0,242,254,0.3)]';
    }
  };

  const getModeIcon = (mode: TaskMode) => {
    switch (mode) {
      case 'coding':
        return <Code2 className="w-3 h-3 text-cyan-400" />;
      case 'image':
        return <ImageIcon className="w-3 h-3 text-blue-400" />;
      case 'video':
        return <Video className="w-3 h-3 text-rose-400" />;
      case 'music':
        return <Music className="w-3 h-3 text-amber-400" />;
      case 'audio':
        return <Volume2 className="w-3 h-3 text-slate-400" />;
      case 'general':
      default:
        return <Sparkles className="w-3 h-3 text-cyan-300" />;
    }
  };

  return (
    <div className="w-screen h-screen flex overflow-hidden select-none bg-transparent">
      <div className="glass-panel w-full h-full flex overflow-hidden relative border border-white/10 shadow-2xl backdrop-blur-xl">

        {/* ========================================================= */}
        {/* CASE A: COMPACT MUSIC-PLAYING CAPSULE WIDGET VIEW          */}
        {/* ========================================================= */}
        {isCompactMode ? (
          <div className="w-full h-full flex flex-col justify-between p-2 select-none animate-in fade-in zoom-in-95 duration-150">
            {/* Top Compact Titlebar (Only App Title, no version, no redundant circle) */}
            <div className="h-4 px-2 flex items-center justify-between drag-region">
              <span className="font-extrabold text-[10px] tracking-wider bg-gradient-to-r from-cyan-300 via-slate-100 to-purple-300 bg-clip-text text-transparent uppercase font-mono">
                TRANSGENTIC
              </span>
            </div>

            {/* Compact Music Capsule Body: Completely transparent (inherits outer glass-panel blur) */}
            <div className="flex-1 flex items-center justify-between px-2.5 py-0.5 gap-2.5 drag-region">

              {/* 1. Far Left: Online Glowing Blue/Purple Circle (Animatedly transitions to purple-300 when processing) */}
              <button
                onClick={handleStatusCircleClick}
                className="relative shrink-0 flex items-center justify-center w-9 h-9 rounded-full cursor-pointer group no-drag focus:outline-none"
                title={showUpdateIndicator ? `Update v${availableUpdate?.version} available • Open About` : isProcessing ? "Processing Task • Click to expand" : "Transgentic Online • Click to expand"}
              >
                <div className={`w-7 h-7 rounded-full transition-all duration-500 group-hover:scale-110 ${showUpdateIndicator ? 'update-available-orb' : 'animate-pulse'} ${isProcessing
                  ? 'bg-purple-300 shadow-[0_0_20px_#d8b4fe]'
                  : 'bg-cyan-400 shadow-[0_0_18px_#00f2fe]'
                  }`} />
                <div className={`absolute inset-0 rounded-full transition-all duration-500 scale-125 animate-ping opacity-60 pointer-events-none ${showUpdateIndicator ? 'hidden' : ''} ${isProcessing
                  ? 'bg-purple-300/35 group-hover:bg-purple-300/50'
                  : 'bg-cyan-400/30 group-hover:bg-cyan-400/50'
                  }`} />
              </button>

              {/* 2. Left-Center: Latest AI Service Icon in Circle Avatar */}
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 border no-drag ${getLatestProviderBg(latestProviderId)}`}
                title={`${getProviderDisplayName(latestProviderId, servicesManifest, providers)} • ${providers[latestProviderId]?.name || 'Connected'}`}
              >
                {getLatestProviderIcon(latestProviderId)}
              </div>

              {/* 3. Center / Right: Mode Icon, Prompt/Answer Text & Timer/Log Time (All Center-Aligned) */}
              <div className="flex-1 min-w-0 flex flex-col items-center justify-center text-center drag-region px-1">

                {/* Line 1: Mode Icon & Soundwave Animation */}
                <div className="flex items-center justify-center gap-1.5 text-slate-300">
                  {getModeIcon(activeMode)}
                  {isProcessing ? (
                    <div className="flex items-center gap-0.5 h-2.5">
                      <div className="w-0.5 bg-purple-300 rounded-full animate-bounce h-2" />
                      <div className="w-0.5 bg-purple-200 rounded-full animate-bounce h-2.5 delay-75" />
                      <div className="w-0.5 bg-purple-400 rounded-full animate-bounce h-1.5 delay-150" />
                      <div className="w-0.5 bg-purple-300 rounded-full animate-bounce h-2 delay-200" />
                    </div>
                  ) : (
                    <span className="text-[8.5px] font-mono text-slate-400 uppercase tracking-wider font-semibold">
                      {activeMode}
                    </span>
                  )}
                </div>

                {/* Line 2: Prompt (if processing) or Response (if finished) with clean ellipsis */}
                <div className="w-full text-[10.5px] font-medium text-slate-100 truncate tracking-tight font-sans px-1 text-center">
                  {isProcessing ? (
                    latestLog?.promptSnippet || coreStatus.currentTaskDescription || 'Processing task...'
                  ) : latestLog ? (
                    latestLog.responseSnippet || latestLog.promptSnippet || 'Task completed'
                  ) : (
                    'Transgentic Online'
                  )}
                </div>

                {/* Line 3: Timer (if processing) or Log Time (if finished) */}
                <div className="text-[9px] font-mono text-slate-400 flex items-center justify-center gap-1">
                  {isProcessing ? (
                    <span className="text-purple-300 flex items-center gap-1 font-bold font-mono">
                      <span className="w-1.5 h-1.5 rounded-full bg-purple-300 animate-ping" />
                      {formatTimer(processingSec)}
                    </span>
                  ) : (
                    <span className="text-slate-400 font-mono">
                      {latestLog ? (
                        <>
                          {new Date(latestLog.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          {latestLog.durationMs ? ` • ${(latestLog.durationMs / 1000).toFixed(1)}s` : ''}
                        </>
                      ) : (
                        `:${coreStatus.port} • Ready`
                      )}
                    </span>
                  )}
                </div>

              </div>

            </div>
          </div>
        ) : (
          /* ========================================================= */
          /* CASE B: STANDARD FULL DASHBOARD VIEW                      */
          /* ========================================================= */
          <>
            {/* Left / Main Dynamic Hub Panel (Full width when right drawer is closed) */}
            <div className={`h-full flex flex-col justify-between transition-all ${currentDrawerProvider ? 'w-[480px] min-w-[480px] shrink-0 border-r border-white/5' : 'flex-1 w-full'
              }`}>

              {/* Top Titlebar & Controls */}
              <div className="h-11 pl-4 pr-2 flex items-center justify-between border-b border-white/5 drag-region">
                {/* Left: Interactive Blue/Purple Circle (Compact Mode Toggle) + App Title (About Modal Trigger) */}
                <div className="flex items-center gap-2.5 no-drag">
                  {/* Blue/Purple Glowing Circle Button (Click to Toggle Compact Mode) */}
                  <button
                    onClick={handleStatusCircleClick}
                    className="relative group p-1 -m-1 rounded-full cursor-pointer focus:outline-none"
                    title={showUpdateIndicator ? `Update v${availableUpdate?.version} available • Open About` : 'Toggle Compact Mini Widget'}
                  >
                    <div className={`w-3 h-3 rounded-full transition-all duration-500 group-hover:scale-125 ${showUpdateIndicator ? 'update-available-orb' : 'animate-pulse'} ${isProcessing
                      ? 'bg-purple-300 shadow-[0_0_12px_#d8b4fe]'
                      : 'bg-cyan-400 shadow-[0_0_10px_#00f2fe]'
                      }`} />
                    <div className={`absolute inset-0 rounded-full transition-all duration-500 scale-150 animate-ping opacity-60 ${showUpdateIndicator ? 'hidden' : ''} ${isProcessing
                      ? 'bg-purple-300/30 group-hover:bg-purple-300/50'
                      : 'bg-cyan-400/20 group-hover:bg-cyan-400/40'
                      }`} />
                  </button>

                  {/* Title & Version (Click to open About & Disclaimer Modal) */}
                  <div
                    onClick={() => {
                      soundFx.playClick();
                      setShowAboutModal(true);
                    }}
                    className="flex items-center gap-1.5 cursor-pointer group hover:opacity-95 transition-opacity"
                    title="About Transgentic & Legal Disclaimer"
                  >
                    <span className="font-extrabold text-xs tracking-wider bg-gradient-to-r from-cyan-300 via-slate-100 to-purple-300 bg-clip-text text-transparent uppercase font-mono group-hover:brightness-125 transition-all">
                      TRANSGENTIC
                    </span>
                  </div>
                </div>

                {/* Center Tab Navigation */}
                <div className="flex items-center gap-1 bg-black/40 p-0.5 rounded-lg border border-white/5 no-drag">
                  <button
                    onClick={() => handleTabChange('hub')}
                    className={`px-2 py-1 rounded text-[10px] font-semibold flex items-center gap-1 transition-colors ${activeTab === 'hub' || activeTab === 'routes' || activeTab === 'settings'
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                      : 'text-slate-400 hover:text-slate-200'
                      }`}
                    title="Tactile AI Hub"
                  >
                    <Radio className={`w-3 h-3 ${coreStatus?.port > 0 ? 'text-emerald-400' : 'text-slate-400'}`} />
                    <span>Hub</span>
                  </button>

                  <button
                    onClick={() => handleTabChange('logs')}
                    className={`px-2 py-1 rounded text-[10px] font-semibold flex items-center gap-1 transition-colors ${activeTab === 'logs'
                      ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                      : 'text-slate-400 hover:text-slate-200'
                      }`}
                    title="Live MCP Traffic Stream"
                  >
                    <Activity className="w-3 h-3 text-cyan-400" />
                    <span>Logs</span>
                    {logs.length > 0 && (
                      <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
                    )}
                  </button>

                  <button
                    onClick={() => handleTabChange('mem')}
                    className={`px-2 py-1 rounded text-[10px] font-semibold flex items-center gap-1 transition-colors ${activeTab === 'mem'
                      ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40'
                      : 'text-slate-400 hover:text-slate-200'
                      }`}
                    title="Memory & Context Hub (Encrypted SQLite & Secret Vault)"
                  >
                    <Brain className="w-3 h-3 text-purple-400" />
                    <span>Memory</span>
                    {secrets.length > 0 && (
                      <span className="w-1.5 h-1.5 rounded-full bg-purple-400" />
                    )}
                  </button>
                </div>

                {/* Right: Window & Sound Controls */}
                <div className="flex items-center gap-1 no-drag">
                  <button
                    onClick={handleToggleSound}
                    className={`p-1.5 rounded-md hover:bg-white/10 transition-colors ${soundEnabled ? 'text-cyan-400' : 'text-slate-500'
                      }`}
                    title={soundEnabled ? 'Mute Sound FX' : 'Enable Sound FX'}
                  >
                    {soundEnabled ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
                  </button>
                  <button
                    onClick={handleTogglePin}
                    className={`p-1.5 rounded-md hover:bg-white/10 transition-colors ${isPinned ? 'text-cyan-400' : 'text-slate-400'
                      }`}
                    title={isPinned ? 'Window Pinned (Always on Top)' : 'Unpinned'}
                  >
                    <Pin className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={minimize}
                    className="p-1.5 rounded-md hover:bg-white/10 text-slate-400 transition-colors"
                    title="Minimize"
                  >
                    <Minus className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={hideToTray}
                    className="p-1.5 rounded-md hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 transition-colors"
                    title="Close to Tray (Keep MCP Server Active)"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Tab Content Area */}
              <div className="flex-1 min-h-0 overflow-clip relative">
                {activeTab === 'hub' && (
                  <RadialHub
                    coreStatus={coreStatus}
                    config={config}
                    providers={providers}
                    logs={logs}
                    servicesManifest={servicesManifest}
                    routeMatrix={routeMatrix}
                    modeRoutes={modeRoutes}
                    onProviderClick={handleSatelliteClick}
                    onModeChange={setMode}
                    onToggleBalancedMode={toggleBalancedMode}
                    onToggleAgentGuard={toggleAgentGuard}
                    onCoreClick={() => handleTabChange('logs')}
                    onRoutesClick={() => handleTabChange('routes')}
                    onSettingsClick={() => handleTabChange('settings')}
                    onLocalLLMClick={() => {
                      soundFx.playClick();
                      setShowLocalLLMModal(true);
                    }}
                    localLLMEnabled={config.localLLM?.enabled ?? false}
                    onSendPrompt={handleSendPrompt}
                    onSelectFiles={(mode?: TaskMode): Promise<DesktopAttachmentSelection[]> => selectQuickPromptFiles(mode)}
                    hasActiveSession={hasActiveSession}
                    onClearSession={clearThreadSessions}
                    onOpenAuthModal={() => {
                      soundFx.playClick();
                      setShowAuthModal(true);
                    }}
                  />
                )}
                {activeTab === 'routes' && (
                  <RoutesSettings
                    modeRoutes={modeRoutes}
                    routeMatrix={routeMatrix}
                    config={config}
                    providers={providers}
                    servicesManifest={servicesManifest}
                    localLLMConfig={config.localLLM}
                    initialPipeline={routesInitialPipeline}
                    onUpdateRoute={updateModeRoute}
                    onResetRoutes={resetModeRoutes}
                    onBack={() => handleTabChange('hub')}
                  />
                )}
                {activeTab === 'settings' && (
                  <SettingsView
                    initialTab={settingsInitialTab}
                    initialProvider={settingsInitialProvider}
                    config={config}
                    registry={registry}
                    providers={providers}
                    servicesManifest={servicesManifest}
                    healingReports={healingReports}
                    onAuditProviderDom={auditProviderDom}
                    onHealProviderDom={healProviderDom}
                    onUpdateHealingConfig={updateHealingConfig}
                    onUpdateConfig={updateConfig}
                    onToggleBalancedMode={toggleBalancedMode}
                    onToggleDoubleAgent={toggleDoubleAgent}
                    onToggleDoubleAgentMode={toggleDoubleAgentMode}
                    onUpdateDoubleAgent={updateDoubleAgentConfig}
                    onToggleAgentGuard={toggleAgentGuard}
                    onUpdateRecallConfig={updateRecallConfig}
                    onToggleRecallMode={toggleRecallMode}
                    onUpdateProviderConfig={updateProviderConfig}
                    onToggleModel={toggleModel}
                    onToggleService={toggleService}
                    onToggleExperimentalService={toggleExperimentalService}
                    onAddCustomApiProvider={addCustomApiProvider}
                    onUpdateCustomApiProvider={updateCustomApiProvider}
                    onInstallRecipe={installRecipe}
                    onDeleteProvider={deleteProvider}
                    onUpdateServiceTitle={updateServiceTitle}
                    onResyncModels={resyncModels}
                    onSelectDirectory={selectDirectory}
                    onApplyPort={applyPort}
                    onApplyNetworkAccess={applyNetworkAccess}
                    onClearBrowserStorage={clearBrowserStorage}
                    onPurgeAllLocalStorage={purgeAllLocalStorage}
                    onOpenAuthModal={() => {
                      soundFx.playClick();
                      setShowAuthModal(true);
                    }}
                    onNavigateToRoutes={handleNavigateToRoutes}
                    onBack={() => handleTabChange('hub')}
                  />
                )}
                {activeTab === 'logs' && (
                  <LogStream
                    logs={logs}
                    totalLogsCount={totalLogsCount}
                    onFetchMore={fetchMoreLogs}
                    onClearLogs={clearLogs}
                    onTerminateRequest={terminateRequest}
                    onTerminateAllPending={terminateAllPendingRequests}
                    servicesManifest={servicesManifest}
                    providers={providers}
                  />
                )}
                {activeTab === 'mem' && (
                  <MemoryHubView
                    secrets={secrets}
                    onClearVault={clearVault}
                    onClearBrowserStorage={clearBrowserStorage}
                    onPurgeAllLocalStorage={purgeAllLocalStorage}
                  />
                )}
              </div>

              {/* Bottom Bar with Connection Info */}
              <div className="h-7 px-4 bg-black/40 flex items-center justify-between border-t border-white/5 text-[10px] font-mono text-slate-400 drag-region">
                <div className="flex items-center gap-1.5 no-drag">
                  <button
                    onClick={() => void handleFooterNetworkToggle()}
                    disabled={isUpdatingFooterNetwork}
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-all ${isLanSharing ? 'border-emerald-500/35 bg-emerald-500/15 text-emerald-300 shadow-[0_0_8px_rgba(16,185,129,0.16)]' : 'border-white/[0.08] bg-white/[0.035] text-slate-500 hover:border-cyan-500/25 hover:text-cyan-300'} disabled:cursor-wait disabled:opacity-50`}
                    title={isLanSharing ? `Stop local network sharing (${endpointHost})` : footerLanAddress ? `Share gateway on ${footerLanAddress}` : 'No local network interface available'}
                    aria-label={isLanSharing ? 'Disable local network sharing' : 'Enable local network sharing'}
                  >
                    <Globe className={`h-3 w-3 ${isUpdatingFooterNetwork ? 'animate-pulse' : ''}`} />
                  </button>

                  {/* Clickable Endpoint Label -> Cycles MCP / SSE / Completion */}
                  <button
                    onClick={handleToggleEndpointType}
                    className="text-slate-500 hover:text-cyan-300 transition-colors cursor-pointer flex items-center gap-1 font-mono group"
                    title={`Click to switch to ${nextFooterEndpointLabel}`}
                  >
                    <span>{footerEndpointLabel}</span>
                  </button>

                  {/* Clickable URL -> Copies to Clipboard */}
                  <button
                    onClick={handleCopyEndpointUrl}
                    className="flex items-center gap-1 text-cyan-300 hover:text-cyan-200 font-semibold font-mono selection:bg-cyan-500 selection:text-black cursor-pointer group bg-cyan-500/5 hover:bg-cyan-500/10 px-1.5 py-0.5 rounded transition-all border border-transparent hover:border-cyan-500/20"
                    title={`Click to copy ${footerEndpointType === 'completion' ? 'completion' : footerEndpointType.toUpperCase()} URL (${currentEndpointUrl})`}
                  >
                    <span>{currentEndpointUrl}</span>
                    {copiedEndpoint ? (
                      <Check className="w-2.5 h-2.5 text-emerald-400 shrink-0" />
                    ) : (
                      <Copy className="w-2.5 h-2.5 text-slate-500 group-hover:text-cyan-400 transition-colors shrink-0" />
                    )}
                  </button>
                </div>
                <div className="flex items-center gap-3 no-drag">
                  <span className="text-slate-500">
                    {coreStatus.activeMode.toUpperCase()} MODE
                  </span>
                  <button
                    onClick={() => setShowAboutModal(true)}
                    className="text-slate-500 hover:text-slate-300 transition-colors cursor-pointer"
                    title="About Transgentic"
                  >
                    v{appVersion}
                  </button>
                </div>
              </div>

            </div>

            {/* Right Sliding Webview Drawer Panel (700px -> 1180px total width) */}
            {currentDrawerProvider && (
              <div className="w-[700px] min-w-[700px] h-full flex-1 no-drag">
                <DrawerWebview
                  provider={currentDrawerProvider}
                  accountStore={accountsRegistry ? accountsRegistry[currentDrawerProvider.id] : undefined}
                  healingReport={healingReports?.[currentDrawerProvider.id]}
                  localLLMConfig={config.localLLM}
                  onOpenLocalLlm={() => setShowLocalLLMModal(true)}
                  onAuditDom={auditProviderDom}
                  onHealDom={healProviderDom}
                  onClose={closeDrawer}
                  onReload={reloadProvider}
                  onOpenWindow={openProviderWindow}
                  onOpenSystemBrowser={openSystemBrowser}
                  onOpenAccountModal={() => setShowAccountModalProvider(currentDrawerProvider.id)}
                />
              </div>
            )}
          </>
        )}

      </div>

      {showUpdateDialog && availableUpdate && !showAboutModal && !showAuthModal && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div role="dialog" aria-modal="true" aria-labelledby="update-title" onKeyDown={(event) => { if (event.key === 'Escape') setShowUpdateDialog(false); }} className="w-full max-w-sm rounded-xl border border-cyan-500/40 bg-[#0c1017] p-6 text-slate-200 shadow-2xl space-y-4">
            <h2 id="update-title" className="text-lg font-semibold text-cyan-300">Transgentic update available</h2>
            <p className="text-sm">Version {availableUpdate.version} is available. You’re currently using {appVersion}.</p>
            <div className="flex justify-end gap-3">
              <button autoFocus onClick={() => setShowUpdateDialog(false)} className="px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10">Later</button>
              <button onClick={openUpdateRelease} className="px-3 py-2 rounded-lg bg-cyan-500/20 text-cyan-300 hover:bg-cyan-500/30">Open release page</button>
            </div>
          </div>
        </div>
      )}

      {/* About & Disclaimer Centered Modal */}
      {showAboutModal && (
        <div
          onClick={handleDismissAboutModal}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-150"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative w-full max-w-md max-h-[calc(100vh-2rem)] overflow-y-auto bg-[#0c1017] border border-cyan-500/40 rounded-xl shadow-[0_20px_50px_rgba(0,0,0,0.95)] p-6 space-y-4 animate-in zoom-in-95 duration-150 text-left"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center gap-2.5">
                <div className={`w-3.5 h-3.5 rounded-full transition-all duration-500 group-hover:scale-110 shrink-0 ${showUpdateIndicator ? 'update-available-orb' : 'animate-pulse'} ${isProcessing
                  ? 'bg-purple-300 shadow-[0_0_20px_#d8b4fe]'
                  : 'bg-cyan-400 shadow-[0_0_18px_#00f2fe]'
                  }`} />
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-extrabold text-sm tracking-wider font-mono bg-gradient-to-r from-cyan-300 to-purple-300 bg-clip-text text-transparent uppercase">
                      TRANSGENTIC
                    </span>
                    <span className="text-[9px] font-mono text-cyan-300 bg-cyan-500/10 px-1.5 py-0.5 rounded border border-cyan-500/30">
                      v{appVersion}
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-400 font-mono">
                    Local Tactical AI Orchestrator & Multi-Model MCP Gateway
                  </p>
                </div>
              </div>
              <button
                onClick={handleDismissAboutModal}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-white/10 transition-colors cursor-pointer"
                title="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Architecture Overview */}
            <div className="space-y-2 text-xs text-slate-300 font-sans leading-relaxed">
              <p>
                Transgentic unifies Webview AI sessions (ChatGPT, Claude, Gemini, Grok) with your local agentic IDEs (<strong className="text-cyan-300">Codex, Antigravity, Cursor, Claude Desktop</strong>) over low-latency SSE transport.
              </p>

              <div className="bg-black/40 rounded-lg p-3 border border-white/5 space-y-1.5 font-mono text-[11px]">
                <div className="flex items-center gap-2 text-cyan-300">
                  <CheckCircle2 className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Balanced Agentic Coding Workflow</span>
                </div>
                <div className="flex items-center gap-2 text-purple-300">
                  <CheckCircle2 className="w-3.5 h-3.5 text-purple-400" />
                  <span>In-Memory Volatile Secret Blinding Vault</span>
                </div>
                <div className="flex items-center gap-2 text-emerald-300">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Local Media File Download Manager</span>
                </div>
                <div className="flex items-center gap-2 text-amber-300">
                  <CheckCircle2 className="w-3.5 h-3.5 text-amber-400" />
                  <span>Standardized Browser Session & Input Alignment</span>
                </div>
              </div>
            </div>

            {/* Disclaimer */}
            <div className={`p-3.5 bg-amber-500/5 border border-amber-500/20 rounded-xl text-[11px] text-amber-200/80 leading-relaxed font-sans space-y-2 overflow-y-auto ${availableUpdate ? 'max-h-[175px]' : 'max-h-[220px]'}`}>
              <div className="flex items-center gap-1.5 text-amber-300 font-bold">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <span>Disclaimer & Operational Notice</span>
              </div>
              <p>
                Transgentic is an independent, local-first developer productivity utility created to help synchronize memory, requirements, and contextual planning between your agentic IDE tools (e.g. Codex, Antigravity, Cursor) and your web AI chat sessions (e.g. ChatGPT, Claude, Gemini, Grok). By providing local cross-tool memory recall, it prevents agentic tools from planning in isolation without awareness of discussions and designs formulated in other chats.
              </p>
              <p>
                Memory stores and the MCP bridge run locally, with no Transgentic-operated cloud relay. Prompts, attachments, and authenticated web sessions communicate with the providers you configure.
              </p>
              <p>
                Transgentic is not affiliated with, endorsed by, or sponsored by OpenAI, Anthropic, Google, or xAI. Users maintain full control over their credentials, sessions, and compliance with the terms of service of each respective platform. All product names, logos, and brands (including ChatGPT, Claude, Gemini, and Grok) are property of their respective owners. All company, product, and service names used in this application are for identification purposes only.
              </p>
            </div>
            <label className="flex items-center gap-3 rounded-lg border border-white/10 bg-white/5 p-3 cursor-pointer text-xs text-slate-200">
              <input type="checkbox" checked={autoCheckUpdates} onChange={(event) => handleAutoCheckUpdates(event.target.checked)} className="accent-cyan-400 w-4 h-4" />
              <span>
                Automatically check for updates
                <span className="block mt-1 text-[10px] text-slate-400">At launch and every hour while the app is running.</span>
              </span>
            </label>
            {availableUpdate && (
              <p className="rounded-lg border border-cyan-500/30 bg-cyan-500/10 p-3 text-xs text-cyan-200">
                Update available: v{availableUpdate.version} · Installed: v{appVersion}
              </p>
            )}

            {/* Footer */}
            <div className="pt-1 flex items-center justify-between border-t border-white/5">
              <button
                onClick={() => {
                  if (availableUpdate) { openUpdateRelease(); return; }
                  const url = 'https://github.com/entertheexit/transgentic';
                  if ((window as any).transgenticApi?.openExternalUrl) {
                    (window as any).transgenticApi.openExternalUrl(url);
                  } else {
                    window.open(url, '_blank');
                  }
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white border border-white/10 font-mono text-xs transition-all cursor-pointer"
              >
                <Github className="w-3.5 h-3.5" />
                <span>{availableUpdate ? `Update to v${availableUpdate.version}` : 'GitHub'}</span>
              </button>
              <button
                onClick={handleDismissAboutModal}
                className="px-4 py-1.5 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-500/40 font-mono text-xs font-semibold transition-all cursor-pointer shadow-[0_0_12px_rgba(6,182,212,0.2)]"
              >
                Got it
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MCP Client Authentication Setup Modal */}
      <AuthSetupModal
        isOpen={showAuthModal}
        onClose={handleCloseAuthModal}
        isFirstLaunch={isFirstLaunchAuth}
      />

      {/* AI Services Manifest Route Conflict Alert Modal */}
      {serviceConflicts && serviceConflicts.length > 0 && (
        <ServiceConflictModal
          conflicts={serviceConflicts}
          onDismiss={clearServiceConflicts}
          onGoToRoutes={() => {
            clearServiceConflicts();
            handleTabChange('routes');
          }}
        />
      )}

      {/* Multi-Account Profile Management Modal */}
      {showAccountModalProvider && (
        <AccountManagerModal
          providerId={showAccountModalProvider}
          providerStatus={providers[showAccountModalProvider]}
          accountStore={accountsRegistry ? accountsRegistry[showAccountModalProvider] : undefined}
          onClose={() => setShowAccountModalProvider(null)}
          onAddAccount={addAccount}
          onUpdateAlias={updateAccountAlias}
          onSetMain={setMainAccount}
          onSetActive={setActiveAccount}
          onReorder={reorderAccounts}
          onDelete={deleteAccount}
          onOpenDedicatedWindow={openProviderWindow}
        />
      )}

      {/* Dedicated Local LLM Configuration Hub Modal */}
      <LocalLLMModal
        isOpen={showLocalLLMModal}
        onClose={() => setShowLocalLLMModal(false)}
        config={config.localLLM}
        onUpdateConfig={updateLocalLlmConfig}
        onFetchModels={fetchLocalLlmModels}
        onTestConnection={testLocalLlmConnection}
      />
    </div>
  );
}

export default App;
