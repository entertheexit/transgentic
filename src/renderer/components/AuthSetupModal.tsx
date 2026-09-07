import React, { useState, useEffect } from 'react';
import { ShieldCheck, Key, Copy, Check, RefreshCw, ArrowRight, Lock, Terminal } from 'lucide-react';
import { soundFx } from '../audio/soundFx.js';

interface AuthSetupModalProps {
  isOpen: boolean;
  onClose: () => void;
  isFirstLaunch?: boolean;
}

export const AuthSetupModal: React.FC<AuthSetupModalProps> = ({
  isOpen,
  onClose,
  isFirstLaunch = false,
}) => {
  const [token, setToken] = useState<string>('');
  const [copied, setCopied] = useState<boolean>(false);
  const [isRegenerating, setIsRegenerating] = useState<boolean>(false);

  useEffect(() => {
    if (isOpen) {
      fetchToken();
    }
  }, [isOpen]);

  const fetchToken = async () => {
    if ((window as any).transgenticApi?.getMasterToken) {
      try {
        const masterToken = await (window as any).transgenticApi.getMasterToken();
        setToken(masterToken);
      } catch (e) {
        console.error('Failed to get master token:', e);
      }
    }
  };

  const handleCopy = () => {
    soundFx.playClick();
    if (token) {
      navigator.clipboard.writeText(token);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  const handleRegenerate = async () => {
    soundFx.playClick();
    if ((window as any).transgenticApi?.regenerateMasterToken) {
      setIsRegenerating(true);
      try {
        const newToken = await (window as any).transgenticApi.regenerateMasterToken();
        setToken(newToken);
        soundFx.playTaskSuccess();
      } catch (e) {
        soundFx.playWarnTone();
      } finally {
        setIsRegenerating(false);
      }
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="w-full max-w-md bg-[#0c1017]/95 border border-cyan-500/30 rounded-2xl shadow-[0_0_50px_rgba(6,182,212,0.15)] flex flex-col overflow-hidden text-slate-200 no-drag">
        {/* Header */}
        <div className="p-5 pb-3 flex items-start justify-between border-b border-white/5">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 shadow-[0_0_15px_rgba(6,182,212,0.2)]">
              <Key className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-100 flex items-center gap-1.5 font-mono uppercase tracking-wide">
                <span>{isFirstLaunch ? 'MCP Client Credential Setup' : 'MCP Client Access Token'}</span>
              </h2>
              <p className="text-[11px] text-slate-400">
                Authenticate local IDE clients (Codex, Cursor, Claude) to Transgentic.
              </p>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4 text-xs">
          <div className="bg-black/40 border border-white/5 rounded-xl p-3 space-y-2 text-[11px] text-slate-300 leading-relaxed font-sans">
            <div className="flex items-center gap-1 text-cyan-300 font-semibold font-mono">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Loopback Client Authentication</span>
            </div>
            <p className="text-slate-400 text-[10.5px]">
              Transgentic requires an authentication token for all incoming MCP connections on port 58420. Unauthenticated or foreign requests are denied.
            </p>
          </div>

          {/* Token Display Field */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-mono uppercase tracking-wider text-slate-400 flex items-center justify-between">
              <span>Master Client Access Token:</span>
              <span className="text-cyan-400 text-[9px] font-mono">Bearer Token</span>
            </label>

            <div className="relative flex items-center">
              <input
                type="text"
                readOnly
                value={token || 'Generating token...'}
                className="w-full bg-black/60 border border-white/10 rounded-xl px-3 py-2 pr-20 text-[11px] font-mono text-cyan-300 focus:outline-none select-all"
              />

              <div className="absolute right-1.5 flex items-center gap-1">
                <button
                  onClick={handleCopy}
                  className="px-2.5 py-1 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-500/40 text-[10px] font-semibold flex items-center gap-1 transition-colors cursor-pointer"
                  title="Copy Master Token"
                >
                  {copied ? (
                    <>
                      <Check className="w-3 h-3 text-emerald-400" />
                      <span className="text-emerald-400">Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3 h-3" />
                      <span>Copy</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* Quick Example Snippet */}
          <div className="bg-black/50 border border-white/5 rounded-xl p-2.5 space-y-1 text-[10px] font-mono">
            <span className="text-slate-400 flex items-center gap-1">
              <Terminal className="w-3 h-3 text-cyan-400" />
              <span>Example Header / Query Connection:</span>
            </span>
            <div className="text-slate-300 text-[9.5px] truncate select-all bg-black/40 p-1.5 rounded border border-white/5">
              http://127.0.0.1:58420/sse?token={token || 'YOUR_TOKEN'}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 bg-black/40 border-t border-white/5 flex items-center justify-between">
          <button
            onClick={handleRegenerate}
            disabled={isRegenerating}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 border border-white/10 text-xs font-semibold transition-colors cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRegenerating ? 'animate-spin' : ''}`} />
            <span>Regenerate</span>
          </button>

          <button
            onClick={() => {
              soundFx.playClick();
              onClose();
            }}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-500/40 text-xs font-semibold transition-all shadow-[0_0_15px_rgba(6,182,212,0.2)] cursor-pointer"
          >
            <span>{isFirstLaunch ? 'Proceed to Hub' : 'Close'}</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};
