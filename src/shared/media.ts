import type { CustomRecipe, RecipeElementLocator } from './types/recipe.js';
import { ATTACHMENT_LIMITS } from './attachments.js';

export type MediaMode = 'image' | 'video' | 'music';
export type MediaValue = string | number | boolean;
export type MediaSettings = Record<string, MediaValue>;
export interface MediaPreferences { settings?: MediaSettings; provider_settings?: Record<string, MediaSettings> }
export interface MediaLocator extends RecipeElementLocator {
  scope?: string;
  index?: number;
  expectedCount?: number;
  identityAttribute?: string;
  identitySelector?: string;
  identities?: string[];
  requiredAttributes?: Record<string, string>;
  compact?: Omit<MediaLocator, 'compact'>;
}
export interface MediaClick { action: 'click' | 'clickIfPresent' | 'pointerDown'; target: MediaLocator }
export type MediaStep = MediaClick | { action: 'waitAbsent'; target: MediaLocator } | { action: 'escape' };
export interface MediaChoice {
  value: MediaValue;
  label: string;
  steps: MediaStep[];
  verificationSteps?: MediaStep[];
  closeSteps?: MediaStep[];
  selectedWhen: MediaLocator;
  models?: string[];
}
export interface MediaSetting {
  key: string;
  label: string;
  type: 'enum' | 'boolean' | 'number';
  default: MediaValue;
  models?: string[];
  options: MediaChoice[];
}
export interface RecipeGeneration {
  activationSteps: MediaStep[];
  activeWhen: MediaLocator;
  settings: MediaSetting[];
  models?: string[];
  nativeDefaults?: Record<string, MediaValue>;
}
export interface MediaCapability {
  provider: string;
  title: string;
  mode: MediaMode;
  model?: string;
  available: boolean;
  unavailable_reason?: string;
  native_defaults?: Record<string, MediaValue>;
  settings: Array<Pick<MediaSetting, 'key' | 'label' | 'type' | 'default'> & { options: Array<Pick<MediaChoice, 'value' | 'label'>> }>;
  attachments?: { acceptedKinds: string[]; acceptedMimeTypes?: string[]; multiple: boolean; maxFiles: number; maxFileBytes: number; maxTotalBytes: number };
}
const safeKey = /^[a-z][a-z0-9_]{0,63}$/;
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
export function normalizeMediaPreferences(raw: unknown): MediaPreferences {
  if (raw === undefined) return {};
  if (!object(raw)) throw new Error('Media preferences must be an object.');
  const settings = (v: unknown): MediaSettings => {
    if (!object(v)) throw new Error('Media settings must be an object.');
    const result: MediaSettings = {};
    if (Object.keys(v).length > 32) throw new Error('Too many media settings.');
    for (const [key, value] of Object.entries(v)) {
      if (!safeKey.test(key) || !['string', 'number', 'boolean'].includes(typeof value) || (typeof value === 'number' && !Number.isFinite(value)) || (typeof value === 'string' && value.length > 128)) throw new Error(`Invalid media setting "${key}".`);
      result[key] = value as MediaValue;
    }
    return result;
  };
  const result: MediaPreferences = {};
  if (raw.settings !== undefined) result.settings = settings(raw.settings);
  if (raw.provider_settings !== undefined) {
    if (!object(raw.provider_settings) || Object.keys(raw.provider_settings).length > 32) throw new Error('provider_settings must be an object.');
    result.provider_settings = {};
    for (const [id, values] of Object.entries(raw.provider_settings)) {
      if (!safeKey.test(id)) throw new Error('Invalid media provider ID.');
      result.provider_settings[id] = settings(values);
    }
  }
  return result;
}
export function mediaCapability(recipe: CustomRecipe, mode: MediaMode, model?: string, available = true): MediaCapability | undefined {
  const config = recipe.response.modes[mode];
  if (!config?.enabled) return undefined;
  const generation = config.generation;
  const modelSupported = !generation?.models || !!model && generation.models.includes(model);
  const definitions = (generation?.settings || []).filter(s => !s.models || !!model && s.models.includes(model));
  const settings = definitions.map(s => ({ key: s.key, label: s.label, type: s.type, default: s.default, options: s.options.filter(o => !o.models || !!model && o.models.includes(model)).map(o => ({ value: o.value, label: o.label })) }));
  const defaultsSupported = settings.every(s => s.options.some(o => o.value === s.default));
  return { provider: recipe.id, title: recipe.title, mode, model, available: available && !!generation && modelSupported && defaultsSupported,
    ...(!generation ? { unavailable_reason: 'Media controls have not been verified in this recipe.' } : !modelSupported || !defaultsSupported ? { unavailable_reason: 'Media controls are unavailable for this model.' } : !available ? { unavailable_reason: 'Provider is not authenticated or available.' } : {}),
    ...(generation?.nativeDefaults ? { native_defaults: generation.nativeDefaults } : {}), settings,
    ...(config.inputAttachments ? { attachments: { acceptedKinds: config.inputAttachments.acceptedKinds,
      ...(config.inputAttachments.acceptedMimeTypes ? { acceptedMimeTypes: config.inputAttachments.acceptedMimeTypes } : {}),
      multiple: config.inputAttachments.multiple === true,
      ...ATTACHMENT_LIMITS, maxFiles: config.inputAttachments.multiple === true ? ATTACHMENT_LIMITS.maxFiles : 1,
    } } : {}),
  };
}
export function resolveMediaSettings(recipe: CustomRecipe, mode: MediaMode, preferences: MediaPreferences = {}, model?: string, providerId = recipe.id): MediaSettings {
  const capability = mediaCapability(recipe, mode, model);
  if (!capability?.available) throw new Error(`[MEDIA_SETTINGS_UNSUPPORTED] ${recipe.title}: ${capability?.unavailable_reason || `does not support ${mode}`}`);
  const explicit = { ...preferences.settings, ...preferences.provider_settings?.[providerId] };
  const resolved: MediaSettings = Object.fromEntries(capability.settings.map(s => [s.key, s.default]));
  for (const [key, value] of Object.entries(explicit)) {
    const setting = capability.settings.find(s => s.key === key);
    if (!setting || !setting.options.some(o => o.value === value)) throw new Error(`[MEDIA_SETTINGS_UNSUPPORTED] ${recipe.title} cannot honor ${key}=${JSON.stringify(value)} for ${mode}.`);
    resolved[key] = value;
  }
  return resolved;
}

/** Strictly normalize declarative controls; never retain executable or unknown fields. */
export function validateGeneration(raw: unknown): RecipeGeneration {
  const fail = (): never => { throw new Error('Invalid generation controls: activation, settings and positive verification are required.'); };
  const locator = (v: any, nested = false): MediaLocator => {
    if (!object(v) || (!v.selectors && !v.role)) return fail();
    const list = (x: any): string | string[] | undefined => {
      if (x === undefined) return undefined;
      if (typeof x === 'string' && x.trim()) return x.trim();
      if (Array.isArray(x) && x.length && x.every(s => typeof s === 'string' && s.trim())) return x.map(s => s.trim());
      return fail();
    };
    if (v.index !== undefined && (!Number.isInteger(v.index) || (v.index as number) < 0 || typeof v.scope !== 'string' || !v.scope.trim() || !Number.isInteger(v.expectedCount) || (v.expectedCount as number) <= (v.index as number))) return fail();
    if (v.identities !== undefined && (!Array.isArray(v.identities) || v.identities.length !== v.expectedCount || !v.identities.every(s => typeof s === 'string') || typeof v.identityAttribute !== 'string')) return fail();
    if (v.requiredAttributes !== undefined && (!object(v.requiredAttributes) || Object.entries(v.requiredAttributes).some(([k, value]) => !/^[a-z][a-z0-9_-]*$/.test(k) || typeof value !== 'string'))) return fail();
    return { ...(v.selectors ? { selectors: list(v.selectors) } : {}), ...(v.role ? { role: String(v.role) } : {}), ...(v.name ? { name: list(v.name) } : {}), ...(v.nameMatch === 'contains' ? { nameMatch: 'contains' as const } : {}), ...(v.scope ? { scope: String(v.scope) } : {}), ...(v.index !== undefined ? { index: Number(v.index), expectedCount: Number(v.expectedCount) } : {}), ...(v.identities ? { identities: v.identities as string[], identityAttribute: String(v.identityAttribute), ...(v.identitySelector ? { identitySelector: String(v.identitySelector) } : {}) } : {}), ...(v.requiredAttributes ? { requiredAttributes: v.requiredAttributes as Record<string, string> } : {}), ...(!nested && v.compact ? { compact: locator(v.compact, true) } : {}) };
  };
  const steps = (v: any): MediaStep[] => {
    if (!Array.isArray(v) || v.length > 16) return fail();
    return v.map(s => s?.action === 'click' || s?.action === 'clickIfPresent' || s?.action === 'pointerDown' || s?.action === 'waitAbsent' ? { action: s.action, target: locator(s.target) } : s?.action === 'escape' ? { action: 'escape' } : fail());
  };
  if (!object(raw) || !Array.isArray(raw.settings) || raw.settings.length > 32) return fail();
  const keys = new Set<string>();
  const settings: MediaSetting[] = raw.settings.map((s: any) => {
    if (!s || !safeKey.test(s.key) || keys.has(s.key) || typeof s.label !== 'string' || !['enum', 'number', 'boolean'].includes(s.type) || !Array.isArray(s.options) || !s.options.length || s.options.length > 64) return fail();
    keys.add(s.key);
    const options = s.options.map((o: any) => {
      if (!o || typeof o.label !== 'string' || !['string', 'number', 'boolean'].includes(typeof o.value) || (s.type === 'boolean' && typeof o.value !== 'boolean') || (s.type === 'number' && (typeof o.value !== 'number' || !Number.isFinite(o.value)))) return fail();
      if (o.models !== undefined && (!Array.isArray(o.models) || !o.models.length || !o.models.every((m: unknown) => typeof m === 'string'))) return fail();
      return { value: o.value, label: o.label, steps: steps(o.steps), selectedWhen: locator(o.selectedWhen), ...(o.verificationSteps ? { verificationSteps: steps(o.verificationSteps) } : {}), ...(o.closeSteps ? { closeSteps: steps(o.closeSteps) } : {}), ...(o.models ? { models: o.models } : {}) };
    });
    if (new Set(options.map((o: MediaChoice) => JSON.stringify(o.value))).size !== options.length || !options.some((o: MediaChoice) => o.value === s.default) || (s.models !== undefined && (!Array.isArray(s.models) || !s.models.every((m: unknown) => typeof m === 'string')))) return fail();
    return { key: s.key, label: s.label, type: s.type, default: s.default, options, ...(s.models ? { models: s.models } : {}) };
  });
  if (raw.models !== undefined && (!Array.isArray(raw.models) || !raw.models.length || !raw.models.every(m => typeof m === 'string'))) return fail();
  const nativeDefaults = raw.nativeDefaults === undefined ? undefined : normalizeMediaPreferences({ settings: raw.nativeDefaults }).settings;
  return { activationSteps: steps(raw.activationSteps), activeWhen: locator(raw.activeWhen), settings, ...(raw.models ? { models: raw.models as string[] } : {}), ...(nativeDefaults ? { nativeDefaults } : {}) };
}
