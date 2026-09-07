import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  ExternalLink,
  ShieldCheck,
  CheckCircle2,
  Globe,
  FolderOpen,
  Download,
  ChevronDown,
  ChevronUp,
  ClipboardPaste,
  AlertCircle,
  Puzzle,
  Sparkles,
  Zap,
  Monitor,
  Info,
} from 'lucide-react';
import { ProviderId } from '../../shared/types.js';
import { AuthBookmarklet } from './AuthBookmarklet.js';
import { soundFx } from '../audio/soundFx.js';
import { version as appVersion } from '../../../package.json';
import { getExtensionDownloadUrl } from '../../shared/release.js';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  providerId: ProviderId;
  providerName: string;
  providerUrl: string;
  onSynced?: () => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  providerId,
  providerName,
  providerUrl,
  onSynced,
}) => {
  const [synced, setSynced] = useState(false);
  const [manualInput, setManualInput] = useState('');
  const [isSyncing, setIsSyncing] = useState(false);
  const [showAlternative, setShowAlternative] = useState(false);
  const [extFeedback, setExtFeedback] = useState<string | null>(null);
  const [syncFeedback, setSyncFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setSynced(false);
      setManualInput('');
      setIsSyncing(false);
      setShowAlternative(false);
      setExtFeedback(null);
      setSyncFeedback(null);
      return;
    }

    // Listen to live session synced IPC event
    const api = (window as any).transgenticApi;
    if (api?.onSessionSynced) {
      const unsub = api.onSessionSynced((data: any) => {
        if (data && (data.provider === providerId || !data.provider)) {
          setSynced(true);
          soundFx.playSuccess();
          if (onSynced) onSynced();
          setTimeout(() => {
            onClose();
          }, 2000);
        }
      });
      return () => unsub();
    }
  }, [isOpen, providerId, onSynced, onClose]);

  const handleOpenSystemBrowser = () => {
    soundFx.playClick();
    const api = (window as any).transgenticApi;
    if (api?.openSystemBrowser) {
      api.openSystemBrowser(providerId);
    } else {
      window.open(providerUrl, '_blank');
    }
  };

  const handleDownloadExtensionZip = async () => {
    soundFx.playClick();
    const api = (window as any).transgenticApi;
    if (api?.downloadExtensionZip) {
      const res = await api.downloadExtensionZip();
      if (res?.success) {
        setExtFeedback(res.externalDownload
          ? 'Opened the extension download in your browser.'
          : `Saved extension ZIP to: ${res.savedPath}`);
      } else if (!res?.canceled) {
        setExtFeedback(res?.error || 'Could not download ZIP archive.');
      }
    } else {
      window.open(getExtensionDownloadUrl(appVersion), '_blank', 'noopener,noreferrer');
      setExtFeedback('Opened the extension download in your browser.');
    }
  };

  const handleOpenExtensionFolder = async () => {
    soundFx.playClick();
    const api = (window as any).transgenticApi;
    if (api?.openExtensionDirectory) {
      const res = await api.openExtensionDirectory();
      if (res?.success) {
        setExtFeedback('Extension directory opened in File Manager!');
      } else {
        setExtFeedback(res?.error || 'Could not open folder automatically.');
      }
    } else {
      setExtFeedback('Folder location: extensions/transgentic-sync/');
    }
  };

  const processAndSyncPayload = async (rawInput: string) => {
    if (!rawInput.trim()) {
      setSyncFeedback({ type: 'error', message: 'No session data provided.' });
      return;
    }

    setIsSyncing(true);
    setSyncFeedback(null);
    soundFx.playClick();

    try {
      let payload: any = {
        provider: providerId,
        origin: providerUrl,
        cookies: rawInput.trim(),
      };

      let text = rawInput.trim();
      if (text.startsWith('TRANSGENTIC_AUTH:')) {
        try {
          const parsed = JSON.parse(text.slice('TRANSGENTIC_AUTH:'.length));
          payload = {
            ...payload,
            ...parsed,
            provider: providerId,
          };
        } catch {}
      } else if (text.startsWith('{') && text.endsWith('}')) {
        try {
          const parsed = JSON.parse(text);
          payload = {
            ...payload,
            ...parsed,
            provider: providerId,
          };
        } catch {}
      }

      const api = (window as any).transgenticApi;
      let res;
      if (api?.syncSession) {
        res = await api.syncSession(payload);
      } else {
        const response = await fetch('http://127.0.0.1:58420/api/auth/sync-session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        res = await response.json();
      }

      if (res && res.success) {
        setSynced(true);
        soundFx.playSuccess();
        if (onSynced) onSynced();
        setTimeout(() => {
          onClose();
        }, 1800);
      } else {
        setSyncFeedback({ type: 'error', message: res?.error || res?.message || 'Failed to sync session.' });
      }
    } catch (err: any) {
      soundFx.playWarnTone();
      setSyncFeedback({
        type: 'error',
        message: err.message || 'Error parsing session payload.',
      });
    } finally {
      setIsSyncing(false);
    }
  };

  const handlePasteFromClipboard = async () => {
    soundFx.playClick();
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setManualInput(text);
        await processAndSyncPayload(text);
      } else {
        setSyncFeedback({ type: 'error', message: 'Clipboard is empty. Copy session data in Chrome first.' });
      }
    } catch (err: any) {
      setSyncFeedback({ type: 'error', message: 'Could not read clipboard. Please paste manually into the box below.' });
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          className="relative w-full max-w-lg bg-[#0f1117] border border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]"
        >
          {/* Header */}
          <div className="px-5 py-4 border-b border-white/5 flex items-center justify-between bg-white/[0.02]">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-teal-500/10 border border-teal-500/30 text-teal-400">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                  <span>Native Chrome Authentication</span>
                  <span className="text-[10px] font-mono text-teal-400 bg-teal-500/15 px-2 py-0.5 rounded border border-teal-500/30 flex items-center gap-1">
                    <Monitor className="w-2.5 h-2.5" />
                    Chrome Bridge
                  </span>
                </h3>
                <p className="text-[11px] text-slate-400 font-sans">
                  Log in directly in your Chrome browser, then sync with 1-click.
                </p>
              </div>
            </div>

            <button
              onClick={() => {
                soundFx.playClick();
                onClose();
              }}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Body */}
          <div className="p-5 overflow-y-auto space-y-4">
            {/* Multi-browser compatibility notice */}
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-[11px] text-cyan-200/90 font-sans">
              <Info className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
              <span>Also compatible with Chromium-based browsers (Brave, Edge, Opera, Arc) and Firefox.</span>
            </div>
            {synced ? (
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="py-8 text-center space-y-3"
              >
                <div className="w-16 h-16 mx-auto rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 shadow-[0_0_25px_rgba(16,185,129,0.3)]">
                  <CheckCircle2 className="w-8 h-8" />
                </div>
                <h4 className="text-base font-bold text-emerald-300">Session Synchronized!</h4>
                <p className="text-xs text-slate-400 max-w-sm mx-auto">
                  Your authenticated session for <strong>{providerName}</strong> has been imported and applied. The provider is now connected and ready.
                </p>
              </motion.div>
            ) : (
              <>
                {/* Method 1: Chrome Extension Sync (Primary / Recommended) */}
                <div className="p-4 rounded-xl bg-gradient-to-br from-teal-500/10 via-cyan-500/5 to-transparent border border-teal-500/30 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 rounded-lg bg-teal-500/20 text-teal-300">
                        <Puzzle className="w-4 h-4" />
                      </div>
                      <span className="text-xs font-bold text-slate-100">
                        Chrome Extension Authentication
                      </span>
                    </div>
                    <span className="text-[10px] font-mono font-bold text-teal-300 bg-teal-500/20 px-2 py-0.5 rounded border border-teal-500/40">
                      Recommended
                    </span>
                  </div>

                  <p className="text-[11px] text-slate-300 font-sans leading-relaxed">
                    Install our lightweight Chrome Extension to synchronize authenticated sessions automatically without typing or manual copy-pasting:
                  </p>

                  <div className="space-y-2 text-[11px] font-sans text-slate-400 pl-1">
                    <div className="flex items-start gap-2">
                      <span className="w-4 h-4 rounded-full bg-white/10 text-slate-300 flex items-center justify-center text-[9px] font-mono font-bold shrink-0 mt-0.5">1</span>
                      <span>Download the extension package (.zip) or open the extension folder directly.</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <span className="w-4 h-4 rounded-full bg-white/10 text-slate-300 flex items-center justify-center text-[9px] font-mono font-bold shrink-0 mt-0.5">2</span>
                      <span>In Chrome, go to <code className="text-teal-300 bg-black/40 px-1 py-0.5 rounded">chrome://extensions</code> and toggle <strong>Developer mode</strong> on (top-right).</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <span className="w-4 h-4 rounded-full bg-white/10 text-slate-300 flex items-center justify-center text-[9px] font-mono font-bold shrink-0 mt-0.5">3</span>
                      <span>Click <strong>Load unpacked</strong> and select the extension folder.</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <span className="w-4 h-4 rounded-full bg-white/10 text-slate-300 flex items-center justify-center text-[9px] font-mono font-bold shrink-0 mt-0.5">4</span>
                      <span>Open <strong>{providerName}</strong> in Chrome, click the Transgentic extension icon, and click <strong>Sync</strong>.</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <button
                      onClick={handleDownloadExtensionZip}
                      className="py-2 px-3 rounded-lg bg-teal-500/20 hover:bg-teal-500/30 text-teal-200 border border-teal-500/40 text-xs font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer shadow-sm"
                    >
                      <Download className="w-3.5 h-3.5 text-teal-300" />
                      <span>Download .zip</span>
                    </button>

                    <button
                      onClick={handleOpenExtensionFolder}
                      className="py-2 px-3 rounded-lg bg-white/5 hover:bg-white/10 text-slate-200 border border-white/10 text-xs font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer shadow-sm"
                    >
                      <FolderOpen className="w-3.5 h-3.5 text-slate-300" />
                      <span>Open Folder</span>
                    </button>
                  </div>

                  <button
                    onClick={handleOpenSystemBrowser}
                    className="w-full py-2 px-3 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-200 border border-emerald-500/30 text-xs font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer"
                  >
                    <Globe className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Open {providerName} in Chrome</span>
                    <ExternalLink className="w-3 h-3 text-emerald-400 opacity-60" />
                  </button>

                  {extFeedback && (
                    <div className="text-[10.5px] font-mono text-teal-300 bg-teal-500/10 border border-teal-500/20 p-2 rounded-lg">
                      {extFeedback}
                    </div>
                  )}

                  {/* Live Ready Indicator */}
                  <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-black/40 border border-teal-500/20 text-[10.5px] font-mono">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_8px_#34d399]" />
                      <span className="text-slate-300">Listening on port 58420</span>
                    </div>
                    <span className="text-teal-400 font-semibold">Click extension icon to sync</span>
                  </div>
                </div>

                {/* Method 2 & 3 Collapsible Dropdown */}
                <div className="p-3.5 rounded-xl bg-white/[0.02] border border-white/5 space-y-3">
                  <button
                    onClick={() => {
                      soundFx.playClick();
                      setShowAlternative(!showAlternative);
                    }}
                    className="w-full flex items-center justify-between text-xs font-bold text-slate-400 hover:text-slate-200 cursor-pointer select-none"
                  >
                    <span>Alternative: Bookmarklet & Manual Paste</span>
                    {showAlternative ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </button>

                  {showAlternative && (
                    <div className="space-y-4 pt-2 border-t border-white/5">
                      {/* Bookmarklet */}
                      <AuthBookmarklet
                        providerId={providerId}
                        providerName={providerName}
                        providerUrl={providerUrl}
                      />

                      {/* Manual Paste */}
                      <div className="space-y-2 pt-2 border-t border-white/5">
                        <button
                          onClick={handlePasteFromClipboard}
                          disabled={isSyncing}
                          className="w-full py-2 px-3 rounded-lg bg-white/5 hover:bg-white/10 text-slate-200 border border-white/10 font-semibold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer"
                        >
                          <ClipboardPaste className="w-3.5 h-3.5 text-teal-400" />
                          <span>{isSyncing ? 'Importing Session...' : 'Paste & Sync Session from Clipboard'}</span>
                        </button>

                        <div className="space-y-1 pt-1">
                          <label className="text-[10px] font-mono text-slate-400 flex items-center justify-between">
                            <span>Or paste raw cURL / cookies / header:</span>
                            {manualInput && (
                              <button
                                onClick={() => setManualInput('')}
                                className="text-[9px] text-slate-500 hover:text-slate-300 underline cursor-pointer"
                              >
                                Clear
                              </button>
                            )}
                          </label>
                          <textarea
                            value={manualInput}
                            onChange={(e) => setManualInput(e.target.value)}
                            placeholder="Paste cURL request, Cookie: header, or JSON snippet..."
                            rows={2}
                            className="w-full p-2 rounded-lg bg-black/50 border border-white/10 text-slate-200 text-[10.5px] font-mono focus:border-teal-500 focus:outline-none resize-none"
                          />

                          {manualInput && (
                            <button
                              onClick={() => processAndSyncPayload(manualInput)}
                              disabled={isSyncing}
                              className="w-full py-1.5 rounded-lg bg-teal-500/20 hover:bg-teal-500/30 text-teal-300 border border-teal-500/40 text-xs font-semibold transition-all cursor-pointer"
                            >
                              {isSyncing ? 'Syncing...' : 'Sync Pasted Data'}
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {syncFeedback && (
                    <motion.div
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={`p-2.5 rounded-lg text-[11px] font-mono flex items-center gap-2 ${
                        syncFeedback.type === 'success'
                          ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-300'
                          : 'bg-rose-500/10 border border-rose-500/20 text-rose-300'
                      }`}
                    >
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                      <span>{syncFeedback.message}</span>
                    </motion.div>
                  )}
                </div>
              </>
            )}
          </div>

          {/* Footer Notice */}
          <div className="px-5 py-3 border-t border-white/5 bg-white/[0.01] flex items-center justify-between text-[10.5px] font-mono text-slate-500">
            <span>Local Receiver: http://127.0.0.1:58420</span>
            <span className="text-teal-400/80">Host-Aligned Profile Sync</span>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
