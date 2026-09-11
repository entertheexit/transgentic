import React from 'react';
import { RouteMode, TaskMode } from '../../shared/types.js';
import { Sparkles, Code, Image, Video, Volume2 } from 'lucide-react';
import { soundFx } from '../audio/soundFx.js';

interface ModeSelectorProps {
  activeMode: TaskMode;
  onChange: (mode: RouteMode) => void;
}

const MODES: Array<{ id: RouteMode; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { id: 'general', label: 'General', icon: Sparkles },
  { id: 'coding', label: 'Coding', icon: Code },
  { id: 'image', label: 'Image', icon: Image },
  { id: 'video', label: 'Video', icon: Video },
  { id: 'audio', label: 'Audio', icon: Volume2 },
];

export const ModeSelector: React.FC<ModeSelectorProps> = ({ activeMode, onChange }) => {
  const handleSelect = (mode: RouteMode, idx: number) => {
    soundFx.playModeSwitch(idx);
    onChange(mode);
  };
  return (
    <div className="w-full px-4">
      <div className="bg-black/50 backdrop-blur-md p-1 rounded-2xl border border-white/10 flex items-center justify-between shadow-inner gap-0.5">
        {MODES.map(({ id, label, icon: Icon }, idx) => {
          const isActive = activeMode === id || (activeMode === 'writing' && id === 'general');
          return (
            <button
              key={id}
              onClick={() => handleSelect(id, idx)}
              className={`flex-1 py-1.5 px-1.5 rounded-xl text-xs font-semibold flex items-center justify-center gap-1 transition-all duration-200 ${
                isActive
                  ? 'bg-gradient-to-r from-cyan-500/20 to-blue-500/20 text-cyan-300 border border-cyan-500/40 shadow-[0_0_12px_rgba(0,242,254,0.25)]'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-white/5 border border-transparent'
              }`}
            >
              <Icon className={`w-3 h-3 shrink-0 ${isActive ? 'text-cyan-300' : 'text-slate-500'}`} />
              <span className="text-[9px] tracking-tight">{label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
