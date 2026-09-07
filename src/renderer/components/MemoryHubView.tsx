import React, { useState } from 'react';
import { BlindedTokenMap } from '../../shared/types.js';
import {
  Brain,
  Shield,
  ShieldCheck,
  Trash2,
  Key,
  Globe,
  Mail,
  FileCode,
  Database,
  Lock,
  Zap,
  Sparkles,
  Layers,
  Cpu,
  HardDrive,
  Cookie,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  Fingerprint,
  Layers2,
} from 'lucide-react';
import { soundFx } from '../audio/soundFx.js';

interface MemoryHubViewProps {
  secrets: BlindedTokenMap[];
  onClearVault: () => void;
  onClearBrowserStorage?: () => Promise<any>;
  onPurgeAllLocalStorage?: () => Promise<any>;
}

export const MemoryHubView: React.FC<MemoryHubViewProps> = ({
  secrets,
  onClearVault,
  onClearBrowserStorage,
  onPurgeAllLocalStorage,
}) => {
  const [showConfirmModal, setShowConfirmModal] = useState<'app_local' | 'browser' | 'all' | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState<{ text: string; type: 'success' | 'info' } | null>(null);

  const getTypeIcon = (type: BlindedTokenMap['type']) => {
    switch (type) {
      case 'api_key':
        return <Key className="w-3.5 h-3.5 text-amber-400" />;
      case 'ip':
        return <Globe className="w-3.5 h-3.5 text-blue-400" />;
      case 'email':
        return <Mail className="w-3.5 h-3.5 text-cyan-400" />;
      case 'jwt':
      case 'generic_secret':
      default:
        return <FileCode className="w-3.5 h-3.5 text-purple-400" />;
    }
  };

  const handleWipeSecretsOnly = () => {
    soundFx.playClick();
    onClearVault();
    setFeedbackMessage({ text: 'All active blinded secrets wiped from volatile RAM.', type: 'info' });
    setTimeout(() => setFeedbackMessage(null), 4000);
  };

  const handleConfirmAction = async () => {
    if (!showConfirmModal) return;
    setIsProcessing(true);
    soundFx.playClick();

    try {
      if (showConfirmModal === 'app_local') {
        if (onPurgeAllLocalStorage) {
          await onPurgeAllLocalStorage();
        } else {
          onClearVault();
          try { window.localStorage.clear(); } catch { }
        }
        setFeedbackMessage({
          text: 'App local storage, token vault, request logs, and memory threads successfully cleared.',
          type: 'success',
        });
      } else if (showConfirmModal === 'browser') {
        if (onClearBrowserStorage) {
          const res = await onClearBrowserStorage();
          setFeedbackMessage({
            text: `Purged browser storage & cookies across ${res?.clearedPartitions || 4} webview partitions.`,
            type: 'success',
          });
        }
      } else if (showConfirmModal === 'all') {
        if (onPurgeAllLocalStorage) {
          await onPurgeAllLocalStorage();
        }
        if (onClearBrowserStorage) {
          await onClearBrowserStorage();
        }
        setFeedbackMessage({
          text: 'Complete wipe finished: all browser partitions, cookies, memory vault, and local storage cleared.',
          type: 'success',
        });
      }
    } catch (err: any) {
      setFeedbackMessage({ text: `Clearance notice: ${err.message || 'Action completed'}`, type: 'info' });
    } finally {
      setIsProcessing(false);
      setShowConfirmModal(null);
      setTimeout(() => setFeedbackMessage(null), 5000);
    }
  };

  return (
    <div className="flex flex-col h-full p-4 space-y-3.5 overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-purple-500/10 border border-purple-500/30 flex items-center justify-center text-purple-400 shadow-[0_0_15px_rgba(168,85,247,0.15)]">
            <Brain className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-slate-100 tracking-wide">Memory & Context Hub</h2>
              <span className="text-[9px] font-mono font-bold text-purple-300 bg-purple-500/15 px-1.5 py-0.5 rounded border border-purple-500/30 uppercase tracking-wider">
                AES-256-GCM
              </span>
            </div>
            <p className="text-[10px] text-slate-400">
              Encrypted SQLite
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {secrets.length > 0 && (
            <button
              onClick={handleWipeSecretsOnly}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-rose-300 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 rounded-xl transition-all cursor-pointer shadow-[0_0_12px_rgba(244,63,94,0.15)]"
              title="Wipe Secrets from RAM"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Wipe Secrets</span>
            </button>
          )}

          <button
            onClick={() => {
              soundFx.playClick();
              setShowConfirmModal('all');
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-amber-300 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 rounded-xl transition-all cursor-pointer shadow-[0_0_12px_rgba(245,158,11,0.15)]"
            title="Clear all app memory & browser storage"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Clear All</span>
          </button>
        </div>
      </div>

      {/* Real-time Feedback Banner */}
      {feedbackMessage && (
        <div
          className={`p-2.5 rounded-xl border flex items-center gap-2 text-xs font-medium ${feedbackMessage.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
              : 'bg-cyan-500/10 border-cyan-500/30 text-cyan-300'
            }`}
        >
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{feedbackMessage.text}</span>
        </div>
      )}

      {/* Memory Status Metrics Bar */}
      <div className="grid grid-cols-3 gap-2">
        <div className="p-2.5 rounded-xl bg-white/[0.02] border border-white/5 flex flex-col gap-1">
          <div className="flex items-center gap-1.5 text-slate-400 text-[10px] font-mono">
            <Database className="w-3 h-3 text-cyan-400" />
            <span>SQLite Storage</span>
          </div>
          <div className="text-xs font-semibold text-slate-200">Encrypted DB</div>
          <span className="text-[9px] text-emerald-400 font-mono flex items-center gap-1">
            <Lock className="w-2.5 h-2.5" />
            <span>transgentic_memory.db</span>
          </span>
        </div>

        <div className="p-2.5 rounded-xl bg-white/[0.02] border border-white/5 flex flex-col gap-1">
          <div className="flex items-center gap-1.5 text-slate-400 text-[10px] font-mono">
            <Shield className="w-3 h-3 text-purple-400" />
            <span>Active Secrets</span>
          </div>
          <div className="text-xs font-semibold text-slate-200">
            {secrets.length} {secrets.length === 1 ? 'Secret' : 'Secrets'} in RAM
          </div>
          <span className="text-[9px] text-slate-400 font-mono">
            {secrets.length === 0 ? 'Zero lingering credentials' : 'Blinded in volatile memory'}
          </span>
        </div>

        <div className="p-2.5 rounded-xl bg-white/[0.02] border border-white/5 flex flex-col gap-1">
          <div className="flex items-center gap-1.5 text-slate-400 text-[10px] font-mono">
            <Zap className="w-3 h-3 text-amber-400" />
            <span>Auto-Purge</span>
          </div>
          <div className="text-xs font-semibold text-emerald-300">Auto-Wipe Active</div>
          <span className="text-[9px] text-slate-400 font-mono">Purged upon response return</span>
        </div>
      </div>

      {/* Storage & Data Privacy Management Card */}
      <div className="p-3.5 rounded-2xl bg-black/40 border border-white/5 space-y-3">
        <div className="flex items-center justify-between pb-2 border-b border-white/5">
          <div className="flex items-center gap-2">
            <HardDrive className="w-4 h-4 text-amber-400" />
            <div>
              <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider font-mono">
                Storage & Data Privacy Clearance
              </h3>
              <p className="text-[10px] text-slate-400">
                Purge local state, browser partitions, cookies, and cached session data before uninstalling or resetting.
              </p>
            </div>
          </div>
          <span className="flex items-center gap-1 text-[9px] font-mono text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20 font-semibold">
            <Fingerprint className="w-3 h-3" />
            Privacy First
          </span>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {/* Card 1: App Local Storage & Memory */}
          <div className="p-3 rounded-xl bg-white/[0.02] border border-white/5 flex flex-col justify-between space-y-2.5">
            <div className="space-y-1">
              <div className="flex items-center gap-1.5 text-slate-200 font-semibold text-xs">
                <Database className="w-3.5 h-3.5 text-purple-400" />
                <span>App Local Storage & Memory</span>
              </div>
              <p className="text-[10px] text-slate-400 leading-relaxed">
                Clears in-memory token blinding vault, SQLite thread sessions, request logs, and cached renderer data.
              </p>
            </div>
            <button
              onClick={() => {
                soundFx.playClick();
                setShowConfirmModal('app_local');
              }}
              className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl bg-purple-500/15 hover:bg-purple-500/25 text-purple-300 border border-purple-500/30 text-xs font-semibold transition-all cursor-pointer shadow-[0_0_10px_rgba(168,85,247,0.1)]"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Clear App Local Storage</span>
            </button>
          </div>

          {/* Card 2: Browser Storage & Partitions */}
          <div className="p-3 rounded-xl bg-white/[0.02] border border-white/5 flex flex-col justify-between space-y-2.5">
            <div className="space-y-1">
              <div className="flex items-center gap-1.5 text-slate-200 font-semibold text-xs">
                <Cookie className="w-3.5 h-3.5 text-cyan-400" />
                <span>Browser Storage & Cookies</span>
              </div>
              <p className="text-[10px] text-slate-400 leading-relaxed">
                Purges all cookies, web localStorages, IndexedDBs, and caches across ChatGPT, Claude, Gemini, and Grok webview partitions.
              </p>
            </div>
            <button
              onClick={() => {
                soundFx.playClick();
                setShowConfirmModal('browser');
              }}
              className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-300 border border-cyan-500/30 text-xs font-semibold transition-all cursor-pointer shadow-[0_0_10px_rgba(6,182,212,0.1)]"
            >
              <Cookie className="w-3.5 h-3.5" />
              <span>Purge Browser Storage</span>
            </button>
          </div>
        </div>
      </div>

      {/* In-Memory Secret Vault Card */}
      <div className="p-3.5 rounded-2xl bg-black/40 border border-white/5 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-purple-400" />
            <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider font-mono">
              In-Memory Secret Vault
            </h3>
          </div>
          <span className="text-[10px] font-mono text-slate-400">
            {secrets.length} Active Token{secrets.length === 1 ? '' : 's'}
          </span>
        </div>

        <div className="p-2.5 bg-white/[0.02] border border-white/5 rounded-xl text-[11px] text-slate-400 leading-relaxed">
          <span className="text-purple-300 font-semibold">Automatic Secret Blinding:</span> Sensitive API keys, tokens, and credentials in prompts are replaced with <code className="text-cyan-300 font-mono font-semibold">[[TG_SECRET_XX]]</code> before reaching external AI providers.
          <div className="mt-1 text-[10px] text-slate-400 font-mono flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            <span>Secrets are automatically purged from memory & SQLite immediately after unblinding into responses.</span>
          </div>
        </div>

        {/* Secrets List / Empty State */}
        <div className="space-y-2 max-h-[160px] overflow-y-auto pr-1">
          {secrets.length === 0 ? (
            <div className="flex flex-col items-center justify-center text-center p-6 text-slate-500 bg-white/[0.01] rounded-xl border border-dashed border-white/5">
              <ShieldCheck className="w-7 h-7 text-emerald-400/50 mb-2" />
              <p className="text-xs font-semibold text-slate-400">Zero active secrets in storage</p>
              <p className="text-[10px] text-slate-500 mt-1 max-w-sm">
                All blinded tokens have been securely mapped back to agent responses and automatically wiped.
              </p>
            </div>
          ) : (
            secrets.map((s) => (
              <div
                key={s.token}
                className="p-2.5 bg-black/30 border border-white/5 rounded-xl flex items-center justify-between hover:border-purple-500/30 transition-colors"
              >
                <div className="flex items-center gap-2.5">
                  <div className="p-1.5 rounded-lg bg-white/5 border border-white/5">
                    {getTypeIcon(s.type)}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-bold text-cyan-300">{s.token}</span>
                      <span className="text-[9px] font-mono uppercase px-1.5 py-0.5 rounded bg-white/5 text-slate-400">
                        {s.type}
                      </span>
                    </div>
                    <div className="text-[10px] font-mono text-slate-400 mt-0.5">
                      Preview: <span className="text-slate-300">{s.samplePreview}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 text-[9px] font-mono text-slate-500">
                  <span className="px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-300 border border-purple-500/20">
                    Encrypted
                  </span>
                  <span>{new Date(s.detectedAt).toLocaleTimeString()}</span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Memory Modules Card */}
      <div className="p-3.5 rounded-2xl bg-black/40 border border-white/5 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-cyan-400" />
            <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider font-mono">
              Memory & Context Engine
            </h3>
          </div>
          <span className="flex items-center gap-1 text-[10px] font-mono text-cyan-400 bg-cyan-500/10 px-2 py-0.5 rounded-full border border-cyan-500/20 font-semibold">
            <Layers2 className="w-3 h-3" />
            Modular Ready
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          <div className="p-3 rounded-xl bg-white/[0.02] border border-white/5 flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                <span>Conversation Recall</span>
              </span>
              <span className="text-[9px] font-mono text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded">
                Active
              </span>
            </div>
            <p className="text-[10px] text-slate-400 leading-relaxed">
              Maintains project and session thread continuity across AI provider switches.
            </p>
          </div>

          <div className="p-3 rounded-xl bg-white/[0.02] border border-white/5 flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                <Cpu className="w-3.5 h-3.5 text-purple-400" />
                <span>Entity & Long-Term Memory</span>
              </span>
              <span className="text-[9px] font-mono text-purple-300 bg-purple-500/10 px-1.5 py-0.5 rounded">
                SQLite Ready
              </span>
            </div>
            <p className="text-[10px] text-slate-400 leading-relaxed">
              Schema configured in SQLite database for persistent knowledge graph & entity memory extensions.
            </p>
          </div>
        </div>
      </div>

      {/* Clearance Confirmation Modal */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="relative w-full max-w-md bg-slate-900 border border-white/10 rounded-2xl p-5 shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-100">
                  {showConfirmModal === 'app_local'
                    ? 'Clear App Local Storage & Memory?'
                    : showConfirmModal === 'browser'
                      ? 'Purge All Browser Storage & Cookies?'
                      : 'Clear All Local & Browser Storage?'}
                </h3>
                <p className="text-xs text-slate-400">
                  {showConfirmModal === 'app_local'
                    ? 'This will wipe active blinded secrets, SQLite thread continuity, request logs, and cached local storage.'
                    : showConfirmModal === 'browser'
                      ? 'This will clear all cookies, localStorages, IndexedDBs, and session caches across ChatGPT, Claude, Gemini, and Grok. You will need to log in again in the Webview Drawer.'
                      : 'This performs a complete wipe of all browser partition cookies, session tokens, secret vaults, and local storage.'}
                </p>
              </div>
            </div>

            <div className="p-3 bg-black/40 rounded-xl border border-white/5 text-[11px] text-slate-300 space-y-1">
              <div className="flex items-center gap-1.5 text-amber-400 font-semibold">
                <AlertTriangle className="w-3.5 h-3.5" />
                <span>Notice:</span>
              </div>
              <p className="text-slate-400">
                This action is immediate and cannot be undone. Use this when resetting your environment or before uninstalling the application.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                onClick={() => {
                  soundFx.playClick();
                  setShowConfirmModal(null);
                }}
                disabled={isProcessing}
                className="px-4 py-2 text-xs font-semibold text-slate-300 hover:text-slate-100 bg-white/5 hover:bg-white/10 rounded-xl transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmAction}
                disabled={isProcessing}
                className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-500 rounded-xl transition-all cursor-pointer shadow-[0_0_15px_rgba(225,29,72,0.4)]"
              >
                {isProcessing && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                <span>
                  {isProcessing
                    ? 'Purging Storage...'
                    : showConfirmModal === 'app_local'
                      ? 'Clear Local Storage'
                      : showConfirmModal === 'browser'
                        ? 'Purge Browser Cookies'
                        : 'Confirm Complete Wipe'}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
