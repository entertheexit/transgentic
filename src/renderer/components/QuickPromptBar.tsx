import React, { useState } from 'react';
import { Send, Sparkles, Loader2, RotateCcw, Eye, Bot } from 'lucide-react';
import { soundFx } from '../audio/soundFx.js';

const QUICK_PROMPT_DRAFT_KEY = 'transgentic_quick_prompt_draft';

interface QuickPromptBarProps {
  onSendPrompt: (prompt: string) => Promise<any>;
  isProcessing: boolean;
  hasActiveSession?: boolean;
  onClearSession?: () => Promise<void>;
  hasAnswer?: boolean;
  onViewAnswer?: () => void;
  isServiceDeselected?: boolean;
  activeMode?: string;
}

export const QuickPromptBar: React.FC<QuickPromptBarProps> = ({
  onSendPrompt,
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
    } finally {
      setIsClearing(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isProcessing || isServiceDeselected) return;

    const prompt = input.trim();
    setInput('');
    try {
      localStorage.removeItem(QUICK_PROMPT_DRAFT_KEY);
    } catch {}
    soundFx.playClick();
    await onSendPrompt(prompt);
  };

  let rightPadding = 'pr-9';
  if (hasAnswer && hasActiveSession) {
    rightPadding = 'pr-44';
  } else if (hasAnswer) {
    rightPadding = 'pr-24';
  } else if (hasActiveSession) {
    rightPadding = 'pr-28';
  }

  return (
    <form onSubmit={handleSubmit} className="w-full px-4 mt-2">
      <div className="relative flex items-center">
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
    </form>
  );
};
