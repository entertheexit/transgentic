import { beforeEach, describe, expect, it, vi } from 'vitest';
import { runInNewContext } from 'node:vm';
import { ModelScraperEngine } from '../src/main/registry/modelScrapers.js';
import { validateCustomRecipe } from '../src/shared/types/recipe.js';

const state = vi.hoisted(() => ({ recipe: undefined as any }));
vi.mock('../src/main/registry/recipeManager.js', () => ({
  globalRecipeManager: { getRecipe: () => state.recipe },
}));
vi.mock('../src/main/registry/modelRegistry.js', () => ({ ModelRegistryManager: {} }));

function webview(document: any = {}) {
  return {
    isDestroyed: () => false,
    executeJavaScript: vi.fn(async (script: string) =>
      runInNewContext(script, {
        document, setTimeout: (fn: () => void) => fn(),
        getComputedStyle: () => ({ display: 'block', visibility: 'visible' }),
        KeyboardEvent: class { constructor(_type: string, _options: unknown) {} },
      })),
  } as any;
}

describe('Built-in web model controls', () => {
  it('does not invent a catalog when the picker is unavailable', async () => {
    const view = webview({ querySelectorAll: () => [] });
    expect(await ModelScraperEngine.discoverModels('gemini', view)).toEqual([]);
    await expect(ModelScraperEngine.selectRequestedModel('gemini', '3-8-flash', view))
      .rejects.toThrow('[MODEL_SELECTION_FAILED]');
  });

  it('discovers the enabled current choices and rejects a disabled choice before submission', async () => {
    let opened = false;
    const trigger = {
      textContent: 'Flash-Lite', getAttribute: () => 'Open mode picker, currently Flash-Lite',
      getClientRects: () => [1], click: () => { opened = !opened; },
    };
    const choice = (label: string, disabled = false) => ({
      textContent: `${label} Description`,
      classList: { contains: () => false },
      querySelector: (selector: string) => selector === '.label' ? { textContent: label } : null,
      getAttribute: (name: string) => name === 'data-mode-id' ? label : null,
      getClientRects: () => [1], matches: (selector: string) => disabled && selector.includes('disabled'),
      click: vi.fn(),
    });
    const available = choice('3.8 Flash');
    const disabled = choice('4 Argon', true);
    const view = webview({
      querySelectorAll: (selector: string) => selector.includes('Open mode picker') ? [trigger] : opened ? [available, disabled] : [],
      dispatchEvent: () => { opened = false; },
    });
    expect(await ModelScraperEngine.discoverModels('gemini', view)).toEqual([{ id: '3-8-flash', displayName: '3.8 Flash' }]);
    expect(opened).toBe(false);
    await expect(ModelScraperEngine.selectRequestedModel('gemini', '4-argon', view))
      .rejects.toThrow('[MODEL_SELECTION_FAILED]');
    expect(disabled.click).not.toHaveBeenCalled();
  });

  it('selects and verifies one already-open Gemini choice', async () => {
    let current = 'Other model';
    let selected = false;
    const trigger = {
      textContent: current,
      getAttribute: (name: string) => name === 'aria-expanded' ? 'true' : current,
      getClientRects: () => [1], click: vi.fn(),
    };
    const choice = {
      textContent: '3.8 Flash All-around help',
      querySelector: (selector: string) => selector === '.label' ? { textContent: '3.8 Flash' } : null,
      getAttribute: () => null,
      classList: { contains: (name: string) => name === 'selected' && selected },
      getClientRects: () => [1], matches: () => false,
      click: vi.fn(() => { selected = true; current = 'Open mode picker, currently Flash'; }),
    };
    const view = webview({
      querySelectorAll: (selector: string) => selector.includes('Open mode picker') ? [trigger] : [choice],
    });
    await expect(ModelScraperEngine.selectRequestedModel('gemini', '3-8-flash', view)).resolves.toBeUndefined();
    expect(trigger.click).toHaveBeenCalledTimes(1);
    expect(choice.click).toHaveBeenCalledTimes(1);
  });

  it('accepts Gemini selected state even when the trigger abbreviates the model name', async () => {
    const trigger = {
      textContent: 'Flash', getAttribute: (name: string) => name === 'aria-expanded' ? 'true' : 'Open mode picker, currently Flash',
      getClientRects: () => [1], click: vi.fn(),
    };
    const choice = {
      textContent: '3.8 Flash All-around help',
      querySelector: () => ({ textContent: '3.8 Flash' }),
      getAttribute: () => null,
      classList: { contains: (name: string) => name === 'selected' },
      getClientRects: () => [1], matches: () => false, click: vi.fn(),
    };
    const view = webview({ querySelectorAll: (selector: string) => selector.includes('Open mode picker') ? [trigger] : [choice] });
    await expect(ModelScraperEngine.selectRequestedModel('gemini', '3-8-flash', view)).resolves.toBeUndefined();
    expect(choice.click).not.toHaveBeenCalled();
  });
});

describe('Recipe-driven custom model controls', () => {
  beforeEach(() => {
    state.recipe = {
      id: 'custom_example', version: '1', title: 'Example',
      domainMatch: 'portal.example', selectors: { inputPrompt: 'textarea', submitButton: '.send' },
      response: { container: '.answer', modes: { text: { enabled: true } } },
      models: [{ id: 'model-a', displayName: 'Model A' }],
    };
  });

  it('returns only the recipe catalog without querying unrelated DOM when controls are absent', async () => {
    const view = webview();
    expect(await ModelScraperEngine.discoverModels('custom_example' as any, view))
      .toEqual([{ id: 'model-a', displayName: 'Model A', requiresTier: undefined }]);
    expect(view.executeJavaScript).not.toHaveBeenCalled();
    expect(await ModelScraperEngine.switchModel('custom_example' as any, 'model-a', view)).toBe(false);
  });

  it('does not invent models for an unknown recipe', async () => {
    state.recipe = undefined;
    expect(await ModelScraperEngine.discoverModels('custom_missing' as any, webview())).toEqual([]);
  });

  it('discovers models from selectors supplied by the recipe and preserves configured IDs', async () => {
    state.recipe.modelSelection = { item: '.private-choice', name: '.label' };
    const item = { querySelector: () => ({ textContent: 'Model A' }) };
    const querySelectorAll = vi.fn(() => [item]);
    const result = await ModelScraperEngine.discoverModels('custom_example' as any, webview({ querySelectorAll }));
    expect(result[0].id).toBe('model-a');
    expect(querySelectorAll).toHaveBeenCalledWith('.private-choice');
  });

  it('submits only an exact model match using recipe controls', async () => {
    state.recipe.modelSelection = { item: '.choice', name: '.label', trigger: '.picker' };
    const wrongClick = vi.fn();
    const trigger = { textContent: 'Other Model', querySelector: () => null };
    const correctClick = vi.fn(() => { trigger.textContent = 'Model A'; });
    const items = [
      { querySelector: () => ({ textContent: 'Model A Extra' }), click: wrongClick },
      { querySelector: () => ({ textContent: 'Model A' }), click: correctClick },
    ];
    const view = webview({ querySelectorAll: () => items, querySelector: () => trigger });
    expect(await ModelScraperEngine.switchModel('custom_example' as any, 'model-a', view)).toBe(true);
    expect(correctClick).toHaveBeenCalledTimes(1);
    expect(wrongClick).not.toHaveBeenCalled();
  });

  it('rejects a requested model when an older installed recipe has no switching controls', async () => {
    await expect(ModelScraperEngine.selectRequestedModel('custom_example' as any, 'model-a', webview()))
      .rejects.toThrow('[MODEL_SELECTION_FAILED]');
  });

  it('does not claim success when clicking a card leaves the previous model active', async () => {
    state.recipe.modelSelection = { item: '.choice', name: '.label', trigger: '.picker' };
    const trigger = { textContent: 'Other Model', querySelector: () => null };
    const item = { querySelector: () => ({ textContent: 'Model A' }), click: vi.fn() };
    const view = webview({ querySelectorAll: () => [item], querySelector: () => trigger });
    await expect(ModelScraperEngine.selectRequestedModel('custom_example' as any, 'model-a', view))
      .rejects.toThrow('prompt was not submitted');
    expect(item.click).toHaveBeenCalledTimes(1);
  });

  it('accepts an already active model without clicking or reopening the picker', async () => {
    state.recipe.modelSelection = { item: '.choice', trigger: '.picker' };
    const trigger = { textContent: '', querySelector: () => ({ getAttribute: () => 'Model A' }), click: vi.fn() };
    const view = webview({ querySelector: () => trigger });
    await expect(ModelScraperEngine.selectRequestedModel('custom_example' as any, 'model-a', view)).resolves.toBeUndefined();
    expect(trigger.click).not.toHaveBeenCalled();
  });

  it('falls back to the recipe catalog when DOM inspection fails', async () => {
    state.recipe.modelSelection = { item: '.choice' };
    const view = webview();
    view.executeJavaScript.mockRejectedValue(new Error('page unavailable'));
    expect((await ModelScraperEngine.discoverModels('custom_example' as any, view))[0].id).toBe('model-a');
  });

  it('preserves declarative controls and disclaimer text through validation', () => {
    state.recipe.modelSelection = { item: '.choice', trigger: '.open', unknown: 'ignored' };
    state.recipe.disclaimer = 'Provider authorization required.';
    state.recipe.disclaimerVersion = '2';
    const result = validateCustomRecipe(state.recipe);
    expect(result.valid).toBe(true);
    expect(result.recipe?.modelSelection).toEqual({ item: '.choice', trigger: '.open' });
    expect(result.recipe?.disclaimer).toBe(state.recipe.disclaimer);
    expect(result.recipe?.disclaimerVersion).toBe('2');
  });
});
