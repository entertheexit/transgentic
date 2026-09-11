import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Image as ImageIcon,
  Film,
  Music,
  ExternalLink,
  FolderOpen,
  Copy,
  Check,
  Maximize2,
  X,
  AlertCircle,
} from 'lucide-react';
import { soundFx } from '../audio/soundFx.js';
import {
  modalBackdropVariants,
  modalBackdropTransition,
  modalContentVariants,
  modalContentTransition,
} from '../utils/modalAnimations.js';

export type MediaType = 'image' | 'video' | 'audio' | 'other';

export interface MediaPreviewProps {
  path: string;
  modeHint?: string;
  compact?: boolean;
  className?: string;
}

export function extractMediaPath(mediaPath?: string, text?: string): string | undefined {
  const sanitize = (raw: string) => {
    let p = raw.trim().replace(/^['"]|['"]$/g, '');
    if (p.startsWith('file://')) {
      p = p.replace(/^file:\/\//i, '');
      if (/^\/[a-zA-Z]:/.test(p)) {
        p = p.slice(1);
      }
    }
    return p;
  };

  if (mediaPath && typeof mediaPath === 'string' && mediaPath.trim()) {
    return sanitize(mediaPath);
  }
  if (!text || typeof text !== 'string') return undefined;
  const match = text.match(/Local media asset saved to:\s*([^\r\n]+)/i) ||
                text.match(/Generated (?:media|image|video|audio|music) asset saved to:\s*([^\r\n]+)/i);
  if (match && match[1]) {
    return sanitize(match[1]);
  }
  return undefined;
}

export function getMediaTypeFromPath(filePath: string, modeHint?: string): MediaType {
  if (!filePath) return 'other';
  const ext = filePath.split('.').pop()?.toLowerCase();
  if (['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg', 'bmp'].includes(ext || '')) {
    return 'image';
  }
  if (['mp4', 'webm', 'mov', 'mkv'].includes(ext || '')) {
    return 'video';
  }
  if (['mp3', 'wav', 'ogg', 'm4a', 'aac', 'flac'].includes(ext || '')) {
    return 'audio';
  }
  if (modeHint === 'image') return 'image';
  if (modeHint === 'video') return 'video';
  if (modeHint === 'audio' || modeHint === 'music') return 'audio';
  return 'other';
}

export const MediaPreview: React.FC<MediaPreviewProps> = ({
  path: filePath,
  modeHint,
  compact = false,
  className = '',
}) => {
  const cleanFilePath = React.useMemo(() => {
    if (!filePath || typeof filePath !== 'string') return '';
    let p = filePath.trim().replace(/^['"]|['"]$/g, '');
    if (p.startsWith('file://')) {
      p = p.replace(/^file:\/\//i, '');
      if (/^\/[a-zA-Z]:/.test(p)) {
        p = p.slice(1);
      }
    }
    return p;
  }, [filePath]);

  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [hasError, setHasError] = useState(false);
  const [protocolFailed, setProtocolFailed] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isLightBoxOpen, setIsLightBoxOpen] = useState(false);

  const mediaType = getMediaTypeFromPath(cleanFilePath, modeHint);
  const fileName = cleanFilePath ? cleanFilePath.split('/').pop() || cleanFilePath : '';

  // Get protocol URL
  const api = typeof window !== 'undefined' ? (window as any).transgenticApi : null;
  const protocolUrl = React.useMemo(() => {
    if (!cleanFilePath) return '';
    return api?.getMediaUrl ? api.getMediaUrl(cleanFilePath) : cleanFilePath;
  }, [cleanFilePath, api]);

  useEffect(() => {
    let isMounted = true;
    setHasError(false);
    setProtocolFailed(false);
    setDataUrl(null);

    if (cleanFilePath && api?.getMediaData) {
      api.getMediaData(cleanFilePath)
        .then((res: any) => {
          if (!isMounted) return;
          if (res && !res.exists) {
            setHasError(true);
          } else if (res?.exists && res?.dataUrl) {
            setDataUrl(res.dataUrl);
            setHasError(false);
          }
        })
        .catch(() => {
          // If IPC call errors, keep relying on protocolUrl
        });
    }
    return () => {
      isMounted = false;
    };
  }, [cleanFilePath]);

  const activeSrc = (!protocolFailed && protocolUrl) ? protocolUrl : (dataUrl || protocolUrl);

  const handleMediaError = () => {
    if (!protocolFailed && !dataUrl && api?.getMediaData && cleanFilePath) {
      setProtocolFailed(true);
      api.getMediaData(cleanFilePath)
        .then((res: any) => {
          if (res?.exists && res?.dataUrl) {
            setDataUrl(res.dataUrl);
            setHasError(false);
          } else {
            setHasError(true);
          }
        })
        .catch(() => {
          setHasError(true);
        });
    } else {
      setHasError(true);
    }
  };

  const handleCopyPath = (e: React.MouseEvent) => {
    e.stopPropagation();
    soundFx.playClick();
    navigator.clipboard.writeText(cleanFilePath);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleOpenFile = (e: React.MouseEvent) => {
    e.stopPropagation();
    soundFx.playClick();
    if (api?.openMediaFile) {
      api.openMediaFile(cleanFilePath);
    }
  };

  const handleShowInFolder = (e: React.MouseEvent) => {
    e.stopPropagation();
    soundFx.playClick();
    if (api?.showMediaInFolder) {
      api.showMediaInFolder(cleanFilePath);
    }
  };

  if (!cleanFilePath) return null;

  return (
    <div className={`media-preview-container flex flex-col space-y-2 p-2.5 rounded-xl bg-black/60 border border-purple-500/30 transition-all ${className}`}>
      {/* Media Content Area */}
      <div className="relative rounded-lg overflow-hidden bg-black/80 flex items-center justify-center border border-white/5 min-h-[100px]">
        {hasError ? (
          <div className="flex flex-col items-center justify-center p-4 text-center text-slate-400 space-y-1">
            <AlertCircle className="w-6 h-6 text-amber-400 opacity-80" />
            <span className="text-[11px] font-mono text-slate-300">Local media file:</span>
            <span className="text-[10px] font-mono text-slate-500 truncate max-w-xs">{fileName}</span>
          </div>
        ) : mediaType === 'image' ? (
          <div className="relative group w-full flex items-center justify-center bg-black/90 p-1">
            <img
              src={activeSrc}
              alt={fileName}
              onError={handleMediaError}
              className={`object-contain rounded-lg transition-transform ${compact ? 'max-h-48' : 'max-h-80'} w-auto cursor-pointer hover:opacity-95`}
              onClick={() => setIsLightBoxOpen(true)}
              title="Click to expand full size"
            />
            <button
              onClick={() => setIsLightBoxOpen(true)}
              className="absolute top-2 right-2 p-1.5 rounded-lg bg-black/70 hover:bg-black/90 text-white/80 hover:text-white border border-white/10 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer shadow-lg"
              title="Zoom image"
            >
              <Maximize2 className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : mediaType === 'video' ? (
          <div className="w-full flex items-center justify-center bg-black p-1">
            <video
              controls
              playsInline
              preload="metadata"
              src={activeSrc}
              onError={handleMediaError}
              className={`w-full ${compact ? 'max-h-56' : 'max-h-80'} rounded-lg object-contain`}
            />
          </div>
        ) : mediaType === 'audio' ? (
          <div className="w-full p-3.5 flex flex-col items-center justify-center space-y-2.5 bg-gradient-to-b from-purple-950/20 to-black">
            <div className="flex items-center gap-2 text-purple-300">
              <Music className="w-4 h-4 text-purple-400 animate-pulse" />
              <span className="text-xs font-mono font-semibold truncate max-w-[280px]">
                {fileName}
              </span>
            </div>
            <audio
              controls
              preload="metadata"
              src={activeSrc}
              onError={handleMediaError}
              className="w-full h-8 rounded-lg"
            />
          </div>
        ) : (
          <div className="flex items-center gap-2 p-4 text-slate-300 text-xs font-mono">
            <Film className="w-5 h-5 text-cyan-400" />
            <span className="truncate">{fileName}</span>
          </div>
        )}
      </div>

      {/* Meta Bar & Actions */}
      <div className="flex items-center justify-between gap-2 pt-1 border-t border-white/5 text-[10px] font-mono">
        <div className="flex items-center gap-1.5 truncate text-slate-400">
          {mediaType === 'image' && <ImageIcon className="w-3.5 h-3.5 text-purple-400 shrink-0" />}
          {mediaType === 'video' && <Film className="w-3.5 h-3.5 text-cyan-400 shrink-0" />}
          {mediaType === 'audio' && <Music className="w-3.5 h-3.5 text-emerald-400 shrink-0" />}
          <span className="truncate select-all text-slate-300" title={cleanFilePath}>
            {cleanFilePath}
          </span>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={handleCopyPath}
            className="flex items-center gap-1 px-2 py-0.5 rounded bg-white/5 hover:bg-white/10 text-slate-300 transition-colors cursor-pointer"
            title="Copy absolute path"
          >
            {copied ? (
              <>
                <Check className="w-2.5 h-2.5 text-emerald-400" />
                <span className="text-emerald-400 font-bold">Copied</span>
              </>
            ) : (
              <>
                <Copy className="w-2.5 h-2.5" />
                <span>Copy</span>
              </>
            )}
          </button>

          <button
            onClick={handleOpenFile}
            className="flex items-center gap-1 px-2 py-0.5 rounded bg-purple-500/20 hover:bg-purple-500/30 text-purple-200 transition-colors cursor-pointer"
            title="Open in default system player"
          >
            <ExternalLink className="w-2.5 h-2.5" />
            <span>Open</span>
          </button>

          <button
            onClick={handleShowInFolder}
            className="flex items-center gap-1 px-2 py-0.5 rounded bg-white/5 hover:bg-white/10 text-slate-300 transition-colors cursor-pointer"
            title="Reveal in Finder / File Explorer"
          >
            <FolderOpen className="w-2.5 h-2.5" />
            <span>Folder</span>
          </button>
        </div>
      </div>

      {/* Lightbox Modal for Full-Size Image Viewing */}
      <AnimatePresence>
        {isLightBoxOpen && mediaType === 'image' && (
          <motion.div
            key="lightbox-modal-backdrop"
            variants={modalBackdropVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            transition={modalBackdropTransition}
            onClick={() => setIsLightBoxOpen(false)}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-md p-4"
          >
            <motion.div
              key="lightbox-modal-content"
              variants={modalContentVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
              transition={modalContentTransition}
              onClick={(e) => e.stopPropagation()}
              className="relative max-w-4xl max-h-[90vh] flex flex-col items-center bg-[#0d1117] border border-purple-500/40 rounded-2xl overflow-hidden shadow-2xl p-2"
            >
              <div className="w-full flex items-center justify-between px-3 py-2 border-b border-white/10">
                <span className="text-xs font-mono text-slate-200 truncate">{fileName}</span>
                <button
                  onClick={() => setIsLightBoxOpen(false)}
                  className="p-1 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="flex-1 overflow-auto p-2 flex items-center justify-center">
                <img src={activeSrc} alt={fileName} className="max-w-full max-h-[75vh] object-contain rounded-lg" />
              </div>
              <div className="w-full flex items-center justify-end gap-2 px-3 py-2 border-t border-white/10 text-xs font-mono">
                <button
                  onClick={handleCopyPath}
                  className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 flex items-center gap-1 cursor-pointer"
                >
                  <Copy className="w-3 h-3" />
                  <span>{copied ? 'Copied' : 'Copy Path'}</span>
                </button>
                <button
                  onClick={handleOpenFile}
                  className="px-2.5 py-1 rounded-lg bg-purple-500/20 hover:bg-purple-500/30 text-purple-200 flex items-center gap-1 cursor-pointer"
                >
                  <ExternalLink className="w-3 h-3" />
                  <span>Open in Viewer</span>
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
