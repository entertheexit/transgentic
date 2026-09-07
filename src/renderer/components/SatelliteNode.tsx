import React from 'react';
import { ProviderId, ProviderStatus } from '../../shared/types.js';
import { Bot, Sparkles, Brain, Cpu } from 'lucide-react';
import { soundFx } from '../audio/soundFx.js';
import { getProviderTheme } from '../utils/providerTheme.js';

interface SatelliteNodeProps {
  provider: ProviderStatus;
  position: 'top' | 'top-right' | 'bottom-right' | 'bottom-left';
  onClick: (id: ProviderId) => void;
}

export const SatelliteNode: React.FC<SatelliteNodeProps> = ({ provider, position, onClick }) => {
  // Coordinate calculations relative to center of a 400x400 container
  const getPositionClasses = () => {
    switch (position) {
      case 'top':
        return 'top-4 left-1/2 -translate-x-1/2'; // 12 o'clock
      case 'top-right':
        return 'top-14 right-10'; // 2 o'clock
      case 'bottom-right':
        return 'bottom-16 right-10'; // 4 o'clock
      case 'bottom-left':
        return 'bottom-16 left-10'; // 8 o'clock
    }
  };

  const getStatusRing = () => {
    switch (provider.state) {
      case 'ready':
        return 'border-emerald-500/80 shadow-[0_0_12px_rgba(16,185,129,0.6)]';
      case 'rate_limited':
        return 'border-amber-500/80 shadow-[0_0_12px_rgba(245,158,11,0.6)] animate-pulse';
      case 'busy':
        return 'border-cyan-400 shadow-[0_0_15px_rgba(0,242,254,0.8)] animate-spin-slow';
      case 'disconnected':
      default:
        return 'border-rose-500/50 shadow-[0_0_8px_rgba(244,63,94,0.3)]';
    }
  };

  const getStatusBadge = () => {
    switch (provider.state) {
      case 'ready':
        return <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 shadow-[0_0_6px_#10b981]" />;
      case 'rate_limited':
        return <span className="w-2.5 h-2.5 rounded-full bg-amber-400 shadow-[0_0_6px_#f59e0b] animate-ping" />;
      case 'busy':
        return <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 shadow-[0_0_6px_#00f2fe]" />;
      case 'disconnected':
      default:
        return <span className="w-2.5 h-2.5 rounded-full bg-rose-500" />;
    }
  };

  const getProviderIcon = () => {
    const theme = getProviderTheme(provider.id);
    const Icon = theme.icon;
    return <Icon className={`w-5 h-5 ${theme.textClass}`} />;
  };

  return (
    <div className={`absolute ${getPositionClasses()} z-20 flex flex-col items-center group`}>
      {/* Node Button */}
      <button
        onClick={() => {
          soundFx.playClick();
          onClick(provider.id);
        }}
        className={`relative w-14 h-14 rounded-full satellite-node flex items-center justify-center border-2 ${getStatusRing()}`}
        title={`${provider.name} (${provider.state}) - Click to inspect/login`}
      >
        {getProviderIcon()}

        {/* Small floating status dot on the node */}
        <div className="absolute -top-1 -right-1">
          {getStatusBadge()}
        </div>
      </button>

      {/* Label and State Pill */}
      <div className="mt-1.5 flex flex-col items-center pointer-events-none">
        <span className="text-[11px] font-semibold text-slate-200 tracking-wide drop-shadow-md">
          {provider.name}
        </span>
        <span className="text-[8px] uppercase tracking-wider font-mono px-1.5 py-0.2 rounded bg-black/40 text-slate-400 border border-white/5">
          {provider.state}
        </span>
      </div>
    </div>
  );
};
