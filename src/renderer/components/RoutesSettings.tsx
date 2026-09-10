import { isCliProvider } from '../../shared/cli.js';
import React, { useState, useEffect } from 'react';
import {
  ModeRouteConfig,
  ProviderId,
  ProviderStatus,
  ServicesManifest,
  TaskMode,
  LocalLLMConfig,
  RouteMatrix,
  ModePipelineConfig,
  TransgenticConfig,
} from '../../shared/types.js';
import {
  Sparkles,
  Code2,
  PenTool,
  Image as ImageIcon,
  Video,
  Volume2,
  Music,
  Plus,
  Trash2,
  ChevronUp,
  ChevronDown,
  RotateCcw,
  Bot,
  Brain,
  Zap,
  Cpu,
  Layers,
  ArrowLeft,
  ShieldCheck,
  Star,
  GitFork,
  Info,
} from 'lucide-react';
import { soundFx } from '../audio/soundFx.js';
import { getProviderTheme, getProviderDisplayName } from '../utils/providerTheme.js';

interface RoutesSettingsProps {
  modeRoutes: Record<TaskMode, ModeRouteConfig>;
  routeMatrix?: RouteMatrix | null;
  config?: TransgenticConfig;
  providers: Record<ProviderId, ProviderStatus>;
  servicesManifest?: ServicesManifest | null;
  localLLMConfig?: LocalLLMConfig;
  initialPipeline?: 'main' | 'co';
  onUpdateRoute: (mode: TaskMode, config: Partial<ModeRouteConfig> | Partial<ModePipelineConfig>, pipeline?: 'main' | 'co') => void;
  onResetRoutes: () => void;
  onBack?: () => void;
}

const DEFAULT_PROVIDERS: ProviderId[] = ['chatgpt', 'claude', 'gemini', 'grok'];

export const RoutesSettings: React.FC<RoutesSettingsProps> = ({
  modeRoutes,
  routeMatrix,
  config,
  providers,
  servicesManifest,
  localLLMConfig,
  initialPipeline,
  onUpdateRoute,
  onResetRoutes,
  onBack,
}) => {
  const [activePipeline, setActivePipeline] = useState<'main' | 'co'>(initialPipeline || 'main');
  const [selectedMode, setSelectedMode] = useState<TaskMode>('general');
  const [fallbackToAdd, setFallbackToAdd] = useState<ProviderId | ''>('');
  const [showResetConfirm, setShowResetConfirm] = useState<boolean>(false);

  useEffect(() => {
    if (initialPipeline) {
      setActivePipeline(initialPipeline);
    }
  }, [initialPipeline]);

  const isDoubleAgentEnabled = config?.doubleAgent?.enabled ?? false;
  const isBalancedMode = config?.balancedMode ?? config?.coding?.balancedMode ?? true;

  const allProviders: ProviderId[] = (() => {
    const services = servicesManifest?.services || {};
    const dynamicProviders = Object.values(services)
      .filter(
        (s) =>
          !DEFAULT_PROVIDERS.includes(s.id as ProviderId) &&
          s.id !== 'localllm' &&
          s.enabled !== false &&
          !s.hidden &&
          (s.providerType === 'cli' || s.providerType === 'api' || s.providerType === 'webview' || s.id.startsWith('custom_') || s.id.startsWith('webview_') || s.id.startsWith('api_'))
      )
      .map((s) => s.id as ProviderId);
    return Array.from(new Set([...DEFAULT_PROVIDERS, ...dynamicProviders, 'localllm']));
  })();

  const currentPipelineConfig: ModePipelineConfig | undefined =
    routeMatrix?.[activePipeline]?.[selectedMode];

  const currentRoute: ModeRouteConfig = {
    mode: selectedMode,
    primary: (currentPipelineConfig?.defaultService !== undefined
      ? currentPipelineConfig.defaultService
      : (activePipeline === 'co' ? 'chatgpt' : (modeRoutes[selectedMode]?.primary ?? 'claude'))) as ProviderId,
    fallbacks: (currentPipelineConfig?.fallbackChain || (activePipeline === 'co' ? ['gemini', 'grok'] : modeRoutes[selectedMode]?.fallbacks) || []) as ProviderId[],
    cliWorkspaces: currentPipelineConfig?.cliWorkspaces || (activePipeline === 'main' ? modeRoutes[selectedMode]?.cliWorkspaces : undefined),
    providerModels: currentPipelineConfig?.modelRouting || modeRoutes[selectedMode]?.providerModels,
    outputFormat: modeRoutes[selectedMode]?.outputFormat || 'prose_markdown',
  };

  const mainPrimary = (routeMatrix?.main?.[selectedMode]?.defaultService !== undefined
    ? routeMatrix.main[selectedMode].defaultService
    : (modeRoutes[selectedMode]?.primary ?? 'claude')) as ProviderId;
  const coPrimary = (routeMatrix?.co?.[selectedMode]?.defaultService !== undefined
    ? routeMatrix.co[selectedMode].defaultService
    : 'chatgpt') as ProviderId;

  const getProviderIcon = (id: ProviderId) => {
    const theme = getProviderTheme(id, servicesManifest?.services?.[id]);
    const Icon = theme.icon;
    return <Icon className={`w-3.5 h-3.5 ${theme.textClass}`} />;
  };

  const getProviderLabel = (id: ProviderId) => {
    if (!id) return 'None';
    return getProviderDisplayName(id, servicesManifest, providers);
  };

  const getModeIcon = (mode: TaskMode) => {
    switch (mode) {
      case 'general':
        return <Sparkles className="w-3 h-3" />;
      case 'coding':
        return <Code2 className="w-3 h-3" />;
      case 'writing':
        return <PenTool className="w-3 h-3" />;
      case 'image':
        return <ImageIcon className="w-3 h-3" />;
      case 'video':
        return <Video className="w-3 h-3" />;
      case 'audio':
        return <Volume2 className="w-3 h-3" />;
    }
  };

  const handleSetPrimary = (newPrimary: ProviderId) => {
    soundFx.playClick();
    if (currentRoute.primary === newPrimary) {
      // Toggle off / Deselect
      onUpdateRoute(selectedMode, {
        primary: '' as any,
        defaultService: '',
        fallbacks: currentRoute.fallbacks,
        providerModels: currentRoute.providerModels,
      }, activePipeline);
      return;
    }

    const updatedFallbacks = currentRoute.fallbacks.filter((p) => p !== newPrimary);
    onUpdateRoute(selectedMode, {
      primary: newPrimary,
      defaultService: newPrimary,
      fallbacks: updatedFallbacks,
      providerModels: currentRoute.providerModels,
    }, activePipeline);

    // If changing Main, prevent duplicate in Co if identical
    if (activePipeline === 'main' && newPrimary === coPrimary) {
      const coFallbacks = (routeMatrix?.co?.[selectedMode]?.fallbackChain || []).filter((p) => p !== newPrimary);
      const fallbackOptions: ProviderId[] = ['chatgpt', 'claude', 'gemini', 'grok'];
      const altCoPrimary = coFallbacks[0] || fallbackOptions.find((p) => p !== newPrimary) || 'claude';
      onUpdateRoute(selectedMode, {
        primary: altCoPrimary,
        defaultService: altCoPrimary,
        fallbacks: coFallbacks.filter((p) => p !== altCoPrimary),
      }, 'co');
    }
  };

  const handleMoveFallback = (index: number, direction: 'up' | 'down') => {
    soundFx.playClick();
    const newFallbacks = [...currentRoute.fallbacks];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= newFallbacks.length) return;

    const temp = newFallbacks[index];
    newFallbacks[index] = newFallbacks[targetIndex];
    newFallbacks[targetIndex] = temp;

    onUpdateRoute(selectedMode, {
      primary: currentRoute.primary,
      fallbacks: newFallbacks,
      providerModels: currentRoute.providerModels,
    }, activePipeline);
  };

  const handleRemoveFallback = (index: number) => {
    soundFx.playClick();
    const newFallbacks = currentRoute.fallbacks.filter((_, i) => i !== index);
    onUpdateRoute(selectedMode, {
      primary: currentRoute.primary,
      fallbacks: newFallbacks,
      providerModels: currentRoute.providerModels,
    }, activePipeline);
  };

  const handleAddFallback = () => {
    if (!fallbackToAdd) return;
    soundFx.playClick();
    if (!currentRoute.fallbacks.includes(fallbackToAdd)) {
      const newFallbacks = [...currentRoute.fallbacks, fallbackToAdd];
      onUpdateRoute(selectedMode, {
        primary: currentRoute.primary,
        fallbacks: newFallbacks,
        providerModels: currentRoute.providerModels,
      }, activePipeline);
    }
    setFallbackToAdd('');
  };

  const [modelFallbackToAdd, setModelFallbackToAdd] = useState<Record<string, string>>({});

  const getProviderModelsForMode = (providerId: ProviderId, mode: TaskMode) => {
    const s = servicesManifest?.services?.[providerId];
    if (!s) return [];
    const isApi = s.providerType === 'api' || providerId.startsWith('api_');
    if (!Array.isArray(s.models) || s.models.length === 0) {
      if (isApi && (mode === 'general' || mode === 'coding' || mode === 'writing')) {
        const defaultModel = s.defaultModelId || 'default';
        return [{ id: defaultModel, displayName: defaultModel, enabled: true, mode: 'general', modes: ['general', 'coding', 'writing'], requiresTier: undefined }];
      }
      return [];
    }
    const filtered = s.models.filter((m) => {
      if (m.mode === mode) return true;
      if (Array.isArray(m.modes) && m.modes.includes(mode)) return true;
      if (mode === 'general' && !m.mode && (!m.modes || m.modes.length === 0)) return true;
      if (isApi && (mode === 'general' || mode === 'coding' || mode === 'writing') && (!m.modes || m.modes.length === 0)) return true;
      return false;
    });
    if (filtered.length === 0 && isApi && (mode === 'general' || mode === 'coding' || mode === 'writing')) {
      return s.models;
    }
    return filtered;
  };

  const doesProviderSupportMode = (providerId: ProviderId, mode: TaskMode): boolean => {
    if (providerId === 'localllm') {
      return mode === 'general' || mode === 'coding' || mode === 'writing';
    }
    const s = servicesManifest?.services?.[providerId];
    const isCustom = s?.providerType === 'api' || s?.providerType === 'webview' || providerId.startsWith('api_') || providerId.startsWith('custom_') || providerId.startsWith('webview_');
    if (isCustom) {
      const models = getProviderModelsForMode(providerId, mode);
      if (models.length > 0) return true;
      return mode === 'general' || mode === 'coding' || mode === 'writing';
    }
    return getProviderModelsForMode(providerId, mode).length > 0;
  };

  const getDefaultModelForProviderMode = (providerId: ProviderId, mode: TaskMode) => {
    const configured = currentRoute.providerModels?.[providerId]?.defaultModelId;
    if (configured) return configured;
    const available = getProviderModelsForMode(providerId, mode);
    return available[0]?.id || servicesManifest?.services?.[providerId]?.defaultModelId || '';
  };

  const getFallbackModelsForProviderMode = (providerId: ProviderId) => {
    return currentRoute.providerModels?.[providerId]?.fallbackModelIds || [];
  };

  const handleSetProviderModeDefaultModel = (providerId: ProviderId, modelId: string) => {
    soundFx.playClick();
    const existing = currentRoute.providerModels?.[providerId] || {};
    const updatedFallbacks = (existing.fallbackModelIds || []).filter((id) => id !== modelId);
    onUpdateRoute(selectedMode, {
      primary: currentRoute.primary,
      fallbacks: currentRoute.fallbacks,
      providerModels: {
        ...(currentRoute.providerModels || {}),
        [providerId]: {
          ...existing,
          defaultModelId: modelId,
          fallbackModelIds: updatedFallbacks,
        },
      },
    }, activePipeline);
  };

  const handleAddProviderModeFallbackModel = (providerId: ProviderId, modelId: string) => {
    if (!modelId) return;
    soundFx.playClick();
    const existing = currentRoute.providerModels?.[providerId] || {};
    const existingFbs = existing.fallbackModelIds || [];
    if (!existingFbs.includes(modelId)) {
      onUpdateRoute(selectedMode, {
        primary: currentRoute.primary,
        fallbacks: currentRoute.fallbacks,
        providerModels: {
          ...(currentRoute.providerModels || {}),
          [providerId]: {
            ...existing,
            fallbackModelIds: [...existingFbs, modelId],
          },
        },
      }, activePipeline);
    }
    setModelFallbackToAdd((prev) => ({ ...prev, [providerId]: '' }));
  };

  const handleRemoveProviderModeFallbackModel = (providerId: ProviderId, index: number) => {
    soundFx.playClick();
    const existing = currentRoute.providerModels?.[providerId] || {};
    const existingFbs = existing.fallbackModelIds || [];
    onUpdateRoute(selectedMode, {
      primary: currentRoute.primary,
      fallbacks: currentRoute.fallbacks,
      providerModels: {
        ...(currentRoute.providerModels || {}),
        [providerId]: {
          ...existing,
          fallbackModelIds: existingFbs.filter((_, i) => i !== index),
        },
      },
    }, activePipeline);
  };

  const handleMoveProviderModeFallbackModel = (providerId: ProviderId, index: number, direction: 'up' | 'down') => {
    soundFx.playClick();
    const existing = currentRoute.providerModels?.[providerId] || {};
    const existingFbs = [...(existing.fallbackModelIds || [])];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= existingFbs.length) return;
    const temp = existingFbs[index];
    existingFbs[index] = existingFbs[targetIndex];
    existingFbs[targetIndex] = temp;
    onUpdateRoute(selectedMode, {
      primary: currentRoute.primary,
      fallbacks: currentRoute.fallbacks,
      providerModels: {
        ...(currentRoute.providerModels || {}),
        [providerId]: {
          ...existing,
          fallbackModelIds: existingFbs,
        },
      },
    }, activePipeline);
  };

  // Providers not yet in primary or fallbacks
  const availableToAdd = allProviders.filter(
    (p) => p !== currentRoute.primary && !currentRoute.fallbacks.includes(p)
  );

  return (
    <div className="h-full w-full flex flex-col p-4 overflow-y-auto space-y-4 no-drag">
      {/* Top Header & Reset */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {onBack && (
            <button
              onClick={() => {
                soundFx.playClick();
                onBack();
              }}
              className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 border border-white/10 transition-colors cursor-pointer"
              title="Back to Hub"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
            </button>
          )}
          <div>
            <h2 className="text-xs font-bold text-slate-100 uppercase tracking-wider flex items-center gap-1.5 font-mono">
              <Layers className="w-3.5 h-3.5 text-cyan-400" />
              <span>Routing</span>
            </h2>
            <p className="text-[10px] text-slate-400">
              Configure dual pipeline routing (Main vs Co-Agent), default services, and custom fallback chains.
            </p>
          </div>
        </div>

        <button
          onClick={() => {
            soundFx.playClick();
            setShowResetConfirm(true);
          }}
          className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 border border-white/10 text-[10px] font-mono transition-colors cursor-pointer"
          title="Reset all modes to default routing"
        >
          <RotateCcw className="w-3 h-3" />
          <span>Reset Defaults</span>
        </button>
      </div>

      {/* Top-Level Segmented Control: [ ⭐️ Main Agent ] | [ 🔀 Co-Agent ] */}
      <div className="flex items-center gap-1 p-1 bg-black/40 rounded-xl border border-white/10">
        <button
          onClick={() => {
            soundFx.playClick();
            setActivePipeline('main');
          }}
          className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-mono font-semibold transition-all cursor-pointer min-h-[40px] ${
            activePipeline === 'main'
              ? 'bg-gradient-to-r from-cyan-500/30 to-blue-500/30 text-cyan-300 border border-cyan-500/50 shadow-[0_0_15px_rgba(6,182,212,0.25)]'
              : 'text-slate-400 hover:text-slate-200 hover:bg-white/5 border border-transparent'
          }`}
        >
          <Star className="w-3.5 h-3.5 text-cyan-400" />
          <span>Main Agent</span>
        </button>

        <button
          onClick={() => {
            soundFx.playClick();
            setActivePipeline('co');
          }}
          className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-mono font-semibold transition-all cursor-pointer min-h-[40px] ${
            activePipeline === 'co'
              ? 'bg-gradient-to-r from-amber-500/30 to-rose-500/30 text-amber-300 border border-amber-500/50 shadow-[0_0_15px_rgba(245,158,11,0.25)]'
              : 'text-slate-400 hover:text-slate-200 hover:bg-white/5 border border-transparent'
          }`}
        >
          <div className="flex items-center gap-2">
            <GitFork className="w-3.5 h-3.5 text-amber-400" />
            <span>Co-Agent</span>
            <span
              title={
                isDoubleAgentEnabled && !isBalancedMode
                  ? 'Dual Concurrent Dispatch: Co-Agent queries run concurrently with Main Agent'
                  : isDoubleAgentEnabled
                  ? 'Balanced Mode: Your Agentic IDE performs cross-examination. Co-Agent routes activate when Balanced Mode is OFF'
                  : 'Double Agent is disabled in Settings'
              }
              className={`text-[9px] px-1.5 py-0.5 rounded font-mono transition-colors ${
                isDoubleAgentEnabled && !isBalancedMode
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                  : isDoubleAgentEnabled
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                  : 'bg-white/10 text-slate-400 border border-white/10'
              }`}
            >
              {isDoubleAgentEnabled && !isBalancedMode
                ? 'Active'
                : isDoubleAgentEnabled
                ? 'Standby'
                : 'Inactive'}
            </span>
          </div>
        </button>
      </div>

      {/* Contextual Co-Agent Pipeline Banner */}
      {activePipeline === 'co' && (
        <div className={`flex items-start gap-2.5 p-3 rounded-xl border text-[11px] leading-relaxed transition-all ${
          isDoubleAgentEnabled && !isBalancedMode
            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200 shadow-[0_0_15px_rgba(16,185,129,0.08)]'
            : isDoubleAgentEnabled
            ? 'bg-amber-500/10 border-amber-500/30 text-amber-200/90 shadow-[0_0_15px_rgba(245,158,11,0.08)]'
            : 'bg-slate-800/40 border-white/10 text-slate-400'
        }`}>
          {isDoubleAgentEnabled && !isBalancedMode ? (
            <>
              <Zap className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold text-emerald-300">Dual Concurrent Dispatch Active: </span>
                Balanced Mode is <span className="font-semibold text-white font-mono">OFF</span>. Transgentic will concurrently query both your Main Agent and Co-Agent routes below, merging both perspectives side-by-side.
              </div>
            </>
          ) : isDoubleAgentEnabled ? (
            <>
              <Info className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold text-amber-300">Standby in Balanced Mode: </span>
                When Balanced Mode is <span className="font-semibold text-white font-mono">ACTIVE</span>, Double Agent directs your Agentic IDE (Cursor, Codex, Antigravity, Claude Code) to cross-examine its own reasoning against Transgentic's Main Agent. To have Transgentic query both Main and Co-Agent models concurrently, switch Balanced Mode to <span className="font-semibold text-white font-mono">DISABLED</span> in Settings.
              </div>
            </>
          ) : (
            <>
              <Info className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold text-slate-300">Double Agent Disabled: </span>
                Enable Double Agent in <span className="text-amber-400 font-mono">Settings</span> to activate dual-agent cross-examination or concurrent routing.
              </div>
            </>
          )}
        </div>
      )}

      {/* Mode Selector Tabs */}
      <div className="grid grid-cols-6 gap-1 bg-black/40 p-1 rounded-xl border border-white/5">
        {(['general', 'coding', 'writing', 'image', 'video', 'audio'] as TaskMode[]).map((mode) => (
          <button
            key={mode}
            onClick={() => {
              soundFx.playClick();
              setSelectedMode(mode);
            }}
            className={`flex items-center justify-center gap-1 py-1.5 rounded-lg text-[10px] font-semibold uppercase tracking-wider transition-all cursor-pointer ${
              selectedMode === mode
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-[0_0_12px_rgba(6,182,212,0.25)]'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {getModeIcon(mode)}
            <span className="capitalize">{mode}</span>
          </button>
        ))}
      </div>

      {/* Mode Card Settings */}
      <div className="tactile-core-card p-3.5 rounded-2xl space-y-4">
        {/* Mode Info Bar */}
        <div className="flex items-center justify-between pb-2 border-b border-white/5">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
              {getModeIcon(selectedMode)}
            </div>
            <div>
              <span className="text-xs font-bold text-slate-100 uppercase tracking-wide">
                {selectedMode} Mode Pipeline ({activePipeline === 'main' ? 'Main Agent' : 'Co-Agent'})
              </span>
              <span className="block text-[10px] text-slate-500 font-mono">
                Format: {currentRoute.outputFormat}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1 text-[10px] text-emerald-400 font-mono bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
            <ShieldCheck className="w-3 h-3" />
            <span>Auto-Failover Active</span>
          </div>
        </div>

        {/* 1. Primary Default Provider */}
        <div className="space-y-1.5">
          <label className="text-[10px] font-mono uppercase tracking-wider text-slate-400 flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <span>1. Default AI Service (Primary)</span>
              <span className="text-[9px] text-slate-500 font-sans normal-case">(click selected to deselect & fallback to Codex)</span>
            </span>
            {activePipeline === 'co' && (
              <span className="text-[9px] font-mono text-cyan-400">
                Main Agent Primary: {mainPrimary ? getProviderLabel(mainPrimary) : 'Deselected'}
              </span>
            )}
          </label>

          {!currentRoute.primary && (
            <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/25 flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <Bot className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <span className="text-[10px] text-amber-200">
                  <strong>No Service Selected</strong>: Requests in {selectedMode} mode will fall back to your agentic client (Codex / Antigravity / Cursor). Quick prompt is disabled.
                </span>
              </div>
              <span className="text-[9px] font-mono font-bold text-amber-300 bg-amber-500/20 px-1.5 py-0.5 rounded border border-amber-500/30 shrink-0">
                CODEX FALLBACK
              </span>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            {allProviders.map((id) => {
              const isSelected = currentRoute.primary === id;
              const prov = providers[id];
              const sEntry = servicesManifest?.services?.[id];
              const isLocal = id === 'localllm';
              const isApi = sEntry?.providerType === 'api' || id.startsWith('api_');
              const isLocalDisabled = isLocal && localLLMConfig?.enabled === false;
              const isDevDisabled = !isLocal && sEntry?.enabled === false;
              const isModeSupported = doesProviderSupportMode(id, selectedMode);
              const isExp = sEntry?.experimental === true;
              const isActiveInMain = activePipeline === 'co' && id === mainPrimary;
              const isDisabled = isDevDisabled || !isModeSupported || isActiveInMain;

              return (
                <button
                  key={id}
                  disabled={isDisabled}
                  onClick={() => handleSetPrimary(id)}
                  className={`relative flex items-center justify-between p-2.5 rounded-xl border text-left transition-all ${
                    isActiveInMain
                      ? 'opacity-60 bg-cyan-500/[0.04] border-cyan-500/30 cursor-not-allowed text-slate-400'
                      : !isModeSupported
                      ? 'opacity-35 bg-white/[0.01] border-white/5 cursor-not-allowed text-slate-500'
                      : isLocalDisabled
                      ? 'bg-cyan-500/[0.03] border-white/10 text-slate-400'
                      : isSelected && isDevDisabled
                      ? 'bg-rose-500/15 border-rose-500/60 shadow-[0_0_12px_rgba(244,63,94,0.2)] text-slate-100 cursor-pointer'
                      : isSelected
                      ? 'bg-cyan-500/15 border-cyan-500/50 shadow-[0_0_12px_rgba(6,182,212,0.15)] text-slate-100 cursor-pointer'
                      : isDevDisabled
                      ? 'bg-rose-500/[0.03] border-rose-500/20 text-slate-400 opacity-70 cursor-not-allowed'
                      : 'bg-white/5 border-white/5 hover:border-white/15 text-slate-300 cursor-pointer'
                  }`}
                  title={
                    isSelected
                      ? 'Currently selected as Primary. Click to deselect (falls back to Codex).'
                      : isActiveInMain
                      ? 'Currently active as Primary in Main Agent. Mutual exclusion prevents dual assignment.'
                      : !isModeSupported
                      ? isLocal
                        ? 'Local LLM only supports text and code completions'
                        : `${getProviderLabel(id)} has no models supporting ${selectedMode} mode`
                      : isLocalDisabled
                      ? 'Local LLM is currently disabled in settings'
                      : undefined
                  }
                >
                  <div className="flex items-center gap-2">
                    <div className="service-icon-box p-1.5 rounded-lg shrink-0">
                      {getProviderIcon(id)}
                    </div>
                    <div>
                      <div className="text-[11px] font-bold flex items-center gap-1.5">
                        <span>{getProviderLabel(id)}</span>
                        {isActiveInMain && (
                          <span className="text-[8px] font-mono text-cyan-300 bg-cyan-500/20 px-1 py-0.2 rounded border border-cyan-500/40 absolute -top-1 -right-0.5 shadow-[0_0_8px_rgba(6,182,212,0.3)]">
                            Active in Main
                          </span>
                        )}
                        {!isActiveInMain && !isModeSupported && (
                          <span className="text-[8px] font-mono text-slate-400 bg-white/5 px-1 py-0.2 rounded border border-white/10 absolute -top-1 -right-0.5">
                            Unsupported
                          </span>
                        )}
                        {!isActiveInMain && isLocalDisabled && isModeSupported && (
                          <span className="text-[8px] font-mono text-slate-400 bg-white/10 px-1 py-0.2 rounded border border-white/20 absolute -top-1 -right-0.5">
                            [Disabled]
                          </span>
                        )}
                        {!isActiveInMain && isDevDisabled && (
                          <span className="text-[8.5px] font-mono text-rose-400 bg-rose-500/10 px-1 py-0.2 rounded border border-rose-500/20 absolute -top-1 -right-0.5">
                            N/A
                          </span>
                        )}
                      </div>
                      <div className="text-[9px] text-slate-500 font-mono">
                        {isActiveInMain
                          ? '○ Primary in Main'
                          : !isModeSupported
                          ? isLocal
                            ? '○ Text & code only'
                            : `○ No ${selectedMode} models`
                          : isLocal
                          ? localLLMConfig?.enabled
                            ? `● Active (${localLLMConfig.selectedModel || localLLMConfig.preset})`
                            : '○ Disabled in settings'
                          : isDevDisabled
                          ? '○ Disabled in settings'
                          : isApi
                          ? Boolean(sEntry?.baseUrl)
                            ? `● Connected (${sEntry?.defaultModelId || 'Default'})`
                            : '○ Not configured'
                          : prov?.isAuthenticated
                          ? '● Authenticated'
                          : '○ Not connected'}
                      </div>
                    </div>
                  </div>

                  {isSelected && (
                    <span
                      className={`text-[9px] font-mono px-1.5 py-0.5 rounded border ${
                        !isModeSupported
                          ? 'text-amber-300 bg-amber-500/20 border-amber-500/40'
                          : isLocalDisabled
                          ? 'text-slate-400 bg-white/10 border-white/20'
                          : isDevDisabled
                          ? 'text-rose-300 bg-rose-500/20 border-rose-500/40'
                          : 'text-cyan-400 bg-cyan-500/20 border-cyan-500/40'
                      }`}
                    >
                      {!isModeSupported ? 'UNSUPPORTED' : isLocalDisabled ? 'DISABLED' : isDevDisabled ? 'CONFLICT' : 'DEFAULT'}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* 2. Fallback Chain Manager */}
        <div className="space-y-2 pt-1 border-t border-white/5">
          <div className="flex items-center justify-between">
            <label className="text-[10px] font-mono uppercase tracking-wider text-slate-400 flex items-center gap-1">
              <span>2. Fallback Chain ({currentRoute.fallbacks.length} configured)</span>
            </label>
            <span className="text-[9px] text-slate-500 font-mono">
              Attempts fallbacks in order if primary hits limits
            </span>
          </div>

          {/* List of Fallbacks */}
          <div className="space-y-1.5">
            {currentRoute.fallbacks.length === 0 ? (
              <div className="p-3 text-center rounded-xl bg-white/5 border border-dashed border-white/10 text-slate-500 text-[10px]">
                No fallback providers added. Requests will error immediately if primary is unavailable.
              </div>
            ) : (
              currentRoute.fallbacks.map((fbId, idx) => {
                const isLocal = fbId === 'localllm';
                const isLocalDisabled = isLocal && localLLMConfig?.enabled === false;
                const isFbDisabled = !isLocal && servicesManifest?.services?.[fbId]?.enabled === false;
                const isModeSupported = doesProviderSupportMode(fbId, selectedMode);
                return (
                  <div
                    key={fbId}
                    className={`flex items-center justify-between p-2 rounded-xl border transition-colors ${
                      !isModeSupported
                        ? 'bg-amber-500/[0.03] border-amber-500/20 text-slate-400'
                        : isLocalDisabled
                        ? 'opacity-60 bg-white/[0.02] border-white/5 text-slate-500'
                        : isFbDisabled
                        ? 'bg-rose-500/[0.03] border-rose-500/20 text-slate-400'
                        : 'bg-white/5 border-white/5 hover:border-white/10'
                    }`}
                    title={
                      isLocalDisabled
                        ? 'Local LLM is disabled in settings. Requests will bypass to the next fallback.'
                        : undefined
                    }
                  >
                    <div className="flex items-center gap-2">
                      <span className="w-4 text-[10px] font-mono text-slate-500 text-center font-bold">
                        #{idx + 1}
                      </span>
                      <div className="service-icon-box p-1.5 rounded-lg shrink-0">
                        {getProviderIcon(fbId)}
                      </div>
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className={`text-[11px] font-semibold ${isLocalDisabled ? 'text-slate-400' : 'text-slate-200'}`}>
                            {getProviderLabel(fbId)}
                          </span>
                          {!isModeSupported && (
                            <span className="text-[8px] font-mono text-amber-300 bg-amber-500/15 px-1 py-0.2 rounded border border-amber-500/30">
                              {isLocal ? 'Text & code only' : `No ${selectedMode} models`}
                            </span>
                          )}
                          {isLocalDisabled && isModeSupported && (
                            <span className="text-[8.5px] font-mono text-slate-400 bg-white/10 px-1 py-0.2 rounded border border-white/20">
                              [Disabled]
                            </span>
                          )}
                          {(() => {
                            const sFb = servicesManifest?.services?.[fbId];
                            const isFbRecipe = sFb?.providerType === 'webview' || fbId.startsWith('custom_') || fbId.startsWith('webview_');
                            if (isFbRecipe) {
                              return (
                                <span className="text-[7.5px] font-mono font-bold text-teal-300 bg-teal-500/20 px-1.5 py-0.2 rounded-full border border-teal-400/40">
                                  RECIPE
                                </span>
                              );
                            }
                            return null;
                          })()}
                          {isFbDisabled && (
                            <span className="text-[8.5px] font-mono text-rose-400 bg-rose-500/10 px-1 py-0.2 rounded border border-rose-500/20">
                              Disabled
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                  {/* Reorder & Remove Actions */}
                  <div className="flex items-center gap-1">
                    <button
                      disabled={idx === 0}
                      onClick={() => handleMoveFallback(idx, 'up')}
                      className="p-1 rounded text-slate-500 hover:text-slate-300 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                      title="Move Up"
                    >
                      <ChevronUp className="w-3.5 h-3.5" />
                    </button>

                    <button
                      disabled={idx === currentRoute.fallbacks.length - 1}
                      onClick={() => handleMoveFallback(idx, 'down')}
                      className="p-1 rounded text-slate-500 hover:text-slate-300 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                      title="Move Down"
                    >
                      <ChevronDown className="w-3.5 h-3.5" />
                    </button>

                    <button
                      onClick={() => handleRemoveFallback(idx)}
                      className="p-1 rounded text-slate-500 hover:text-rose-400 transition-colors ml-1"
                      title="Remove Fallback"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

          {/* Add Fallback Control */}
          {availableToAdd.length > 0 && (
            <div className="flex items-center gap-2 pt-1">
              <select
                value={fallbackToAdd}
                onChange={(e) => setFallbackToAdd(e.target.value as ProviderId)}
                className="flex-1 bg-black/50 border border-white/10 rounded-xl px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-cyan-500/50"
              >
                <option value="" disabled>
                  Select provider to add as fallback...
                </option>
                {availableToAdd.map((id) => {
                  const isSupported = doesProviderSupportMode(id, selectedMode);
                  return (
                    <option key={id} value={id} disabled={!isSupported}>
                      {getProviderLabel(id)} {!isSupported ? `(Unsupported for ${selectedMode})` : ''}
                    </option>
                  );
                })}
              </select>

              <button
                disabled={!fallbackToAdd || !doesProviderSupportMode(fallbackToAdd, selectedMode)}
                onClick={handleAddFallback}
                className={`flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                  fallbackToAdd && doesProviderSupportMode(fallbackToAdd, selectedMode)
                    ? 'bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-500/40 cursor-pointer'
                    : 'bg-white/5 text-slate-500 border border-white/5 cursor-not-allowed'
                }`}
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add</span>
              </button>
            </div>
          )}
        </div>

        {/* 3. Multi-Model Service Model Routing */}
        {(() => {
          const providersInRoute = [currentRoute.primary, ...currentRoute.fallbacks];
          const routingServices = providersInRoute.filter(
            (id) => servicesManifest?.services?.[id]?.supportsModelRouting === true
          );

          if (routingServices.length === 0) {
            const availableRoutingService = allProviders.find(
              (id) => servicesManifest?.services?.[id]?.supportsModelRouting === true
            );
            if (!availableRoutingService) return null;

            return (
              <div className="pt-2 border-t border-white/5">
                <div className="p-3 rounded-xl bg-teal-500/5 border border-teal-500/20 text-[11px] text-teal-300/80 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-3.5 h-3.5 text-teal-400 shrink-0" />
                    <span>
                      <strong>{getProviderLabel(availableRoutingService)}</strong> supports per-mode model routing. Add it to Primary or Fallbacks to configure dedicated models for {selectedMode}.
                    </span>
                  </div>
                </div>
              </div>
            );
          }

          return (
            <div className="space-y-3 pt-2 border-t border-white/5">
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-mono uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-teal-400" />
                  <span>3. Multi-Model Service Routing ({selectedMode} mode)</span>
                </label>
                <span className="text-[9px] text-teal-400/80 font-mono">
                  Per-mode model assignments & fallbacks
                </span>
              </div>

              {routingServices.map((provId) => {
                const srv = servicesManifest?.services?.[provId];
                const modeModels = getProviderModelsForMode(provId, selectedMode);
                const defaultModelId = getDefaultModelForProviderMode(provId, selectedMode);
                const fallbackModelIds = getFallbackModelsForProviderMode(provId);
                const availableModelFbs = modeModels.filter(
                  (m) => m.id !== defaultModelId && !fallbackModelIds.includes(m.id)
                );
                const selectedFallbackToAdd = modelFallbackToAdd[provId] || '';

                return (
                  <div
                    key={provId}
                    className="space-y-3 p-3.5 rounded-xl bg-teal-950/20 border border-teal-500/30"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="service-icon-box p-1.5 rounded-lg shrink-0 text-teal-400">
                          {getProviderIcon(provId)}
                        </div>
                        <div>
                          <div className="text-xs font-bold text-slate-100 flex items-center gap-1.5">
                            <span>{srv?.name || provId} Model Routing</span>
                            <span className="text-[8.5px] font-mono text-teal-300 bg-teal-500/20 px-1.5 py-0.2 rounded border border-teal-500/30 font-semibold">
                              {selectedMode.toUpperCase()}
                            </span>
                          </div>
                          <p className="text-[10px] text-slate-400">
                            Configure which model inside {srv?.name || provId} handles {selectedMode} tasks.
                          </p>
                        </div>
                      </div>
                    </div>

                    {isCliProvider(provId) && <div className="space-y-2 border-b border-white/10 pb-3">
                      {config?.cli?.services?.[provId]?.workMode === 'agentic' ? <label className="block text-xs text-slate-300">Host workspace (optional)
                        <select aria-label={`${srv?.name || provId} host workspace`} className="mt-1 w-full rounded-lg border border-white/10 bg-slate-900 px-3 py-2" value={currentRoute.cliWorkspaces?.[provId] || ''} onChange={e => onUpdateRoute(selectedMode, { cliWorkspaces: { ...currentRoute.cliWorkspaces, [provId]: e.target.value } }, activePipeline)}>
                          <option value="">No project access</option>
                          {config?.cli?.workspaces.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                          {currentRoute.cliWorkspaces?.[provId] && !config?.cli?.workspaces.some(w => w.id === currentRoute.cliWorkspaces?.[provId]) && <option value={currentRoute.cliWorkspaces[provId]}>Unavailable workspace — select another</option>}
                        </select>
                      </label> : <div className="flex items-center gap-2 rounded-lg border border-cyan-500/20 bg-cyan-500/[0.06] px-3 py-2 text-[10.5px] text-cyan-200"><ShieldCheck className="h-3.5 w-3.5" />Provider Mode · supplied context only, no host workspace</div>}
                      <p className="text-[11px] text-slate-400">{config?.cli?.services?.[provId]?.workMode === 'agentic' ? `A workspace belongs to the machine running Transgentic. Editing, command, and MCP grants still apply.${activePipeline === 'co' ? ' Co always disables editing and commands.' : ''}` : 'Switch this CLI to Agentic Mode in Provider settings before assigning a host workspace.'}</p>
                    </div>}

                    {/* Default Model Selector */}
                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <label className="text-[10px] font-mono uppercase tracking-wider text-slate-400">
                          Default Model:
                        </label>
                        <span className="text-[9.5px] text-teal-400/80 font-mono">
                          {modeModels.length} models tagged for {selectedMode}
                        </span>
                      </div>
                      <select
                        value={defaultModelId}
                        onChange={(e) => handleSetProviderModeDefaultModel(provId, e.target.value)}
                        className="w-full bg-black/50 border border-teal-500/30 rounded-xl px-3 py-1.5 text-xs text-teal-200 focus:outline-none focus:border-teal-400 font-mono cursor-pointer"
                      >
                        {modeModels.map((m) => (
                          <option key={m.id} value={m.id} className="bg-slate-900 text-slate-200">
                            {m.displayName || m.id} {m.requiresTier ? `(${m.requiresTier})` : ''}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Intra-Service Fallback Models */}
                    <div className="space-y-1.5 pt-1 border-t border-teal-500/10">
                      <div className="flex items-center justify-between">
                        <label className="text-[10px] font-mono uppercase tracking-wider text-slate-400">
                          Intra-Service Fallback Models ({fallbackModelIds.length}):
                        </label>
                        <span className="text-[9px] text-slate-500 font-mono">
                          Tried in order before next provider
                        </span>
                      </div>

                      {fallbackModelIds.length === 0 ? (
                        <div className="p-2 text-center rounded-lg bg-black/30 border border-dashed border-white/5 text-slate-500 text-[10px] font-mono">
                          No fallback models configured for {srv?.name || provId}.
                        </div>
                      ) : (
                        <div className="space-y-1">
                          {fallbackModelIds.map((mId, idx) => {
                            const mObj = modeModels.find((m) => m.id === mId) || srv?.models?.find((m) => m.id === mId);
                            return (
                              <div
                                key={mId}
                                className="flex items-center justify-between p-1.5 px-2.5 rounded-lg bg-black/40 border border-white/5 text-xs font-mono text-slate-300"
                              >
                                <div className="flex items-center gap-2">
                                  <span className="text-[9.5px] font-bold text-teal-400">#{idx + 1}</span>
                                  <span>{mObj?.displayName || mId}</span>
                                </div>
                                <div className="flex items-center gap-1">
                                  <button
                                    disabled={idx === 0}
                                    onClick={() => handleMoveProviderModeFallbackModel(provId, idx, 'up')}
                                    className={`p-1 rounded hover:bg-white/10 ${idx === 0 ? 'text-slate-600 cursor-not-allowed' : 'text-slate-300 cursor-pointer'}`}
                                    title="Move Up"
                                  >
                                    <ChevronUp className="w-3 h-3" />
                                  </button>
                                  <button
                                    disabled={idx === fallbackModelIds.length - 1}
                                    onClick={() => handleMoveProviderModeFallbackModel(provId, idx, 'down')}
                                    className={`p-1 rounded hover:bg-white/10 ${idx === fallbackModelIds.length - 1 ? 'text-slate-600 cursor-not-allowed' : 'text-slate-300 cursor-pointer'}`}
                                    title="Move Down"
                                  >
                                    <ChevronDown className="w-3 h-3" />
                                  </button>
                                  <button
                                    onClick={() => handleRemoveProviderModeFallbackModel(provId, idx)}
                                    className="p-1 rounded text-rose-400 hover:bg-rose-500/20 cursor-pointer"
                                    title="Remove Fallback Model"
                                  >
                                    <Trash2 className="w-3 h-3" />
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {/* Add Fallback Model Selector */}
                      {availableModelFbs.length > 0 && (
                        <div className="flex items-center gap-2 pt-1">
                          <select
                            value={selectedFallbackToAdd}
                            onChange={(e) =>
                              setModelFallbackToAdd((prev) => ({ ...prev, [provId]: e.target.value }))
                            }
                            className="flex-1 bg-black/50 border border-white/10 rounded-xl px-2.5 py-1 text-xs text-slate-200 focus:outline-none focus:border-teal-500/40 font-mono"
                          >
                            <option value="" disabled>
                              Add fallback model for {selectedMode}...
                            </option>
                            {availableModelFbs.map((m) => (
                              <option key={m.id} value={m.id} className="bg-slate-900 text-slate-200">
                                {m.displayName || m.id}
                              </option>
                            ))}
                          </select>
                          <button
                            disabled={!selectedFallbackToAdd}
                            onClick={() => handleAddProviderModeFallbackModel(provId, selectedFallbackToAdd)}
                            className={`flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs font-semibold font-mono transition-all ${
                              selectedFallbackToAdd
                                ? 'bg-teal-500/20 hover:bg-teal-500/30 text-teal-300 border border-teal-500/40 cursor-pointer'
                                : 'bg-white/5 text-slate-500 border border-white/5 cursor-not-allowed'
                            }`}
                          >
                            <Plus className="w-3 h-3" />
                            <span>Add</span>
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })()}
      </div>

      {/* Confirmation Modal for Resetting Routes */}
      {showResetConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="w-full max-w-sm bg-[#0f1117] border border-white/10 rounded-2xl p-5 space-y-4 shadow-2xl text-slate-200">
            <div className="flex items-center gap-2.5 text-amber-400">
              <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/30">
                <RotateCcw className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-100 font-sans">Reset Routing Defaults?</h3>
                <p className="text-[11px] text-slate-400 font-sans">Restore factory primary & fallback routes.</p>
              </div>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed font-sans bg-black/40 p-3 rounded-xl border border-white/5">
              This will restore default primary providers and candidate fallback chains for all 6 task modes (General, Coding, Writing, Image, Video, Audio).
            </p>

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                onClick={() => {
                  soundFx.playClick();
                  setShowResetConfirm(false);
                }}
                className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 border border-white/10 text-xs font-semibold transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  soundFx.playClick();
                  onResetRoutes();
                  soundFx.playTaskSuccess();
                  setShowResetConfirm(false);
                }}
                className="px-3.5 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 text-xs font-semibold transition-all shadow-[0_0_12px_rgba(245,158,11,0.2)] cursor-pointer"
              >
                Confirm Reset
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
