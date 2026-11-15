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
  const menu = { getClientRects: () => [1], querySelectorAll: (selector: string) => document.querySelectorAll?.(selector) || [] };
  const page = {
    ...document,
    getElementById: document.getElementById || (() => menu),
    querySelectorAll: (selector: string) => selector === '[role="menu"], [role="listbox"]'
      ? [menu] : document.querySelectorAll?.(selector) || [],
  };
  return {
    isDestroyed: () => false,
    executeJavaScript: vi.fn(async (script: string) =>
      runInNewContext(script, {
        document: page, setTimeout: (fn: () => void) => fn(),
        getComputedStyle: () => ({ display: 'block', visibility: 'visible' }),
        KeyboardEvent: class { constructor(_type: string, _options: unknown) {} },
      })),
  } as any;
}

describe('Built-in web model controls', () => {
  it('discovers enabled efforts and verifies selection in the picker-owned submenu', async () => {
    let selected = 'Low';
    const item = (label: string, locked = false) => ({
      textContent: label,
      getAttribute: () => null,
      getClientRects: () => [1],
      querySelectorAll: () => [],
      matches: (selector: string) => selector.includes('aria-disabled') ? locked : selected === label,
      click: () => { selected = label; },
    });
    const trigger = {
      getClientRects: () => [1],
      getAttribute: (key: string) => key === 'aria-controls' ? 'models' : 'true',
    };
    const submenu = {
      textContent: 'Effort Medium',
      getClientRects: () => [1],
      getAttribute: (key: string) => key === 'aria-controls' ? 'effort' : key === 'aria-expanded' ? 'true' : null,
      matches: () => false,
    };
    const menu = (choices: unknown[]) => ({ getClientRects: () => [1], querySelectorAll: () => choices });
    const picker = menu([submenu]);
    const efforts = menu([item('Low'), item('Medium'), item('Max', true)]);
    const view = webview({
      getElementById: (key: string) => key === 'models' ? picker : key === 'effort' ? efforts : null,
      querySelectorAll: (selector: string) => selector.includes('aria-label') ? [trigger] : [],
      dispatchEvent: () => {},
    });
    expect(await ModelScraperEngine.readEfforts('claude', view)).toEqual({ low: 'Low', medium: 'Medium' });
    await ModelScraperEngine.selectEffort('claude', view, 'medium');
    expect(selected).toBe('Medium');
    await expect(ModelScraperEngine.selectEffort('claude', view, 'max')).rejects.toThrow('not be verified');
  });

  it('opens ChatGPT’s model list by native pointer and keeps an already visible model list open', async () => {
    let expanded = false;
    let pointerClicks = 0;
    const trigger = {
      getClientRects: () => [1],
      getBoundingClientRect: () => ({ left: 10, top: 10, width: 20, height: 20 }),
      getAttribute: (key: string) => key === 'aria-controls' ? 'picker' : key === 'aria-expanded' ? String(expanded) : null,
      contains: (element: unknown) => element === trigger,
    };
    const toggle = { click: vi.fn(), getClientRects: () => [1], matches: () => false };
    const model = {
      textContent: 'GPT-5.6 Sol',
      getClientRects: () => [1],
      getAttribute: () => null,
      matches: () => false,
    };
    const panel = {
      contains: () => true,
      getClientRects: () => expanded ? [1] : [],
      querySelectorAll: (selector: string) => selector.includes('menuitemradio') ? [model] : [toggle],
    };
    const view = webview({
      getElementById: () => panel,
      elementFromPoint: () => trigger,
      querySelectorAll: (selector: string) => selector.includes('Select ChatGPT model') ? [trigger] : [],
    });
    const sendCommand = vi.fn(async (_method: string, event: { type: string; key?: string }) => {
      if (event.type === 'mouseReleased') expanded = ++pointerClicks === 2;
      if (event.key === 'Escape') expanded = false;
    });
    view.debugger = { isAttached: () => true, sendCommand };

    expect(await ModelScraperEngine.discoverModels('chatgpt', view)).toEqual([
      { id: 'gpt-5-6-sol', displayName: 'GPT-5.6 Sol' },
    ]);
    expect(toggle.click).not.toHaveBeenCalled();
    expect(pointerClicks).toBe(2);
    expect(sendCommand).toHaveBeenCalledWith('Input.dispatchMouseEvent',
      expect.objectContaining({ type: 'mousePressed', x: 20, y: 20 }));
    expect(expanded).toBe(false);
  });

  it('enumerates the ChatGPT effort slider and restores its original position', async () => {
    const ids = ['instant', 'medium', 'high', 'extra', 'pro'];
    let index = 2;
    const trigger = {
      getClientRects: () => [1],
      getAttribute: (key: string) => ({
        'aria-controls': 'picker',
        'aria-expanded': 'true',
        'data-selected-reasoning-effort': ids[index],
      } as Record<string, string>)[key] ?? null,
    };
    const slider = {
      getClientRects: () => [1],
      matches: (selector: string) => selector === '[role="slider"]',
      tabIndex: 0,
      focus: vi.fn(),
      getAttribute: (key: string) => ({
        'aria-valuenow': String(index),
        'aria-valuemin': '0',
        'aria-valuemax': '4',
      } as Record<string, string>)[key] ?? null,
    };
    const panel = { contains: () => true, matches: () => false, getClientRects: () => [1], querySelectorAll: () => [slider] };
    const view = webview({
      getElementById: (key: string) => key === 'picker' ? panel : null,
      querySelectorAll: (selector: string) => selector.includes('Select ChatGPT model') ? [trigger] : [],
      dispatchEvent: () => {},
    });
    view.debugger = {
      isAttached: () => true,
      sendCommand: async (_command: string, event: { type: string; key: string }) => {
        if (event.type === 'rawKeyDown' && event.key.startsWith('Arrow')) index += event.key === 'ArrowRight' ? 1 : -1;
      },
    };
    const selected = vi.fn();

    expect(await ModelScraperEngine.readEfforts('chatgpt', view, undefined, selected)).toEqual({
      instant: 'Instant', medium: 'Medium', high: 'High', extra: 'Extra High', pro: 'Pro',
    });
    expect(selected).toHaveBeenCalledExactlyOnceWith('high');
    expect(index).toBe(2);
    await ModelScraperEngine.selectEffort('chatgpt', view, 'extra');
    expect(index).toBe(3);
  });

  it('verifies only the committed ChatGPT effort when the slider is hidden', async () => {
    const trigger = {
      getClientRects: () => [1],
      getAttribute: (key: string) => ({
        'aria-controls': 'picker',
        'aria-expanded': 'true',
        'data-selected-reasoning-effort': 'medium',
      } as Record<string, string>)[key] ?? null,
    };
    const panel = { contains: () => true, matches: () => false, getClientRects: () => [1], querySelectorAll: () => [] };
    const view = webview({
      getElementById: () => panel,
      querySelectorAll: (selector: string) => selector.includes('Select ChatGPT model') ? [trigger] : [],
    });
    view.debugger = { isAttached: () => true, sendCommand: vi.fn() };

    expect(await ModelScraperEngine.readEfforts('chatgpt', view)).toEqual({ medium: 'Medium' });
    await expect(ModelScraperEngine.selectEffort('chatgpt', view, 'medium')).resolves.toBeUndefined();
    await expect(ModelScraperEngine.selectEffort('chatgpt', view, 'high')).rejects.toThrow('not be verified');
  });

  it('opens the Gemini thinking submenu by pointer hover and reads its selected option', async () => {
    let hovered = false;
    const submenu = {
      textContent: 'Thinking level',
      getClientRects: () => [1],
      getBoundingClientRect: () => ({ x: 10, y: 20, width: 40, height: 20 }),
      getAttribute: (key: string) => key === 'aria-controls' ? 'levels' : null,
      matches: () => false,
      click: vi.fn(),
    };
    const trigger = {
      getClientRects: () => [1],
      getAttribute: (key: string) => key === 'aria-controls' ? 'models' : 'true',
      click: vi.fn(),
    };
    const low = {
      textContent: 'Low',
      getAttribute: (key: string) => key === 'aria-checked' ? 'true' : null,
      getClientRects: () => [1],
      querySelectorAll: () => [],
      matches: () => false,
    };
    const parent = { getClientRects: () => [1], querySelectorAll: () => [submenu] };
    const levels = { getClientRects: () => hovered ? [1] : [], querySelectorAll: () => [low] };
    const view = webview({
      getElementById: (key: string) => key === 'models' ? parent : levels,
      querySelectorAll: (selector: string) => selector.includes('Open mode picker') ? [trigger] : [],
    });
    const sendCommand = vi.fn(async () => { hovered = true; });
    view.debugger = { isAttached: () => true, sendCommand };
    const selected = vi.fn();

    expect(await ModelScraperEngine.readEfforts('gemini', view, undefined, selected)).toEqual({ low: 'Low' });
    expect(sendCommand).toHaveBeenCalledExactlyOnceWith('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 30, y: 30, buttons: 0 });
    expect(submenu.click).not.toHaveBeenCalled();
    expect(selected).toHaveBeenCalledExactlyOnceWith('low');
  });

  it('verifies the active model on a replacement trigger after selecting a choice', async () => {
    const trigger = (label: string) => ({
      textContent: label,
      getClientRects: () => [1],
      getAttribute: (key: string) => key === 'aria-expanded' ? 'true' : null,
    });
    let current = trigger('Fast');
    const choice = {
      textContent: 'Expert',
      getAttribute: () => null,
      getClientRects: () => [1],
      matches: () => false,
      classList: { contains: () => false },
      click: vi.fn(() => { current = trigger('Expert'); }),
    };
    const view = webview({
      querySelectorAll: (selector: string) => selector.includes('aria-label')
        ? [current] : [choice],
    });
    expect(await ModelScraperEngine.switchModel('grok', 'expert', view)).toBe(true);
    expect(choice.click).toHaveBeenCalledOnce();
  });

  it('scopes choices to the controlled menu and excludes submenu and effort controls', async () => {
    const item = (role: string, label: string) => ({
      textContent: label + ' Description',
      firstElementChild: { textContent: label },
      querySelector: () => ({ textContent: label }),
      getAttribute: (name: string) => name === 'role' ? role : null,
      getClientRects: () => [1], matches: () => false,
    });
    const entries = [item('menuitemradio', 'Model A'), item('menuitem', 'Effort'), item('menuitem', 'More models')];
    const trigger = {
      getAttribute: (name: string) => name === 'aria-controls' ? 'models' : 'true',
      getClientRects: () => [1],
    };
    const menu = {
      getClientRects: () => [1],
      querySelectorAll: (selector: string) => entries.filter(entry => selector.includes('[role="' + entry.getAttribute('role') + '"]')),
    };
    const view = webview({
      getElementById: (id: string) => id === 'models' ? menu : null,
      querySelectorAll: (selector: string) => selector.includes('button[aria-label')
        ? [trigger] : [item('menuitemradio', 'Unrelated'), ...entries],
    });
    expect(await ModelScraperEngine.discoverModels('claude', view)).toEqual([{ id: 'model-a', displayName: 'Model A' }]);
  });

  it('discovers and verifies Meta Instant/Thinking using stable native identities', async () => {
    let opened = false;
    let selected = 'Instant';
    const trigger = {
      get textContent() { return selected; },
      getAttribute: (name: string) => name === 'aria-controls' ? 'meta-modes' : name === 'aria-expanded' ? String(opened) : null,
      getClientRects: () => [1],
      click: () => { opened = !opened; },
    };
    const choice = (id: string, label: string) => ({
      textContent: label + ' description',
      classList: { contains: () => false },
      getAttribute: (name: string) => name === 'data-testid' ? id : name === 'aria-checked' ? String(selected === label) : null,
      getClientRects: () => [1], matches: () => false,
      click: () => { selected = label; opened = false; },
    });
    const choices = [choice('composer-mode-option-think_fast', 'Instant'), choice('composer-mode-option-think_hard', 'Thinking')];
    const view = webview({
      querySelectorAll: (selector: string) => selector.includes('composer-mode-dropdown-button') ? [trigger] : opened ? choices : [],
      dispatchEvent: () => { opened = false; },
    });
    expect(await ModelScraperEngine.discoverModels('meta', view)).toEqual([
      { id: 'instant', displayName: 'Instant' }, { id: 'thinking', displayName: 'Thinking' },
    ]);
    expect(opened).toBe(false);
    await expect(ModelScraperEngine.selectRequestedModel('meta', 'thinking', view)).resolves.toBeUndefined();
    expect(selected).toBe('Thinking');
    expect(opened).toBe(false);
    await expect(ModelScraperEngine.selectRequestedModel('meta', 'unavailable-model', view)).rejects.toThrow('MODEL_SELECTION_FAILED');
  });

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

  it('selects Gemini from its picker when a sidebar chat title contains model', async () => {
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
      querySelectorAll: (selector: string) => {
        if (!selector.includes('Open mode picker')) return [choice];
        const sidebarButton = { getClientRects: () => [1], getAttribute: () => 'More options for MODEL_OK Confirmation' };
        return selector.includes('aria-label*="model"') ? [trigger, sidebarButton] : [trigger];
      },
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
    expect(await ModelScraperEngine.discoverModels('custom_example' as any, view, true)).toEqual([]);
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
