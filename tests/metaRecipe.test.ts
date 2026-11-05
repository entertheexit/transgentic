import { describe, expect, it, vi } from 'vitest';
import { runInNewContext } from 'node:vm';
import { BUILTIN_RECIPES, validateCustomRecipe } from '../src/shared/types/recipe.js';
import { BUILTIN_PROVIDER_IDS, isBuiltinProvider } from '../src/shared/providers.js';
import { mediaCapability, mediaGenerationPrompt, resolveMediaSettings, validateGeneration } from '../src/shared/media.js';
import { CustomRecipeAdapter } from '../src/main/webviews/customRecipeAdapter.js';
import { CookieSyncManager } from '../src/main/auth/cookieSyncServer.js';
import { applyMediaControls } from '../src/main/webviews/mediaControls.js';

const recipe = BUILTIN_RECIPES.meta;

function authenticatedView({ accountVisible = false, guest = false, hidden = false } = {}) {
  const marker = { getClientRects: () => hidden ? [] : [1] };
  return {
    isDestroyed: () => false,
    getURL: () => 'https://www.meta.ai/',
    executeJavaScript: vi.fn((script: string) => runInNewContext(script, {
      document: {
        body: { innerText: '' },
        querySelectorAll: (selector: string) => selector === recipe.auth!.loggedInSelector
          ? accountVisible ? [marker] : [] : guest && selector === recipe.auth!.loggedOutSelector ? [marker] : [],
        querySelector: () => ({}), // Guest pages also expose a usable composer.
      },
      getComputedStyle: () => ({ display: 'block', visibility: 'visible' }),
    })),
  } as any;
}

describe('Meta AI built-in recipe', () => {
  it('preserves the native provider identity, partition, and strict authentication through validation', () => {
    const validated = validateCustomRecipe(structuredClone(recipe));
    expect(validated.errors).toEqual([]);
    expect(validated.recipe?.auth?.requireLoggedInSelector).toBe(true);
    expect(BUILTIN_PROVIDER_IDS).toContain('meta');
    expect(isBuiltinProvider('meta')).toBe(true);
    expect(isBuiltinProvider('custom_meta')).toBe(false);
    const adapter = new CustomRecipeAdapter(validated.recipe!);
    expect(adapter.providerId).toBe('meta');
    expect(adapter.partition).toBe('persist:transgentic_meta');
    expect(adapter.supportsTemporaryChat()).toBe(false);
  });

  it.each([
    [{}, false],
    [{ accountVisible: true }, true],
    [{ accountVisible: true, hidden: true }, false],
    [{ accountVisible: true, guest: true }, false],
  ])('requires a visible signed-in account marker for %j', async (state, expected) => {
    const adapter = new CustomRecipeAdapter(recipe);
    adapter.setWebContents(authenticatedView(state));
    expect(await adapter.checkAuthStatus()).toBe(expected);
  });

  it('rejects an account marker on another origin', async () => {
    const adapter = new CustomRecipeAdapter(recipe);
    const view = authenticatedView({ accountVisible: true });
    view.getURL = () => 'https://meta.ai.example.org/';
    adapter.setWebContents(view);
    expect(await adapter.checkAuthStatus()).toBe(false);
    expect(view.executeJavaScript).not.toHaveBeenCalled();
  });

  it.each(['meta', 'meta.ai', 'www.meta.ai', 'https://www.meta.ai/prompt/test'])('normalizes the Meta identity %s', value => {
    expect(CookieSyncManager.normalizeProviderId(value)).toBe('meta');
  });

  it.each(['https://meta.ai.example.org/', 'https://notmeta.ai/', 'https://example.org/meta.ai'])('does not normalize another host as Meta: %s', value => {
    expect(CookieSyncManager.normalizeProviderId(value)).not.toBe('meta');
  });

  it.each(['image', 'video'] as const)('exposes validated %s generation without unsupported settings', mode => {
    const normalized = validateCustomRecipe(structuredClone(recipe)).recipe!;
    expect(mediaCapability(normalized, mode)).toMatchObject({ available: true });
    expect(resolveMediaSettings(normalized, mode)).toEqual({});
  });

  it('advertises one image reference for each verified path', () => {
    const normalized = validateCustomRecipe(structuredClone(recipe)).recipe!;
    expect(normalized.response.modes.text.inputAttachments).toMatchObject({
      acceptedKinds: ['image'], multiple: false, readyStableMs: 8000,
    });
    expect(mediaCapability(normalized, 'image')?.attachments).toMatchObject({
      acceptedKinds: ['image'], multiple: false, maxFiles: 1,
    });
    expect(mediaCapability(normalized, 'video')?.attachments).toMatchObject({
      acceptedKinds: ['image'], multiple: false, maxFiles: 1,
    });
  });

  it('makes prompt-directed activation explicit without pretending to select a native media mode', async () => {
    const generation = validateGeneration(recipe.response.modes.image!.generation);
    expect(generation.strategy).toBe('prompt');
    expect(generation).not.toHaveProperty('activeWhen');
    expect(mediaGenerationPrompt(generation, 'A blue cube')).toContain('\n\nA blue cube');
    expect(mediaGenerationPrompt(undefined, 'A blue cube')).toBe('A blue cube');
    const run = vi.fn(async () => true);
    const verify = await applyMediaControls(generation, {}, run);
    await verify();
    expect(run).toHaveBeenCalled();
    expect(run.mock.calls.every(([script]) => !script.includes('el.click()'))).toBe(true);
  });

  it('rejects ambiguous or unsupported generation strategies and invented settings', () => {
    const generation = recipe.response.modes.image!.generation!;
    expect(() => validateGeneration({ ...generation, strategy: 'unknown' })).toThrow();
    expect(() => validateGeneration({ ...generation, promptInstruction: '' })).toThrow();
    expect(() => validateGeneration({ ...generation, activeWhen: { selectors: 'button' } })).toThrow();
    expect(() => validateGeneration({ ...generation, readyWhen: undefined })).toThrow();
    const enabled = structuredClone(recipe);
    enabled.response.modes.image!.enabled = true;
    expect(resolveMediaSettings(enabled, 'image')).toEqual({});
    expect(() => resolveMediaSettings(enabled, 'image', { settings: { aspect_ratio: '16:9' } })).toThrow('cannot honor');
  });
});

describe('Meta response generation state', () => {
  it('ignores unrelated header Cancel controls and persistent completed-thinking panels', async () => {
    const { DomObserver } = await import('../src/main/webviews/domObserver.js');
    const answer: any = {
      tagName: 'DIV', innerText: 'META_OK', textContent: 'META_OK', offsetWidth: 100, offsetHeight: 20,
      getAttribute: () => null, closest: () => null, matches: () => false,
      querySelector: () => null, querySelectorAll: () => [],
      cloneNode: () => ({ textContent: 'META_OK', querySelectorAll: () => [] }),
    };
    const cancel = {
      textContent: 'Cancel', offsetWidth: 100, offsetHeight: 20,
      closest: () => null, querySelector: () => null, matches: () => false,
      getAttribute: (key: string) => key === 'aria-label' ? 'Cancel' : null,
      classList: { contains: () => false },
    };
    const result = await runInNewContext(DomObserver.getInspectionScript('meta', 'general', recipe), {
      document: {
        body: { innerText: '' }, querySelector: () => null,
        querySelectorAll: (selector: string) => selector === recipe.response.container ? [answer]
          : selector === 'button, [role="button"]' ? [cancel] : [],
        createElement: () => ({ textContent: '' }),
      },
      getComputedStyle: () => ({ display: 'block', visibility: 'visible', opacity: '1' }),
    });
    expect(result).toMatchObject({ text: 'META_OK', isGenerating: false, isThinking: false });
  });
});
