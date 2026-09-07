import React from 'react';
import { BlindedTokenMap } from '../../shared/types.js';
import { Shield, Trash2, Key, Globe, Mail, FileCode, CheckCircle } from 'lucide-react';

interface SecretVaultViewProps {
  secrets: BlindedTokenMap[];
  onClearVault: () => void;
}

export const SecretVaultView: React.FC<SecretVaultViewProps> = ({ secrets, onClearVault }) => {
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

  return (
    <div className="flex flex-col h-full p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Shield className="w-4 h-4 text-purple-400" />
          <h2 className="text-sm font-bold text-slate-100">In-Memory Secret Vault</h2>
        </div>
        {secrets.length > 0 && (
          <button
            onClick={onClearVault}
            className="flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-semibold text-rose-300 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 rounded-lg transition-colors"
          >
            <Trash2 className="w-3 h-3" />
            <span>Flush Vault</span>
          </button>
        )}
      </div>

      {/* Description Info Banner */}
      <div className="p-2.5 bg-black/40 border border-white/5 rounded-xl text-[11px] text-slate-400 leading-relaxed">
        <span className="text-purple-300 font-semibold">Data Blinding Active:</span> Sensitive tokens (API keys, IP addresses, credentials) are replaced with deterministic <code className="text-cyan-300">[[TG_SECRET_XX]]</code> tokens before reaching web sessions, and restored in-memory upon return.
      </div>

      {/* Secret Tokens List */}
      <div className="flex-1 overflow-y-auto space-y-2 pr-1">
        {secrets.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-500">
            <CheckCircle className="w-8 h-8 text-slate-600 mb-2" />
            <p className="text-xs">No active masked secrets in memory.</p>
            <p className="text-[10px] text-slate-600 mt-1">Secrets are captured and blinded automatically on incoming prompts.</p>
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

              <span className="text-[9px] font-mono text-slate-500">
                {new Date(s.detectedAt).toLocaleTimeString()}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
