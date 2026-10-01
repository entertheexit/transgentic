import { describe, expect, it, vi } from 'vitest';
import vm from 'node:vm';
import { BUILTIN_RECIPES, validateCustomRecipe } from '../src/shared/types/recipe.js';
import { mediaCapability, normalizeMediaPreferences, resolveMediaSettings, validateGeneration, type MediaLocator } from '../src/shared/media.js';
import { applyMediaControls, findMediaControl } from '../src/main/webviews/mediaControls.js';
import { desktopMediaSnapshot, preferencesFromChoices } from '../src/renderer/components/MediaSettingsModal.js';

const recipe = BUILTIN_RECIPES.gemini;
const locator: MediaLocator = { scope: '#options', selectors: '[role=radio]', index: 1, expectedCount: 2, identities: ['short', 'standard'], identityAttribute: 'data-value' };
function fixture({ values = ['short', 'standard'], width = 1000, hidden = false, disabled = false, scopeCount = 1 } = {}) {
  let selected = -1;
  const options = values.map((value, i) => ({
    tagName: 'BUTTON', textContent: ['สั้น', 'มาตรฐาน'][i] || value,
    getAttribute: (key: string) => key === 'data-value' ? value : key === 'aria-checked' ? String(selected === i) : key === 'role' ? 'radio' : null,
    hasAttribute: (key: string) => key === 'disabled' && disabled,
    getBoundingClientRect: () => ({ width: hidden ? 0 : 100, height: 20 }),
    querySelector: () => null, closest() { return this; }, click: () => { selected = i; },
  }));
  const scope = { getBoundingClientRect: () => ({ width: 100, height: 200 }), querySelectorAll: () => options };
  return { document: { querySelectorAll: (selector: string) => selector === '#compact' && width >= 768 ? [] : selector === '#options' || selector === '#compact' ? Array(scopeCount).fill(scope) : [] }, innerWidth: width, getComputedStyle: () => ({ display: 'block', visibility: 'visible', opacity: '1' }), select: (i: number) => selected = i };
}
const find = (l: MediaLocator, context: object) => vm.runInNewContext(`(${findMediaControl.toString()})(${JSON.stringify(l)})`, context);

describe('Declarative media recipe contracts', () => {
  it.each(['gemini', 'grok', 'chatgpt'])('validates built-in %s settings', id => {
    expect(validateCustomRecipe(BUILTIN_RECIPES[id]).valid).toBe(true);
  });
  it('keeps old recipes readable without advertising unverified media controls', () => {
    const old = structuredClone(recipe); delete old.response.modes.music!.generation;
    expect(validateCustomRecipe(old).valid).toBe(true);
    expect(mediaCapability(old, 'music')?.available).toBe(false);
    expect(() => resolveMediaSettings(old, 'music')).toThrow('not been verified');
  });
  it('uses recipe defaults then common settings then provider overrides', () => {
    expect(resolveMediaSettings(recipe, 'music')).toEqual({ length: 'standard', vocals: 'custom', genre: 'custom' });
    expect(resolveMediaSettings(recipe, 'music', { settings: { length: 'short', genre: 'pop' }, provider_settings: { gemini: { genre: 'jazz_blues' } } })).toEqual({ length: 'short', vocals: 'custom', genre: 'jazz_blues' });
  });
  it('rejects incompatible fallback values unless a valid semantic override exists', () => {
    expect(() => resolveMediaSettings(BUILTIN_RECIPES.grok, 'image', { settings: { aspect_ratio: '3:4' } })).toThrow('MEDIA_SETTINGS_UNSUPPORTED');
    expect(resolveMediaSettings(BUILTIN_RECIPES.grok, 'image', { settings: { aspect_ratio: '3:4' }, provider_settings: { grok: { aspect_ratio: '1:1' } } })).toEqual({ quality: 'speed', aspect_ratio: '1:1' });
  });
  it('does not substitute defaults for explicit unsupported values', () => {
    expect(() => resolveMediaSettings(recipe, 'music', { settings: { length: 'long' } })).toThrow('MEDIA_SETTINGS_UNSUPPORTED');
    expect(() => resolveMediaSettings(recipe, 'image', { settings: { resolution: '8k' } })).toThrow('MEDIA_SETTINGS_UNSUPPORTED');
  });
  it('filters model-dependent settings and options and rejects unavailable defaults', () => {
    const r = structuredClone(recipe), gen = r.response.modes.music!.generation!;
    gen.models = ['a', 'b']; gen.settings[2].models = ['b']; gen.settings[0].options[0].models = ['b'];
    expect(mediaCapability(r, 'music', 'a')?.settings.map(s => s.key)).toEqual(['length', 'vocals']);
    expect(() => resolveMediaSettings(r, 'music', { settings: { length: 'short' } }, 'a')).toThrow('MEDIA_SETTINGS_UNSUPPORTED');
    expect(mediaCapability(r, 'music', 'c')?.available).toBe(false);
    gen.settings[0].default = 'short'; expect(mediaCapability(r, 'music', 'a')?.available).toBe(false);
  });
  it('never exposes internal selectors or indexes in public capabilities', () => {
    const json = JSON.stringify(mediaCapability(recipe, 'music'));
    expect(json).not.toMatch(/selectors|expectedCount|selectedWhen|activationSteps/);
  });
  it.each([{ settings: { 'bad-key': 1 } }, { settings: { sound: {} } }, { settings: { duration_seconds: Infinity } }, { provider_settings: [] }])('rejects malformed public settings %j', raw => expect(() => normalizeMediaPreferences(raw)).toThrow());
  it('requires count and scope guards for indexes and positive activation proof', () => {
    const g = structuredClone(recipe.response.modes.music!.generation!);
    delete g.activeWhen; expect(() => validateGeneration(g)).toThrow();
    const bad = structuredClone(recipe.response.modes.music!.generation!);
    (bad.settings[0].options[0].steps[1] as any).target.expectedCount = undefined;
    expect(() => validateGeneration(bad)).toThrow();
  });
  it('rejects executable actions and strips unknown executable fields', () => {
    const g: any = structuredClone(recipe.response.modes.music!.generation!);
    g.activationSteps = [{ action: 'javascript', code: 'alert(1)' }]; expect(() => validateGeneration(g)).toThrow();
    g.activationSteps = []; g.code = 'alert(1)'; expect(validateGeneration(g)).not.toHaveProperty('code');
  });
  it('snapshots desktop inheritance and explicit override flags independently', () => {
    const caps = [mediaCapability(recipe, 'image')!, mediaCapability(BUILTIN_RECIPES.grok, 'image')!];
    const choices = { 'gemini:image': { values: { aspect_ratio: '3:4' }, overrides: [] }, 'grok:image': { values: { aspect_ratio: '16:9', quality: 'quality_2' }, overrides: ['aspect_ratio'] } };
    const prefs = preferencesFromChoices(caps, choices);
    choices['gemini:image'].values.aspect_ratio = '1:1';
    expect(prefs).toEqual({ settings: { aspect_ratio: '3:4' }, provider_settings: { grok: { aspect_ratio: '16:9' } } });
    expect(resolveMediaSettings(recipe, 'image')).toEqual({ aspect_ratio: '1:1' });
  });
  it('captures saved choices at send time before asynchronous capability discovery', async () => {
    let saved = JSON.stringify({ 'gemini:image': { values: { aspect_ratio: '3:4' }, overrides: [] } });
    let finish!: (value: unknown) => void;
    vi.stubGlobal('localStorage', { getItem: () => saved });
    vi.stubGlobal('window', { transgenticApi: { getMediaConfiguration: () => new Promise(resolve => { finish = resolve; }) } });
    try {
      const pending = desktopMediaSnapshot('image');
      saved = JSON.stringify({ 'gemini:image': { values: { aspect_ratio: '16:9' }, overrides: [] } });
      finish([mediaCapability(recipe, 'image')!]);
      await expect(pending).resolves.toMatchObject({ settings: { aspect_ratio: '3:4' } });
    } finally { vi.unstubAllGlobals(); }
  });
});

describe('Guarded media control resolution', () => {
  it('waits for an animated option group to be complete before selecting', async () => {
    const context = fixture();
    const scope = context.document.querySelectorAll('#options')[0];
    const options = scope.querySelectorAll();
    let active = false, reads = 0;
    scope.querySelectorAll = () => ++reads === 1 ? options.slice(0, 1) : options;
    const click = vi.spyOn(options[1], 'click').mockImplementation(() => { active = true; });
    const original = context.document.querySelectorAll;
    context.document.querySelectorAll = (selector: string) => selector === '#active' ? active ? [options[1]] : [] : original(selector);
    const config = validateGeneration({ activationSteps: [{ action: 'click', target: locator }], activeWhen: { selectors: '#active' }, settings: [] });
    await expect(applyMediaControls(config, {}, async <T>(script: string): Promise<T> => vm.runInNewContext(script, context))).resolves.toBeTypeOf('function');
    expect(click).toHaveBeenCalledTimes(1);
    expect(reads).toBeGreaterThan(1);
  });
  it('opens pointer-driven controls without a second click and verifies the result', async () => {
    const context = fixture();
    const option = context.document.querySelectorAll('#options')[0].querySelectorAll()[1];
    const clicks = vi.spyOn(option, 'click');
    const events: any[] = [];
    Object.assign(option, { dispatchEvent(event: any) { events.push(event); context.select(1); return true; } });
    Object.assign(context, { PointerEvent: class { constructor(type: string, init: object) { Object.assign(this, { type }, init); } } });
    const config = validateGeneration({ activationSteps: [{ action: 'pointerDown', target: locator }], activeWhen: { ...locator, requiredAttributes: { 'aria-checked': 'true' } }, settings: [] });
    await expect(applyMediaControls(config, {}, async <T>(script: string): Promise<T> => vm.runInNewContext(script, context))).resolves.toBeTypeOf('function');
    expect(events).toEqual([expect.objectContaining({ type: 'pointerdown', button: 0, pointerType: 'mouse', bubbles: true })]);
    expect(clicks).not.toHaveBeenCalled();
  });
  it('allows conditional reset clicks but still requires positive verification', async () => {
    const context = fixture();
    const scripts: string[] = [];
    const run = async <T>(script: string): Promise<T> => { scripts.push(script); return vm.runInNewContext(script, context); };
    const config = validateGeneration({ activationSteps: [{ action: 'clickIfPresent', target: { selectors: '#missing' } }, { action: 'click', target: locator }], activeWhen: { ...locator, requiredAttributes: { 'aria-checked': 'true' } }, settings: [] });
    await expect(applyMediaControls(config, {}, run)).resolves.toBeTypeOf('function');
    expect(scripts.some(script => script.includes('#missing'))).toBe(true);
    expect(() => validateGeneration({ ...config, activationSteps: [{ action: 'evaluate', script: 'alert(1)' }] })).toThrow();
    const ambiguous = { ...config, activeWhen: { selectors: '#absent' }, activationSteps: [{ action: 'clickIfPresent' as const, target: { ...locator, scope: '#options' } }] };
    const badContext = fixture({ scopeCount: 2 });
    await expect(applyMediaControls(ambiguous, {}, async <T>(script: string): Promise<T> => vm.runInNewContext(script, badContext))).rejects.toThrow('ambiguous');
  });
  it('selects by zero-based identity despite localized labels', () => expect(find(locator, fixture())?.textContent).toBe('มาตรฐาน'));
  it.each([['reordered', ['standard', 'short']], ['missing', ['short']], ['additional', ['short', 'standard', 'long']]])('refuses %s options', (_name, values) => expect(() => find(locator, fixture({ values }))).toThrow());
  it('refuses ambiguous scopes and disabled options', () => {
    expect(() => find(locator, fixture({ scopeCount: 2 }))).toThrow('ambiguous');
    expect(() => find(locator, fixture({ disabled: true }))).toThrow('unavailable');
  });
  it('allows multiple visible overlays only when checking that all menus have closed', () => {
    const context = fixture();
    const overlays = context.document.querySelectorAll('#options')[0].querySelectorAll();
    context.document.querySelectorAll = () => [...overlays, ...overlays];
    expect(() => find({ selectors: '.overlay' }, context)).toThrow('ambiguous');
    expect(vm.runInNewContext(`(${findMediaControl.toString()})({selectors: '.overlay'}, true)`, context)).not.toBeNull();
  });
  it('uses compact locator variants and waits for missing/hidden controls', () => {
    const l = { ...locator, scope: '#missing', compact: { ...locator, scope: '#compact' } };
    expect(find(l, fixture({ width: 480 }))?.textContent).toBe('มาตรฐาน');
    expect(find(l, fixture({ width: 1000 }))).toBeNull();
    expect(find(locator, fixture({ hidden: true }))).toBeNull();
  });
  it('verifies selected values again after attachments and fails before dispatch if changed', async () => {
    const context = fixture();
    const config = { activationSteps: [], activeWhen: locator, settings: [{ key: 'length', label: 'Length', type: 'enum' as const, default: 'standard', options: [{ value: 'standard', label: 'Standard', steps: [{ action: 'click' as const, target: locator }], selectedWhen: { ...locator, requiredAttributes: { 'aria-checked': 'true' } } }] }] };
    const run = async <T>(script: string): Promise<T> => vm.runInNewContext(script, context);
    const verify = await applyMediaControls(config, { length: 'standard' }, run);
    await verify(); context.select(0);
    vi.useFakeTimers();
    try {
      const failed = expect(verify()).rejects.toThrow('MEDIA_SETTINGS_FAILED');
      await vi.advanceTimersByTimeAsync(5100);
      await failed;
    } finally { vi.useRealTimers(); }
  });
  it('preserves selected-value proof when compact variants only replace locators', () => {
    const l = { ...locator, requiredAttributes: { 'aria-checked': 'true' }, compact: { ...locator, scope: '#compact' } };
    const context = fixture({ width: 480 });
    context.select(1);
    expect(find(l, context)).not.toBeNull();
    context.select(0);
    expect(find(l, context)).toBeNull();
  });
  it('waits for menus to close before inspecting the next option group', async () => {
    let open = true, inspections = 0;
    const config = { activationSteps: [{ action: 'escape' as const }, { action: 'waitAbsent' as const, target: { selectors: '#overlay' } }], activeWhen: { selectors: '#active' }, settings: [] };
    const run = async <T>(script: string): Promise<T> => {
      if (script.includes('#active')) return (!open) as T;
      inspections++; if (inspections > 2) open = false;
      return open as T;
    };
    await applyMediaControls(config, {}, run, undefined, () => {});
    expect(inspections).toBe(3);
  });
});
