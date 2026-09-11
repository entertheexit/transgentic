import React, { useState } from 'react';
import { McpRequestLog, ProviderStatus, ServicesManifest } from '../../shared/types.js';
import {
  Activity,
  ArrowRight,
  ShieldAlert,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Clock,
  Trash2,
  ChevronDown,
  ChevronUp,
  Copy,
  Check,
  Bot,
  Sparkles,
  RefreshCw,
  Zap,
  MessageSquareText,
  Square,
  RotateCcw,
  HardDrive,
  Cpu,
  Shield,
  Minimize2,
} from 'lucide-react';
import { soundFx } from '../audio/soundFx.js';
import { MediaPreview, extractMediaPath } from './MediaPreview.js';
import { getProviderDisplayName } from '../utils/providerTheme.js';

interface LogStreamProps {
  logs: McpRequestLog[];
  totalLogsCount?: number;
  onFetchMore?: () => void;
  onClearLogs?: () => void;
  onTerminateRequest?: (logId: string) => Promise<any>;
  onTerminateAllPending?: () => Promise<any>;
  servicesManifest?: ServicesManifest | null;
  providers?: Record<string, ProviderStatus> | null;
}

export const LogStream: React.FC<LogStreamProps> = ({
  logs,
  totalLogsCount = 0,
  onFetchMore,
  onClearLogs,
  onTerminateRequest,
  onTerminateAllPending,
  servicesManifest,
  providers,
}) => {
  const [expandedLogIds, setExpandedLogIds] = useState<Record<string, boolean>>({});
  const [copiedLogId, setCopiedLogId] = useState<string | null>(null);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  const toggleExpand = (id: string) => {
    soundFx.playClick();
    setExpandedLogIds((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  const handleCopy = (text: string, id: string) => {
    soundFx.playClick();
    navigator.clipboard.writeText(text);
    setCopiedLogId(id);
    setTimeout(() => setCopiedLogId(null), 2500);
  };

  const handleClear = () => {
    soundFx.playClick();
    if (onClearLogs) {
      onClearLogs();
      soundFx.playTaskSuccess();
    }
    setShowClearConfirm(false);
  };

  const handleLoadMore = async () => {
    if (onFetchMore && !isLoadingMore) {
      soundFx.playClick();
      setIsLoadingMore(true);
      try {
        await onFetchMore();
      } finally {
        setIsLoadingMore(false);
      }
    }
  };

  const getStatusIcon = (status: McpRequestLog['status'], error?: string) => {
    switch (status) {
      case 'success':
        return <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />;
      case 'fallback':
        return <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />;
      case 'failed':
        if (error && error.toLowerCase().includes('terminated')) {
          return <Square className="w-3.5 h-3.5 text-rose-400 fill-rose-400 shrink-0" />;
        }
        return <XCircle className="w-3.5 h-3.5 text-rose-400 shrink-0" />;
      case 'pending':
      default:
        return <Clock className="w-3.5 h-3.5 text-cyan-400 animate-spin shrink-0" />;
    }
  };

  const getModeBadgeStyle = (mode: string) => {
    switch (mode) {
      case 'coding':
        return 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30';
      case 'writing':
        return 'bg-amber-500/15 text-amber-300 border-amber-500/30';
      case 'image':
        return 'bg-purple-500/15 text-purple-300 border-purple-500/30';
      case 'video':
        return 'bg-fuchsia-500/15 text-fuchsia-300 border-fuchsia-500/30';
      case 'audio':
      case 'music':
        return 'bg-pink-500/15 text-pink-300 border-pink-500/30';
      case 'general':
      default:
        return 'bg-slate-500/15 text-slate-300 border-slate-500/30';
    }
  };

  const pendingLogs = logs.filter((l) => l.status === 'pending');
  const pendingCount = pendingLogs.length;

  const handleTerminateItem = async (logId: string) => {
    soundFx.playClick();
    if (onTerminateRequest) {
      await onTerminateRequest(logId);
      soundFx.playWarnTone();
    }
  };

  const handleTerminateAll = async () => {
    soundFx.playClick();
    if (onTerminateAllPending) {
      await onTerminateAllPending();
      soundFx.playWarnTone();
    }
  };

  const displayTotal = Math.max(totalLogsCount, logs.length);
  const hasMore = logs.length < displayTotal;

  return (
    <div className="flex flex-col h-full pt-4 space-y-3 max-h-full overflow-hidden">
      {/* Header */}
      <div className="flex pl-4 pr-4 items-center gap-3 justify-between pb-4 border-b border-white/5 shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 shadow-[0_0_15px_rgba(6,182,212,0.15)]">
            <Activity className="w-4 h-4" />
          </div>
          <div className="items-center gap-2">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-slate-100 tracking-wide">Logs</h2>
              <span className="text-[10px] font-mono text-slate-500 bg-white/5 px-2 py-0.5 rounded border border-white/5">
                {logs.length} of {displayTotal}
              </span>
            </div>
            <p className="text-[10px] text-slate-400">
              Live MCP Routing Stream
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {pendingCount > 0 && onTerminateAllPending && (
            <button
              onClick={handleTerminateAll}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40 text-[10px] font-mono font-bold transition-all shadow-[0_0_10px_rgba(244,63,94,0.2)] cursor-pointer"
              title="Stop waiting on all pending requests and flag them as terminated"
            >
              <Square className="w-2.5 h-2.5 fill-rose-400 text-rose-400" />
              <span>Stop Waiting ({pendingCount})</span>
            </button>
          )}

          {logs.length > 0 && (
            <>
              {showClearConfirm ? (
                <div className="flex items-center gap-1.5 animate-in fade-in duration-200">
                  <span className="text-[10px] font-mono text-rose-400">Clear all?</span>
                  <button
                    onClick={handleClear}
                    className="px-2 py-0.5 rounded bg-rose-500 hover:bg-rose-600 text-white text-[10px] font-mono font-bold transition-colors cursor-pointer"
                  >
                    Yes, Delete
                  </button>
                  <button
                    onClick={() => setShowClearConfirm(false)}
                    className="px-2 py-0.5 rounded bg-white/10 hover:bg-white/20 text-slate-300 text-[10px] font-mono transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => {
                    soundFx.playClick();
                    setShowClearConfirm(true);
                  }}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-mono font-semibold text-amber-300 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 shadow-[0_0_12px_rgba(245,158,11,0.15)] transition-all cursor-pointer"
                  title="Clear all logs from disk and memory"
                >
                  <Trash2 className="w-3 h-3" />
                  <span>Clear All</span>
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Log Feed List */}
      <div className="flex-1 overflow-y-auto !mt-0 pt-3 pb-4 pl-4 pr-4 space-y-2.5 pr-1">
        {logs.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-500">
            <Activity className="w-8 h-8 text-slate-600 mb-2 opacity-60" />
            <p className="text-xs font-semibold text-slate-400">No MCP requests recorded yet.</p>
            <p className="text-[10px] text-slate-600 mt-1 max-w-xs">
              All MCP requests and AI service answers are securely stored to local disk so you can review routing history anytime.
            </p>
          </div>
        ) : (
          logs.map((log) => {
            const isExpanded = !!expandedLogIds[log.id];
            const answerText = log.responseText || log.responseSnippet || '';

            return (
              <div
                key={log.id}
                className="p-3 bg-black/40 border border-white/5 rounded-xl flex flex-col space-y-2 hover:border-cyan-500/30 transition-all shadow-sm"
              >
                {/* Top Row: Route + Mode + Balanced Badge + Model Badge + Duration + Timestamp */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    {getStatusIcon(log.status, log.error)}
                    <span className={`text-[9.5px] font-mono font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border ${getModeBadgeStyle(log.mode)}`}>
                      {log.mode}
                    </span>

                    {log.balancedModeApplied && (
                      <span className="text-[9px] font-mono font-bold text-cyan-300 bg-cyan-500/20 px-1.5 py-0.5 rounded border border-cyan-500/40 flex items-center gap-1">
                        <Zap className="w-2.5 h-2.5 text-cyan-400" />
                        <span>BALANCED</span>
                      </span>
                    )}

                    {log.autoClassified && (
                      <span className="text-[8.5px] font-mono text-slate-400 bg-white/5 px-1 py-0.5 rounded border border-white/5" title="Mode automatically inferred from prompt context">
                        auto
                      </span>
                    )}

                    {log.isQuickPrompt && (
                      <span className="text-[9px] font-mono font-bold text-emerald-300 bg-emerald-500/20 px-1.5 py-0.5 rounded border border-emerald-500/40 flex items-center gap-1" title="Executed directly via Transgentic Quick Prompt">
                        <MessageSquareText className="w-2.5 h-2.5 text-emerald-400" />
                        <span>QUICK PROMPT</span>
                      </span>
                    )}

                    {log.autoRollover && (
                      <span className="text-[9px] font-mono font-bold text-fuchsia-300 bg-fuchsia-500/20 px-1.5 py-0.5 rounded border border-fuchsia-500/40 flex items-center gap-1" title="Conversation length reached limit; automatically rolled over to fresh chat session">
                        <RotateCcw className="w-2.5 h-2.5 text-fuchsia-400" />
                        <span>AUTO NEW CHAT</span>
                      </span>
                    )}

                    {log.presetPromptsAttached && (
                      <span className="text-[9px] font-mono font-bold text-indigo-300 bg-indigo-500/20 px-1.5 py-0.5 rounded border border-indigo-500/40 flex items-center gap-1" title="New chat: Transgentic feature preset directives (Recall / Balanced Mode) attached to establish context">
                        <span>NEW CHAT DIRECTIVES</span>
                      </span>
                    )}

                    {log.isMicroTask && (
                      <span
                        className="text-[9px] font-mono font-bold text-teal-300 bg-teal-500/20 px-1.5 py-0.5 rounded border border-teal-500/40 flex items-center gap-1"
                        title={`Micro-task detected${log.microTaskCategory ? ` (${log.microTaskCategory})` : ''}: Lightweight local execution`}
                      >
                        <Cpu className="w-2.5 h-2.5 text-teal-400" />
                        <span>MICRO-TASK{log.microTaskCategory ? `: ${log.microTaskCategory.toUpperCase()}` : ''}</span>
                      </span>
                    )}

                    {(log.bypassedWebviewDispatch || log.bypassedCloudDispatch) && (
                      <span
                        className="text-[9px] font-mono font-bold text-amber-300 bg-amber-500/20 px-1.5 py-0.5 rounded border border-amber-500/40 flex items-center gap-1"
                        title="Webview Dispatch Bypassed: Executed directly via Local LLM endpoint as configured in Route fallback"
                      >
                        <Sparkles className="w-2.5 h-2.5 text-amber-400" />
                        <span>BYPASS WEBVIEW</span>
                      </span>
                    )}

                    {log.localZeroLeakApplied && (
                      <span
                        className="text-[9px] font-mono font-bold text-purple-300 bg-purple-500/20 px-1.5 py-0.5 rounded border border-purple-500/40 flex items-center gap-1"
                        title={`Local Zero-Leak: Ephemeral credential protection masked ${log.localZeroLeakCount || 0} secrets before Web AI dispatch`}
                      >
                        <Shield className="w-2.5 h-2.5 text-purple-400" />
                        <span>ZERO-LEAK{log.localZeroLeakCount ? ` (${log.localZeroLeakCount})` : ''}</span>
                      </span>
                    )}

                    {log.localCompactApplied && (
                      <span
                        className="text-[9px] font-mono font-bold text-indigo-300 bg-indigo-500/20 px-1.5 py-0.5 rounded border border-indigo-500/40 flex items-center gap-1"
                        title={`Local Compact: Context distilled by Local LLM from ${log.localCompactOriginalChars || 0} to ${log.localCompactDistilledChars || 0} characters`}
                      >
                        <Minimize2 className="w-2.5 h-2.5 text-indigo-400" />
                        <span>COMPACT</span>
                      </span>
                    )}

                    <div className="flex items-center gap-1 text-[11px] font-mono font-semibold">
                      <span className="text-cyan-300">
                        {getProviderDisplayName(log.targetProvider, servicesManifest, providers)}
                      </span>
                      {log.fallbackProvider && (
                        <>
                          <ArrowRight className="w-3 h-3 text-amber-400" />
                          <span className="text-amber-400">
                            {getProviderDisplayName(log.fallbackProvider, servicesManifest, providers)}
                          </span>
                        </>
                      )}
                    </div>

                    {log.modelUsed && (
                      <span className="text-[9px] font-mono text-purple-300 bg-purple-500/10 px-1.5 py-0.5 rounded border border-purple-500/20 flex items-center gap-1">
                        <Sparkles className="w-2.5 h-2.5" />
                        <span>{log.modelUsed}</span>
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2 text-[9px] font-mono text-slate-500 shrink-0">
                    {log.status === 'pending' && onTerminateRequest && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleTerminateItem(log.id);
                        }}
                        className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40 text-[9.5px] font-mono font-bold transition-all shadow-sm hover:shadow-[0_0_8px_rgba(244,63,94,0.3)] cursor-pointer"
                        title="Terminate this request and stop waiting"
                      >
                        <Square className="w-2 h-2 fill-rose-400 text-rose-400" />
                        <span>Terminate</span>
                      </button>
                    )}
                    {log.durationMs !== undefined && (
                      <span className="text-emerald-400 font-bold bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">
                        {log.durationMs < 1000 ? `${log.durationMs}ms` : `${(log.durationMs / 1000).toFixed(1)}s`}
                      </span>
                    )}
                    <span>{new Date(log.timestamp).toLocaleTimeString()}</span>
                  </div>
                </div>

                {/* Prompt Preview */}
                <div className="space-y-1">
                  <div className="text-[9px] font-mono uppercase tracking-wider text-slate-500 font-semibold">
                    Prompt
                  </div>
                  <div className="text-[11px] text-slate-300 font-mono bg-black/60 px-2.5 py-1.5 rounded-xl border border-white/5 break-words">
                    {log.promptText || log.promptSnippet}
                  </div>
                </div>

                {/* AI Service Answer Preview (Compact 1-2 lines with Expandable Toggle) */}
                {answerText && (
                  <div className="space-y-1 pt-1 border-t border-white/5">
                    <div className="flex items-center justify-between">
                      <div className="text-[9px] font-mono uppercase tracking-wider text-cyan-400 font-semibold flex items-center gap-1">
                        <MessageSquareText className="w-3 h-3" />
                        <span>Response</span>
                      </div>

                      <div className="flex items-center gap-1">
                        {/* Copy Response Button */}
                        <button
                          onClick={() => handleCopy(answerText, log.id)}
                          className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-white/5 hover:bg-white/10 text-slate-300 text-[9px] font-mono transition-colors cursor-pointer"
                          title="Copy full answer to clipboard"
                        >
                          {copiedLogId === log.id ? (
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

                        {/* Expand / Collapse Button */}
                        <button
                          onClick={() => toggleExpand(log.id)}
                          className="flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 text-[9px] font-mono transition-colors cursor-pointer"
                        >
                          <span>{isExpanded ? 'Collapse' : 'Expand'}</span>
                          {isExpanded ? <ChevronUp className="w-2.5 h-2.5" /> : <ChevronDown className="w-2.5 h-2.5" />}
                        </button>
                      </div>
                    </div>

                    {isExpanded ? (
                      <div className="text-[11px] text-slate-200 font-mono bg-black/70 p-2.5 rounded-xl border border-cyan-500/20 max-h-60 overflow-y-auto whitespace-pre-wrap leading-relaxed select-text">
                        {answerText}
                      </div>
                    ) : (
                      <div
                        onClick={() => toggleExpand(log.id)}
                        className="text-[11px] text-slate-400 font-mono bg-black/40 px-2.5 py-1.5 rounded-xl border border-white/5 line-clamp-2 leading-relaxed cursor-pointer hover:text-slate-300 hover:border-white/10 transition-colors"
                        title="Click to expand full answer"
                      >
                        {answerText}
                      </div>
                    )}

                    {/* Local Media Asset Preview & Controls if present */}
                    {(() => {
                      const effectiveMediaPath = extractMediaPath(log.mediaPath, answerText);
                      if (!effectiveMediaPath) return null;
                      return (
                        <div className="pt-1.5">
                          <MediaPreview path={effectiveMediaPath} modeHint={log.mode} />
                        </div>
                      );
                    })()}
                  </div>
                )}

                {/* Bottom Meta Badges */}
                <div className="flex items-center justify-between gap-2 text-[9px] font-mono pt-0.5">
                  {log.maskedSecretsCount > 0 ? (
                    <div className="flex items-center gap-1 text-purple-300">
                      <ShieldAlert className="w-3 h-3 text-purple-400" />
                      <span>Blinded {log.maskedSecretsCount} secrets</span>
                    </div>
                  ) : (
                    <div />
                  )}

                  {log.error && (
                    <div className="text-rose-400 truncate font-semibold">
                      Error: {log.error}
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}

        {/* Load More Historical Logs Button */}
        {hasMore && onFetchMore && (
          <div className="pt-2 pb-1 flex justify-center">
            <button
              disabled={isLoadingMore}
              onClick={handleLoadMore}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 text-xs font-mono font-semibold transition-all cursor-pointer shadow-sm disabled:opacity-50"
            >
              <RefreshCw className={`w-3 h-3 ${isLoadingMore ? 'animate-spin' : ''}`} />
              <span>{isLoadingMore ? 'Loading...' : `Load More Logs (+20)`}</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
