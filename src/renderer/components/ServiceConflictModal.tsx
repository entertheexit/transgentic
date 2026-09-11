import React from "react";
import { motion } from "framer-motion";
import { ServiceRouteConflict, TaskMode } from "../../shared/types.js";
import {
  AlertTriangle,
  ArrowRight,
  Sparkles,
  Code2,
  PenTool,
  Image as ImageIcon,
  Video,
  Volume2,
  Music,
  X,
  Layers,
} from "lucide-react";
import { soundFx } from "../audio/soundFx.js";
import {
  modalBackdropVariants,
  modalBackdropTransition,
  modalContentVariants,
  modalContentTransition,
} from "../utils/modalAnimations.js";

interface ServiceConflictModalProps {
  conflicts: ServiceRouteConflict[];
  onDismiss: () => void;
  onGoToRoutes: () => void;
}

export const ServiceConflictModal: React.FC<ServiceConflictModalProps> = ({
  conflicts,
  onDismiss,
  onGoToRoutes,
}) => {
  if (!conflicts || conflicts.length === 0) return null;

  const getModeIcon = (mode: TaskMode) => {
    switch (mode) {
      case "general":
        return <Sparkles className="w-3.5 h-3.5 text-cyan-400" />;
      case "coding":
        return <Code2 className="w-3.5 h-3.5 text-emerald-400" />;
      case "image":
        return <ImageIcon className="w-3.5 h-3.5 text-purple-400" />;
      case "video":
        return <Video className="w-3.5 h-3.5 text-rose-400" />;
      case "music":
        return <Music className="w-3.5 h-3.5 text-blue-400" />;
      case "audio":
        return <Volume2 className="w-3.5 h-3.5 text-slate-400" />;
      default:
        return <Layers className="w-3.5 h-3.5 text-slate-400" />;
    }
  };

  const handleDismiss = () => {
    soundFx.playClick();
    onDismiss();
  };

  const handleGoToRoutes = () => {
    soundFx.playClick();
    onGoToRoutes();
  };

  return (
    <motion.div
      key="service-conflict-modal-backdrop"
      variants={modalBackdropVariants}
      initial="hidden"
      animate="visible"
      exit="exit"
      transition={modalBackdropTransition}
      onClick={handleDismiss}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4"
    >
      <motion.div
        key="service-conflict-modal-content"
        variants={modalContentVariants}
        initial="hidden"
        animate="visible"
        exit="exit"
        transition={modalContentTransition}
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-lg bg-[#0c1017] border border-amber-500/40 rounded-2xl shadow-[0_20px_60px_rgba(0,0,0,0.95)] p-6 space-y-4 text-left"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 pb-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 shadow-[0_0_15px_rgba(245,158,11,0.25)]">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-sm tracking-wide font-mono text-slate-100 uppercase">
                  Service Configuration Notice
                </span>
                <span className="text-[9px] font-mono text-amber-300 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/30">
                  {conflicts.length} Route Conflict{conflicts.length > 1 ? "s" : ""}
                </span>
              </div>
              <p className="text-[10.5px] text-slate-400 font-mono">
                Active routes reference services disabled in <code className="text-amber-300">ai_services.json</code>
              </p>
            </div>
          </div>
          <button
            onClick={handleDismiss}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-white/10 transition-colors cursor-pointer"
            title="Dismiss"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Conflict Description */}
        <p className="text-xs text-slate-300 leading-relaxed font-sans">
          One or more AI services configured in your routing settings are currently disabled or unavailable at the developer manifest level. Automatic fallback chains will bypass these services, but you may want to reassign your preferred routes:
        </p>

        {/* Affected Routes List */}
        <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
          {conflicts.map((conflict, idx) => (
            <div
              key={idx}
              className="flex items-center justify-between p-2.5 rounded-xl bg-black/50 border border-white/5 text-xs font-mono"
            >
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-white/5 border border-white/10">
                  {getModeIcon(conflict.mode)}
                </div>
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold text-slate-200 uppercase tracking-wide">
                      {conflict.mode} Mode
                    </span>
                    <span
                      className={`text-[9px] uppercase px-1.5 py-0.2 rounded ${
                        conflict.role === "primary"
                          ? "bg-rose-500/20 text-rose-300 border border-rose-500/30"
                          : "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                      }`}
                    >
                      {conflict.role}
                    </span>
                  </div>
                  <span className="text-[10px] text-slate-400">
                    Configured provider: <b className="text-slate-200">{conflict.providerName}</b>
                  </span>
                </div>
              </div>

              <span className="text-[9px] font-mono text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded border border-rose-500/20 uppercase font-semibold">
                Disabled in Manifest
              </span>
            </div>
          ))}
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-end gap-3 pt-2 border-t border-white/10">
          <button
            onClick={handleDismiss}
            className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white border border-white/10 text-xs font-mono font-semibold transition-all cursor-pointer"
          >
            Dismiss
          </button>
          <button
            onClick={handleGoToRoutes}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-black text-xs font-mono font-bold shadow-[0_0_15px_rgba(245,158,11,0.3)] transition-all cursor-pointer"
          >
            <span>Change Route Settings</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
};
