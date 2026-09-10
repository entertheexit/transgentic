import React, { useState } from 'react';
import {
  CoreStatus,
  ProviderId,
  ProviderStatus,
  TaskMode,
  TransgenticConfig,
  McpRequestLog,
  ServicesManifest,
  isAgentHaltGuardEnabled,
  RouteMatrix,
  ModeRouteConfig,
} from '../../shared/types.js';
import {
  Bot,
  Sparkles,
  Brain,
  Cpu,
  CheckCircle2,
  AlertCircle,
  ChevronRight,
  Activity,
  ShieldCheck,
  Shield,
  Zap,
  Layers,
  SlidersHorizontal,
  Info,
  X,
  Loader2,
  Copy,
  Check,
  Eye,
  MessageSquareText,
  Key,
  Globe,
  FlaskConical,
  Image as ImageIcon,
  CircleX,
  CheckIcon,
  FileIcon,
  Target,
} from 'lucide-react';
import { ModeSelector } from './ModeSelector.js';
import { QuickPromptBar } from './QuickPromptBar.js';
import { soundFx } from '../audio/soundFx.js';
import { getProviderTheme, getProviderDisplayName } from '../utils/providerTheme.js';
import { MediaPreview, extractMediaPath } from './MediaPreview.js';

interface RadialHubProps {
  coreStatus: CoreStatus;
  config?: TransgenticConfig;
  providers: Record<ProviderId, ProviderStatus>;
  logs?: McpRequestLog[];
  onProviderClick: (id: ProviderId) => void;
  onModeChange: (mode: TaskMode) => void;
  onToggleBalancedMode?: (enabled?: boolean) => void;
  onToggleAgentGuard?: (mode: TaskMode, enabled?: boolean) => void;
  onCoreClick?: () => void;
  onRoutesClick?: () => void;
  onSettingsClick?: () => void;
  onLocalLLMClick?: () => void;
  localLLMEnabled?: boolean;
  onSendPrompt?: (prompt: string) => Promise<any>;
  hasActiveSession?: boolean;
  onClearSession?: () => Promise<void>;
  servicesManifest?: ServicesManifest | null;
  onOpenAuthModal?: () => void;
  routeMatrix?: RouteMatrix | null;
  modeRoutes?: Record<TaskMode, ModeRouteConfig>;
}

const PROVIDERS_CONFIG: Array<{
  id: ProviderId;
  name: string;
  providerCompany: string;
  defaultModel: string;
  icon: React.ComponentType<{ className?: string }>;
  accentColor: string;
  iconColor: string;
}> = [
  {
    id: 'chatgpt',
    name: 'ChatGPT',
    providerCompany: 'OpenAI',
    defaultModel: 'GPT-4o & Reasoning',
    icon: Bot,
    accentColor: 'emerald',
    iconColor: 'text-emerald-400',
  },
  {
    id: 'claude',
    name: 'Claude',
    providerCompany: 'Anthropic',
    defaultModel: 'Claude 3.5 Sonnet',
    icon: Brain,
    accentColor: 'amber',
    iconColor: 'text-amber-400',
  },
  {
    id: 'gemini',
    name: 'Gemini',
    providerCompany: 'Google',
    defaultModel: 'Gemini 2.0 Flash / Pro',
    icon: Sparkles,
    accentColor: 'blue',
    iconColor: 'text-blue-400',
  },
  {
    id: 'grok',
    name: 'Grok',
    providerCompany: 'xAI',
    defaultModel: 'Grok 3 & Vision',
    icon: Cpu,
    accentColor: 'purple',
    iconColor: 'text-purple-400',
  },
];

const SAMPLE_PROMPTS = [
  {
    title: 'Auto Translate',
    category: 'General',
    text: "Use Transgentic MCP to translate 'Hello, nice to meet you' into Spanish",
  },
  {
    title: 'Clean Refactor',
    category: 'Coding',
    text: "Ask Transgentic MCP to refactor this function to clean TypeScript",
  },
  {
    title: 'Cyberpunk Art',
    category: 'Image',
    text: "Generate an image of a futuristic neon city using Transgentic MCP",
  },
  {
    title: 'Deep Summary',
    category: 'Grok Target',
    text: "Ask Grok via Transgentic MCP to summarize this architectural plan",
  },
];

interface QuickPromptAnswer {
  prompt: string;
  response: string;
  provider?: ProviderId;
  model?: string;
  mediaPath?: string;
  timestamp: number;
}

export const RadialHub: React.FC<RadialHubProps> = ({
  coreStatus,
  config,
  providers,
  logs,
  onProviderClick,
  onModeChange,
  onToggleBalancedMode,
  onToggleAgentGuard,
  onCoreClick,
  onRoutesClick,
  onSettingsClick,
  onLocalLLMClick,
  localLLMEnabled,
  onSendPrompt,
  hasActiveSession,
  onClearSession,
  servicesManifest,
  onOpenAuthModal,
  routeMatrix,
  modeRoutes,
}) => {
  const [showInfoModal, setShowInfoModal] = useState(false);
  const [showAgentGuardModal, setShowAgentGuardModal] = useState(false);
  const [showAnswerModal, setShowAnswerModal] = useState(false);
  const [copiedAnswer, setCopiedAnswer] = useState(false);
  const [copiedPromptIdx, setCopiedPromptIdx] = useState<number | null>(null);
  const [latestAnswer, setLatestAnswer] = useState<QuickPromptAnswer | null>(() => {
    try {
      const saved = localStorage.getItem('transgentic_latest_quick_answer');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  const isModeServiceSelected = (() => {
    const mainRoute = routeMatrix?.main?.[coreStatus.activeMode];
    if (mainRoute && mainRoute.defaultService !== undefined) {
      return Boolean(mainRoute.defaultService);
    }
    const legacyRoute = modeRoutes?.[coreStatus.activeMode];
    if (legacyRoute && legacyRoute.primary !== undefined) {
      return Boolean(legacyRoute.primary);
    }
    return true;
  })();

  const handleCopySamplePrompt = (text: string, idx: number) => {
    soundFx.playClick();
    navigator.clipboard.writeText(text);
    setCopiedPromptIdx(idx);
    setTimeout(() => setCopiedPromptIdx(null), 2000);
  };

  const baseProviders = PROVIDERS_CONFIG.filter(({ id }) => {
    if (!servicesManifest?.services) return true;
    const entry = servicesManifest.services[id];
    if (!entry) return true;
    return entry.hidden !== true && entry.enabled !== false;
  });

  const dynamicProviders = Object.values(servicesManifest?.services || {})
    .filter(
      (s) =>
        !['chatgpt', 'claude', 'gemini', 'grok', 'localllm'].includes(s.id) &&
        s.enabled !== false &&
        !s.hidden &&
        (s.providerType === 'cli' || s.providerType === 'webview' || s.providerType === 'api' || s.id.startsWith('custom_') || s.id.startsWith('webview_') || s.id.startsWith('api_'))
    )
    .map((s) => {
      const theme = getProviderTheme(s.id, s as any);
      const isApi = s.providerType === 'api' || s.id.startsWith('api_');
      const resolvedName = getProviderDisplayName(s.id, servicesManifest, providers);
      return {
        id: s.id,
        name: resolvedName,
        providerCompany: isApi ? 'Custom API' : (s.company && !s.company.toLowerCase().includes('experimental') && s.company !== resolvedName ? s.company : 'Custom Recipe'),
        defaultModel: s.defaultModelId || 'Default',
        icon: theme.icon,
        accentColor: theme.accentColor || 'teal',
        iconColor: theme.textClass,
      };
    });

  const visibleProviders = [...baseProviders, ...dynamicProviders];

  // Find latest successful log created strictly via Quick Prompt with response text
  const latestQuickPromptLog = logs?.find(
    (l) => l.isQuickPrompt === true && (l.status === 'success' || l.status === 'fallback') && (l.responseText || l.responseSnippet)
  );

  // Derive latest answer: prioritize any locally captured prompt answer, or fall back to most recent successful Quick Prompt log
  const currentAnswer: QuickPromptAnswer | null = latestAnswer || (latestQuickPromptLog ? {
    prompt: latestQuickPromptLog.promptText || latestQuickPromptLog.promptSnippet || '',
    response: latestQuickPromptLog.responseText || latestQuickPromptLog.responseSnippet || '',
    provider: latestQuickPromptLog.fallbackProvider || latestQuickPromptLog.targetProvider,
    model: latestQuickPromptLog.modelUsed,
    mediaPath: latestQuickPromptLog.mediaPath,
    timestamp: latestQuickPromptLog.timestamp,
  } : null);

  const isBalancedMode = config?.balancedMode ?? config?.coding?.balancedMode ?? true;
  const isAgentGuard = isAgentHaltGuardEnabled(config, coreStatus.activeMode);

  const handleSend = async (prompt: string) => {
    if (onSendPrompt) {
      const res = await onSendPrompt(prompt);
      const answerText = typeof res === 'string'
        ? res
        : res?.text || res?.content?.[0]?.text || res?.content?.find((c: any) => c.type === 'text')?.text;

      if (answerText || res?.mediaPath) {
        const fullAnswer = res?.mediaPath
          ? (answerText && answerText.includes(res.mediaPath) ? answerText : `Local media asset saved to: ${res.mediaPath}${answerText ? `\n\n${answerText}` : ''}`)
          : (answerText || '');

        const ansObj: QuickPromptAnswer = {
          prompt,
          response: fullAnswer,
          provider: res?.metadata?.providerUsed || res?.provider,
          model: res?.metadata?.modelUsed || res?.modelUsed,
          mediaPath: res?.mediaPath,
          timestamp: Date.now(),
        };
        setLatestAnswer(ansObj);
        try {
          localStorage.setItem('transgentic_latest_quick_answer', JSON.stringify(ansObj));
        } catch {}
      }
      return res;
    }
  };

  const handleClear = async () => {
    if (onClearSession) {
      await onClearSession();
      setLatestAnswer(null);
      try {
        localStorage.removeItem('transgentic_latest_quick_answer');
      } catch {}
    }
  };

  const getCoreStatusBadge = () => {
    switch (coreStatus.state) {
      case 'processing':
        return (
          <span className="flex items-center gap-1 text-[11px] font-mono text-cyan-400">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping" />
            Active Routing
          </span>
        );
      case 'fallback':
        return (
          <span className="flex items-center gap-1 text-[11px] font-mono text-amber-400">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
            Auto-Fallback
          </span>
        );
      case 'rate_limited':
        return (
          <span className="flex items-center gap-1 text-[11px] font-mono text-rose-400">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />
            Rate Limited
          </span>
        );
      default:
        return (
          <span className="flex items-center gap-1 text-[11px] font-mono text-emerald-400">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            Ready
          </span>
        );
    }
  };

  return (
    <div className="flex flex-col h-full justify-between p-4 overflow-y-auto relative w-full max-w-2xl mx-auto">
      {/* 1. Top Section: MAIN Status Header Card with Dual Toggles & Routes */}
      <div>
        <div className="tactile-core-card w-full rounded-xl p-3.5 flex items-center justify-between text-left mb-2 relative">
          <div className="flex-1 min-w-0 pr-2">
            {/* Header Row: MAIN :port Balanced Toggle Agent Guard Toggle */}
            <div className="flex items-center flex-wrap gap-x-2.5 gap-y-1.5">
              <div className="flex items-center gap-1.5 shrink-0">
                <span
                  onClick={() => {
                    soundFx.playClick();
                    if (onCoreClick) onCoreClick();
                  }}
                  className="font-bold text-xs tracking-wider text-slate-100 uppercase font-mono cursor-pointer hover:text-cyan-300 transition-colors"
                  title="View MCP Traffic Logs"
                >
                  HUB
                </span>

                <span className="text-[10px] font-mono text-cyan-400/90 bg-cyan-500/10 px-1.5 py-0.5 rounded-md border border-cyan-500/20">
                  :{coreStatus.port}
                </span>

                {onOpenAuthModal && (
                  <button
                    onClick={() => {
                      soundFx.playClick();
                      onOpenAuthModal();
                    }}
                    className="flex items-center gap-1 text-[10px] font-mono text-cyan-300 hover:text-cyan-200 bg-cyan-500/10 hover:bg-cyan-500/20 px-1.5 py-0.5 rounded-md border border-cyan-500/30 transition-all cursor-pointer shadow-[0_0_10px_rgba(6,182,212,0.15)] group"
                    title="MCP Client Access Token & Authentication Setup"
                  >
                    <Key className="w-2.5 h-2.5 text-cyan-400 group-hover:text-cyan-200" />
                    <span>Access Token</span>
                  </button>
                )}
              </div>

              {/* Dual Micro-Toggles Container */}
              <div className="flex items-center gap-2.5">
                {/* 1. Balanced Coding Mode Micro-Toggle */}
                <div className="flex items-center gap-1">
                  <label
                    className="flex items-center gap-1.5 cursor-pointer select-none"
                    title={`Balanced Mode (${isBalancedMode ? 'Active' : 'Disabled'}): Smart fallbacks and optimal balance`}
                  >
                    <div className="relative inline-flex items-center">
                      <input
                        type="checkbox"
                        checked={isBalancedMode}
                        onChange={(e) => {
                          soundFx.playClick();
                          if (onToggleBalancedMode) onToggleBalancedMode(e.target.checked);
                        }}
                        className="sr-only peer"
                      />
                      <div className="w-6 h-3.5 bg-slate-700/80 peer-checked:bg-cyan-500 rounded-full transition-colors border border-white/10 shadow-inner"></div>
                      <div className="absolute left-[2px] top-[2px] w-2.5 h-2.5 bg-white rounded-full transition-transform peer-checked:translate-x-2.5 pointer-events-none shadow-sm"></div>
                    </div>
                    <span className={`text-[10px] font-mono font-semibold tracking-tight transition-colors ${
                      isBalancedMode ? 'text-cyan-300' : 'text-slate-400 hover:text-slate-300'
                    }`}>
                      Balanced
                    </span>
                  </label>

                  {/* Thunder Trigger Button */}
                  <button
                    onClick={() => {
                      soundFx.playClick();
                      setShowInfoModal(true);
                    }}
                    className="text-slate-500 hover:text-cyan-300 transition-colors p-0.5 rounded cursor-pointer"
                    title="About Balanced Mode"
                  >
                    <Zap className={`w-3.5 h-3.5 ${isBalancedMode ? 'text-cyan-400' : 'text-slate-500'}`} />
                  </button>
                </div>

                {/* 2. Agent Halt Guard Micro-Toggle (Per Mode) */}
                <div className="flex items-center gap-1">
                  <label
                    className="flex items-center gap-1.5 cursor-pointer select-none"
                    title={`Agent Halt Guard for ${coreStatus.activeMode.toUpperCase()} (${isAgentGuard ? 'Active' : 'Disabled'}): Immediately terminates tool execution and instructs Agentic clients (Codex, Antigravity, Claude Code) to stop if all fallbacks rate-limited.`}
                  >
                    <div className="relative inline-flex items-center">
                      <input
                        type="checkbox"
                        checked={isAgentGuard}
                        onChange={(e) => {
                          soundFx.playClick();
                          if (onToggleAgentGuard) onToggleAgentGuard(coreStatus.activeMode, e.target.checked);
                        }}
                        className="sr-only peer"
                      />
                      <div className="w-6 h-3.5 bg-slate-700/80 peer-checked:bg-emerald-500 rounded-full transition-colors border border-white/10 shadow-inner"></div>
                      <div className="absolute left-[2px] top-[2px] w-2.5 h-2.5 bg-white rounded-full transition-transform peer-checked:translate-x-2.5 pointer-events-none shadow-sm"></div>
                    </div>
                    <span className={`text-[10px] font-mono font-semibold tracking-tight transition-colors ${
                      isAgentGuard ? 'text-emerald-300' : 'text-slate-400 hover:text-slate-300'
                    }`}>
                      Agent Guard
                    </span>
                  </label>

                  {/* Agent Guard Information Trigger Button */}
                  <button
                    onClick={() => {
                      soundFx.playClick();
                      setShowAgentGuardModal(true);
                    }}
                    className="text-slate-500 hover:text-emerald-300 transition-colors p-0.5 rounded cursor-pointer"
                    title="About Agent Halt Guard"
                  >
                    <ShieldCheck className={`w-3.5 h-3.5 ${isAgentGuard ? 'text-emerald-400' : 'text-slate-500'}`} />
                  </button>
                </div>

                {/* 3. Dual-Consumption Warning Badge (Scenario 2 Active) */}
                {config?.doubleAgent?.enabled && !isBalancedMode && (config?.doubleAgent?.modes?.[coreStatus.activeMode] ?? true) && (
                  <div
                    className="flex items-center gap-1 text-[9.5px] font-mono text-amber-300 bg-amber-500/15 px-2 py-0.5 rounded-md border border-amber-500/30 animate-pulse shadow-[0_0_10px_rgba(245,158,11,0.2)] select-none"
                    title="Scenario 2 Active: Dual Concurrent Dispatch (Main + Co) will consume quota from both services simultaneously."
                  >
                    <Zap className="w-2.5 h-2.5 text-amber-400" />
                    <span className="font-semibold">Dual-Consumption</span>
                  </div>
                )}
              </div>
            </div>

            {/* Sub-row: State Badge + Active Mode */}
            <div className="text-[11px] text-slate-400 mt-1 flex items-center gap-2">
              {getCoreStatusBadge()}
              <span className="text-slate-600">•</span>
              <span className="text-slate-400 text-[11px] font-mono font-medium">
                {coreStatus.activeMode.toUpperCase()} Mode
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Dedicated Routes Config Button */}
            {onRoutesClick && (
              <button
                onClick={() => {
                  soundFx.playClick();
                  onRoutesClick();
                }}
                title="Configure Mode Routing & Fallback Matrix"
                className="flex items-center gap-1.5 px-2.5 py-2 rounded-xl bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 text-[10px] font-mono font-semibold transition-all shadow-[0_0_10px_rgba(6,182,212,0.15)] cursor-pointer"
              >
                <Layers className="w-3.5 h-3.5 text-cyan-400" />
                <span>Routes</span>
              </button>
            )}

            {/* Dedicated Local LLM Config Button */}
            {onLocalLLMClick && (
              <button
                onClick={() => {
                  soundFx.playClick();
                  onLocalLLMClick();
                }}
                title="Local LLM Configuration Hub (Ollama / LM Studio / Custom)"
                className={`p-2 rounded-xl border transition-all cursor-pointer flex items-center justify-center ${
                  localLLMEnabled
                    ? 'bg-blue-500/20 text-blue-300 border-blue-500/40 shadow-[0_0_12px_rgba(59,130,246,0.25)]'
                    : 'bg-white/5 hover:bg-white/10 text-slate-400 hover:text-slate-200 border-white/10'
                }`}
              >
                <Cpu className={`w-3.5 h-3.5 ${localLLMEnabled ? 'text-blue-300' : 'text-slate-400'}`} />
              </button>
            )}

            {/* Dedicated Icon-Only Settings Button */}
            {onSettingsClick && (
              <button
                onClick={() => {
                  soundFx.playClick();
                  onSettingsClick();
                }}
                title="Settings: Local Storage, MCP Port & Model Availability"
                className="p-2 rounded-xl bg-purple-500/10 hover:bg-purple-500/20 text-purple-300 border border-purple-500/30 transition-all shadow-[0_0_10px_rgba(168,85,247,0.15)] cursor-pointer flex items-center justify-center"
              >
                <SlidersHorizontal className="w-3.5 h-3.5 text-purple-400" />
              </button>
            )}
          </div>
        </div>

        {/* Dedicated Statistics & Telemetry Sub-bar under Main Card */}
        <div className="flex items-center justify-between px-2 py-0.5 text-[10px] font-mono text-slate-400">
          <div className="flex items-center gap-1.5 text-slate-500">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400/80" />
            <span>MCP Gateway Active</span>
          </div>
          <div className="flex items-center gap-2.5">
            <span className="text-slate-300 font-medium">
              <strong className="text-cyan-400 font-bold">{coreStatus.requestCount}</strong> {coreStatus.requestCount === 0 || coreStatus.requestCount === 1 ? 'request' : 'requests'}
            </span>
            <span className="text-slate-600">•</span>
            <span className="text-slate-300 font-medium">
              <strong className="text-purple-400 font-bold">{coreStatus.activeVaultSecrets}</strong> {coreStatus.activeVaultSecrets === 0 || coreStatus.activeVaultSecrets === 1 ? 'secret' : 'secrets'}
            </span>
          </div>
        </div>

        {/* 2. Middle Section: Quick Task Modes & Prompt Composer (ABOVE Example Prompts) */}
        <div className="mt-2 space-y-2">
          <ModeSelector
            activeMode={coreStatus.activeMode}
            onChange={onModeChange}
          />

          <QuickPromptBar
            onSendPrompt={handleSend}
            isProcessing={coreStatus.state === 'processing'}
            hasActiveSession={hasActiveSession}
            onClearSession={handleClear}
            hasAnswer={!!currentAnswer}
            onViewAnswer={() => setShowAnswerModal(true)}
            isServiceDeselected={!isModeServiceSelected}
            activeMode={coreStatus.activeMode}
          />
        </div>

        {/* 3. Sample Prompt Shortcuts / Guidance for External Agents */}
        <div className="bg-black/30 border border-white/5 rounded-xl p-2 space-y-1.5 mt-2">
          <div className="flex items-center justify-between">
            <span className="text-[9px] font-mono uppercase tracking-wider text-slate-400 font-semibold flex items-center gap-1">
              <Sparkles className="w-2.5 h-2.5 text-cyan-400" />
              <span>Prompt Examples for Agentic IDE with "Transgentic MCP"</span>
            </span>
            <span className="text-[8.5px] font-mono text-slate-500">
              Click to copy
            </span>
          </div>

          <div className="grid grid-cols-2 gap-1.5">
            {SAMPLE_PROMPTS.map((sample, idx) => (
              <button
                key={idx}
                onClick={() => handleCopySamplePrompt(sample.text, idx)}
                className="flex items-start gap-1.5 p-1.5 rounded-lg bg-white/5 hover:bg-cyan-500/10 border border-white/5 hover:border-cyan-500/30 text-left transition-all group cursor-pointer"
                title={`Click to copy prompt: "${sample.text}"`}
              >
                <div className="shrink-0 mt-0.5">
                  {copiedPromptIdx === idx ? (
                    <Check className="w-3 h-3 text-emerald-400" />
                  ) : (
                    <Copy className="w-3 h-3 text-slate-500 group-hover:text-cyan-400 transition-colors" />
                  )}
                </div>
                <div className="overflow-hidden min-w-0">
                  <div className="flex items-center gap-1">
                    <span className="text-[9.5px] font-bold text-slate-200 group-hover:text-cyan-300 transition-colors truncate">
                      {sample.title}
                    </span>
                    <span className="text-[8px] font-mono text-slate-500 bg-black/40 px-1 py-0.2 rounded border border-white/5 shrink-0">
                      {sample.category}
                    </span>
                  </div>
                  <p className="text-[8.5px] text-slate-400 truncate mt-0.5">
                    "{sample.text}"
                  </p>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 3. Bottom Section: Clean Stack of AI Service Listed Buttons */}
      <div className="flex-1 flex flex-col gap-2 justify-start my-2">
        {visibleProviders.map(({ id, name, providerCompany, defaultModel }) => {
          const sEntry = servicesManifest?.services?.[id];
          const isApiProvider = sEntry?.providerType === 'api' || id.startsWith('api_');
          const isApiConfigured = isApiProvider && Boolean(sEntry?.baseUrl);
          const theme = getProviderTheme(id, sEntry);
          const Icon = theme.icon;

          const provider = providers[id] || {
            id,
            name: `${name} (${providerCompany})`,
            url: '',
            partition: `persist:transgentic_${id}`,
            state: 'disconnected',
            rateLimitCount: 0,
            isAuthenticated: false,
          };

          const isDevDisabled = sEntry?.enabled === false;
          const isAuthed = isApiProvider
            ? (!isDevDisabled && isApiConfigured)
            : (provider.isAuthenticated && !isDevDisabled);
          const isSyncing = !isApiProvider && (provider.state === 'busy' || (provider as any).isSyncing) && !isDevDisabled;

          return (
            <div
              key={id}
              onClick={() => {
                if (isApiProvider) {
                  return; // API items have no browser webview to open
                }
                soundFx.playDrawerSlide();
                onProviderClick(id);
              }}
              className={`provider-list-card w-full p-2.5 rounded-xl flex items-center justify-between transition-all ${
                isApiProvider
                  ? 'cursor-default'
                  : 'cursor-pointer group'
              } ${
                isDevDisabled
                  ? 'border-rose-500/20 bg-rose-500/[0.02] opacity-60'
                  : isAuthed
                  ? `border-white/10 ${theme.hoverBorderClass}`
                  : 'border-white/5 opacity-80'
              }`}
            >
              {/* Left Column: Icon + Service Name + Status subtitle */}
              <div className="flex items-center gap-3">
                <div className={`w-8 h-8 rounded-xl service-icon-box flex items-center justify-center ${
                  isDevDisabled
                    ? 'bg-rose-500/10 border-rose-500/30'
                    : isAuthed
                    ? `${theme.bgClass} ${theme.borderClass} border`
                    : ''
                }`}>
                  <Icon className={`w-4 h-4 ${isDevDisabled ? 'text-rose-400' : isAuthed ? theme.textClass : 'text-slate-200'}`} />
                </div>
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold text-xs text-slate-100">
                      {name}
                    </span>
                    <span className="text-[10px] text-slate-500 font-mono">
                      ({providerCompany})
                    </span>
                    {isDevDisabled && (
                      <span className="text-[9px] font-mono text-rose-400 bg-rose-500/10 px-1.5 py-0.2 rounded border border-rose-500/20">
                        Dev Disabled
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    {isDevDisabled ? (
                      <span className="text-[10px] text-rose-400/80 font-mono">
                        Disabled in ai_services.json manifest
                      </span>
                    ) : isApiProvider ? (
                      isApiConfigured ? (
                        <>
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                          <span className="text-[10px] text-slate-400 font-mono">
                            API Connected • {defaultModel}
                          </span>
                        </>
                      ) : (
                        <span className="text-[10px] text-slate-500 font-mono">
                          Configured in Settings (Custom API)
                        </span>
                      )
                    ) : isSyncing ? (
                      <>
                        <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping" />
                        <span className="text-[10px] text-cyan-300/90 font-mono">
                          Checking authentication...
                        </span>
                      </>
                    ) : isAuthed ? (
                      <>
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                        <span className="text-[10px] text-slate-400 font-mono">
                          Connected • {defaultModel}
                        </span>
                      </>
                    ) : (
                      <>
                        <span className="text-[10px] text-slate-500 font-mono">
                          Click to connect / authenticate
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Right Column: Connection State / Auth Indicator */}
              <div className="flex items-center gap-2">
                {isDevDisabled ? (
                  <span className="text-[9px] font-mono text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded border border-rose-500/20">
                    Bypassed
                  </span>
                ) : isApiProvider ? (
                  isApiConfigured ? (
                    <div
                      className="p-1 rounded-full text-emerald-400 bg-emerald-500/10 border border-emerald-500/20"
                      title="API Endpoint Ready"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                    </div>
                  ) : (
                    <span className="text-[9px] font-mono text-slate-500 bg-white/5 px-2 py-0.5 rounded border border-white/10">
                      API
                    </span>
                  )
                ) : isSyncing ? (
                  <div
                    className="p-1 rounded-full text-cyan-400 bg-cyan-500/10 border border-cyan-500/20 animate-spin"
                    title="Verifying session..."
                  >
                    <Loader2 className="w-4 h-4" />
                  </div>
                ) : isAuthed ? (
                  <div
                    className="p-1 rounded-full text-emerald-400 bg-emerald-500/10 border border-emerald-500/20"
                    title="Authenticated & Connected"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                  </div>
                ) : (
                  <div className="flex items-center gap-1 text-[10px] text-slate-500 font-mono bg-white/5 px-2 py-1 rounded-lg border border-white/5 group-hover:border-cyan-500/30 group-hover:text-cyan-300 transition-colors">
                    <span>Connect</span>
                    <ChevronRight className="w-3 h-3" />
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* 4. Balanced Agentic Mode Info Modal (Centered Vertically & Horizontally) */}
      {showInfoModal && (
        <div
          onClick={() => {
            soundFx.playClick();
            setShowInfoModal(false);
          }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-150"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative w-full max-w-sm bg-[#0c1017] border border-cyan-500/40 rounded-xl shadow-[0_20px_50px_rgba(0,0,0,0.95)] p-5 space-y-3.5 animate-in zoom-in-95 duration-150 text-left"
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-white/10 pb-2.5">
              <div className="flex items-center gap-2 text-cyan-300 font-mono font-bold text-xs uppercase tracking-wider">
                <Zap className="w-4 h-4 text-cyan-400" />
                <span>Balanced Agentic Mode</span>
              </div>
              <button
                onClick={() => {
                  soundFx.playClick();
                  setShowInfoModal(false);
                }}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-white/10 transition-colors cursor-pointer"
                title="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="space-y-2.5 text-slate-200 text-xs leading-relaxed font-sans">
              <p>
                <strong className="text-cyan-300 font-mono">Balanced Agentic Mode</strong> establishes an optimal division of labor between your local developer agent (<span className="text-cyan-300 font-mono font-semibold">Codex</span>, <span className="text-purple-300 font-mono font-semibold">Antigravity</span>, <span className="text-amber-300 font-mono font-semibold">Cursor</span>), <strong className="text-teal-300 font-mono">Web AI Services</strong>, and <strong className="text-emerald-300 font-mono">Local LLMs</strong>.
              </p>
              <div className="p-2.5 rounded-lg bg-white/5 border border-white/10 space-y-1.5 text-[11px]">
                <div className="font-semibold text-cyan-300 font-mono uppercase tracking-wider text-[10px]">
                  Web AI Services (Claude, ChatGPT, Gemini, Grok)
                </div>
                <p className="text-slate-300">
                  Agentic IDEs handle heavy continuous execution (file edits, builds, test suites). Transgentic MCP handles strategic architectural planning, deep reasoning, and memory recall, minimizing webview spam and protecting cloud rate limits.
                </p>
              </div>
              <div className="p-2.5 rounded-lg bg-white/5 border border-emerald-500/20 space-y-1.5 text-[11px]">
                <div className="font-semibold text-emerald-300 font-mono uppercase tracking-wider text-[10px]">
                  Local LLM Micro-Tasks (Ollama, LM Studio)
                </div>
                <p className="text-slate-300">
                  Local LLMs assist in fast, zero-quota <strong>micro-tasks</strong> (regex generation, TypeScript types from JSON, docstrings, unit test stubs) completely bypassing webview DOM manipulation. Complex planning and deep reasoning are retained directly by your agentic IDE.
                </p>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="pt-2 flex justify-end">
              <button
                onClick={() => {
                  soundFx.playClick();
                  setShowInfoModal(false);
                }}
                className="px-4 py-1.5 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-500/40 font-mono text-xs font-semibold transition-all cursor-pointer shadow-[0_0_12px_rgba(6,182,212,0.2)]"
              >
                Got it
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 5. Agent Halt Guard Info Modal */}
      {showAgentGuardModal && (
        <div
          onClick={() => {
            soundFx.playClick();
            setShowAgentGuardModal(false);
          }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-150"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative w-full max-w-sm bg-[#0c1017] border border-emerald-500/40 rounded-xl shadow-[0_20px_50px_rgba(0,0,0,0.95)] p-5 space-y-3.5 animate-in zoom-in-95 duration-150 text-left"
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-white/10 pb-2.5">
              <div className="flex items-center gap-2 text-emerald-300 font-mono font-bold text-xs uppercase tracking-wider">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                <span>Agent Halt Guard</span>
              </div>
              <button
                onClick={() => {
                  soundFx.playClick();
                  setShowAgentGuardModal(false);
                }}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-white/10 transition-colors cursor-pointer"
                title="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="space-y-2.5 text-slate-200 text-xs leading-relaxed font-sans">
              <p>
                <strong className="text-emerald-300 font-mono">Agent Halt Guard</strong> stops autonomous agents (<span className="text-cyan-300 font-mono font-semibold">Codex</span>, <span className="text-purple-300 font-mono font-semibold">Antigravity</span>, <span className="text-amber-300 font-mono font-semibold">Claude Code</span>) from burning LLM context tokens on rate-limited providers.
              </p>
              <div className="p-2.5 rounded-lg bg-white/5 border border-white/5 space-y-1.5 text-[11.5px]">
                <div className="flex flex-col gap-0.5 text-emerald-300">
                  <span className="font-bold font-mono text-[11px] text-emerald-400">• Enabled (Default):</span>
                  <span className="text-slate-300">Proceeds through fallback chains. If all fallbacks fail due to rate limits, it immediately halts tool execution and directs the agent to stop and consult the human user.</span>
                </div>
                <div className="flex flex-col gap-0.5 text-slate-400 mt-1">
                  <span className="font-bold font-mono text-[11px] text-slate-300">• Disabled:</span>
                  <span className="text-slate-300">Permits the agent to continue its autonomous retry loop according to its standard client policies.</span>
                </div>
              </div>
              <p className="text-[10.5px] text-slate-400 font-mono">
                Current mode: <strong className="text-slate-200 font-semibold">{coreStatus.activeMode.toUpperCase()}</strong> ({isAgentGuard ? 'Active' : 'Disabled'})
              </p>
            </div>

            {/* Modal Footer */}
            <div className="pt-2 flex justify-end">
              <button
                onClick={() => {
                  soundFx.playClick();
                  setShowAgentGuardModal(false);
                }}
                className="px-4 py-1.5 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 font-mono text-xs font-semibold transition-all cursor-pointer shadow-[0_0_12px_rgba(16,185,129,0.2)]"
              >
                Got it
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 5. Quick Prompt AI Response Modal */}
      {showAnswerModal && currentAnswer && (
        <div
          onClick={() => {
            soundFx.playClick();
            setShowAnswerModal(false);
          }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-150"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative w-full max-w-lg max-h-[85vh] bg-[#0c1017] border border-cyan-500/40 rounded-xl shadow-[0_20px_50px_rgba(0,0,0,0.95)] flex flex-col overflow-hidden animate-in zoom-in-95 duration-150 text-left"
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between px-5 py-3 border-b border-white/10 bg-black/40 shrink-0 gap-2">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-lg bg-cyan-500/20 border border-cyan-500/40 flex items-center justify-center text-cyan-400">
                  <MessageSquareText className="w-3.5 h-3.5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-cyan-300 font-mono font-bold text-xs uppercase tracking-wider">
                      Answer
                    </span>
                    {currentAnswer.provider && (
                      <span className="text-[9.5px] font-mono text-slate-300 bg-white/10 px-1.5 py-0.5 rounded border border-white/10">
                        {getProviderDisplayName(currentAnswer.provider, servicesManifest, providers)}
                      </span>
                    )}
                    {currentAnswer.model && (
                      <span className="text-[9.5px] font-mono text-purple-300 bg-purple-500/20 px-1.5 py-0.5 rounded border border-purple-500/30 flex items-center gap-1">
                        <Sparkles className="w-2.5 h-2.5" />
                        <span>{currentAnswer.model}</span>
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => {
                    soundFx.playClick();
                    navigator.clipboard.writeText(currentAnswer.response);
                    setCopiedAnswer(true);
                    setTimeout(() => setCopiedAnswer(false), 2500);
                  }}
                  className="flex items-center gap-1 px-2 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 text-[10px] font-mono border border-white/10 transition-all cursor-pointer"
                  title="Copy full response to clipboard"
                >
                  {copiedAnswer ? (
                    <>
                      <Check className="w-3 h-3 text-emerald-400" />
                      <span className="text-emerald-400">Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3 h-3 text-slate-400" />
                      <span>Copy</span>
                    </>
                  )}
                </button>

                <button
                  onClick={() => {
                    soundFx.playClick();
                    setShowAnswerModal(false);
                  }}
                  className="p-1 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-white/10 transition-colors cursor-pointer"
                  title="Close"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Modal Body: Scrollable */}
            <div className="flex-1 overflow-y-auto p-5 space-y-3.5 font-sans select-text">
              {/* User Prompt Box */}
              {currentAnswer.prompt && (
                <div className="space-y-1">
                  <div className="text-[9px] font-mono uppercase tracking-wider text-slate-500 font-semibold">
                    Prompt
                  </div>
                  <div className="text-xs text-slate-300 font-mono bg-black/60 px-3 py-2 rounded-xl border border-white/10 break-words select-text">
                    {currentAnswer.prompt}
                  </div>
                </div>
              )}

              {/* AI Answer Text */}
              <div className="space-y-1">
                <div className="text-[9px] font-mono uppercase tracking-wider text-cyan-400 font-semibold flex items-center justify-between">
                  <span>Response</span>
                  {currentAnswer.timestamp && (
                    <span className="text-[9px] font-mono text-slate-500 font-normal">
                      {new Date(currentAnswer.timestamp).toLocaleTimeString()}
                    </span>
                  )}
                </div>
                <div className="text-xs text-slate-100 font-mono leading-relaxed bg-black/40 p-3.5 rounded-xl border border-cyan-500/20 break-words whitespace-pre-wrap select-text selection:bg-cyan-500 selection:text-black">
                  {currentAnswer.response}
                </div>
              </div>

              {/* Media Preview if currentAnswer has mediaPath or local path in text */}
              {(() => {
                const effectiveMediaPath = extractMediaPath(currentAnswer.mediaPath, currentAnswer.response);
                if (!effectiveMediaPath) return null;
                return (
                  <div className="space-y-1.5 pt-1">
                    <div className="text-[9px] font-mono uppercase tracking-wider text-purple-400 font-semibold flex items-center gap-1">
                      <ImageIcon className="w-3 h-3" />
                      <span>Generated Media Asset</span>
                    </div>
                    <MediaPreview path={effectiveMediaPath} />
                  </div>
                );
              })()}
            </div>

            {/* Modal Footer */}
            <div className="px-5 py-2.5 border-t border-white/10 bg-black/30 flex items-center justify-between shrink-0">
              <div className="text-[10px] font-mono text-slate-500">
                {currentAnswer.response ? `${currentAnswer.response.length} characters` : ''}
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    soundFx.playClick();
                    setShowAnswerModal(false);
                  }}
                  className="px-4 py-1.5 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-500/40 font-mono text-xs font-semibold transition-all cursor-pointer shadow-[0_0_12px_rgba(6,182,212,0.2)]"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
