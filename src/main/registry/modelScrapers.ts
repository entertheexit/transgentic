import { BUILTIN_RECIPES } from '../../shared/generated/builtinRecipes.js';
import { providerQueryScript } from '../webviews/domQuery.js';
import { WebContents } from 'electron';
import { ProviderId } from '../../shared/types.js';
import type { CustomRecipe } from '../../shared/types/recipe.js';

export class ModelScraperEngine {
  /**
   * Discovers available models from the live Webview DOM.
   */
  public static async discoverModels(
    providerId: ProviderId,
    webContents: WebContents,
    liveOnly = false
  ): Promise<Array<{ id: string; displayName: string; requiresTier?: string; selected?: boolean; locked?: boolean }>> {
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
          return this.scrapeCustomWebview(providerId, webContents, liveOnly);
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

  /** Discovery and selection use the same picker ownership and recipe locators. */
  private static pickerScript(config: NonNullable<CustomRecipe['modelSelection']>): string {
    return `
      const config = ${JSON.stringify(config)};
      const triggerSelector = config.trigger;
      const itemSelector = config.item;
      const namePattern = config.namePattern && new RegExp(config.namePattern, 'i');
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
      const namedChoice = item => (config.idAttribute && config.knownChoices &&
        Object.hasOwn(config.knownChoices, item.getAttribute(config.idAttribute)))
        ? config.knownChoices[item.getAttribute(config.idAttribute)] : undefined;
      const labelFor = item => {
        const known = namedChoice(item);
        if (known) return known.displayName;
        if (namePattern) {
          const model = Array.from(item.querySelectorAll?.('span, div') || []).find(element =>
            !element.children.length && namePattern.test(element.textContent.trim()));
          if (model) return model.textContent.trim();
        }

        const label = config.name ? item.querySelector(config.name) : null;
        return (label?.textContent || item.getAttribute('aria-label') ||
          item.firstElementChild?.textContent || item.textContent || '').trim().split('\\n')[0].trim();
      };
      const disabled = item => item.matches('[aria-disabled="true"], [disabled], [data-disabled], [data-mode-id^="upsell_"]') ||
        Boolean(config.disabledText && (item.getAttribute('aria-label') + ' ' + item.textContent).toLowerCase().includes(config.disabledText.toLowerCase()));
      const isSelected = item => item.getAttribute('aria-checked') === 'true' ||
        item.getAttribute('aria-selected') === 'true' || item.getAttribute('data-state') === 'checked' ||
        item.classList?.contains('selected') ||
        /^selected\\s/i.test(item.getAttribute('aria-label') || '');
      const choices = trigger => {
        const menu = getMenu(trigger);
        return menu ? Array.from(menu.querySelectorAll(itemSelector)).filter(visible).map(item => {
          const displayName = labelFor(item);
          const id = namedChoice(item)?.id || item.getAttribute(config.idAttribute || 'data-model-id') || displayName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
          return { item, id, displayName };
        }).filter(choice => choice.id && choice.displayName && (!namePattern || namePattern.test(choice.displayName))) : [];
      };
      const pickerIsOpen = trigger => {
        if (!trigger) return false;
        const expanded = trigger.getAttribute('aria-expanded');
        return expanded === 'true' || (expanded === null && config.openInput === 'native' && choices(trigger).length > 0);
      };
      const openPicker = trigger => {
        if (config.openInput === 'pointerdown' && typeof PointerEvent === 'function') {
          trigger.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, pointerType: 'mouse', isPrimary: true }));
        } else trigger.click();
      };
      const modelListToggles = menu => Array.from(menu?.querySelectorAll(config.submenu) || []).filter(element =>
        visible(element) && !disabled(element));
      const openModelList = async trigger => {
        if (!config.submenu) return;
        for (let attempt = 0; attempt < 10; attempt++) {
          // A two-view picker can retain its toggle on the model list itself.
          // Preserve the model view if it is already open.
          if (choices(trigger).length) return;
          const toggles = modelListToggles(getMenu(trigger));
          if (toggles.length === 1) {
            toggles[0].click();
            return;
          }
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      };
      const closeOpened = trigger => {
        if (config.closeInput === 'toggle') trigger.click();
        else document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      };
    `;
  }

  private static async openNativePicker(config: NonNullable<CustomRecipe['modelSelection']>, contents: WebContents): Promise<void> {
    if (config.openInput !== 'native' || !contents.debugger) return;
    const readTrigger = () => contents.executeJavaScript(`(() => {
      ${this.pickerScript(config)}
      const trigger = getTrigger();
      if (!trigger) return null;
      if (pickerIsOpen(trigger)) return { open: true };
      const rect = trigger.getBoundingClientRect();
      const x = rect.left + rect.width / 2;
      const y = rect.top + rect.height / 2;
      if (trigger.contains(document.elementFromPoint(x, y))) return { x, y };
      if (!config.openObstructionDismiss) return null;
      const dismiss = [...document.querySelectorAll(config.openObstructionDismiss)].filter(element =>
        visible(element) && !disabled(element));
      if (dismiss.length !== 1) return null;
      const bounds = dismiss[0].getBoundingClientRect();
      const point = { x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height / 2 };
      return dismiss[0].contains(document.elementFromPoint(point.x, point.y)) ? point : null;
    })()`, true);
    const deadline = Date.now() + 4500;
    do {
      const point = await readTrigger();
      if (point?.open) return;
      if (point) {
        await this.dispatchPickerInput(contents, 'Input.dispatchMouseEvent', {
          ...point, type: 'mouseMoved', buttons: 0,
        });
        await this.dispatchPickerInput(contents, 'Input.dispatchMouseEvent', {
          ...point, type: 'mousePressed', button: 'left', buttons: 1, clickCount: 1,
        });
        await this.dispatchPickerInput(contents, 'Input.dispatchMouseEvent', {
          ...point, type: 'mouseReleased', button: 'left', buttons: 0, clickCount: 1,
        });
      }
      // A fresh provider page can render the button before wiring its events.
      await new Promise(resolve => setTimeout(resolve, point ? 350 : 100));
    } while (Date.now() < deadline && !contents.isDestroyed());
  }

  private static async closeNativePicker(config: NonNullable<CustomRecipe['modelSelection']>, contents: WebContents): Promise<void> {
    if (config.openInput !== 'native' || !contents.debugger) return;
    const open = await contents.executeJavaScript(`(() => {
      ${this.pickerScript(config)}
      const trigger = getTrigger();
      if (!pickerIsOpen(trigger)) return false;
      const menu = getMenu(trigger);
      if (menu && !menu.contains(document.activeElement)) menu.focus();
      return true;
    })()`, true);
    if (!open) return;
    const escape = { key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 };
    await this.dispatchPickerInput(contents, 'Input.dispatchKeyEvent', { ...escape, type: 'rawKeyDown' });
    await this.dispatchPickerInput(contents, 'Input.dispatchKeyEvent', { ...escape, type: 'keyUp' });
    await contents.executeJavaScript(`(async () => {
      ${this.pickerScript(config)}
      for (let attempt = 0; attempt < 6 && pickerIsOpen(getTrigger()); attempt++) {
        await new Promise(resolve => setTimeout(resolve, 50));
      }
    })()`, true);
  }

  private static async scrapeBuiltIn(
    providerId: string, webContents: WebContents
  ): Promise<Array<{ id: string; displayName: string; selected?: boolean; locked?: boolean }>> {
    const config = await this.getBuiltinPicker(providerId);
    try {
      if (!config) return [];
      await this.openNativePicker(config, webContents);
      const result = await webContents.executeJavaScript(`
        (async function() {
          ${this.pickerScript(config)}
          let trigger = getTrigger();
          for (let i = 0; i < 50 && !trigger; i++) {
            await new Promise(resolve => setTimeout(resolve, 100));
            trigger = getTrigger();
          }
          if (!trigger) return [];
          const opened = !pickerIsOpen(trigger);
          try {
            if (opened) openPicker(trigger);
            await openModelList(trigger);
            let found = choices(trigger);
            for (let i = 0; i < 30 && !found.length; i++) {
              await new Promise(resolve => setTimeout(resolve, 100));
              found = choices(trigger);
            }
            return Array.from(new Map(found.filter(choice => !disabled(choice.item) || (config.effort && isSelected(choice.item))).map(({ id, displayName, item }) =>
              [id, { id, displayName, ...(config.effort && isSelected(item) ? { selected: true } : {}), ...(disabled(item) ? { locked: true } : {}) }])).values());
          } finally {
            if (opened) closeOpened(trigger);
          }
        })()
      `, true);
      return Array.isArray(result) ? result : [];
    } catch {
      return [];
    } finally {
      if (config) await this.closeNativePicker(config, webContents).catch(() => {});
    }
  }

  private static async switchBuiltIn(
    providerId: string, targetModelId: string, webContents: WebContents
  ): Promise<boolean> {
    const config = await this.getBuiltinPicker(providerId);
    try {
      if (!config) return false;
      await this.openNativePicker(config, webContents);
      const native = Boolean(config.selectInput && webContents.debugger);
      const run = (phase: 'select' | 'locate' | 'verify', expected?: { id: string; displayName: string }) =>
        webContents.executeJavaScript(`
        (async function() {
          ${this.pickerScript(config)}
          const phase = ${JSON.stringify(phase)};
          const expected = ${JSON.stringify(expected ?? null)};
          const target = ${JSON.stringify(targetModelId)};
          const trigger = getTrigger();
          if (!trigger) return false;
          const matches = () => choices(trigger).filter(choice =>
            choice.id === target || normalize(choice.displayName) === normalize(target));
          const selected = choice => isSelected(choice.item);
          const opened = !pickerIsOpen(trigger);
          let pendingNativeClick = false;
          try {
            if (opened) openPicker(trigger);
            await openModelList(trigger);
            let found = phase === 'verify' ? [] : matches();
            for (let i = 0; phase !== 'verify' && i < 20 && !found.length; i++) {
              await new Promise(resolve => setTimeout(resolve, 100));
              found = matches();
            }
            if (phase !== 'verify') {
              if (found.length !== 1 || disabled(found[0].item)) return false;
              if (selected(found[0])) return true;
              if (phase === 'locate') {
                const { item, id, displayName } = found[0];
                if (config.selectInput === 'keyboard') {
                  item.focus({ preventScroll: true });
                  pendingNativeClick = document.activeElement === item;
                  return pendingNativeClick ? { id, displayName, keyboard: true } : false;
                }
                item.scrollIntoView({ block: 'nearest', inline: 'nearest' });
                await new Promise(resolve => setTimeout(resolve, 200));
                if (!visible(item) || disabled(item)) return false;
                const rect = item.getBoundingClientRect();
                const x = rect.left + rect.width / 2;
                const y = rect.top + rect.height / 2;
                const hit = document.elementFromPoint(x, y);
                pendingNativeClick = Boolean(hit && item.contains(hit));
                return pendingNativeClick ? { id, displayName, x, y } : false;
              }
              found[0].item.click();
            }
            const choice = expected ?? found[0];
            for (let i = 0; i < 20; i++) {
              const currentTrigger = getTrigger() || trigger;
              const currentLabels = [currentTrigger.getAttribute('aria-label'), currentTrigger.textContent];
              if (currentLabels.some(current => normalize(current) === normalize(choice.displayName) ||
                normalize(current).endsWith(normalize(choice.displayName)))) return true;
              if (!pickerIsOpen(currentTrigger)) {
                openPicker(currentTrigger);
                await openModelList(currentTrigger);
              }
              const verified = choices(currentTrigger).filter(candidate => candidate.id === choice.id);
              if (verified.length === 1 && selected(verified[0])) {
                if (pickerIsOpen(currentTrigger)) closeOpened(currentTrigger);
                return true;
              }
              await new Promise(resolve => setTimeout(resolve, 100));
            }
            return false;
          } finally {
            const currentTrigger = getTrigger() || trigger;
            if (!pendingNativeClick && (opened || phase === 'verify') && pickerIsOpen(currentTrigger)) closeOpened(currentTrigger);
          }
        })()
      `, true);
      if (!native) return (await run('select')) === true;
      const position = await run('locate');
      if (typeof position === 'boolean') return position;
      if (!position || (!position.keyboard && (!Number.isFinite(position.x) || !Number.isFinite(position.y)))) return false;
      const debuggerApi = webContents.debugger;
      const attachHere = !debuggerApi.isAttached();
      if (attachHere) debuggerApi.attach('1.3');
      try {
        if (position.keyboard) {
          const key = { key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 };
          await debuggerApi.sendCommand('Input.dispatchKeyEvent', { ...key, type: 'rawKeyDown' });
          await debuggerApi.sendCommand('Input.dispatchKeyEvent', { ...key, type: 'keyUp' });
        } else {
          const point = { x: position.x, y: position.y, button: 'left', clickCount: 1 };
          await debuggerApi.sendCommand('Input.dispatchMouseEvent', {
            x: position.x, y: position.y, type: 'mouseMoved', buttons: 0,
          });
          await debuggerApi.sendCommand('Input.dispatchMouseEvent', { ...point, type: 'mousePressed', buttons: 1 });
          await debuggerApi.sendCommand('Input.dispatchMouseEvent', { ...point, type: 'mouseReleased', buttons: 0 });
        }
      } finally {
        if (attachHere && debuggerApi.isAttached()) debuggerApi.detach();
      }
      await this.openNativePicker(config, webContents);
      return (await run('verify', position)) === true;
    } catch {
      return false;
    } finally {
      if (config) await this.closeNativePicker(config, webContents).catch(() => {});
    }
  }

  private static async getBuiltinPicker(providerId: string): Promise<CustomRecipe['modelSelection']> {
    const bundled = (BUILTIN_RECIPES as Record<string, CustomRecipe>)[providerId]?.modelSelection;
    const installed = await this.getCustomRecipe(providerId);
    return (installed?.id === providerId ? installed.modelSelection : undefined) ?? bundled;
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

  public static async selectModelAndEffort(provider: ProviderId, model: string | undefined, effort: string | undefined, contents: WebContents): Promise<void> {
    if (provider === 'chatgpt' && model && model !== 'default' && effort) {
      // On a fresh composer the slider is available before entering the model
      // list. Selecting a model can leave the picker on that list.
      await this.selectEffort(provider, contents, effort).catch(() => {});
    }
    if (model) await this.selectRequestedModel(provider, model, contents);
    // Verify again against the final model. A model change can reset its effort.
    if (effort) await this.selectEffort(provider, contents, effort);
  }

  public static async readEfforts(provider: ProviderId, contents: WebContents, effort?: string, onCurrent?: (effort: string) => void): Promise<Record<string, string>> {
    const config = provider.startsWith('webview_') || provider.startsWith('custom_') || provider.startsWith('recipe_')
      ? (await this.getCustomRecipe(provider))?.modelSelection
      : await this.getBuiltinPicker(provider);
    if (!config?.trigger || !config.effort) return {};
    const inspect = (select?: string, verify = false, hovered = false) => contents.executeJavaScript(`
      (async () => {
        ${this.pickerScript(config)}
        const effort = ${JSON.stringify(select)};
        const spec = config.effort;
        const trigger = getTrigger();
        if (!trigger) return {};
        const pause = () => new Promise(resolve => setTimeout(resolve, 160));
        if (trigger.getAttribute('aria-expanded') !== 'true' || !getMenu(trigger)) openPicker(trigger);
        await pause();
        if (spec.slider) {
          let menu = getMenu(trigger);
          const powerControls = () => {
            const scoped = Array.from(menu?.querySelectorAll(spec.panel) || []).filter(visible);
            if (menu?.matches(spec.panel) && visible(menu)) scoped.unshift(menu);
            if (scoped.length || trigger.getAttribute('aria-expanded') !== 'true') return scoped;
            // The slider can render in a portal adjacent to the controlled popover.
            return Array.from(document.querySelectorAll(spec.panel)).filter(visible);
          };
          if (!powerControls().length && config.submenu) {
            const toggles = modelListToggles(menu);
            if (toggles.length === 1 && !disabled(toggles[0])) {
              toggles[0].click();
              await pause();
              menu = getMenu(trigger);
            }
          }
          const candidates = powerControls();
          const controls = candidates.filter(candidate => !candidates.some(parent => parent !== candidate && parent.contains(candidate)));
          if (controls.length !== 1 || disabled(controls[0])) {
            const current = trigger.getAttribute('data-selected-reasoning-effort');
            const label = Object.hasOwn(spec.labels, current) && spec.labels[current];
            const modelList = choices(trigger).length > 0;
            if (!label) return { modelList };
            if (effort) return effort === current ? { [current]: label, modelList } : { modelList };
            return { efforts: { [current]: label }, current, modelList };
          }
          const control = controls[0];
          const slider = control.matches(spec.slider) ? control : control.querySelector(spec.slider);
          if (!slider?.getClientRects().length) return {};
          const description = [slider, control].map(element => element.getAttribute('aria-describedby') || '').join(' ').trim().split(/ +/)
            .map(id => document.getElementById(id)?.textContent || '').join(' ');
          const keyboardTarget = control.tabIndex >= 0 ? control : slider;
          keyboardTarget.focus();
          return {
            slider: true,
            value: slider.getAttribute('aria-valuetext') || description.trim().match(/^(.+?), +[0-9]+ of [0-9]+/)?.[1],
            effortId: trigger.getAttribute('data-selected-reasoning-effort'),
            position: Number.parseInt(slider.getAttribute('aria-valuenow'), 10),
            minimum: Number.parseInt(slider.getAttribute('aria-valuemin'), 10),
            maximum: Number.parseInt(slider.getAttribute('aria-valuemax'), 10),
            locked: /locked|upgrade/i.test(description),
          };
        }
        const parent = getMenu(trigger);
        const sub = Array.from(parent?.querySelectorAll(spec.submenu) || []).filter(item =>
          visible(item) && (!spec.submenuLabel || (item.getAttribute('aria-label') || item.textContent || '')
            .trim().toLowerCase().startsWith(spec.submenuLabel.toLowerCase())));
        if (sub.length !== 1 || disabled(sub[0])) return {};
        if (spec.submenuInput === 'hover' && !${JSON.stringify(hovered)}) {
          const rect = sub[0].getBoundingClientRect();
          return { hover: { x: Math.round(rect.x + rect.width / 2), y: Math.round(rect.y + rect.height / 2) } };
        }
        if (spec.submenuInput !== 'hover' && sub[0].getAttribute('aria-expanded') !== 'true') {
          sub[0].focus();
          sub[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
          await pause();
          if (sub[0].getAttribute('aria-expanded') !== 'true') {
            sub[0].click();
            await pause();
          }
        }
        const owned = document.getElementById(sub[0].getAttribute('aria-controls') || '');
        const menus = Array.from(document.querySelectorAll('[role="menu"]')).filter(menu => menu !== parent && visible(menu));
        const menu = owned && visible(owned) ? owned : menus.length === 1 ? menus[0] : null;
        if (!menu) return {};
        const options = Array.from(menu.querySelectorAll(spec.item)).filter(item => visible(item) && !disabled(item));
        const result = {};
        const current = [];
        for (const [id, label] of Object.entries(spec.labels)) {
          const matches = options.filter(item => [item.getAttribute('aria-label'), item.textContent,
            ...Array.from(item.querySelectorAll('span, div')).filter(child => !child.children.length).map(child => child.textContent)]
            .some(value => value && new RegExp('^(?:selected )?' + label.replace(/[^a-z ]/gi, '') + '(?:$|[ ,\\\\s])', 'i').test(value.trim())));
          if (matches.length !== 1) continue;
          const item = matches[0];
          if (!effort) result[id] = label;
          if (!effort && isSelected(item)) current.push(id);
          if (effort === id) {
            if (item.matches('[aria-checked="true"], [aria-selected="true"], [data-state="checked"], .selected') ||
              /^(Selected\\s)/i.test(item.getAttribute('aria-label') || '')) return { [id]: label };
            if (!${JSON.stringify(verify)}) item.click();
            return {};
          }
        }
        return { efforts: result, current: current.length === 1 ? current[0] : undefined };
      })()
    `, true);
    const inspectEffort = async (select?: string, verify = false) => {
      const state = await inspect(select, verify);
      if (!state.hover) return state;
      await this.dispatchPickerInput(contents, 'Input.dispatchMouseEvent', {
        type: 'mouseMoved', ...state.hover, buttons: 0,
      });
      await new Promise(resolve => setTimeout(resolve, 250));
      return inspect(select, verify, true);
    };
    const result: Record<string, string> = {};
    try {
      await this.openNativePicker(config, contents);
      let first = await inspectEffort(effort);
      if (config.effort.slider) {
        if (config.openInput === 'native' && first.modelList && !(effort && first[effort])) {
          await this.closeNativePicker(config, contents).catch(() => {});
          await this.openNativePicker(config, contents);
          first = await inspect(effort);
        }
        for (let attempt = 0; attempt < 5 && !first.slider && !(effort && first[effort]); attempt++) {
          await new Promise(resolve => setTimeout(resolve, 200));
          first = await inspect(effort);
        }
      }
      if (first.slider) {
        if (![first.minimum, first.maximum, first.position].every(Number.isInteger) ||
            first.maximum - first.minimum > 10 || first.position < first.minimum || first.position > first.maximum) return {};
        const labels = Object.entries(config.effort.labels);
        const observedChoice = (state: typeof first) => {
          if (state.locked) return undefined;
          const byLabel = labels.find(([, label]) => label.toLowerCase() === state.value?.trim().toLowerCase());
          // The trigger exposes the committed effort even when the slider has
          // no aria-valuetext and its accessible description has not updated.
          const byId = labels.find(([id]) => id === state.effortId);
          return byLabel || byId;
        };
        const current = observedChoice(first);
        if (current) onCurrent?.(current[0]);
        let state = first;
        const move = async (keyCode: 'Left' | 'Right') => {
          const key = 'Arrow' + keyCode;
          const event = { key, code: key, windowsVirtualKeyCode: keyCode === 'Left' ? 37 : 39 };
          await this.dispatchPickerInput(contents, 'Input.dispatchKeyEvent', { ...event, type: 'rawKeyDown' });
          await this.dispatchPickerInput(contents, 'Input.dispatchKeyEvent', { ...event, type: 'keyUp' });
          const observed = await inspect(effort);
          return observed;
        };
        for (let position = first.position; position > first.minimum; position--) {
          const next = await move('Left');
          if (!next.slider || next.position !== position - 1) break;
          state = next;
        }
        for (let position = state.position; position <= first.maximum; position++) {
          const choice = observedChoice(state);
          if (choice) {
            const [id, label] = choice;
            result[id] = label;
            if (id === effort) return result;
          }
          if (position === first.maximum) break;
          const next = await move('Right');
          if (!next.slider || next.position !== position + 1) break;
          state = next;
        }
        while (state.position > first.position) {
          const next = await move('Left');
          if (!next.slider || next.position !== state.position - 1) break;
          state = next;
        }
        while (state.position < first.position) {
          const next = await move('Right');
          if (!next.slider || next.position !== state.position + 1) break;
          state = next;
        }
        return effort ? {} : result;
      }
      if (!effort) {
        if (first.current) onCurrent?.(first.current);
        return first.efforts ?? {};
      }
      if (first[effort]) return { [effort]: first[effort] };
      const verified = await inspectEffort(effort, true);
      return verified[effort] ? verified : {};
    } finally {
      await this.closeNativePicker(config, contents).catch(() => {});
      await contents.executeJavaScript(`(() => {
        ${this.pickerScript(config)}
        const trigger = getTrigger();
        if (trigger?.getAttribute('aria-expanded') === 'true') closeOpened(trigger);
      })()`, true).catch(() => {});
    }
  }

  private static async dispatchPickerInput(contents: WebContents, method: string, params: Record<string, unknown>): Promise<void> {
    // Discovery runs in a hidden probe window. CDP sends trusted input to that
    // target without moving focus away from the user's foreground window.
    const debuggerApi = contents.debugger;
    const attachedHere = !debuggerApi.isAttached();
    if (attachedHere) debuggerApi.attach('1.3');
    try {
      await debuggerApi.sendCommand(method, params);
    } finally {
      if (attachedHere && debuggerApi.isAttached()) debuggerApi.detach();
    }
  }

  public static async selectEffort(provider: ProviderId, contents: WebContents, effort: string): Promise<void> {
    const observed = await this.readEfforts(provider, contents, effort).catch(() => ({}));
    if (!Object.hasOwn(observed, effort)) {
      throw new Error('[MODEL_SELECTION_FAILED] The requested reasoning effort could not be verified before submission.');
    }
  }

  private static async scrapeCustomWebview(
    providerId: ProviderId,
    webContents: WebContents, liveOnly: boolean
  ): Promise<Array<{ id: string; displayName: string; requiresTier?: string }>> {
    const recipe = await this.getCustomRecipe(providerId);
    if (!recipe) return [];
    const configured = (recipe.models || []).map(m => ({
      id: m.id, displayName: m.displayName, requiresTier: m.requiresTier,
    }));
    if (!recipe.modelSelection) return liveOnly ? [] : configured;
    try {
      const found = await webContents.executeJavaScript(`
        (async function() {
          ${providerQueryScript(recipe.openShadowDom === true)}
          const cfg = ${JSON.stringify(recipe.modelSelection)};
          const configured = ${JSON.stringify(configured)};
          const models = new Map();
          const pause = () => new Promise(r => setTimeout(r, 250));
          const scrape = () => {
            for (const item of queryAll(document, cfg.item)) {
              if (item.getClientRects && !item.getClientRects().length) continue;
              if (item.matches?.('[aria-disabled="true"], [disabled], [data-disabled]')) continue;
              const name = cfg.name ? queryOne(item, cfg.name) : item;
              const label = (name?.innerText || name?.textContent || name?.getAttribute('alt') || '').trim();
              const firstLine = label.split('\\n')[0].trim().toLowerCase();
              const known = configured.find(m => m.displayName.toLowerCase() === label.toLowerCase() ||
                m.displayName.toLowerCase() === firstLine);
              const displayName = known?.displayName || label;
              const id = (cfg.idAttribute && item.getAttribute(cfg.idAttribute)) || known?.id || displayName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
              if (id) models.set(id, {
                id, displayName: displayName || id,
                requiresTier: (cfg.tier ? queryOne(item, cfg.tier)?.textContent?.trim() : undefined) || known?.requiresTier,
              });
            }
          };
          let opened = false;
          try {
            scrape();
            if (models.size === 0 && cfg.trigger) {
              let trigger = queryOne(document, cfg.trigger);
              for (let attempt = 0; attempt < 16 && !trigger; attempt++) {
                await pause();
                trigger = queryOne(document, cfg.trigger);
              }
              if (trigger) {
                trigger.click();
                opened = true;
                for (let attempt = 0; attempt < 12 && !models.size; attempt++) {
                  await pause();
                  scrape();
                }
              }
            }
            if (cfg.tabs) {
              for (const tab of queryAll(document, cfg.tabs)) {
                tab.click(); await pause(); scrape();
              }
            }
            const scroll = cfg.scrollContainer && queryOne(document, cfg.scrollContainer);
            if (scroll) {
              const previousTop = scroll.scrollTop;
              try { scroll.scrollTop = scroll.scrollHeight; await pause(); scrape(); }
              finally { scroll.scrollTop = previousTop; }
            }
            return Array.from(models.values());
          } finally {
            if (opened && cfg.close) queryOne(document, cfg.close)?.click();
          }
        })()
      `, true);
      return Array.isArray(found) && found.length ? found : liveOnly ? [] : configured;
    } catch {
      return liveOnly ? [] : configured;
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
          ${providerQueryScript(recipe.openShadowDom === true)}
          const cfg = ${JSON.stringify(recipe.modelSelection)};
          const targetId = ${JSON.stringify(targetModelId)};
          const targetName = ${JSON.stringify(target?.displayName || targetModelId)};
          const normalize = value => String(value).toLowerCase().replace(/[^a-z0-9]+/g, '');
          const pause = () => new Promise(r => setTimeout(r, 250));
          const find = () => Array.from(queryAll(document, cfg.item)).find(item => {
            if (item.getClientRects && !item.getClientRects().length) return false;
            if (item.matches?.('[aria-disabled="true"], [disabled]')) return false;
            if (cfg.idAttribute && item.getAttribute(cfg.idAttribute) === targetId) return true;
            const name = cfg.name ? queryOne(item, cfg.name) : item;
            const label = name?.textContent?.trim() || name?.getAttribute('alt') || '';
            return normalize(label) === normalize(targetName) || normalize(label) === normalize(targetId);
          });
          const isActive = () => {
            if (!cfg.trigger) return false;
            const trigger = queryOne(document, cfg.trigger);
            if (!trigger) return false;
            const labels = [trigger.textContent?.trim(), queryOne(trigger, 'img[alt]')?.getAttribute('alt')];
            if (openShadowDom) {
              for (const slot of queryAll(trigger, 'slot:not([name])')) {
                labels.push(...slot.assignedElements({ flatten: true }).map(element =>
                  element.innerText?.trim() || element.textContent?.trim()));
              }
            }
            if (cfg.activeLabel) labels.push(queryOne(document, cfg.activeLabel)?.textContent?.trim());
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
              const trigger = queryOne(document, cfg.trigger);
              if (trigger) { trigger.click(); opened = true; item = await waitFor(find); }
            }
            if (!item && cfg.tabs) {
              for (const tab of queryAll(document, cfg.tabs)) {
                tab.click(); item = await waitFor(find);
                if (item) break;
              }
            }
            if (!item) return false;
            item.click(); await pause();
            if (cfg.confirm) {
              const confirm = Array.from(queryAll(document, cfg.confirm)).find(button =>
                !cfg.confirmText || button.textContent?.trim() === cfg.confirmText);
              confirm?.click();
            }
            return Boolean(await waitFor(isActive));
          } finally {
            if (opened && cfg.close) queryOne(document, cfg.close)?.click();
          }
        })()
      `, true);
    } catch {
      return false;
    }
  }
}
