import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Send, Sparkles, Loader2, RotateCcw, Eye, Bot, Paperclip, FileText, Film, X } from 'lucide-react';
import { soundFx } from '../audio/soundFx.js';
import { ATTACHMENT_LIMITS, type AttachmentInput, type DesktopAttachmentSelection } from '../../shared/attachments.js';
import type { TaskMode } from '../../shared/types.js';

const QUICK_PROMPT_DRAFT_KEY = 'transgentic_quick_prompt_draft';

interface QuickPromptBarProps {
  onSendPrompt: (prompt: string, files: AttachmentInput[]) => Promise<any>;
  onSelectFiles?: (mode?: TaskMode) => Promise<DesktopAttachmentSelection[]>;
  isProcessing: boolean;
  hasActiveSession?: boolean;
  onClearSession?: () => Promise<void>;
  hasAnswer?: boolean;
  onViewAnswer?: () => void;
  isServiceDeselected?: boolean;
  activeMode?: TaskMode;
}

export const QuickPromptBar: React.FC<QuickPromptBarProps> = ({
  onSendPrompt,
  onSelectFiles,
  isProcessing,
  hasActiveSession = false,
  onClearSession,
  hasAnswer = false,
  onViewAnswer,
  isServiceDeselected = false,
  activeMode,
}) => {
  const [input, setInput] = useState(() => {
    try {
      return localStorage.getItem(QUICK_PROMPT_DRAFT_KEY) || '';
    } catch {
      return '';
    }
  });
  const [isClearing, setIsClearing] = useState(false);
  const [attachments, setAttachments] = useState<DesktopAttachmentSelection[]>([]);
  const [attachmentError, setAttachmentError] = useState('');
  const attachmentsRef = useRef<HTMLDivElement | null>(null);
  const wheelCleanupRef = useRef<(() => void) | null>(null);

  const handleAttachmentsRef = useCallback((node: HTMLDivElement | null) => {
    if (wheelCleanupRef.current) {
      wheelCleanupRef.current();
      wheelCleanupRef.current = null;
    }
    attachmentsRef.current = node;
    if (node) {
      let targetScrollLeft = node.scrollLeft;
      let animId: number | null = null;
      let snapTimeout: ReturnType<typeof setTimeout> | null = null;

      const animate = () => {
        const current = node.scrollLeft;
        const diff = targetScrollLeft - current;
        if (Math.abs(diff) <= 0.5) {
          node.scrollLeft = targetScrollLeft;
          animId = null;
          if (snapTimeout) clearTimeout(snapTimeout);
          snapTimeout = setTimeout(() => {
            node.style.scrollSnapType = '';
          }, 80);
          return;
        }
        node.scrollLeft = current + diff * 0.22;
        animId = requestAnimationFrame(animate);
      };

      const handleWheel = (e: WheelEvent) => {
        // Prevent default page scrolling when scrolling over attachments
        e.preventDefault();

        if (snapTimeout) {
          clearTimeout(snapTimeout);
          snapTimeout = null;
        }
        node.style.scrollSnapType = 'none';

        const rawDelta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
        const multiplier = e.deltaMode === 1 ? 24 : e.deltaMode === 2 ? 100 : 1;
        const delta = rawDelta * multiplier;

        if (animId === null) {
          targetScrollLeft = node.scrollLeft;
        }

        const maxScroll = Math.max(0, node.scrollWidth - node.clientWidth);
        targetScrollLeft = Math.max(0, Math.min(maxScroll, targetScrollLeft + delta));

        if (animId === null) {
          animId = requestAnimationFrame(animate);
        }
      };

      node.addEventListener('wheel', handleWheel, { passive: false });
      wheelCleanupRef.current = () => {
        if (animId) cancelAnimationFrame(animId);
        if (snapTimeout) clearTimeout(snapTimeout);
        node.removeEventListener('wheel', handleWheel);
      };
    }
  }, []);

  useEffect(() => {
    return () => {
      if (wheelCleanupRef.current) {
        wheelCleanupRef.current();
        wheelCleanupRef.current = null;
      }
    };
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setInput(val);
    try {
      localStorage.setItem(QUICK_PROMPT_DRAFT_KEY, val);
    } catch {}
  };

  const handleClear = async (e: React.MouseEvent) => {
    e.preventDefault();
    if (isClearing || !onClearSession) return;
    soundFx.playClick();
    setIsClearing(true);
    try {
      await onClearSession();
      setAttachments([]);
      setAttachmentError('');
    } finally {
      setIsClearing(false);
    }
  };

  const handleAttach = async (e: React.MouseEvent) => {
    e.preventDefault();
    if (!onSelectFiles || isProcessing || isServiceDeselected || activeMode === 'music') return;
    soundFx.playClick();
    setAttachmentError('');
    try {
      const selected = await onSelectFiles(activeMode);
      if (!selected.length) return;
      const next = [...attachments];
      for (const file of selected) {
        if (!next.some(existing => existing.path === file.path)) next.push(file);
      }
      if (next.length > ATTACHMENT_LIMITS.maxFiles) {
        throw new Error(`Quick Prompt accepts at most ${ATTACHMENT_LIMITS.maxFiles} files.`);
      }
      if (next.some(file => file.size > ATTACHMENT_LIMITS.maxFileBytes)) {
        throw new Error('Each attachment must be 50 MB or smaller.');
      }
      if (next.reduce((total, file) => total + file.size, 0) > ATTACHMENT_LIMITS.maxTotalBytes) {
        throw new Error('Attachments must total 100 MB or less.');
      }
      setAttachments(next);
    } catch (error: any) {
      setAttachmentError(error?.message || 'Could not attach the selected files.');
      soundFx.playWarnTone();
    }
  };

  const removeAttachment = (filePath: string) => {
    soundFx.playClick();
    setAttachments(current => current.filter(file => file.path !== filePath));
    setAttachmentError('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isProcessing || isServiceDeselected) return;

    const prompt = input.trim();
    const files: AttachmentInput[] = attachments.map(({ path, name }) => ({ path, name }));
    soundFx.playClick();
    setAttachmentError('');
    try {
      await onSendPrompt(prompt, files);
      setInput('');
      setAttachments([]);
      try {
        localStorage.removeItem(QUICK_PROMPT_DRAFT_KEY);
      } catch {}
    } catch (error: any) {
      setAttachmentError(error?.message || 'Quick Prompt could not send this request.');
    }
  };

  let rightPadding = 'pr-24';
  if (hasAnswer && hasActiveSession) {
    rightPadding = 'pr-56';
  } else if (hasAnswer) {
    rightPadding = 'pr-40';
  } else if (hasActiveSession) {
    rightPadding = 'pr-44';
  }

  return (
    <form onSubmit={handleSubmit} className="w-full mt-2">
      <div className="relative flex items-center mx-4">
        
        <div className={`absolute left-3 pointer-events-none ${isServiceDeselected ? 'text-amber-400' : 'text-cyan-400'}`}>
          {isServiceDeselected ? <Bot className="w-3.5 h-3.5" /> : <Sparkles className="w-3.5 h-3.5" />}
        </div>

        <input
          type="text"
          value={input}
          onChange={handleChange}
          placeholder={
            isServiceDeselected
              ? `Quick prompt disabled: No service selected for ${activeMode || 'this'} mode (falls back to Codex).`
              : 'Type quick prompt (e.g. review my code)...'
          }
          disabled={isProcessing || isServiceDeselected}
          className={`w-full h-8 pl-8 ${rightPadding} ${
            isServiceDeselected
              ? 'bg-black/40 border border-amber-500/20 text-slate-400 opacity-70 cursor-not-allowed'
              : 'bg-black/60 border border-white/10 text-slate-100 placeholder-slate-500 focus:border-cyan-500/60 focus:ring-1 focus:ring-cyan-500/40'
          } rounded-xl text-xs transition-all font-mono focus:outline-none`}
        />

        {/* Action Pills Before Submit Button */}
        <div className="absolute right-8 flex items-center gap-1.5">
          <button
            type="button"
            onClick={handleAttach}
            disabled={!onSelectFiles || isProcessing || isServiceDeselected || activeMode === 'music'}
            title={activeMode === 'music' ? 'Music mode does not accept attachments' : 'Attach images or documents; Video mode also accepts video files'}
            className="flex items-center gap-1 px-1.5 py-0.5 rounded-lg bg-slate-500/20 hover:bg-slate-500/30 text-slate-300 border border-slate-500/40 hover:border-slate-400 text-[9px] font-mono transition-all cursor-pointer disabled:opacity-40 disabled:pointer-events-none"
          >
            <Paperclip className="w-2.5 h-2.5 text-slate-300" />
            <span>{attachments.length ? `Files ${attachments.length}` : 'Files'}</span>
          </button>

          {hasAnswer && onViewAnswer && (
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                soundFx.playClick();
                onViewAnswer();
              }}
              title="View latest AI response output"
              className="flex items-center gap-1 px-1.5 py-0.5 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-500/40 hover:border-cyan-400 text-[9px] font-mono transition-all animate-in fade-in zoom-in-95 cursor-pointer shadow-[0_0_8px_rgba(6,182,212,0.25)]"
            >
              <Eye className="w-2.5 h-2.5 text-cyan-400" />
              <span>Answer</span>
            </button>
          )}

          {hasActiveSession && onClearSession && (
            <button
              type="button"
              onClick={handleClear}
              disabled={isProcessing || isClearing}
              title="Active chat session in progress. Click to clear session and start a new chat."
              className="flex items-center gap-1 px-1.5 py-0.5 rounded-lg bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 border border-purple-500/40 hover:border-purple-400 text-[9px] font-mono transition-all animate-in fade-in zoom-in-95 cursor-pointer shadow-[0_0_8px_rgba(168,85,247,0.25)] disabled:opacity-50"
            >
              <RotateCcw className={`w-2.5 h-2.5 ${isClearing ? 'animate-spin text-purple-200' : 'text-purple-400'}`} />
              <span>New Chat</span>
            </button>
          )}
        </div>

        <button
          type="submit"
          disabled={!input.trim() || isProcessing || isServiceDeselected}
          className="absolute right-1.5 p-1 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 disabled:opacity-30 disabled:pointer-events-none transition-all"
        >
          {isProcessing ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Send className="w-3.5 h-3.5" />
          )}
        </button>
      </div>

      {attachments.length > 0 && (
        <div
          ref={handleAttachmentsRef}
          className="mt-1.5 flex w-full snap-x snap-mandatory scroll-px-4 gap-2 overflow-x-auto overflow-y-hidden px-4 pb-1"
          aria-label="Quick Prompt attachments"
        >
          {attachments.map(file => (
            <AttachmentPreviewCard
              key={file.path}
              file={file}
              disabled={isProcessing}
              onRemove={() => removeAttachment(file.path)}
            />
          ))}
        </div>
      )}
      {attachmentError && (
        <p className="mt-1 px-4 text-[9px] font-mono text-rose-300" role="alert">{attachmentError}</p>
      )}
    </form>
  );
};

const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'webp', 'gif']);
const VIDEO_EXTENSIONS = new Set(['mp4', 'webm', 'mov']);

const AttachmentPreviewCard: React.FC<{
  file: DesktopAttachmentSelection;
  disabled: boolean;
  onRemove: () => void;
}> = ({ file, disabled, onRemove }) => {
  const [previewFailed, setPreviewFailed] = useState(false);
  const extension = file.name.includes('.') ? file.name.split('.').pop()!.toLowerCase() : '';
  const isImage = IMAGE_EXTENSIONS.has(extension);
  const isVideo = VIDEO_EXTENSIONS.has(extension);
  const api = typeof window !== 'undefined' ? window.transgenticApi : undefined;
  const previewUrl = (isImage || isVideo) && api?.getMediaUrl ? api.getMediaUrl(file.path) : '';

  return (
    <div
      className="group relative h-16 w-16 shrink-0 snap-start overflow-hidden rounded-lg border border-cyan-500/30 bg-slate-950 shadow-[0_0_8px_rgba(6,182,212,0.12)]"
      title={`${file.name} (${formatFileSize(file.size)})`}
    >
      {!previewFailed && previewUrl && isImage ? (
        <img
          src={previewUrl}
          alt=""
          className="h-full w-full object-cover"
          onError={() => setPreviewFailed(true)}
        />
      ) : !previewFailed && previewUrl && isVideo ? (
        <video
          src={previewUrl}
          className="h-full w-full object-cover"
          muted
          playsInline
          preload="metadata"
          onError={() => setPreviewFailed(true)}
        />
      ) : (
        <div className="flex h-full w-full flex-col items-center justify-center gap-1 bg-slate-900 text-cyan-300">
          <FileText className="h-6 w-6" />
          <span className="max-w-[52px] truncate text-[8px] font-mono uppercase text-slate-400">{extension || 'file'}</span>
        </div>
      )}

      {isVideo && !previewFailed && (
        <div className="pointer-events-none absolute left-1 top-1 rounded bg-black/65 p-0.5 text-white">
          <Film className="h-2.5 w-2.5" />
        </div>
      )}

      <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/95 via-black/75 to-transparent px-1 pb-1 pt-3">
        <p className="truncate text-[8px] font-mono leading-none text-white">{file.name}</p>
      </div>

      <button
        type="button"
        onClick={onRemove}
        disabled={disabled}
        aria-label={`Remove ${file.name}`}
        className="absolute right-1 top-1 rounded-full border border-white/20 bg-black/75 p-0.5 text-white shadow hover:bg-rose-500/90 disabled:opacity-40"
      >
        <X className="h-2.5 w-2.5" />
      </button>
    </div>
  );
};

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
