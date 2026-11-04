import React, { useState } from 'react';
import { resolveChatMode, type ChatModeSelection, type ProviderStatus, type RouteMode, type TransgenticConfig } from '../../shared/types.js';

export function ChatModeControl({ config, mode, provider, capability, onOpenProvider }: {
  config: TransgenticConfig; mode: RouteMode; provider?: string;
  capability?: ProviderStatus['temporaryChat']; onOpenProvider?: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const selection = resolveChatMode(config, mode, provider || '');
  const choices: Array<[ChatModeSelection, string]> = [['normal', 'Normal']];
  if (capability?.supported) {
    if (capability.variants?.length) {
      if (capability.variants.includes('personalized')) choices.push(['temporary-personalized', 'Temporary · Personalized']);
      if (capability.variants.includes('unpersonalized')) choices.push(['temporary-unpersonalized', 'Temporary · Unpersonalized']);
    } else choices.push(['temporary', 'Temporary']);
  }
  const status = !provider ? 'Select a service' : !capability ? 'Status unavailable' : !capability.supported ? 'Temporary Chat unsupported'
    : capability.checking ? 'Checking…' : capability.reason?.startsWith('Sign in') ? 'Sign in required'
      : capability.checkFailed ? 'Couldn’t verify' : capability.availability === 'unavailable' ? 'Unavailable'
        : 'Verified when starting';
  const choose = async (value: ChatModeSelection) => {
    if (!provider || !window.transgenticApi) return;
    setSaving(true); setError('');
    try {
      await window.transgenticApi.updateConfig({ chatModes: { ...config.chatModes,
        [mode]: { ...config.chatModes?.[mode], [provider]: value } } });
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not save chat mode.'); }
    finally { setSaving(false); }
  };
  return <div className="min-w-0 space-y-1" title="Personalization controls provider memory, plugins, and custom instructions. Transgentic Recall, local logs, and Library files follow existing settings. Changes apply to the next request in a fresh conversation.">
    <div className="flex flex-wrap gap-1" role="group" aria-label={`Chat mode for ${mode} (${provider || 'no service'})`}>
      {choices.map(([value, label]) => <button key={value} type="button" aria-pressed={selection === value}
        disabled={!provider || saving} onClick={() => void choose(value)}
        className={`rounded-lg border px-2 py-1 text-[10px] focus-visible:outline focus-visible:outline-cyan-400 ${selection === value ? 'border-indigo-400 bg-indigo-500/20 text-indigo-200' : 'border-white/10 text-slate-400 hover:bg-white/5'}`}>{label}</button>)}
    </div>
    <div className="flex flex-wrap items-center gap-2 text-[10px] text-slate-400" role="status">
      <span>{status}</span>
      {provider && capability?.supported && <button type="button" onClick={() => void window.transgenticApi?.reloadProvider(provider).catch(() => setError('Could not check provider.'))}>Retry</button>}
      {provider && onOpenProvider && <button type="button" onClick={onOpenProvider}>Open Provider</button>}
      {error && <span role="alert">{error}</span>}
    </div>
  </div>;
}
