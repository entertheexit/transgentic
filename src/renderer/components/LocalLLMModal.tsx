import React, { useState, useEffect } from 'react';
import { LocalLLMConfig } from '../../shared/types.js';
import {
  Cpu,
  Server,
  RefreshCw,
  Zap,
  CheckCircle2,
  XCircle,
  X,
  Sliders,
  Sparkles,
  ExternalLink,
  Shield,
  HelpCircle,
  Lock,
  Minimize2,
} from 'lucide-react';
import { soundFx } from '../audio/soundFx.js';

interface LocalLLMModalProps {
  isOpen: boolean;
  onClose: () => void;
  config?: LocalLLMConfig;
  onUpdateConfig: (updates: Partial<LocalLLMConfig>) => Promise<any>;
  onFetchModels?: (baseUrl: string, preset: string) => Promise<string[]>;
  onTestConnection?: (config: LocalLLMConfig) => Promise<{ success: boolean; latencyMs: number; message?: string }>;
}

const PRESET_DEFAULTS: Record<'ollama' | 'lmstudio' | 'custom', { name: string; defaultUrl: string; desc: string }> = {
  ollama: {
    name: 'Ollama',
    defaultUrl: 'http://127.0.0.1:11434',
    desc: 'Local daemon running Ollama CLI models (GET /api/tags & OpenAI-compatible /v1/chat/completions)',
  },
  lmstudio: {
    name: 'LM Studio',
    defaultUrl: 'http://127.0.0.1:1234',
    desc: 'LM Studio local inference server (OpenAI-compatible GET /v1/models & /v1/chat/completions)',
  },
  custom: {
    name: 'Custom',
    defaultUrl: 'http://127.0.0.1:8000',
    desc: 'Any OpenAI-compatible local runtime supporting /v1/chat/completions',
  },
};

export const LocalLLMModal: React.FC<LocalLLMModalProps> = ({
  isOpen,
  onClose,
  config,
  onUpdateConfig,
  onFetchModels,
  onTestConnection,
}) => {
  const [enabled, setEnabled] = useState<boolean>(config?.enabled ?? false);
  const [preset, setPreset] = useState<'ollama' | 'lmstudio' | 'custom'>(config?.preset ?? 'ollama');
  const [baseUrl, setBaseUrl] = useState<string>(config?.baseUrl || PRESET_DEFAULTS.ollama.defaultUrl);
  const [selectedModel, setSelectedModel] = useState<string>(config?.selectedModel || '');
  const [temperature, setTemperature] = useState<number>(config?.temperature ?? 0.2);
  const [contextLength, setContextLength] = useState<number>(config?.contextLength ?? 8192);
  const [localMicroTask, setLocalMicroTask] = useState<boolean>(config?.localMicroTask ?? false);
  const [localZeroLeak, setLocalZeroLeak] = useState<boolean>(config?.localZeroLeak ?? false);
  const [localCompact, setLocalCompact] = useState<boolean>(config?.localCompact ?? false);
  const [completionCompact, setCompletionCompact] = useState<boolean>(config?.completionCompact ?? false);
  const [compactThresholdChars, setCompactThresholdChars] = useState<number>(config?.compactThresholdChars ?? 4000);

  // Discovery & Test State
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [isFetchingModels, setIsFetchingModels] = useState<boolean>(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const [isTesting, setIsTesting] = useState<boolean>(false);
  const [testResult, setTestResult] = useState<{ success: boolean; latencyMs: number; message?: string } | null>(null);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);

  // Sync state when modal opens
  useEffect(() => {
    if (config && isOpen) {
      setEnabled(config.enabled ?? false);
      setPreset(config.preset ?? 'ollama');
      setBaseUrl(config.baseUrl || PRESET_DEFAULTS[config.preset ?? 'ollama'].defaultUrl);
      setSelectedModel(config.selectedModel || '');
      setTemperature(config.temperature ?? 0.2);
      setContextLength(config.contextLength ?? 8192);
      setLocalMicroTask(config.localMicroTask ?? false);
      setLocalZeroLeak(config.localZeroLeak ?? false);
      setLocalCompact(config.localCompact ?? false);
      setCompletionCompact(config.completionCompact ?? false);
      setCompactThresholdChars(config.compactThresholdChars ?? 4000);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSelectPreset = async (newPreset: 'ollama' | 'lmstudio' | 'custom') => {
    soundFx.playClick();
    setPreset(newPreset);
    setTestResult(null);
    setFetchError(null);

    // If current baseUrl is empty or matches another preset's default, update to new default
    const isDefaultOfOther = Object.values(PRESET_DEFAULTS).some((p) => p.defaultUrl === baseUrl);
    let newUrl = baseUrl;
    if (!baseUrl || isDefaultOfOther) {
      newUrl = PRESET_DEFAULTS[newPreset].defaultUrl;
      setBaseUrl(newUrl);
    }

    // Auto-save immediately so switching presets persists on refresh and execution
    try {
      await onUpdateConfig({
        enabled,
        preset: newPreset,
        baseUrl: newUrl,
        selectedModel,
        temperature,
        contextLength,
        localMicroTask,
        localZeroLeak,
        localCompact,
        completionCompact,
        compactThresholdChars,
      });
      setSaveStatus('Preset switched');
      setTimeout(() => setSaveStatus(null), 2000);
    } catch {}
  };

  const handleModelChange = async (newModel: string) => {
    setSelectedModel(newModel);
    try {
      await onUpdateConfig({
        enabled,
        preset,
        baseUrl,
        selectedModel: newModel,
        temperature,
        contextLength,
        localMicroTask,
        localZeroLeak,
        localCompact,
        completionCompact,
        compactThresholdChars,
      });
      setSaveStatus('Model updated');
      setTimeout(() => setSaveStatus(null), 1500);
    } catch {}
  };

  const handleBlurSave = async () => {
    try {
      await onUpdateConfig({
        enabled,
        preset,
        baseUrl,
        selectedModel,
        temperature,
        contextLength,
        localMicroTask,
        localZeroLeak,
        localCompact,
        completionCompact,
        compactThresholdChars,
      });
    } catch {}
  };

  const handleClose = async () => {
    soundFx.playClick();
    try {
      await onUpdateConfig({
        enabled,
        preset,
        baseUrl,
        selectedModel,
        temperature,
        contextLength,
        localMicroTask,
        localZeroLeak,
        localCompact,
        completionCompact,
        compactThresholdChars,
      });
    } catch {}
    onClose();
  };

  const handleFetchModels = async () => {
    soundFx.playClick();
    if (!onFetchModels) return;

    setIsFetchingModels(true);
    setFetchError(null);
    try {
      const models = await onFetchModels(baseUrl, preset);
      setAvailableModels(models);
      if (models.length > 0) {
        soundFx.playTaskSuccess();
        const chosenModel = (!selectedModel || !models.includes(selectedModel)) ? models[0] : selectedModel;
        setSelectedModel(chosenModel);
        await onUpdateConfig({
          enabled,
          preset,
          baseUrl,
          selectedModel: chosenModel,
          temperature,
          contextLength,
          localMicroTask,
          localZeroLeak,
          localCompact,
          completionCompact,
          compactThresholdChars,
        });
      } else {
        setFetchError('No models found at this endpoint. Ensure models are downloaded/running.');
        soundFx.playWarnTone();
      }
    } catch (err: any) {
      setFetchError(err?.message || 'Failed to query models from endpoint.');
      soundFx.playWarnTone();
    } finally {
      setIsFetchingModels(false);
    }
  };

  const handleTestConnection = async () => {
    soundFx.playClick();
    if (!onTestConnection) return;

    setIsTesting(true);
    setTestResult(null);
    try {
      const currentPayload: LocalLLMConfig = {
        enabled,
        preset,
        baseUrl,
        selectedModel,
        temperature,
        contextLength,
        localMicroTask,
        localZeroLeak,
        localCompact,
        completionCompact,
        compactThresholdChars,
      };
      const res = await onTestConnection(currentPayload);
      setTestResult(res);
      if (res.success) {
        soundFx.playTaskSuccess();
      } else {
        soundFx.playWarnTone();
      }
    } catch (err: any) {
      setTestResult({
        success: false,
        latencyMs: 0,
        message: err?.message || 'Connection test failed',
      });
      soundFx.playWarnTone();
    } finally {
      setIsTesting(false);
    }
  };

  const handleSaveAndApply = async (newEnabled?: boolean) => {
    soundFx.playClick();
    const isEn = newEnabled !== undefined ? newEnabled : enabled;
    const updates: LocalLLMConfig = {
      enabled: isEn,
      preset,
      baseUrl,
      selectedModel,
      temperature,
      contextLength,
      localMicroTask,
      localZeroLeak,
      localCompact,
      completionCompact,
      compactThresholdChars,
    };
    try {
      await onUpdateConfig(updates);
      setSaveStatus('Saved');
      setTimeout(() => setSaveStatus(null), 2000);
    } catch {
      setSaveStatus('Save failed');
    }
  };

  const handleToggleEnable = async (checked: boolean) => {
    soundFx.playClick();
    setEnabled(checked);
    // Non-destructively persists existing settings immediately
    await handleSaveAndApply(checked);
  };

  const handleToggleMicroTask = async (checked: boolean) => {
    soundFx.playClick();
    setLocalMicroTask(checked);
    try {
      await onUpdateConfig({
        enabled,
        preset,
        baseUrl,
        selectedModel,
        temperature,
        contextLength,
        localMicroTask: checked,
        localZeroLeak,
        localCompact,
        completionCompact,
        compactThresholdChars,
      });
      setSaveStatus(checked ? 'Local Micro-task enabled' : 'Local Micro-task disabled');
      setTimeout(() => setSaveStatus(null), 2000);
    } catch {
      setSaveStatus('Save failed');
    }
  };

  const handleToggleZeroLeak = async (checked: boolean) => {
    soundFx.playClick();
    setLocalZeroLeak(checked);
    try {
      await onUpdateConfig({
        enabled,
        preset,
        baseUrl,
        selectedModel,
        temperature,
        contextLength,
        localMicroTask,
        localZeroLeak: checked,
        localCompact,
        completionCompact,
        compactThresholdChars,
      });
      setSaveStatus(checked ? 'Local Zero-Leak enabled' : 'Local Zero-Leak disabled');
      setTimeout(() => setSaveStatus(null), 2000);
    } catch {
      setSaveStatus('Save failed');
    }
  };

  const handleToggleCompact = async (checked: boolean) => {
    soundFx.playClick();
    setLocalCompact(checked);
    try {
      await onUpdateConfig({
        enabled,
        preset,
        baseUrl,
        selectedModel,
        temperature,
        contextLength,
        localMicroTask,
        localZeroLeak,
        localCompact: checked,
        completionCompact,
        compactThresholdChars,
      });
      setSaveStatus(checked ? 'Local Compact enabled' : 'Local Compact disabled');
      setTimeout(() => setSaveStatus(null), 2000);
    } catch {
      setSaveStatus('Save failed');
    }
  };

  const handleCompactThresholdChange = async (val: number) => {
    setCompactThresholdChars(val);
  };

  const handleToggleCompletionCompact = async (checked: boolean) => {
    soundFx.playClick();
    setCompletionCompact(checked);
    try {
      await onUpdateConfig({ completionCompact: checked });
      setSaveStatus(checked ? 'Completion compact enabled' : 'Completion compact disabled');
      setTimeout(() => setSaveStatus(null), 2000);
    } catch {
      setSaveStatus('Save failed');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in no-drag">
      <div className="relative w-full max-w-lg bg-[#0d0f14] border border-blue-500/30 rounded-2xl shadow-[0_0_40px_rgba(59,130,246,0.15)] flex flex-col overflow-hidden max-h-[90vh]">
        {/* Modal Header */}
        <div className="p-4 border-b border-white/10 flex items-center justify-between bg-gradient-to-r from-blue-950/30 via-slate-900 to-transparent">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-blue-500/15 border border-blue-500/40 text-blue-400 shadow-[0_0_12px_rgba(59,130,246,0.25)]">
              <Cpu className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-slate-100 font-mono tracking-wide uppercase">
                  Local LLM
                </h2>
                {enabled && (
                  <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                    ACTIVE
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-400">
                Configure local offline runtimes for fallback routing & coding-pipeline self-healing.
              </p>
            </div>
          </div>

          <button
            onClick={handleClose}
            className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white border border-white/10 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-4 overflow-y-auto space-y-4 flex-1">
          {/* Master Enable/Disable Toggle Card */}
          <div className="p-3 rounded-xl bg-black/40 border border-white/10 flex items-center justify-between">
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-bold text-slate-200 uppercase font-mono">
                  Enable Local LLM (Master)
                </span>
                <span className="text-[9px] px-1.5 py-0.2 rounded font-mono font-bold bg-blue-500/20 text-blue-300 border border-blue-500/30">
                  MASTER
                </span>
              </div>
              <p className="text-[10px] text-slate-400 mt-0.5">
                Master toggle for Local LLM across the entire app. Enables offline runtime, routing, fallbacks, and local coding features without wiping configuration.
              </p>
            </div>

            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={enabled}
                onChange={(e) => handleToggleEnable(e.target.checked)}
                className="sr-only peer"
              />
              <span className="relative h-5 w-9 rounded-full border border-white/10 bg-slate-700/80 shadow-inner transition-colors peer-checked:border-blue-400/40 peer-checked:bg-blue-500 after:absolute after:left-[2px] after:top-[2px] after:h-3.5 after:w-3.5 after:rounded-full after:bg-slate-300 after:shadow after:transition-transform peer-checked:after:translate-x-4 peer-checked:after:bg-white" />
              <span className={`text-[10px] font-mono font-bold tracking-tight ${
                enabled ? 'text-blue-300' : 'text-slate-500'
              }`}>
                {enabled ? 'ENABLED' : 'DISABLED'}
              </span>
            </label>
          </div>

          {/* Local Micro-task Toggle Card */}
          <div className="p-3 rounded-xl bg-black/40 border border-white/10 flex items-center justify-between">
            <div className="pr-3">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-bold text-slate-200 uppercase font-mono">
                  Local Micro-task
                </span>
                <span className="text-[9px] px-1.5 py-0.2 rounded font-mono font-bold bg-teal-500/20 text-teal-300 border border-teal-500/30">
                  CODING ONLY
                </span>
              </div>
              <p className="text-[10px] text-slate-400 mt-0.5">
                Available in Coding Mode only. When enabled, automatically offloads micro-tasks (regex, TS types, docstrings, test stubs) to Local LLM after Turn 1 if Local LLM is in the fallback chain, or when requested by agentic clients (Codex). Dedicates Local LLM strictly to micro-tasks.
              </p>
            </div>

            <label className="flex items-center gap-2 cursor-pointer select-none shrink-0">
              <input
                type="checkbox"
                checked={localMicroTask}
                onChange={(e) => handleToggleMicroTask(e.target.checked)}
                className="sr-only peer"
              />
              <span className="relative h-5 w-9 rounded-full border border-white/10 bg-slate-700/80 shadow-inner transition-colors peer-checked:border-teal-400/40 peer-checked:bg-teal-500 after:absolute after:left-[2px] after:top-[2px] after:h-3.5 after:w-3.5 after:rounded-full after:bg-slate-300 after:shadow after:transition-transform peer-checked:after:translate-x-4 peer-checked:after:bg-white" />
              <span className={`text-[10px] font-mono font-bold tracking-tight ${
                localMicroTask ? 'text-teal-300' : 'text-slate-500'
              }`}>
                {localMicroTask ? 'ENABLED' : 'DISABLED'}
              </span>
            </label>
          </div>

          {/* Local Zero-Leak Toggle Card */}
          <div className="p-3 rounded-xl bg-black/40 border border-white/10 flex items-center justify-between">
            <div className="pr-3">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-bold text-slate-200 uppercase font-mono">
                  Local Zero-Leak
                </span>
                <span className="text-[9px] px-1.5 py-0.2 rounded font-mono font-bold bg-purple-500/20 text-purple-300 border border-purple-500/30">
                  CODING ONLY
                </span>
              </div>
              <p className="text-[10px] text-slate-400 mt-0.5">
                Available in Coding Mode only. When active AI service is Cloud AI Webview (not Local LLM), automatically masks sensitive credentials (API tokens, database connection URIs, environment variables, private IPs/domains) with indexed placeholders and restores them on response.
              </p>
            </div>

            <label className="flex items-center gap-2 cursor-pointer select-none shrink-0">
              <input
                type="checkbox"
                checked={localZeroLeak}
                onChange={(e) => handleToggleZeroLeak(e.target.checked)}
                className="sr-only peer"
              />
              <span className="relative h-5 w-9 rounded-full border border-white/10 bg-slate-700/80 shadow-inner transition-colors peer-checked:border-purple-400/40 peer-checked:bg-purple-500 after:absolute after:left-[2px] after:top-[2px] after:h-3.5 after:w-3.5 after:rounded-full after:bg-slate-300 after:shadow after:transition-transform peer-checked:after:translate-x-4 peer-checked:after:bg-white" />
              <span className={`text-[10px] font-mono font-bold tracking-tight ${
                localZeroLeak ? 'text-purple-300' : 'text-slate-500'
              }`}>
                {localZeroLeak ? 'ENABLED' : 'DISABLED'}
              </span>
            </label>
          </div>

          {/* Local Compact Toggle Card */}
          <div className="p-3 rounded-xl bg-black/40 border border-white/10 space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="pr-3">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-bold text-slate-200 uppercase font-mono">
                    Local Compact
                  </span>
                  <span className="text-[9px] px-1.5 py-0.2 rounded font-mono font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                    CODING ONLY
                  </span>
                </div>
                <p className="text-[10px] text-slate-400 mt-0.5">
                  Available in Coding Mode only. When active AI service is Cloud AI Webview (not Local LLM), automatically distills bloated code blocks and multi-file diffs using Local LLM before webview dispatch to conserve token limits and accelerate response times.
                </p>
              </div>

              <label className="flex items-center gap-2 cursor-pointer select-none shrink-0">
                <input
                  type="checkbox"
                  checked={localCompact}
                  onChange={(e) => handleToggleCompact(e.target.checked)}
                  className="sr-only peer"
                />
                <span className="relative h-5 w-9 rounded-full border border-white/10 bg-slate-700/80 shadow-inner transition-colors peer-checked:border-indigo-400/40 peer-checked:bg-indigo-500 after:absolute after:left-[2px] after:top-[2px] after:h-3.5 after:w-3.5 after:rounded-full after:bg-slate-300 after:shadow after:transition-transform peer-checked:after:translate-x-4 peer-checked:after:bg-white" />
                <span className={`text-[10px] font-mono font-bold tracking-tight ${
                  localCompact ? 'text-indigo-300' : 'text-slate-500'
                }`}>
                  {localCompact ? 'ENABLED' : 'DISABLED'}
                </span>
              </label>
            </div>

            {localCompact && (
              <div className="flex items-center justify-between pt-1 border-t border-white/5">
                <div>
                  <span className="text-[10px] font-mono text-slate-300">
                    Trigger Threshold (Characters):
                  </span>
                  <p className="text-[9px] text-slate-500 font-mono">
                    Prompts exceeding this size will trigger Local LLM code distillation (default: 4,000)
                  </p>
                </div>
                <input
                  type="number"
                  min={1000}
                  max={50000}
                  step={500}
                  value={compactThresholdChars}
                  onChange={(e) => handleCompactThresholdChange(parseInt(e.target.value, 10) || 4000)}
                  onBlur={handleBlurSave}
                  className="w-24 bg-black/60 border border-white/10 rounded-lg px-2.5 py-1 text-xs text-indigo-300 font-mono text-right focus:outline-none focus:border-indigo-500/50"
                />
              </div>
            )}

            <div className={`flex items-center justify-between border-t border-white/5 pt-2.5 ${enabled ? '' : 'opacity-60'}`}>
              <div className="min-w-0 pr-3">
                <div className="flex items-center gap-2">
                  <Minimize2 className={`h-3.5 w-3.5 shrink-0 ${completionCompact ? 'text-indigo-300' : 'text-slate-500'}`} />
                  <span className="text-[10.5px] font-semibold text-slate-200">Completion gateway compact</span>
                  <span className="rounded border border-indigo-500/20 bg-indigo-500/10 px-1.5 py-0.5 font-mono text-[8px] text-indigo-300">TEXT ONLY</span>
                </div>
                <p className="mt-1 text-[9px] text-slate-500">Distill long `/v1` text history before generation. Tool requests always stay direct.</p>
              </div>
              <label className={`flex shrink-0 items-center gap-2 ${enabled ? 'cursor-pointer' : 'cursor-not-allowed'}`}>
                <input type="checkbox" checked={completionCompact} disabled={!enabled} onChange={event => void handleToggleCompletionCompact(event.target.checked)} className="peer sr-only" />
                <span className="relative h-5 w-9 rounded-full border border-white/10 bg-slate-700/80 shadow-inner transition-colors peer-disabled:opacity-50 peer-checked:border-indigo-400/40 peer-checked:bg-indigo-500 after:absolute after:left-[2px] after:top-[2px] after:h-3.5 after:w-3.5 after:rounded-full after:bg-slate-300 after:shadow after:transition-transform peer-checked:after:translate-x-4 peer-checked:after:bg-white" />
              </label>
            </div>
          </div>

          {/* Runtimes & Presets */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-mono uppercase tracking-wider text-slate-400 flex items-center justify-between">
              <span>Runtime Preset:</span>
              <span className="text-[9px] text-blue-400 font-semibold">{PRESET_DEFAULTS[preset].name}</span>
            </label>
            <div className="grid grid-cols-3 gap-1.5 bg-black/50 p-1 rounded-xl border border-white/5">
              {(['ollama', 'lmstudio', 'custom'] as const).map((key) => (
                <button
                  key={key}
                  onClick={() => handleSelectPreset(key)}
                  className={`py-1.5 px-2 rounded-lg text-[10.5px] font-mono font-semibold transition-all cursor-pointer flex flex-col items-center gap-0.5 ${
                    preset === key
                      ? 'bg-blue-500/20 text-blue-300 border border-blue-500/50 shadow-[0_0_10px_rgba(59,130,246,0.2)]'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
                  }`}
                >
                  <span>{PRESET_DEFAULTS[key].name}</span>
                </button>
              ))}
            </div>
            <p className="text-[9.5px] text-slate-500 px-1 font-mono">
              {PRESET_DEFAULTS[preset].desc}
            </p>
          </div>

          {/* Base Endpoint URL */}
          <div className="space-y-1">
            <label className="text-[10px] font-mono uppercase tracking-wider text-slate-400 flex items-center justify-between">
              <span>Endpoint Base URL:</span>
              <span className="text-[9px] text-slate-500">Default: {PRESET_DEFAULTS[preset].defaultUrl}</span>
            </label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={baseUrl}
                onChange={(e) => {
                  setBaseUrl(e.target.value);
                  setTestResult(null);
                }}
                onBlur={handleBlurSave}
                placeholder="e.g. http://127.0.0.1:11434"
                className="flex-1 bg-black/60 border border-white/10 rounded-xl px-3 py-1.5 text-xs text-slate-200 font-mono focus:outline-none focus:border-blue-500/50"
              />
              <button
                onClick={async () => {
                  soundFx.playClick();
                  const defUrl = PRESET_DEFAULTS[preset].defaultUrl;
                  setBaseUrl(defUrl);
                  try {
                    await onUpdateConfig({
                      enabled,
                      preset,
                      baseUrl: defUrl,
                      selectedModel,
                      temperature,
                      contextLength,
                      localMicroTask,
                      localZeroLeak,
                      localCompact,
                      completionCompact,
                      compactThresholdChars,
                    });
                  } catch {}
                }}
                className="px-2 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-slate-400 text-[10px] font-mono transition-colors"
                title="Reset to default URL for this preset"
              >
                Reset
              </button>
            </div>
          </div>

          {/* Model Discovery & Model Selector Dropdown */}
          <div className="space-y-1.5 bg-black/40 p-3 rounded-xl border border-white/5">
            <div className="flex items-center justify-between">
              <label className="text-[10px] font-mono uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                <Sparkles className="w-3 h-3 text-blue-400" />
                <span>Installed Model Weights</span>
              </label>

              <button
                onClick={handleFetchModels}
                disabled={isFetchingModels}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-mono font-semibold transition-all ${
                  isFetchingModels
                    ? 'bg-blue-500/10 text-blue-400 cursor-wait'
                    : 'bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 border border-blue-500/40 cursor-pointer'
                }`}
              >
                <RefreshCw className={`w-3 h-3 ${isFetchingModels ? 'animate-spin' : ''}`} />
                <span>{isFetchingModels ? 'Scanning...' : 'Fetch / Refresh Models'}</span>
              </button>
            </div>

            {availableModels.length > 0 ? (
              <div className="space-y-1">
                <select
                  value={selectedModel}
                  onChange={(e) => handleModelChange(e.target.value)}
                  className="w-full bg-black/60 border border-blue-500/30 rounded-xl px-3 py-2 text-xs text-blue-300 font-mono focus:outline-none focus:border-blue-500"
                >
                  {availableModels.map((m) => (
                    <option key={m} value={m} className="bg-[#111318] text-slate-200">
                      {m}
                    </option>
                  ))}
                </select>
                <span className="text-[9px] font-mono text-emerald-400 block px-1">
                  ✓ Found {availableModels.length} models from local runtime
                </span>
              </div>
            ) : (
              <div className="space-y-1">
                <input
                  type="text"
                  value={selectedModel}
                  onChange={(e) => setSelectedModel(e.target.value)}
                  onBlur={handleBlurSave}
                  placeholder="e.g. qwen2.5-coder:7b or deepseek-coder:6.7b"
                  className="w-full bg-black/60 border border-white/10 rounded-xl px-3 py-2 text-xs text-slate-200 font-mono focus:outline-none focus:border-blue-500/50"
                />
                <span className="text-[9px] font-mono text-slate-500 block px-1">
                  Click 'Fetch / Refresh Models' or enter a model identifier manually.
                </span>
              </div>
            )}

            {fetchError && (
              <div className="p-2 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-300 text-[10px] font-mono">
                {fetchError}
              </div>
            )}
          </div>

          {/* Connection Test & Latency Badge */}
          <div className="p-3 rounded-xl bg-black/40 border border-white/5 space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs font-bold text-slate-200 uppercase font-mono flex items-center gap-1.5">
                  <Zap className="w-3.5 h-3.5 text-amber-400" />
                  <span>Connection Test</span>
                </span>
                <p className="text-[10px] text-slate-400">
                  Sends a lightweight 1-token generation test to verify endpoint responsiveness.
                </p>
              </div>

              <button
                onClick={handleTestConnection}
                disabled={isTesting}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10.5px] font-mono font-semibold transition-all ${
                  isTesting
                    ? 'bg-amber-500/10 text-amber-400 cursor-wait'
                    : 'bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 cursor-pointer shadow-[0_0_10px_rgba(245,158,11,0.15)]'
                }`}
              >
                <Zap className={`w-3.5 h-3.5 ${isTesting ? 'animate-bounce' : ''}`} />
                <span>{isTesting ? 'Testing...' : 'Test'}</span>
              </button>
            </div>

            {testResult && (
              <div
                className={`flex items-center justify-between p-2 rounded-lg border text-[11px] font-mono ${
                  testResult.success
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                    : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                }`}
              >
                <div className="flex items-center gap-1.5">
                  {testResult.success ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  ) : (
                    <XCircle className="w-4 h-4 text-rose-400 shrink-0" />
                  )}
                  <span className="truncate max-w-[320px]">{testResult.message || (testResult.success ? 'Success' : 'Failed')}</span>
                </div>

                {testResult.success && testResult.latencyMs > 0 && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-200 font-bold shrink-0">
                    {testResult.latencyMs} ms
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Advanced Model Parameters */}
          <div className="grid grid-cols-2 gap-3 pt-1">
            {/* Temperature */}
            <div className="space-y-1 bg-black/40 p-2.5 rounded-xl border border-white/5">
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-mono uppercase tracking-wider text-slate-300">
                  Temperature:
                </label>
                <span className="text-[10px] font-mono font-bold text-blue-400">{temperature.toFixed(2)}</span>
              </div>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={temperature}
                onChange={(e) => setTemperature(parseFloat(e.target.value))}
                onMouseUp={handleBlurSave}
                onTouchEnd={handleBlurSave}
                className="w-full accent-blue-400 cursor-pointer"
              />
              <span className="text-[8.5px] font-mono text-slate-500 block">
                0.2 recommended for deterministic code & repairs
              </span>
            </div>

            {/* Context Length */}
            <div className="space-y-1 bg-black/40 p-2.5 rounded-xl border border-white/5">
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-mono uppercase tracking-wider text-slate-300">
                  Context Length:
                </label>
                <span className="text-[10px] font-mono font-bold text-purple-400">{contextLength}</span>
              </div>
              <input
                type="number"
                min={2048}
                max={131072}
                step={1024}
                value={contextLength}
                onChange={(e) => setContextLength(parseInt(e.target.value, 10) || 8192)}
                onBlur={handleBlurSave}
                className="w-full bg-black/60 border border-white/10 rounded-lg px-2 py-1 text-xs text-slate-200 font-mono focus:outline-none focus:border-blue-500/50"
              />
              <span className="text-[8.5px] font-mono text-slate-500 block">
                Tokens allocated in GPU/CPU VRAM (default: 8192)
              </span>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-3.5 border-t border-white/10 bg-black/60 flex items-center justify-between">
          <div className="flex items-center gap-2">
            {saveStatus && (
              <span className="text-[10px] font-mono text-emerald-400 flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" />
                <span>{saveStatus}</span>
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleClose}
              className="px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 text-xs font-mono transition-colors cursor-pointer"
            >
              Close
            </button>

            <button
              onClick={() => handleSaveAndApply()}
              className="px-4 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-mono font-bold transition-all shadow-[0_0_15px_rgba(59,130,246,0.4)] cursor-pointer"
            >
              Save Configuration
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
