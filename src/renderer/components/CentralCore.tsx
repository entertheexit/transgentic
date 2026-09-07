import React from 'react';
import { CoreStatus, ProviderId } from '../../shared/types.js';
import { Shield, Activity, Cpu, RefreshCw, Zap } from 'lucide-react';

interface CentralCoreProps {
  status: CoreStatus;
  onClick?: () => void;
}

export const CentralCore: React.FC<CentralCoreProps> = ({ status, onClick }) => {
  const getGlowStyles = () => {
    switch (status.state) {
      case 'processing':
        return 'border-emerald-500/60 shadow-[0_0_30px_rgba(16,185,129,0.5)]';
      case 'routing':
        return 'border-cyan-500/60 shadow-[0_0_30px_rgba(6,182,212,0.5)]';
      case 'fallback':
        return 'border-amber-500/60 shadow-[0_0_30px_rgba(245,158,11,0.5)]';
      case 'rate_limited':
        return 'border-rose-500/60 shadow-[0_0_30px_rgba(244,63,94,0.5)]';
      case 'idle':
      default:
        return 'border-cyan-500/30 shadow-[0_0_20px_rgba(0,242,254,0.15)]';
    }
  };

  const getStatusText = () => {
    switch (status.state) {
      case 'processing':
        return status.activeProvider ? `PROCESSING (${status.activeProvider.toUpperCase()})` : 'PROCESSING';
      case 'routing':
        return 'ROUTING...';
      case 'fallback':
        return status.activeProvider ? `FALLBACK: ${status.activeProvider.toUpperCase()}` : 'FALLBACK ACTIVE';
      case 'rate_limited':
        return 'RATE LIMITED';
      case 'idle':
      default:
        return 'TRANSGENTIC CORE';
    }
  };

  const getStatusBadgeColor = () => {
    switch (status.state) {
      case 'processing':
        return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40';
      case 'routing':
        return 'bg-cyan-500/20 text-cyan-400 border-cyan-500/40';
      case 'fallback':
        return 'bg-amber-500/20 text-amber-400 border-amber-500/40';
      case 'rate_limited':
        return 'bg-rose-500/20 text-rose-400 border-rose-500/40';
      case 'idle':
      default:
        return 'bg-slate-800/60 text-slate-400 border-slate-700/50';
    }
  };

  return (
    <div className="relative flex items-center justify-center">
      {/* Outer subtle orbital guide ring */}
      <div className="absolute w-44 h-44 rounded-full border border-white/5 pointer-events-none animate-pulse-slow" />

      {/* Main tactile central button */}
      <button
        onClick={onClick}
        className={`relative z-10 w-36 h-36 rounded-full tactile-core-btn flex flex-col items-center justify-center p-3 text-center transition-all duration-300 ${getGlowStyles()}`}
      >
        {/* Core State Icon */}
        <div className="relative mb-1">
          {status.state === 'processing' || status.state === 'routing' ? (
            <RefreshCw className="w-6 h-6 text-emerald-400 animate-spin" />
          ) : status.state === 'fallback' ? (
            <Zap className="w-6 h-6 text-amber-400 animate-bounce" />
          ) : (
            <Cpu className="w-6 h-6 text-cyan-400" />
          )}
        </div>

        {/* State Label */}
        <span className="text-[10px] font-bold tracking-wider text-slate-200 uppercase font-mono px-2 py-0.5 rounded-full border mb-1 max-w-[120px] truncate ${getStatusBadgeColor()}">
          {getStatusText()}
        </span>

        {/* Sub-metrics */}
        <div className="flex items-center gap-2 text-[9px] font-mono text-slate-400">
          <span className="flex items-center gap-0.5">
            <Activity className="w-2.5 h-2.5 text-cyan-400" />
            {status.requestCount} req
          </span>
          <span className="text-slate-600">|</span>
          <span className="flex items-center gap-0.5 text-purple-300">
            <Shield className="w-2.5 h-2.5 text-purple-400" />
            {status.activeVaultSecrets}
          </span>
        </div>

        {/* Port tag */}
        <span className="text-[8px] font-mono text-slate-500 mt-1">
          :{status.port}
        </span>
      </button>
    </div>
  );
};
