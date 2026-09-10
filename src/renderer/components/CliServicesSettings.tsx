import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, ChevronDown, CircleAlert, Clock3, Code2, Copy, ExternalLink, FolderGit2, HardDrive, KeyRound, LoaderCircle, PencilLine, Power, RefreshCw, ShieldCheck, Terminal, X } from 'lucide-react';
import { CLI_DEFINITIONS, defaultCliService, type CliModelDiscovery, type CliProviderId, type CliState, type CliPermissions } from '../../shared/cli.js';
import type { ServicesManifest } from '../../shared/types.js';
import { loadCliState } from '../utils/cliStateLoader.js';
import { soundFx } from '../audio/soundFx.js';

type Props = { manifest?: ServicesManifest | null; selectedProvider: CliProviderId; onToggleService: (id: CliProviderId, enabled: boolean) => Promise<any> };
const actionClass = 'group inline-flex items-center justify-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.035] px-3 py-2 text-[10px] font-semibold text-slate-300 transition-all hover:border-cyan-500/30 hover:bg-cyan-500/[0.08] hover:text-cyan-200 disabled:cursor-not-allowed disabled:opacity-35';

function GlowSwitch({ checked, disabled, onChange, label }: { checked: boolean; disabled?: boolean; onChange: (checked: boolean) => void; label: string }) {
  return <label className={`flex items-center justify-between gap-3 ${disabled ? 'cursor-not-allowed opacity-45' : 'cursor-pointer'} select-none`}>
    <span className="text-[11px] text-slate-300">{label}</span>
    <input className="sr-only peer" type="checkbox" checked={checked} disabled={disabled} onChange={e => onChange(e.target.checked)} />
    <span className="relative h-5 w-9 shrink-0 rounded-full border border-white/10 bg-slate-800 shadow-inner transition-colors peer-checked:border-cyan-400/40 peer-checked:bg-cyan-500/70 peer-focus-visible:ring-2 peer-focus-visible:ring-cyan-400/50 after:absolute after:left-[2px] after:top-[2px] after:h-3.5 after:w-3.5 after:rounded-full after:bg-slate-300 after:shadow after:transition-transform peer-checked:after:translate-x-4 peer-checked:after:bg-white" />
  </label>;
}

let memoryCachedCliState: CliState | undefined;
const memoryCachedCliModels: Partial<Record<CliProviderId, CliModelDiscovery>> = {};

export function setCachedCliState(state: CliState) {
  memoryCachedCliState = state;
}

export function getCachedCliState(): CliState | undefined {
  return memoryCachedCliState;
}

export function CliServicesSettings({ manifest, selectedProvider: id, onToggleService }: Props) {
  const api = window.transgenticApi;
  const [state, setState] = useState<CliState | undefined>(memoryCachedCliState);
  const [busy, setBusy] = useState<string>();
  const [notice, setNotice] = useState('');
  const [copiedLogin, setCopiedLogin] = useState(false);
  const [showWorkspaces, setShowWorkspaces] = useState(false);
  const [modelDiscovery, setModelDiscovery] = useState<CliModelDiscovery | undefined>(memoryCachedCliModels[id]);
  const [isFetchingModels, setIsFetchingModels] = useState(false);
  const [customModelEditing, setCustomModelEditing] = useState(false);
  const load = () => {
    setNotice('');
    void loadCliState(api)
      .then(s => {
        memoryCachedCliState = s;
        setState(s);
      })
      .catch((error: Error) => {
        if (!state) setNotice(error.message);
      });
  };
  useEffect(load, []);
  useEffect(() => {
    setNotice('');
    setCopiedLogin(false);
    setModelDiscovery(memoryCachedCliModels[id]);
    setCustomModelEditing(false);
  }, [id]);
  const fetchModels = async (force = false) => {
    if (typeof api?.fetchCliModels !== 'function') return;
    setIsFetchingModels(true);
    try {
      const result = await api.fetchCliModels(id, force);
      memoryCachedCliModels[id] = result;
      setModelDiscovery(result);
    } catch {
      const result: CliModelDiscovery = { provider: id, state: 'error', models: [], message: 'Could not fetch this CLI model list. You can enter a model manually.', fetchedAt: Date.now() };
      memoryCachedCliModels[id] = result;
      setModelDiscovery(result);
    } finally {
      setIsFetchingModels(false);
    }
  };
  const executableKey = state?.statuses[id]?.executablePath || state?.config.services[id]?.executablePath || '';
  useEffect(() => {
    let active = true;
    if (typeof api?.fetchCliModels !== 'function') return;
    setIsFetchingModels(true);
    void api.fetchCliModels(id, false).then((result: CliModelDiscovery) => {
      if (!active) return;
      memoryCachedCliModels[id] = result;
      setModelDiscovery(result);
    }).catch(() => {
      if (!active) return;
      const result: CliModelDiscovery = { provider: id, state: 'error', models: [], message: 'Could not fetch this CLI model list. You can enter a model manually.', fetchedAt: Date.now() };
      memoryCachedCliModels[id] = result;
      setModelDiscovery(result);
    }).finally(() => { if (active) setIsFetchingModels(false); });
    return () => { active = false; };
  }, [api, id, executableKey]);
  useEffect(() => {
    if (!showWorkspaces) return;
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') setShowWorkspaces(false); };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [showWorkspaces]);
  const run = async (key: string, fn: () => Promise<any>) => {
    soundFx.playClick(); setBusy(key); setNotice('');
    try {
      const result = await fn();
      if (result?.config) {
        memoryCachedCliState = result;
        setState(result);
      } else if (typeof result === 'string') {
        setNotice(result);
      }
    } catch (error: any) {
      setNotice(error?.message || 'CLI action failed.');
    } finally {
      try {
        const fresh = await api!.getCliState!();
        memoryCachedCliState = fresh;
        setState(fresh);
      } catch {}
      setBusy(undefined);
    }
  };
  const statusTone = useMemo(() => {
    const value = state?.statuses[id]?.state;
    if (value === 'ready' || value === 'available') return 'emerald';
    if (value === 'busy') return 'cyan';
    if (value === 'error' || value === 'authentication_required' || value === 'incompatible') return 'rose';
    return 'slate';
  }, [id, state]);

  if (!state) {
    return (
      <div className="tactile-core-card flex min-h-[280px] flex-col items-center justify-center rounded-2xl border border-cyan-500/15 p-8 text-center">
        <LoaderCircle className="h-6 w-6 animate-spin text-cyan-400" />
        <p className="mt-3 text-xs font-medium text-slate-300">{notice || 'Connecting to CLI services…'}</p>
        <p className="mt-1 text-[10px] text-slate-500">Checking native permissions and available binaries</p>
      </div>
    );
  }
  const definition = CLI_DEFINITIONS[id];
  const config = state.config.services[id] || defaultCliService();
  const status = state.statuses[id];
  const enabled = manifest?.services[id]?.enabled === true;
  const agentic = config.workMode === 'agentic';
  const configurePermission = (key: keyof CliPermissions, value: boolean) => run(`${id}-${key}`, () => api!.configureCli!(id, { [key]: value }));

  return <section className="space-y-3" aria-label={`${definition.name} settings`}>
    {notice && <div role="status" className="rounded-xl border border-cyan-500/25 bg-cyan-500/[0.07] px-3 py-2.5 text-[10.5px] leading-relaxed text-cyan-100 shadow-[0_0_18px_rgba(6,182,212,0.06)]">{notice}</div>}
    {!state.sandboxAvailable && <div className="flex gap-2 rounded-xl border border-amber-500/25 bg-amber-500/[0.07] p-3 text-[10.5px] text-amber-100"><CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />This device cannot currently enforce Transgentic CLI permissions.</div>}
    <article className="tactile-core-card overflow-hidden rounded-2xl border border-cyan-500/15 shadow-[0_0_24px_rgba(6,182,212,0.055)]">
      <div className="relative flex items-center justify-between gap-3 p-3.5 after:absolute after:bottom-0 after:left-3.5 after:right-3.5 after:h-px after:bg-white/5">
        <div className="flex min-w-0 items-center gap-3"><div className="service-icon-box flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-cyan-300"><Terminal className="h-4 w-4" /></div><div className="min-w-0"><div className="flex min-w-0 items-center gap-2"><h3 className="truncate text-xs font-bold uppercase tracking-wide text-slate-100">{definition.name}</h3><span className="rounded-md border border-white/10 bg-black/25 px-1.5 py-0.5 text-[8px] font-mono uppercase tracking-wider text-slate-500">Built in</span></div><div className={`mt-1 flex items-center gap-1.5 text-[9.5px] font-mono ${statusTone === 'emerald' ? 'text-emerald-400' : statusTone === 'cyan' ? 'text-cyan-300' : statusTone === 'rose' ? 'text-rose-300' : 'text-slate-500'}`}>{statusTone === 'emerald' ? <CheckCircle2 className="h-3 w-3" /> : statusTone === 'cyan' ? <LoaderCircle className="h-3 w-3 animate-spin" /> : <CircleAlert className="h-3 w-3" />}<span>{status?.state?.replaceAll('_', ' ') || 'not checked'}</span></div></div></div>
        <label className={`relative inline-flex shrink-0 items-center ${busy ? 'cursor-not-allowed opacity-45' : 'cursor-pointer'}`} title={`${enabled ? 'Disable' : 'Enable'} ${definition.name}`}>
          <input className="peer sr-only" type="checkbox" checked={enabled} disabled={Boolean(busy)} onChange={event => void run(`${id}-enabled`, () => onToggleService(id, event.target.checked))} aria-label={`${enabled ? 'Disable' : 'Enable'} ${definition.name}`} />
          <span className="relative h-5 w-9 rounded-full border border-white/10 bg-slate-800 shadow-inner transition-colors peer-checked:border-cyan-400/40 peer-checked:bg-cyan-500/70 peer-focus-visible:ring-2 peer-focus-visible:ring-cyan-400/50 after:absolute after:left-[2px] after:top-[2px] after:h-3.5 after:w-3.5 after:rounded-full after:bg-slate-300 after:shadow after:transition-transform peer-checked:after:translate-x-4 peer-checked:after:bg-white" />
        </label>
      </div>
      <div className="space-y-4 p-4">
        {status?.message && <p className="rounded-xl border border-white/[0.06] bg-black/20 px-3 py-2 text-[10px] leading-relaxed text-slate-400">{status.message}</p>}

        {/* Executable binary path & file picker */}
        <div className="flex items-center justify-between gap-2.5 rounded-xl border border-white/[0.07] bg-black/30 p-2.5">
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-slate-400">
              <HardDrive className="h-3.5 w-3.5" />
            </div>
            <div className="min-w-0">
              <div className="text-[8.5px] font-mono uppercase tracking-wider text-slate-500">Executable Binary</div>
              <div className="truncate font-mono text-[10px] text-slate-300" title={status?.executablePath || config.executablePath}>
                {status?.executablePath || config.executablePath || `Auto-detect (${definition.executable})`}
              </div>
            </div>
          </div>
          <button
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-1.5 text-[10px] font-semibold text-slate-300 transition-all hover:border-cyan-500/30 hover:bg-cyan-500/10 hover:text-cyan-200 disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer"
            disabled={Boolean(busy)}
            onClick={() => void run(`${id}-choose`, () => api!.selectCliExecutable!(id))}
            title="Browse and select custom executable binary"
          >
            <FolderGit2 className="h-3 w-3 text-cyan-400" />
            <span>Choose Executable</span>
          </button>
        </div>

        {/* CLI Action Toolbar: Test, Check, Copy Sign-in, Guide */}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {/* 1. Test Connection (Hero Primary Action) */}
          <button
            className="group relative flex items-center justify-center gap-2 overflow-hidden rounded-xl border border-cyan-500/40 bg-gradient-to-r from-cyan-500/20 via-cyan-500/15 to-teal-500/20 px-3 py-2 text-[10.5px] font-semibold text-cyan-200 shadow-[0_0_14px_rgba(6,182,212,0.18)] transition-all hover:border-cyan-400/60 hover:from-cyan-500/30 hover:to-teal-500/30 hover:text-white hover:shadow-[0_0_20px_rgba(6,182,212,0.3)] disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer"
            disabled={Boolean(busy) || !state.sandboxAvailable}
            onClick={() => void run(`${id}-test`, () => api!.testCli!(id))}
            title={!state.sandboxAvailable ? 'CLI permission sandbox unavailable on this machine' : 'Send a test prompt to verify native CLI connection'}
          >
            {busy === `${id}-test` ? (
              <LoaderCircle className="h-3.5 w-3.5 shrink-0 animate-spin text-cyan-300" />
            ) : (
              <Power className="h-3.5 w-3.5 shrink-0 text-cyan-400 transition-transform group-hover:scale-110" />
            )}
            <span className="truncate">{busy === `${id}-test` ? 'Testing…' : 'Test Connection'}</span>
          </button>

          {/* 2. Check Installation */}
          <button
            className="group flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.035] px-3 py-2 text-[10.5px] font-semibold text-slate-200 transition-all hover:border-cyan-500/30 hover:bg-cyan-500/[0.08] hover:text-cyan-200 disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer shadow-sm"
            disabled={Boolean(busy)}
            onClick={() => void run(`${id}-probe`, () => api!.probeCli!(id))}
            title="Probe system PATH and check installed binary version"
          >
            <RefreshCw className={`h-3.5 w-3.5 shrink-0 transition-transform ${busy === `${id}-probe` ? 'animate-spin text-cyan-400' : 'text-slate-400 group-hover:rotate-45 group-hover:text-cyan-300'}`} />
            <span className="truncate">{busy === `${id}-probe` ? 'Checking…' : 'Check Installation'}</span>
          </button>

          {/* 3. Copy Sign-in */}
          <button
            className={`group flex items-center justify-center gap-2 rounded-xl border px-3 py-2 text-[10.5px] font-semibold transition-all cursor-pointer shadow-sm ${
              copiedLogin
                ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-200 shadow-[0_0_12px_rgba(16,185,129,0.2)]'
                : 'border-white/10 bg-white/[0.035] text-slate-200 hover:border-amber-500/30 hover:bg-amber-500/[0.08] hover:text-amber-200'
            }`}
            onClick={() => void run(`${id}-login`, async () => {
              await navigator.clipboard.writeText(definition.login);
              setCopiedLogin(true);
              setTimeout(() => setCopiedLogin(false), 2200);
              return `Copied "${definition.login}". Run it in your terminal, then test the connection.`;
            })}
            title={`Copy login command (${definition.login}) to clipboard`}
          >
            {copiedLogin ? (
              <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
            ) : (
              <KeyRound className="h-3.5 w-3.5 shrink-0 text-amber-400/80 transition-transform group-hover:rotate-12 group-hover:text-amber-300" />
            )}
            <span className="truncate">{copiedLogin ? 'Copied Command!' : 'Copy Sign-in'}</span>
          </button>

          {/* 4. Guide */}
          <a
            className="group flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.035] px-3 py-2 text-[10.5px] font-semibold text-slate-200 transition-all hover:border-teal-500/30 hover:bg-teal-500/[0.08] hover:text-teal-200 shadow-sm cursor-pointer"
            href={definition.docs}
            target="_blank"
            rel="noreferrer"
            title={`Open official ${definition.name} documentation in browser`}
          >
            <ExternalLink className="h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-teal-300" />
            <span className="truncate">Guide</span>
          </a>
        </div>
        <div>
          <div className="mb-2 flex items-center justify-between"><span className="text-[10px] font-mono uppercase tracking-[0.14em] text-slate-400">Work mode</span><button className={actionClass} onClick={() => setShowWorkspaces(true)}><FolderGit2 className="h-3.5 w-3.5" />Workspaces</button></div>
          <div className="grid grid-cols-2 gap-1 rounded-xl border border-white/[0.06] bg-black/35 p-1">{(['provider', 'agentic'] as const).map(mode => <button key={mode} disabled={Boolean(busy)} onClick={() => void run(`${id}-mode`, () => api!.configureCli!(id, { workMode: mode }))} className={`flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-[10.5px] font-semibold transition-all ${config.workMode === mode ? 'border border-cyan-500/40 bg-cyan-500/15 text-cyan-200 shadow-[0_0_14px_rgba(6,182,212,0.13)]' : 'border border-transparent text-slate-500 hover:bg-white/5 hover:text-slate-300'}`}>{mode === 'provider' ? <ShieldCheck className="h-3.5 w-3.5" /> : <Code2 className="h-3.5 w-3.5" />}{mode === 'provider' ? 'Provider Mode' : 'Agentic Mode'}</button>)}</div>
          <p className="mt-2 px-1 text-[10px] leading-relaxed text-slate-400">{agentic ? 'Work in a registered project on this Transgentic machine. You control editing and command access independently.' : 'Answer only from context supplied by the client. The client owns its project, files, commands, and conversation history.'}</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="block">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[9.5px] font-mono uppercase tracking-wider text-slate-500">Model override</span>
              <button type="button" disabled={isFetchingModels || Boolean(busy)} onClick={() => void fetchModels(true)} className="rounded-md p-0.5 text-slate-600 transition hover:bg-cyan-500/10 hover:text-cyan-300 disabled:cursor-wait disabled:opacity-45" title={modelDiscovery?.message || 'Refresh models from the native CLI'} aria-label={`Refresh ${definition.name} models`}><RefreshCw className={`h-3 w-3 ${isFetchingModels ? 'animate-spin text-cyan-400' : ''}`} /></button>
            </div>
            {modelDiscovery?.state === 'available' && modelDiscovery.models.length > 0 && !customModelEditing ? <div className="relative mt-1.5">
              <select value={config.model || ''} disabled={Boolean(busy)} onChange={event => { const value = event.target.value; if (value === '__custom__') { setCustomModelEditing(true); return; } void run(`${id}-model`, () => api!.configureCli!(id, { model: value })); }} className="w-full appearance-none truncate rounded-xl border border-white/10 bg-black/30 px-3 py-2 pr-8 text-xs text-slate-200 outline-none transition focus:border-cyan-500/40 disabled:cursor-not-allowed disabled:opacity-45" title={config.model || 'CLI default'}>
                <option value="">CLI default</option>
                {config.model && !modelDiscovery.models.some(model => model.id === config.model) && <option value={config.model}>{config.model} · Current override</option>}
                {modelDiscovery.models.map(model => <option key={model.id} value={model.id}>{model.name === model.id ? model.id : `${model.name} · ${model.id}`}</option>)}
                <option value="__custom__">Custom model…</option>
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
            </div> : <input key={`${id}-${config.model || ''}-${customModelEditing ? 'custom' : 'manual'}`} autoFocus={customModelEditing} defaultValue={config.model || ''} placeholder="CLI default" title={modelDiscovery?.message} className="mt-1.5 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-xs text-slate-200 outline-none transition focus:border-cyan-500/40" onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur(); if (event.key === 'Escape' && customModelEditing) { event.currentTarget.value = config.model || ''; setCustomModelEditing(false); } }} onBlur={event => { const value = event.target.value.trim(); const changed = value !== (config.model || ''); if (changed) void run(`${id}-model`, () => api!.configureCli!(id, { model: value })).finally(() => setCustomModelEditing(false)); else setCustomModelEditing(false); }} />}
          </div>
          <label className="block"><span className="text-[9.5px] font-mono uppercase tracking-wider text-slate-500">Timeout</span><div className="mt-1.5 flex items-center rounded-xl border border-white/10 bg-black/30 px-3"><Clock3 className="h-3.5 w-3.5 text-slate-500" /><input type="number" min={10} max={1800} defaultValue={config.timeoutSeconds} className="w-full bg-transparent px-2 py-2 text-xs text-slate-200 outline-none" onBlur={e => { if (Number(e.target.value) !== config.timeoutSeconds) void run(`${id}-timeout`, () => api!.configureCli!(id, { timeoutSeconds: Number(e.target.value) })); }} /><span className="text-[9px] text-slate-500">sec</span></div></label>
        </div>
        <div className={`grid gap-2 rounded-xl border p-3 sm:grid-cols-2 ${agentic ? 'border-purple-500/15 bg-purple-500/[0.035]' : 'border-white/[0.05] bg-black/15'}`}><GlowSwitch checked={agentic && config.allowProjectEditing} disabled={!agentic || Boolean(busy)} label="Allow project editing" onChange={value => void configurePermission('allowProjectEditing', value)} /><GlowSwitch checked={agentic && config.allowCommands} disabled={!agentic || Boolean(busy)} label="Allow commands" onChange={value => void configurePermission('allowCommands', value)} /></div>
      </div>
    </article>
    <p className="px-1 text-[9.5px] leading-relaxed text-slate-500">Connection tests use your native CLI login. Provider Mode never receives a host workspace. Changing work mode or permissions stops active CLI work.</p>

    {showWorkspaces && <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Registered CLI workspaces" onMouseDown={event => { if (event.target === event.currentTarget) setShowWorkspaces(false); }}><div className="tactile-core-card flex max-h-[82vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-cyan-500/25 shadow-[0_0_60px_rgba(6,182,212,0.16)]">
      <div className="flex items-center justify-between border-b border-white/[0.07] bg-gradient-to-r from-cyan-500/[0.08] to-transparent p-4"><div className="flex items-center gap-3"><div className="rounded-xl border border-cyan-500/25 bg-cyan-500/10 p-2 text-cyan-300"><FolderGit2 className="h-4 w-4" /></div><div><h3 className="text-sm font-bold text-slate-100">Registered workspaces</h3><p className="text-[9.5px] text-slate-500">Shared registry for all built-in CLI services</p></div></div><button className="rounded-lg p-2 text-slate-500 transition hover:bg-white/5 hover:text-slate-200" onClick={() => setShowWorkspaces(false)} aria-label="Close workspaces"><X className="h-4 w-4" /></button></div>
      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {!state.config.workspaces.length && <div className="rounded-2xl border border-dashed border-white/10 bg-black/20 px-5 py-8 text-center"><FolderGit2 className="mx-auto h-7 w-7 text-slate-600" /><p className="mt-2 text-xs text-slate-300">No host projects registered</p><p className="mt-1 text-[10px] text-slate-500">Provider Mode does not need a workspace.</p></div>}
        {state.config.workspaces.map(workspace => <article key={workspace.id} className="rounded-2xl border border-white/[0.08] bg-black/25 p-3.5"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><h4 className="truncate text-xs font-semibold text-slate-200">{workspace.name}</h4><p className="mt-1 truncate font-mono text-[9px] text-slate-500" title={workspace.path}>{workspace.path}</p></div><button className="rounded-lg border border-rose-500/15 bg-rose-500/[0.05] px-2 py-1 text-[9px] text-rose-300 hover:bg-rose-500/10" disabled={Boolean(busy)} onClick={() => void run(workspace.id, () => api!.removeCliWorkspace!(workspace.id))}>Remove</button></div>
          <div className="mt-3 flex flex-wrap items-center gap-2"><button className={actionClass} onClick={() => void run(`${workspace.id}-copy`, async () => { await navigator.clipboard.writeText(workspace.id); return 'Workspace ID copied.'; })}><Copy className="h-3 w-3" />Copy ID</button><div className="min-w-[220px] flex-1"><GlowSwitch checked={workspace.allowMcp} disabled={Boolean(busy)} label="Allow authenticated MCP clients" onChange={value => void run(`${workspace.id}-mcp`, () => api!.updateCliWorkspace!(workspace.id, { grants: workspace.grants, allowMcp: value }))} /></div></div>
          <div className="mt-3 grid gap-2 border-t border-white/[0.06] pt-3 sm:grid-cols-2"><GlowSwitch checked={workspace.grants[id]?.allowProjectEditing === true} disabled={Boolean(busy)} label={`${definition.name}: editing`} onChange={value => void run(`${workspace.id}-edit`, () => api!.updateCliWorkspace!(workspace.id, { allowMcp: workspace.allowMcp, grants: { ...workspace.grants, [id]: { allowCommands: workspace.grants[id]?.allowCommands === true, allowProjectEditing: value } } }))} /><GlowSwitch checked={workspace.grants[id]?.allowCommands === true} disabled={Boolean(busy)} label={`${definition.name}: commands`} onChange={value => void run(`${workspace.id}-commands`, () => api!.updateCliWorkspace!(workspace.id, { allowMcp: workspace.allowMcp, grants: { ...workspace.grants, [id]: { allowProjectEditing: workspace.grants[id]?.allowProjectEditing === true, allowCommands: value } } }))} /></div>
        </article>)}
      </div>
      <div className="flex items-center justify-between border-t border-white/[0.07] bg-black/20 p-4"><p className="text-[9.5px] text-slate-500"><PencilLine className="mr-1 inline h-3 w-3" />Grants apply only in Agentic Mode.</p><button className={`${actionClass} border-cyan-500/25 bg-cyan-500/10 text-cyan-200`} disabled={Boolean(busy)} onClick={() => void run('workspace-add', () => api!.addCliWorkspace!())}><FolderGit2 className="h-3.5 w-3.5" />Add workspace</button></div>
    </div></div>}
  </section>;
}
