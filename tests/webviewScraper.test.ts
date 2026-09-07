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
      runInNewContext(script, { document, setTimeout: (fn: () => void) => fn() })),
  } as any;
}

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
