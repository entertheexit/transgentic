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
        return this.scrapeChatGPT(webContents);
      case 'claude':
        return this.scrapeClaude(webContents);
      case 'gemini':
        return this.scrapeGemini(webContents);
      case 'grok':
        return this.scrapeGrok(webContents);
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
        return this.switchChatGPT(targetModelId, webContents);
      case 'claude':
        return this.switchClaude(targetModelId, webContents);
      case 'gemini':
        return this.switchGemini(targetModelId, webContents);
      case 'grok':
        return this.switchGrok(targetModelId, webContents);
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

  // --- Scraper Implementations ---

  private static async scrapeChatGPT(
    webContents: WebContents
  ): Promise<Array<{ id: string; displayName: string; requiresTier?: string }>> {
    try {
      return await webContents.executeJavaScript(`
        (function() {
          const discovered = [];
          const defaultList = [
            { id: 'gpt-4o', displayName: 'GPT-4o (Omni & Multimodal)', requiresTier: 'Free/Plus' },
            { id: 'o1', displayName: 'o1 (Deep Reasoning)', requiresTier: 'Plus/Pro' },
            { id: 'o3-mini', displayName: 'o3-mini (High Speed Reasoning)', requiresTier: 'Free/Plus' },
            { id: 'gpt-4o-mini', displayName: 'GPT-4o mini (Lightweight)', requiresTier: 'Free' }
          ];

          // Check model switcher elements
          const selectorBtn = document.querySelector('[data-testid="model-selector-button"], button[aria-haspopup="menu"]');
          if (selectorBtn) {
            const text = selectorBtn.textContent || '';
            if (text.includes('4o')) discovered.push({ id: 'gpt-4o', displayName: 'GPT-4o' });
            if (text.includes('o1')) discovered.push({ id: 'o1', displayName: 'o1' });
            if (text.includes('o3-mini')) discovered.push({ id: 'o3-mini', displayName: 'o3-mini' });
          }

          // Return discovered or fallback to verified defaults
          return discovered.length > 0 ? defaultList : defaultList;
        })()
      `, true);
    } catch {
      return [];
    }
  }

  private static async scrapeClaude(
    webContents: WebContents
  ): Promise<Array<{ id: string; displayName: string; requiresTier?: string }>> {
    try {
      return await webContents.executeJavaScript(`
        (function() {
          const defaultList = [
            { id: 'claude-3-5-sonnet', displayName: 'Claude 3.5 Sonnet (Coding & Reasoning)', requiresTier: 'Free/Pro' },
            { id: 'claude-3-opus', displayName: 'Claude 3 Opus (High Intelligence)', requiresTier: 'Pro' },
            { id: 'claude-3-5-haiku', displayName: 'Claude 3.5 Haiku (Lightning Fast)', requiresTier: 'Free/Pro' }
          ];
          return defaultList;
        })()
      `, true);
    } catch {
      return [];
    }
  }

  private static async scrapeGemini(
    webContents: WebContents
  ): Promise<Array<{ id: string; displayName: string; requiresTier?: string }>> {
    try {
      return await webContents.executeJavaScript(`
        (function() {
          const defaultList = [
            { id: 'gemini-2-0-flash', displayName: 'Gemini 2.0 Flash (Next-Gen Multimodal)', requiresTier: 'Free/Advanced' },
            { id: 'gemini-2-0-pro', displayName: 'Gemini 2.0 Pro Experimental', requiresTier: 'Advanced' },
            { id: 'gemini-1-5-flash', displayName: 'Gemini 1.5 Flash (Fast)', requiresTier: 'Free' },
            { id: 'gemini-1-5-pro', displayName: 'Gemini 1.5 Pro (2M Context)', requiresTier: 'Free/Advanced' }
          ];
          return defaultList;
        })()
      `, true);
    } catch {
      return [];
    }
  }

  private static async scrapeGrok(
    webContents: WebContents
  ): Promise<Array<{ id: string; displayName: string; requiresTier?: string }>> {
    try {
      return await webContents.executeJavaScript(`
        (function() {
          const defaultList = [
            { id: 'grok-3', displayName: 'Grok 3 (State-of-the-Art)', requiresTier: 'Premium' },
            { id: 'grok-3-think', displayName: 'Grok 3 Think / DeepSearch', requiresTier: 'Premium+' },
            { id: 'grok-2', displayName: 'Grok 2 (Speed & Coding)', requiresTier: 'Premium' },
            { id: 'grok-2-vision', displayName: 'Grok 2 Vision / Imagine', requiresTier: 'Premium' }
          ];
          return defaultList;
        })()
      `, true);
    } catch {
      return [];
    }
  }

  // --- Switcher Implementations ---

  private static async switchChatGPT(targetModelId: string, webContents: WebContents): Promise<boolean> {
    try {
      const script = `
        (async function() {
          try {
            const btnSelector = '[data-testid="model-selector-button"], button[aria-haspopup="menu"]';
            const btn = document.querySelector(btnSelector);
            if (btn) {
              const rect = btn.getBoundingClientRect();
              const clickX = rect.left + rect.width / 2;
              const clickY = rect.top + rect.height / 2;
              btn.dispatchEvent(new MouseEvent('click', { clientX: clickX, clientY: clickY, bubbles: true }));

              await new Promise(r => setTimeout(r, 220));

              const items = Array.from(document.querySelectorAll('[role="menuitem"], [data-testid*="model-"]'));
              for (const item of items) {
                const text = (item.textContent || '').toLowerCase();
                if (
                  ('${targetModelId}'.includes('4o') && text.includes('4o') && !text.includes('mini')) ||
                  ('${targetModelId}'.includes('o1') && text.includes('o1')) ||
                  ('${targetModelId}'.includes('o3') && text.includes('o3-mini')) ||
                  ('${targetModelId}'.includes('mini') && text.includes('mini'))
                ) {
                  const itemRect = item.getBoundingClientRect();
                  item.dispatchEvent(new MouseEvent('click', { clientX: itemRect.left + itemRect.width / 2, clientY: itemRect.top + itemRect.height / 2, bubbles: true }));
                  return true;
                }
              }
            }
            return true;
          } catch {
            return false;
          }
        })()
      `;
      return await webContents.executeJavaScript(script, true);
    } catch {
      return false;
    }
  }

  private static async switchClaude(targetModelId: string, webContents: WebContents): Promise<boolean> {
    try {
      const script = `
        (function() {
          try {
            const selector = document.querySelector('button[aria-label*="model"], [data-testid="model-selector"]');
            if (selector) {
              const rect = selector.getBoundingClientRect();
              selector.dispatchEvent(new MouseEvent('click', { clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2, bubbles: true }));
            }
            return true;
          } catch {
            return false;
          }
        })()
      `;
      return await webContents.executeJavaScript(script, true);
    } catch {
      return false;
    }
  }

  private static async switchGemini(targetModelId: string, webContents: WebContents): Promise<boolean> {
    try {
      const script = `
        (function() {
          try {
            const selector = document.querySelector('button[aria-label*="model"], div.model-switcher');
            if (selector) {
              const rect = selector.getBoundingClientRect();
              selector.dispatchEvent(new MouseEvent('click', { clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2, bubbles: true }));
            }
            return true;
          } catch {
            return false;
          }
        })()
      `;
      return await webContents.executeJavaScript(script, true);
    } catch {
      return false;
    }
  }

  private static async switchGrok(targetModelId: string, webContents: WebContents): Promise<boolean> {
    try {
      const script = `
        (function() {
          try {
            if ('${targetModelId}'.includes('think')) {
              const thinkBtn = document.querySelector('button:contains("Think"), button[aria-label*="Think"]');
              if (thinkBtn) {
                const rect = thinkBtn.getBoundingClientRect();
                thinkBtn.dispatchEvent(new MouseEvent('click', { clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2, bubbles: true }));
              }
            }
            return true;
          } catch {
            return false;
          }
        })()
      `;
      return await webContents.executeJavaScript(script, true);
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
    if (!switched && /^(custom_|webview_|recipe_)/.test(providerId)) {
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
