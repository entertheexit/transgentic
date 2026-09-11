import React, { useEffect } from 'react';
import { motion } from 'framer-motion';
import { ProviderId, ServicesManifest } from '../../shared/types.js';
import { AlertTriangle, Trash2, X, RefreshCw, Layers } from 'lucide-react';
import { soundFx } from '../audio/soundFx.js';
import { getProviderTheme } from '../utils/providerTheme.js';
import {
  modalBackdropVariants,
  modalBackdropTransition,
  modalContentVariants,
  modalContentTransition,
} from '../utils/modalAnimations.js';

export interface DeleteProviderModalProps {
  providerId: ProviderId;
  providerName?: string;
  isWebview?: boolean;
  servicesManifest?: ServicesManifest | null;
  isDeleting?: boolean;
  onConfirm: () => void | Promise<void>;
  onClose: () => void;
}

export const DeleteProviderModal: React.FC<DeleteProviderModalProps> = ({
  providerId,
  providerName,
  isWebview,
  servicesManifest,
  isDeleting = false,
  onConfirm,
  onClose,
}) => {
  const service = servicesManifest?.services?.[providerId];
  const displayName = providerName || service?.name || service?.company || providerId;
  const theme = getProviderTheme(providerId, service);
  const IconComponent = theme.icon || Layers;

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isDeleting) {
        soundFx.playClick();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, isDeleting]);

  const handleClose = () => {
    if (isDeleting) return;
    soundFx.playClick();
    onClose();
  };

  const handleConfirm = () => {
    if (isDeleting) return;
    soundFx.playClick();
    onConfirm();
  };

  return (
    <motion.div
      key="delete-provider-modal-backdrop"
      variants={modalBackdropVariants}
      initial="hidden"
      animate="visible"
      exit="exit"
      transition={modalBackdropTransition}
      onClick={handleClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4"
    >
      <motion.div
        key="delete-provider-modal-content"
        variants={modalContentVariants}
        initial="hidden"
        animate="visible"
        exit="exit"
        transition={modalContentTransition}
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-md bg-[#0c1017] border border-rose-500/30 rounded-2xl shadow-[0_20px_60px_rgba(0,0,0,0.95),0_0_30px_rgba(244,63,94,0.12)] p-6 space-y-4 text-left"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 pb-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-center text-rose-400 shadow-[0_0_15px_rgba(244,63,94,0.2)]">
              <Trash2 className="w-4.5 h-4.5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-sm tracking-wide font-mono text-slate-100 uppercase">
                  Remove Provider
                </span>
                <span className="text-[9.5px] font-mono text-rose-300 bg-rose-500/10 px-1.5 py-0.5 rounded border border-rose-500/30 uppercase">
                  Confirm
                </span>
              </div>
              <p className="text-[10.5px] text-slate-400 font-mono">
                {isWebview ? 'Webview Provider Deletion' : 'Custom Provider Deletion'}
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            disabled={isDeleting}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-white/10 transition-colors cursor-pointer disabled:opacity-40"
            title="Cancel"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Provider Profile Snippet */}
        <div className="p-3.5 rounded-xl bg-white/[0.03] border border-white/10 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className={`w-8 h-8 rounded-lg ${theme.bgClass} ${theme.borderClass} border flex items-center justify-center ${theme.textClass} shrink-0`}>
              <IconComponent className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h4 className="text-xs font-semibold text-slate-100 truncate">{displayName}</h4>
              <p className="text-[10px] font-mono text-slate-400 truncate">{providerId}</p>
            </div>
          </div>
          <span className={`text-[9.5px] font-mono px-2 py-0.5 rounded-md ${theme.badgeClass} shrink-0`}>
            {isWebview ? 'Webview Provider' : 'Custom API'}
          </span>
        </div>

        {/* Warning Body */}
        <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/25 text-rose-200/90 text-xs leading-relaxed flex items-start gap-2.5">
          <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <strong className="text-rose-300 font-semibold block">
              Permanent Deletion
            </strong>
            <p className="text-[11.5px] text-rose-200/80 leading-normal">
              Are you sure you want to remove <strong className="text-rose-100">{displayName}</strong>? This will unregister the service, wipe its cached session cookies & partition, and remove any associated model routes.
            </p>
            <p className="text-[10.5px] text-rose-300/70 font-mono">
              This action cannot be undone.
            </p>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-white/10">
          <button
            type="button"
            onClick={handleClose}
            disabled={isDeleting}
            className="px-3.5 py-2 rounded-xl text-xs font-medium text-slate-300 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 transition-colors cursor-pointer disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={isDeleting}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-white bg-rose-600 hover:bg-rose-500 border border-rose-400/30 shadow-[0_0_15px_rgba(244,63,94,0.35)] hover:shadow-[0_0_20px_rgba(244,63,94,0.5)] transition-all cursor-pointer disabled:opacity-50 flex items-center gap-2"
          >
            {isDeleting ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span>Removing...</span>
              </>
            ) : (
              <>
                <Trash2 className="w-3.5 h-3.5" />
                <span>Remove Provider</span>
              </>
            )}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
};
