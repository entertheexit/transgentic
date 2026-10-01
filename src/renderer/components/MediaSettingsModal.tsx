import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { MediaCapability, MediaPreferences, MediaSettings } from '../../shared/media.js';
import type { TaskMode } from '../../shared/types.js';

type ChoiceRecord = { values: MediaSettings; overrides: string[] };
type DesktopChoices = Record<string, ChoiceRecord>;
const storageKey = 'transgentic_media_choices_v1';
const recordKey = (c: MediaCapability) => `${c.provider}:${c.mode}`;
function readChoices(): DesktopChoices {
  try { const value = JSON.parse(localStorage.getItem(storageKey) || '{}'); return value && typeof value === 'object' && !Array.isArray(value) ? value : {}; } catch { return {}; }
}
function defaults(c: MediaCapability): MediaSettings { return Object.fromEntries(c.settings.map(s => [s.key, s.default])); }
function record(choices: DesktopChoices, c: MediaCapability): ChoiceRecord {
  const saved = choices[recordKey(c)];
  return { values: { ...defaults(c), ...(saved?.values && typeof saved.values === 'object' ? saved.values : {}) }, overrides: Array.isArray(saved?.overrides) ? saved.overrides : [] };
}
export function preferencesFromChoices(capabilities: MediaCapability[], choices: DesktopChoices): MediaPreferences {
  const primary = capabilities[0]; if (!primary) return {};
  const settings = { ...record(choices, primary).values };
  const provider_settings = Object.fromEntries(capabilities.slice(1).map(c => {
    const saved = record(choices, c);
    return [c.provider, Object.fromEntries(saved.overrides.map(key => [key, saved.values[key]]).filter(([, value]) => value !== undefined))];
  }));
  return { settings, provider_settings };
}
function incompatible(c: MediaCapability, values: MediaSettings) {
  return Object.entries(values).filter(([key, value]) => !c.settings.some(s => s.key === key && s.options.some(o => o.value === value))).map(([key, value]) => `${key}=${String(value)}`);
}
export async function desktopMediaSnapshot(mode: TaskMode): Promise<MediaPreferences | undefined> {
  if (!['image', 'video', 'music'].includes(mode)) return undefined;
  const choices = structuredClone(readChoices());
  const capabilities = await window.transgenticApi.getMediaConfiguration(mode);
  const preferences = preferencesFromChoices(capabilities, choices);
  if (capabilities[0]) {
    const invalid = incompatible(capabilities[0], preferences.settings || {});
    if (invalid.length) throw new Error(`Update media settings for ${capabilities[0].title}: ${invalid.join(', ')} is unavailable for the selected model.`);
  }
  return structuredClone(preferences);
}

export function MediaSettingsModal({ mode, routeIdentity, onClose }: { mode: TaskMode; routeIdentity: string; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [capabilities, setCapabilities] = useState<MediaCapability[]>([]);
  const [choices, setChoices] = useState<DesktopChoices>(readChoices);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const modal = dialog.current, trigger = document.activeElement as HTMLElement | null;
    modal?.showModal();
    return () => { modal?.close(); trigger?.focus(); };
  }, []);
  useEffect(() => {
    let active = true; setLoading(true); setError('');
    window.transgenticApi.getMediaConfiguration(mode).then((data: MediaCapability[]) => { if (active) setCapabilities(data); }).catch((e: Error) => { if (active) setError(e.message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [mode, routeIdentity]);
  const preferences = preferencesFromChoices(capabilities, choices);
  const primaryInvalid = capabilities[0] ? incompatible(capabilities[0], preferences.settings || {}) : [];
  const update = (c: MediaCapability, key: string, value: any, override?: boolean) => setChoices(previous => {
    const saved = record(previous, c);
    const flags = new Set(saved.overrides);
    if (override === true) flags.add(key); else if (override === false) flags.delete(key);
    return { ...previous, [recordKey(c)]: { values: { ...saved.values, [key]: value }, overrides: [...flags] } };
  });
  const save = () => {
    try { localStorage.setItem(storageKey, JSON.stringify(choices)); onClose(); } catch { setError('Could not save settings on this device.'); }
  };
  return createPortal(<dialog ref={dialog} onCancel={e => { e.preventDefault(); onClose(); }} aria-labelledby="media-settings-title"
    className="m-auto w-[calc(100%_-_2rem)] max-w-xl rounded-2xl border border-cyan-500/20 bg-slate-950 p-0 text-slate-100 shadow-2xl backdrop:bg-black/70">
    <div className="flex max-h-[85dvh] flex-col">
      <header className="flex shrink-0 items-center justify-between border-b border-white/10 p-4">
        <div><h2 id="media-settings-title" className="font-semibold">{mode.charAt(0).toUpperCase() + mode.slice(1)} settings</h2><p className="mt-1 text-xs text-slate-400">Quick Prompt preferences on this device</p></div>
        <button type="button" onClick={onClose} aria-label="Close media settings" className="rounded-lg p-2 focus-visible:outline focus-visible:outline-cyan-400">✕</button>
      </header>
      <div className="min-h-0 overflow-y-auto p-4 space-y-4">
        {loading && <p role="status">Loading recipe settings…</p>}
        {error && <p role="alert" className="text-sm text-rose-300">{error}</p>}
        {!loading && !capabilities.length && <p className="text-sm text-slate-400">This mode has no configurable media controls. Prompt, attachment and conversation controls remain available in the Hub.</p>}
        {capabilities.map((c, index) => {
          const saved = record(choices, c);
          const effective = index === 0 ? preferences.settings || {} : { ...defaults(c), ...preferences.settings, ...preferences.provider_settings?.[c.provider] };
          const unsupported = incompatible(c, effective);
          return <section key={recordKey(c)} className="rounded-xl border border-white/10 p-3 space-y-3">
            <div><h3 className="font-medium">{c.title} <span className="text-xs text-cyan-300">{index === 0 ? 'Primary' : `Fallback ${index}`}</span></h3>{c.model && <p className="break-all text-xs text-slate-400">{c.model}</p>}{!c.available && <p className="mt-1 text-xs text-amber-300">{c.unavailable_reason || 'Currently unavailable; check provider sign-in and recipe support.'} {index > 0 && 'This fallback will be skipped.'}</p>}</div>
            {!c.settings.length && <p className="text-sm text-slate-400">{c.available ? 'This recipe uses verified native automatic settings.' : 'No verified configurable media controls are available.'}</p>}
            {c.native_defaults && <p className="text-xs text-slate-400">Native defaults: {Object.entries(c.native_defaults).map(([key, value]) => `${key}: ${value}`).join(', ')}</p>}
            {c.settings.map(setting => {
              const overridden = index === 0 || saved.overrides.includes(setting.key);
              const value = effective[setting.key];
              const valid = setting.options.some(o => o.value === value);
              const id = `media-${index}-${setting.key}`;
              return <div key={setting.key} className="space-y-1">
                <div className="flex flex-wrap items-center justify-between gap-2"><label htmlFor={id} className="text-sm">{setting.label}</label>{index > 0 && <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={overridden} onChange={e => update(c, setting.key, valid ? value : setting.default, e.target.checked)} />Override inherited choice</label>}</div>
                <select id={id} disabled={!overridden} value={JSON.stringify(value)} onChange={e => update(c, setting.key, JSON.parse(e.target.value))} className="w-full rounded-lg border border-white/20 bg-slate-900 px-3 py-2 text-sm disabled:opacity-60 focus-visible:outline focus-visible:outline-cyan-400">
                  {!valid && <option value={JSON.stringify(value)}>Unavailable: {String(value)}</option>}
                  {setting.options.map(option => <option key={JSON.stringify(option.value)} value={JSON.stringify(option.value)}>{option.label}</option>)}
                </select>
                {index > 0 && !overridden && <p className="text-xs text-slate-400">{preferences.settings?.[setting.key] !== undefined ? 'Inherited from primary' : 'Recipe default'}</p>}
              </div>;
            })}
            {!!unsupported.length && <p role="status" className="break-words text-xs text-amber-300">{index === 0 ? 'Choose supported values or reset: ' : 'This fallback will be skipped. Unsupported inherited/overridden values: '}{unsupported.join(', ')}</p>}
          </section>;
        })}
      </div>
      <footer className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-white/10 p-4">
        <button type="button" onClick={() => setChoices(previous => { const next = { ...previous }; capabilities.forEach(c => delete next[recordKey(c)]); return next; })} className="mr-auto rounded-lg border border-white/20 px-3 py-2 text-xs">Reset to recipe defaults</button>
        <button type="button" onClick={onClose} className="rounded-lg border border-white/20 px-3 py-2 text-sm">Cancel</button>
        <button type="button" onClick={save} disabled={loading || !!error || !!primaryInvalid.length} className="rounded-lg bg-cyan-400 px-4 py-2 text-sm font-medium text-slate-950 disabled:opacity-40">Save</button>
      </footer>
    </div>
  </dialog>, document.body);
}
