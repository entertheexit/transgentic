import React, { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, RefreshCw } from 'lucide-react';
import { resolveChatMode, type ChatModeSelection, type ProviderStatus, type RouteMode, type TransgenticConfig } from '../../shared/types.js';
import { isCliProvider } from '../../shared/cli.js';

const chatModeLabels: Record<ChatModeSelection, string> = {
  normal: 'Normal (Not Temporary)', temporary: 'Temporary',
  'temporary-personalized': 'Personalized Temporary',
  'temporary-unpersonalized': 'Unpersonalized Temporary',
};

export function chatModeChoices(capability?: ProviderStatus['temporaryChat']): Array<[ChatModeSelection, string]> {
  const modes: ChatModeSelection[] = ['normal'];
  if (capability?.supported) {
    if (capability.variants?.length) {
      if (capability.variants.includes('personalized')) modes.push('temporary-personalized');
      if (capability.variants.includes('unpersonalized')) modes.push('temporary-unpersonalized');
    } else modes.push('temporary');
  }
  return modes.map(value => [value, chatModeLabels[value]]);
}

function floatingPosition(anchor: HTMLElement, content: HTMLElement) {
  const rect = anchor.getBoundingClientRect();
  const { width, height } = content.getBoundingClientRect();
  return {
    left: Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)),
    top: Math.max(8, rect.bottom + height + 8 <= window.innerHeight ? rect.bottom + 6 : rect.top - height - 6),
  };
}

export function ChatModeControl({ config, mode, provider, capability, providerType }: {
  config: TransgenticConfig; mode: RouteMode; provider?: string;
  capability?: ProviderStatus['temporaryChat'];
  providerType?: 'api' | 'webview' | 'cli';
}) {
  const [open, setOpen] = useState(false);
  const [tooltipOpen, setTooltipOpen] = useState(false);
  const [tooltipPosition, setTooltipPosition] = useState({ left: 0, top: 0 });
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [position, setPosition] = useState({ left: 0, top: 0 });
  const trigger = useRef<HTMLButtonElement>(null);
  const statusDot = useRef<HTMLSpanElement>(null);
  const tooltip = useRef<HTMLDivElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const tooltipId = useId();
  const selection = resolveChatMode(config, mode, provider || '', undefined, undefined, providerType, capability?.supported);
  const choices = chatModeChoices(capability);
  const pending = saving || refreshing || capability?.checking;
  const externalSettings = Boolean(provider && (providerType === 'api' || providerType === 'cli' || isCliProvider(provider) || provider === 'localllm' || provider.startsWith('api_')));
  const unavailable = Boolean(provider && (externalSettings || (capability && !capability.supported)));
  const status = error || (saving ? 'Saving chat mode…' : !provider ? 'Select a service' : externalSettings ? 'Temporary Unavailable' : !capability ? 'Status unavailable'
    : !capability.supported ? 'Temporary Chat unsupported' : pending ? 'Checking Temporary Chat…'
      : capability.reason?.startsWith('Sign in') ? 'Sign in required' : capability.checkFailed ? 'Couldn’t verify Temporary Chat'
        : capability.availability === 'unavailable' ? 'Temporary Chat unavailable'
          : capability.availability === 'available' ? 'Temporary Chat available; selected mode is verified when starting'
            : 'Selected mode is verified when starting');
  const description = externalSettings ? 'Temporary Chat is controlled by this service’s CLI or API settings, including its history, memory and retention policies.'
    : capability?.personalization === 'profile-only' && capability.supported ? `${status}. Profile preferences and custom styles may still apply.`
    : capability?.reason && !error && !pending ? `${status}. ${capability.reason}` : status;
  const dotColor = error ? 'bg-rose-400'
    : pending ? 'bg-cyan-400 animate-pulse'
      : capability?.checkFailed ? 'bg-rose-400'
      : !externalSettings && (capability?.availability === 'unavailable' || capability?.reason?.startsWith('Sign in')) ? 'bg-amber-400'
        : capability?.supported && capability.availability === 'available' ? 'bg-emerald-400' : 'bg-slate-500';

  useEffect(() => { setOpen(false); setTooltipOpen(false); setError(''); }, [provider, mode]);

  useLayoutEffect(() => {
    if (!tooltipOpen || !statusDot.current || !tooltip.current) return;
    const place = () => {
      if (!statusDot.current || !tooltip.current) return;
      setTooltipPosition(floatingPosition(statusDot.current, tooltip.current));
    };
    const dismiss = () => setTooltipOpen(false);
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', dismiss, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', dismiss, true);
    };
  }, [tooltipOpen, description]);

  useLayoutEffect(() => {
    if (!open || !trigger.current || !menu.current) return;
    const place = () => {
      if (!trigger.current || !menu.current) return;
      setPosition(floatingPosition(trigger.current, menu.current));
    };
    place();
    const initial = menu.current.querySelector<HTMLButtonElement>('[aria-checked="true"]')
      || menu.current.querySelector<HTMLButtonElement>('[data-chat-mode-option]');
    initial?.focus({ preventScroll: true });
    const dismiss = (event: PointerEvent) => {
      if (!trigger.current?.contains(event.target as Node) && !menu.current?.contains(event.target as Node)) setOpen(false);
    };
    const onScroll = (event: Event) => {
      if (!menu.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', dismiss);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      document.removeEventListener('pointerdown', dismiss);
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [open, provider, mode]);

  const close = () => { setOpen(false); trigger.current?.focus({ preventScroll: true }); };
  const choose = async (value: ChatModeSelection) => {
    if (!provider || !window.transgenticApi) return;
    close();
    setSaving(true);
    setError('');
    try {
      await window.transgenticApi.updateConfig({
        chatModes: { ...config.chatModes, [mode]: { ...config.chatModes?.[mode], [provider]: value } },
      });
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not save chat mode.'); }
    finally { setSaving(false); }
  };
  const retry = async () => {
    close();
    setError('');
    if (!provider) return;
    const api = window.transgenticApi;
    if (!api?.recheckTemporaryChatAvailability) {
      setError('Restart Transgentic to load background availability checks.');
      return;
    }
    setRefreshing(true);
    try { await api.recheckTemporaryChatAvailability(provider); }
    catch { setError('Could not check provider.'); }
    finally { setRefreshing(false); }
  };
  const navigateMenu = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape' || event.key === 'Tab') {
      close();
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); }
      return;
    }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const items = Array.from(menu.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') || []);
    const current = items.indexOf(document.activeElement as HTMLButtonElement);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1
      : (current + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
    items[next]?.focus();
  };

  return <div className="inline-flex min-w-0 items-center gap-1 text-[10px] font-mono">
    <span ref={statusDot} tabIndex={0} role="img" aria-label={description} aria-describedby={tooltipOpen ? tooltipId : undefined}
      onMouseEnter={() => setTooltipOpen(true)} onMouseLeave={() => { if (document.activeElement !== statusDot.current) setTooltipOpen(false); }}
      onFocus={() => setTooltipOpen(true)} onBlur={() => setTooltipOpen(false)}
      onKeyDown={event => { if (event.key === 'Escape') setTooltipOpen(false); }}
      className="inline-flex h-3 w-3 shrink-0 items-center justify-center rounded-full focus-visible:outline focus-visible:outline-cyan-400">
      <span className={`h-1.5 w-1.5 rounded-full ${dotColor}`} />
    </span>
    {unavailable ? <span>Temporary Unavailable</span> : <button ref={trigger} type="button" disabled={!provider || saving}
      aria-label={`Chat mode: ${chatModeLabels[selection]}`} aria-haspopup="menu" aria-expanded={open} aria-controls={open ? menuId : undefined}
      onClick={() => { setTooltipOpen(false); setOpen(value => !value); }}
      onKeyDown={event => { if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); setOpen(true); } }}
      className="inline-flex min-w-0 items-center gap-1 border-0 bg-transparent p-0 py-0 text-slate-500 transition-colors hover:text-slate-200 focus-visible:rounded-sm focus-visible:outline focus-visible:outline-cyan-400 disabled:cursor-default disabled:opacity-50">
      <span className="truncate">{chatModeLabels[selection]}</span>
      <ChevronDown aria-hidden="true" className={`h-3 w-3 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
    </button>}
    <span className="sr-only" role={error ? 'alert' : 'status'}>{status}</span>
    {tooltipOpen && createPortal(<div ref={tooltip} id={tooltipId} role="tooltip" style={tooltipPosition}
      className="pointer-events-none fixed z-[1100] w-60 max-w-[calc(100vw-16px)] rounded-lg border border-white/10 bg-slate-950 px-2.5 py-2 text-left text-[10px] font-mono leading-relaxed text-slate-300 shadow-xl">
      {description}
    </div>, document.body)}
    {open && createPortal(<div ref={menu} id={menuId} role="menu" aria-label={`Chat mode for ${mode} (${provider})`}
      onKeyDown={navigateMenu} style={position}
      className="fixed z-[1000] max-h-[calc(100vh-16px)] w-max min-w-48 max-w-[calc(100vw-16px)] overflow-y-auto rounded-xl border border-white/10 bg-[#191b20] p-1 text-[11px] font-mono text-slate-300 shadow-[0_12px_40px_rgba(0,0,0,0.5)]">
      {choices.map(([value, label]) => <button key={value} type="button" role="menuitemradio" aria-checked={selection === value}
        data-chat-mode-option tabIndex={-1} onClick={() => void choose(value)}
        className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-white/5 focus:bg-white/5 focus:outline-none">
        <span className="w-3 shrink-0">{selection === value && <Check aria-hidden="true" className="h-3 w-3 text-cyan-400" />}</span>
        {label}
      </button>)}
      {capability?.supported && <div role="separator" className="my-1 border-t border-white/10" />}
      {capability?.supported && <button type="button" role="menuitem" tabIndex={-1} onClick={() => void retry()}
        className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-slate-400 hover:bg-white/5 focus:bg-white/5 focus:outline-none">
        <RefreshCw aria-hidden="true" className="h-3 w-3" /> Recheck availability
      </button>}

    </div>, document.body)}
  </div>;
}
