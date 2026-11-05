import { WebContents } from 'electron';
import { ProviderId } from '../../shared/types.js';
import type { CustomRecipe } from '../../shared/types/recipe.js';

export class ModelScraperEngine {
  /**
   * Discovers available models from the live Webview DOM.
   */
  public static async discoverModels(
    providerId: ProviderId,
    webContents: WebContents
  ): Promise<Array<{ id: string; displayName: string; requiresTier?: string }>> {
    if (!webContents || webContents.isDestroyed()) {
      return [];
    }

    switch (providerId) {
      case 'chatgpt':
        return this.scrapeBuiltIn('chatgpt', webContents);
      case 'claude':
        return this.scrapeBuiltIn('claude', webContents);
      case 'gemini':
        return this.scrapeBuiltIn('gemini', webContents);
      case 'grok':
        return this.scrapeBuiltIn('grok', webContents);
      case 'meta':
        return this.scrapeBuiltIn('meta', webContents);
      default:
        if (
          providerId.startsWith('custom_') ||
          providerId.startsWith('webview_') ||
          providerId.startsWith('recipe_')
        ) {
          return this.scrapeCustomWebview(providerId, webContents);
        }
        return [];
    }
  }

  /**
   * Switches the active model in the Web UI if needed.
   */
  public static async switchModel(
    providerId: ProviderId,
    targetModelId: string,
    webContents: WebContents
  ): Promise<boolean> {
    if (!webContents || webContents.isDestroyed()) {
      return false;
    }

    switch (providerId) {
      case 'chatgpt':
        return this.switchBuiltIn('chatgpt', targetModelId, webContents);
      case 'claude':
        return this.switchBuiltIn('claude', targetModelId, webContents);
      case 'gemini':
        return this.switchBuiltIn('gemini', targetModelId, webContents);
      case 'grok':
        return this.switchBuiltIn('grok', targetModelId, webContents);
      case 'meta':
        return this.switchBuiltIn('meta', targetModelId, webContents);
      default:
        if (
          providerId.startsWith('custom_') ||
          providerId.startsWith('webview_') ||
          providerId.startsWith('recipe_')
        ) {
          return this.switchCustomWebview(providerId, targetModelId, webContents);
        }
        return false;
    }
  }

  private static readonly pickerTriggers: Record<string, string> = {
    chatgpt: '[data-testid="model-selector-button"], button[aria-label*="model" i]',
    claude: 'button[aria-label*="model" i], [data-testid="model-selector"]',
    gemini: 'button[aria-label*="Open mode picker" i], button[aria-label*="model" i], div.model-switcher',
    grok: 'button[aria-label*="model" i]',
    meta: 'button[data-testid="composer-mode-dropdown-button"]',
  };

  /** Discovery and selection must use the same menu ownership and label contract. */
  private static pickerScript(providerId: string): string {
    return `
      const provider = ${JSON.stringify(providerId)};
      const triggerSelector = ${JSON.stringify(this.pickerTriggers[providerId])};
      const itemSelector = provider === 'meta'
        ? '[role="menuitemcheckbox"][data-testid^="composer-mode-option-"]'
        : provider === 'gemini'
        ? '[role="menuitem"][data-mode-id]'
        : '[role="menuitemradio"], [role="option"][data-model-id]';
      const normalize = value => String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
      const visible = element => {
        const style = getComputedStyle(element);
        return style.display !== 'none' && style.visibility !== 'hidden' &&
          !element.closest?.('[hidden], [inert], [aria-hidden="true"]') && element.getClientRects().length > 0;
      };
      const getTrigger = () => {
        const triggers = Array.from(document.querySelectorAll(triggerSelector)).filter(visible)
          .filter(element => !element.closest?.('[role="menu"], [role="listbox"]'));
        return triggers.length === 1 ? triggers[0] : null;
      };
      const getMenu = trigger => {
        const controlled = trigger.getAttribute('aria-controls');
        if (controlled) {
          const menu = document.getElementById(controlled);
          return menu && visible(menu) ? menu : null;
        }
        const menus = Array.from(document.querySelectorAll('[role="menu"], [role="listbox"]')).filter(visible);
        return menus.length === 1 ? menus[0] : null;
      };
      const metaChoice = item => ({
        'composer-mode-option-think_fast': { id: 'instant', displayName: 'Instant' },
        'composer-mode-option-think_hard': { id: 'thinking', displayName: 'Thinking' },
      })[item.getAttribute('data-testid')];
      const labelFor = item => {
        if (provider === 'meta') return metaChoice(item)?.displayName || '';

        const label = provider === 'gemini' ? item.querySelector('.label')
          : provider === 'claude' ? item.querySelector('[data-model-name], .truncate') : null;
        return (label?.textContent || item.getAttribute('aria-label') ||
          item.firstElementChild?.textContent || item.textContent || '').trim().split('\\n')[0].trim();
      };
      const disabled = item => item.matches('[aria-disabled="true"], [disabled], [data-disabled]') ||
        (provider === 'grok' && /Requires SuperGrok/i.test(item.textContent || ''));
      const choices = trigger => {
        const menu = getMenu(trigger);
        return menu ? Array.from(menu.querySelectorAll(itemSelector)).filter(visible).map(item => {
          const displayName = labelFor(item);
          const id = (provider === 'meta' ? metaChoice(item)?.id : undefined) || item.getAttribute('data-model-id') || displayName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
          return { item, id, displayName };
        }).filter(choice => choice.id && choice.displayName) : [];
      };
      const closeOpened = trigger => {
        if (provider === 'gemini') trigger.click();
        else document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      };
    `;
  }

  private static async scrapeBuiltIn(
    providerId: string, webContents: WebContents
  ): Promise<Array<{ id: string; displayName: string }>> {
    try {
      const result = await webContents.executeJavaScript(`
        (async function() {
          ${this.pickerScript(providerId)}
          let trigger = getTrigger();
          for (let i = 0; i < 50 && !trigger; i++) {
            await new Promise(resolve => setTimeout(resolve, 100));
            trigger = getTrigger();
          }
          if (!trigger) return [];
          const opened = trigger.getAttribute('aria-expanded') !== 'true';
          try {
            if (opened) trigger.click();
            let found = choices(trigger);
            for (let i = 0; i < 30 && !found.length; i++) {
              await new Promise(resolve => setTimeout(resolve, 100));
              found = choices(trigger);
            }
            return Array.from(new Map(found.filter(choice => !disabled(choice.item)).map(({ id, displayName }) =>
              [id, { id, displayName }])).values());
          } finally {
            if (opened) closeOpened(trigger);
          }
        })()
      `, true);
      return Array.isArray(result) ? result : [];
    } catch {
      return [];
    }
  }

  private static async switchBuiltIn(
    providerId: string, targetModelId: string, webContents: WebContents
  ): Promise<boolean> {
    try {
      return Boolean(await webContents.executeJavaScript(`
        (async function() {
          ${this.pickerScript(providerId)}
          const target = ${JSON.stringify(targetModelId)};
          const trigger = getTrigger();
          if (!trigger) return false;
          const matches = () => choices(trigger).filter(choice =>
            choice.id === target || normalize(choice.displayName) === normalize(target));
          const selected = choice => choice.item.getAttribute('aria-checked') === 'true' ||
            choice.item.getAttribute('aria-selected') === 'true' || choice.item.classList.contains('selected');
          const opened = trigger.getAttribute('aria-expanded') !== 'true';
          try {
            if (opened) trigger.click();
            let found = matches();
            for (let i = 0; i < 20 && !found.length; i++) {
              await new Promise(resolve => setTimeout(resolve, 100));
              found = matches();
            }
            if (found.length !== 1 || disabled(found[0].item)) return false;
            if (selected(found[0])) return true;
            found[0].item.click();
            for (let i = 0; i < 20; i++) {
              const current = trigger.getAttribute('aria-label') || trigger.textContent || '';
              if (normalize(current) === normalize(found[0].displayName) ||
                normalize(current).endsWith(normalize(found[0].displayName))) return true;
              if (trigger.getAttribute('aria-expanded') !== 'true') trigger.click();
              const verified = matches();
              if (verified.length === 1 && selected(verified[0])) {
                if (trigger.getAttribute('aria-expanded') === 'true') closeOpened(trigger);
                return true;
              }
              await new Promise(resolve => setTimeout(resolve, 100));
            }
            return false;
          } finally {
            if (opened && trigger.getAttribute('aria-expanded') === 'true') closeOpened(trigger);
          }
        })()
      `, true));
    } catch {
      return false;
    }
  }

  private static async getCustomRecipe(providerId: ProviderId): Promise<CustomRecipe | undefined> {
    const { globalRecipeManager } = await import('./recipeManager.js');
    return globalRecipeManager.getRecipe(providerId);
  }

  public static async selectRequestedModel(providerId: ProviderId, modelId: string, webContents: WebContents): Promise<void> {
    // "default" means use the current provider selection, not a named model.
    if (modelId === 'default') return;
    const switched = await this.switchModel(providerId, modelId, webContents);
    if (!switched) {
      throw new Error(`[MODEL_SELECTION_FAILED] Model selection failed for ${modelId}. The prompt was not submitted. Check the installed recipe's modelSelection controls and the provider's model picker.`);
    }
  }

  private static async scrapeCustomWebview(
    providerId: ProviderId,
    webContents: WebContents
  ): Promise<Array<{ id: string; displayName: string; requiresTier?: string }>> {
    const recipe = await this.getCustomRecipe(providerId);
    if (!recipe) return [];
    const configured = (recipe.models || []).map(m => ({
      id: m.id, displayName: m.displayName, requiresTier: m.requiresTier,
    }));
    if (!recipe.modelSelection) return configured;
    try {
      const found = await webContents.executeJavaScript(`
        (async function() {
          const cfg = ${JSON.stringify(recipe.modelSelection)};
          const configured = ${JSON.stringify(configured)};
          const models = new Map();
          const pause = () => new Promise(r => setTimeout(r, 250));
          const scrape = () => {
            for (const item of document.querySelectorAll(cfg.item)) {
              const name = cfg.name ? item.querySelector(cfg.name) : item;
              const displayName = (name?.textContent || name?.getAttribute('alt') || '').trim();
              const known = configured.find(m => m.displayName.toLowerCase() === displayName.toLowerCase());
              const id = (cfg.idAttribute && item.getAttribute(cfg.idAttribute)) || known?.id || displayName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
              if (id) models.set(id, {
                id, displayName: displayName || id,
                requiresTier: (cfg.tier ? item.querySelector(cfg.tier)?.textContent?.trim() : undefined) || known?.requiresTier,
              });
            }
          };
          let opened = false;
          try {
            scrape();
            if (models.size === 0 && cfg.trigger) {
              const trigger = document.querySelector(cfg.trigger);
              if (trigger) { trigger.click(); opened = true; await pause(); scrape(); }
            }
            if (cfg.tabs) {
              for (const tab of document.querySelectorAll(cfg.tabs)) {
                tab.click(); await pause(); scrape();
              }
            }
            const scroll = cfg.scrollContainer && document.querySelector(cfg.scrollContainer);
            if (scroll) {
              const previousTop = scroll.scrollTop;
              try { scroll.scrollTop = scroll.scrollHeight; await pause(); scrape(); }
              finally { scroll.scrollTop = previousTop; }
            }
            return Array.from(models.values());
          } finally {
            if (opened && cfg.close) document.querySelector(cfg.close)?.click();
          }
        })()
      `, true);
      return Array.isArray(found) && found.length ? found : configured;
    } catch {
      return configured;
    }
  }

  private static async switchCustomWebview(
    providerId: ProviderId, targetModelId: string, webContents: WebContents
  ): Promise<boolean> {
    const recipe = await this.getCustomRecipe(providerId);
    if (!recipe?.modelSelection) return false;
    const target = recipe.models?.find(m => m.id === targetModelId);
    try {
      return await webContents.executeJavaScript(`
        (async function() {
          const cfg = ${JSON.stringify(recipe.modelSelection)};
          const targetId = ${JSON.stringify(targetModelId)};
          const targetName = ${JSON.stringify(target?.displayName || targetModelId)};
          const normalize = value => String(value).toLowerCase().replace(/[^a-z0-9]+/g, '');
          const pause = () => new Promise(r => setTimeout(r, 250));
          const find = () => Array.from(document.querySelectorAll(cfg.item)).find(item => {
            if (cfg.idAttribute && item.getAttribute(cfg.idAttribute) === targetId) return true;
            const name = cfg.name ? item.querySelector(cfg.name) : item;
            const label = name?.textContent?.trim() || name?.getAttribute('alt') || '';
            return normalize(label) === normalize(targetName) || normalize(label) === normalize(targetId);
          });
          const isActive = () => {
            if (!cfg.trigger) return false;
            const trigger = document.querySelector(cfg.trigger);
            if (!trigger) return false;
            const labels = [trigger.textContent?.trim(), trigger.querySelector('img[alt]')?.getAttribute('alt')];
            return labels.some(label => label && (normalize(label) === normalize(targetName) || normalize(label) === normalize(targetId)));
          };
          const waitFor = async predicate => {
            for (let attempt = 0; attempt < 12; attempt++) {
              const result = predicate();
              if (result) return result;
              await pause();
            }
            return predicate();
          };
          let opened = false;
          try {
            if (isActive()) return true;
            let item = find();
            if (!item && cfg.trigger) {
              const trigger = document.querySelector(cfg.trigger);
              if (trigger) { trigger.click(); opened = true; item = await waitFor(find); }
            }
            if (!item && cfg.tabs) {
              for (const tab of document.querySelectorAll(cfg.tabs)) {
                tab.click(); item = await waitFor(find);
                if (item) break;
              }
            }
            if (!item) return false;
            item.click(); await pause();
            if (cfg.confirm) {
              const confirm = Array.from(document.querySelectorAll(cfg.confirm)).find(button =>
                !cfg.confirmText || button.textContent?.trim() === cfg.confirmText);
              confirm?.click();
            }
            return Boolean(await waitFor(isActive));
          } finally {
            if (opened && cfg.close) document.querySelector(cfg.close)?.click();
          }
        })()
      `, true);
    } catch {
      return false;
    }
  }
}
