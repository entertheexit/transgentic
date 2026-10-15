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

  // Built-in sites change their picker labels frequently. Discover only choices visible to
  // the current account; never advertise a catalog inferred from API or CLI model names.
  private static readonly pickerTriggers: Record<string, string> = {
    chatgpt: '[data-testid="model-selector-button"], button[aria-label*="model" i]',
    claude: 'button[aria-label*="model" i], [data-testid="model-selector"]',
    gemini: 'button[aria-label*="Open mode picker" i], button[aria-label*="model" i], div.model-switcher',
    grok: 'button[aria-label*="model" i]',
  };

  private static readonly pickerItems = '[role="menuitemradio"], [role="option"], [role="menuitem"], mat-option';

  private static readonly geminiModelItems = '[role="menuitem"][data-mode-id]';

  private static async scrapeBuiltIn(
    providerId: string, webContents: WebContents
  ): Promise<Array<{ id: string; displayName: string }>> {
    try {
      const result = await webContents.executeJavaScript(`
        (async function() {
          const triggerSelector = ${JSON.stringify(this.pickerTriggers[providerId])};
          const itemSelector = ${JSON.stringify(providerId === 'gemini' ? this.geminiModelItems : this.pickerItems)};
          const provider = ${JSON.stringify(providerId)};
          const visible = element => {
            const style = getComputedStyle(element);
            return style.display !== 'none' && style.visibility !== 'hidden' && element.getClientRects().length > 0;
          };
          const choices = () => Array.from(document.querySelectorAll(itemSelector))
            .filter(item => visible(item) && !item.matches('[aria-disabled="true"], [disabled], [data-disabled="true"]'))
            .map(item => {
              const displayName = (provider === 'gemini'
                ? item.querySelector('.label')?.textContent
                : item.getAttribute('aria-label') || item.textContent || '').trim().split('\\n')[0].trim();
              const id = item.getAttribute('data-model-id') || displayName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
              return { id, displayName };
            }).filter(item => item.id && item.displayName);
          let trigger = Array.from(document.querySelectorAll(triggerSelector)).find(visible);
          for (let i = 0; i < 50 && !trigger; i++) {
            await new Promise(resolve => setTimeout(resolve, 100));
            trigger = Array.from(document.querySelectorAll(triggerSelector)).find(visible);
          }
          if (!trigger) return [];
          let opened = false;
          if (trigger.getAttribute('aria-expanded') !== 'true') {
            trigger.click(); opened = true;
          }
          let found = choices();
          for (let i = 0; i < 30 && !found.length; i++) {
            await new Promise(resolve => setTimeout(resolve, 100));
            found = choices();
          }
          if (opened) {
            if (provider === 'gemini') trigger.click();
            else document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
          }
          return Array.from(new Map(found.map(item => [item.id, item])).values());
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
          const triggerSelector = ${JSON.stringify(this.pickerTriggers[providerId])};
          const itemSelector = ${JSON.stringify(providerId === 'gemini' ? this.geminiModelItems : this.pickerItems)};
          const provider = ${JSON.stringify(providerId)};
          const target = ${JSON.stringify(targetModelId)};
          const normalize = value => String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
          const visible = element => {
            const style = getComputedStyle(element);
            return style.display !== 'none' && style.visibility !== 'hidden' && element.getClientRects().length > 0;
          };
          const trigger = Array.from(document.querySelectorAll(triggerSelector)).find(visible);
          if (!trigger) return false;
          const active = label => {
            const current = trigger.getAttribute('aria-label') || trigger.textContent || '';
            return normalize(current) === normalize(label) || normalize(current).endsWith(normalize(label));
          };
          const find = () => Array.from(document.querySelectorAll(itemSelector)).filter(visible).filter(item => {
            const label = (provider === 'gemini'
              ? item.querySelector('.label')?.textContent
              : item.getAttribute('aria-label') || item.textContent || '').trim().split('\\n')[0].trim();
            const id = item.getAttribute('data-model-id') || label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
            return id === target || normalize(label) === normalize(target);
          });
          if (active(target)) return true;
          let opened = false;
          if (trigger.getAttribute('aria-expanded') !== 'true') {
            trigger.click(); opened = true;
          }
          let matches = find();
          for (let i = 0; i < 12 && !matches.length; i++) {
            await new Promise(resolve => setTimeout(resolve, 100));
            matches = find();
          }
          if (matches.length !== 1 || matches[0].matches('[aria-disabled="true"], [disabled], [data-disabled="true"]')) {
            if (opened) document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
            return false;
          }
          const item = matches[0];
          if (provider === 'gemini' && item.classList.contains('selected')) {
            if (opened) trigger.click();
            return true;
          }
          const label = (provider === 'gemini'
            ? item.querySelector('.label')?.textContent
            : item.getAttribute('aria-label') || item.textContent || '').trim().split('\\n')[0].trim();
          item.click();
          for (let i = 0; i < 20; i++) {
            if (provider === 'gemini') {
              if (trigger.getAttribute('aria-expanded') !== 'true') trigger.click();
              const selected = find().filter(candidate => candidate.classList.contains('selected'));
              if (selected.length === 1) {
                trigger.click();
                return true;
              }
            } else if (active(label) || item.getAttribute('aria-checked') === 'true' || item.getAttribute('aria-selected') === 'true') {
              return true;
            }
            await new Promise(resolve => setTimeout(resolve, 100));
          }
          if (provider === 'gemini' && trigger.getAttribute('aria-expanded') === 'true') trigger.click();
          return false;
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
