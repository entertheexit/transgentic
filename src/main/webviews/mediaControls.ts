import { providerQueryScript } from './domQuery.js';
import type { MediaLocator, RecipeGeneration, MediaSettings, MediaStep, MediaChoice } from '../../shared/media.js';

/** Self-contained so the same resolver can run in provider pages and DOM fixtures. */
export function findMediaControl(locator: MediaLocator, anyVisible = false, query = (root: ParentNode, selector: string) => Array.from(root.querySelectorAll(selector))): Element | null {
  const l = innerWidth < 768 && locator.compact ? { ...locator, ...locator.compact } : locator;
  const visible = (el: Element) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.display !== 'none' && s.visibility !== 'hidden' && s.opacity !== '0'; };
  const normalize = (v: string | null) => (v || '').replace(/\s+/g, ' ').trim().toLowerCase();
  let root: ParentNode = document;
  if (l.scope) { const scopes = query(document, l.scope).filter(visible); if (!scopes.length) return null; if (scopes.length !== 1) throw new Error('Media control scope is ambiguous.'); root = scopes[0]; }
  const selectors = typeof l.selectors === 'string' ? [l.selectors] : l.selectors || [l.role === 'button' ? 'button,[role="button"]' : '[role]'];
  for (const selector of selectors) {
    let els = query(root, selector).filter(visible);
    if (l.role) els = els.filter(el => (el.getAttribute('role') || (el.tagName === 'BUTTON' ? 'button' : '')).toLowerCase() === l.role!.toLowerCase());
    const names = (typeof l.name === 'string' ? [l.name] : l.name || []).map(normalize);
    if (names.length) els = els.filter(el => [el.getAttribute('aria-label'), el.getAttribute('title'), el.textContent].some(text => names.some(name => l.nameMatch === 'contains' ? normalize(text).includes(name) : normalize(text) === name)));
    if (!els.length) continue;
    if (l.index !== undefined) {
      if (els.length !== l.expectedCount) throw new Error(`Media option count changed (${els.length} visible, ${query(root, selector).length} total, expected ${l.expectedCount}, viewport ${innerWidth}). Update the recipe.`);
      if (l.identities && els.some((el, i) => { const identity = l.identitySelector ? el.querySelector(l.identitySelector) : el; return (l.identityAttribute === 'textContent' ? identity?.textContent?.trim() : identity?.getAttribute(l.identityAttribute!)) !== l.identities![i]; })) throw new Error('Media option order changed. Update the recipe.');
      els = [els[l.index]];
    }
    if (els.length !== 1 && !anyVisible) throw new Error('Media control is ambiguous.');
    const el = els[0];
    if (l.requiredAttributes && Object.entries(l.requiredAttributes).some(([key, value]) => el.getAttribute(key) !== value)) return null;
    if (el.hasAttribute('disabled') || el.getAttribute('aria-disabled') === 'true') throw new Error('Media option is unavailable for this account.');
    return el;
  }
  return null;
}

/** Preserve resolver errors across Electron's otherwise generic script rejection. */
export async function inspectMediaControl(
  run: <T>(script: string) => Promise<T>,
  target: MediaLocator,
  click: boolean | 'pointerDown' = false,
  anyVisible = false,
  openShadow = false
): Promise<boolean> {
  let action = '';
  if (click === 'pointerDown') {
    action = '(el.closest("button,[role=button]") || el).dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true, button: 0, buttons: 1, pointerType: "mouse", isPrimary: true }));';
  } else if (click) {
    action = '(el.closest("button,[role=button],[role=option],[role=menuitemradio],[role=radio]") || el).click();';
  }
  const result = await run<boolean | { error: string }>(`(() => {
    try {
      ${providerQueryScript(openShadow)}
      const el = (${findMediaControl.toString()})(${JSON.stringify(target)}, ${anyVisible}, queryAll);
      if (!el) return false;
      ${action}
      return true;
    } catch (error) {
      return { error: String(error.message || error) };
    }
  })()`);
  if (typeof result !== 'boolean') throw new Error(result.error);
  return result;
}

export async function applyMediaControls(config: RecipeGeneration, settings: MediaSettings, run: <T>(script: string) => Promise<T>, signal?: AbortSignal, escape?: () => void, openShadow = false): Promise<(afterInput?: boolean) => Promise<void>> {
  const readiness = config.strategy === 'prompt' ? config.readyWhen : config.activeWhen;
  const inspect = (target: MediaLocator, click: boolean | 'pointerDown' = false, anyVisible = false) =>
    inspectMediaControl(run, target, click, anyVisible, openShadow);
  const inspectStable = async (target: MediaLocator): Promise<boolean> => {
    const deadline = Date.now() + 5000;
    do {
      if (signal?.aborted) throw Object.assign(new Error('Media setup cancelled.'), { name: 'AbortError' });
      try { return await inspect(target); }
      catch (error) {
        if (!(error instanceof Error) ||
          error.message !== 'Media control scope is ambiguous.' ||
          Date.now() >= deadline) {
          throw error;
        }
        // The provider can briefly render both outgoing and incoming menu overlays.
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    } while (true);
  };
  const checkUnavailable = async () => {
    if (config.unavailableWhen && await inspect(config.unavailableWhen, false, true)) {
      throw new Error('[MEDIA_UNAVAILABLE] ' + (config.unavailableMessage || 'Native media access requires an account or subscription change.'));
    }
  };
  const wait = async (target: MediaLocator, click: boolean | 'pointerDown' = false, absent = false, activation = false) => {
    const deadline = Date.now() + 5000;
    let structureError: Error | undefined;
    do {
      if (signal?.aborted) throw Object.assign(new Error('Media setup cancelled.'), { name: 'AbortError' });
      if (activation) await checkUnavailable();
      let present = false;
      try { present = await inspect(target, click, absent); structureError = undefined; }
      catch (error) {
        // Animated menus may expose only part of their option group initially.
        // Never select until the complete count guard succeeds.
        if (!(error instanceof Error) ||
          (!error.message.startsWith('Media option count changed (') &&
            error.message !== 'Media control scope is ambiguous.')) {
          throw error;
        }
        structureError = error;
      }
      if (absent ? !present : present) return;
      await new Promise(resolve => setTimeout(resolve, 100));
    } while (Date.now() < deadline);
    if (structureError) throw structureError;
    const control = target.name || target.selectors || target.role;
    const scope = target.scope ? ` in ${target.scope}` : '';
    const index = target.index === undefined ? '' : ` option ${target.index}`;
    throw new Error(`Media ${absent ? 'menu close' : click ? 'selection' : 'selected-value'} check failed for ${JSON.stringify(control)}${scope}${index}.`);
  };
  const execute = async (steps: MediaStep[] = [], activation = false) => {
    for (const step of steps) {
      if (signal?.aborted) throw Object.assign(new Error('Media setup cancelled.'), { name: 'AbortError' });
      if (step.action === 'click') await wait(step.target, true, false, activation);
      else if (step.action === 'pointerDown') await wait(step.target, 'pointerDown', false, activation);
      else if (step.action === 'clickIfPresent') await inspect(step.target, true);
      else if (step.action === 'waitAbsent') await wait(step.target, false, true);
      else if (escape) escape();
      else throw new Error('Escape action is unavailable.');
      if (activation) await checkUnavailable();
    }
  };
  const verifyChoice = async (choice: MediaChoice) => {
    await execute(choice.verificationSteps);
    try { await wait(choice.selectedWhen); } finally { await execute(choice.closeSteps); }
  };
  try {
    await checkUnavailable();
    if (!await inspectStable(readiness)) {
      await execute(config.activationSteps, true);
      await wait(readiness);
    }
    const verify = async (afterInput = false) => {
      // Empty-composer markers are consumed by typing. The caller verifies
      // continuity of the same editor and draft before clicking Submit.
      if (!afterInput || config.activationMarker !== 'empty-composer') {
        await wait(afterInput && config.afterInputWhen ? config.afterInputWhen : readiness);
      }
      for (const setting of config.settings) {
        if (!(setting.key in settings)) continue;
        const choice = setting.options.find(o => o.value === settings[setting.key]);
        if (!choice) throw new Error(`Unsupported ${setting.key}.`);
        await verifyChoice(choice);
      }
    };
    for (const setting of config.settings) {
      if (!(setting.key in settings)) continue;
      const choice = setting.options.find(o => o.value === settings[setting.key]);
      if (!choice) throw new Error(`Unsupported ${setting.key}.`);
      if (!await inspectStable(choice.selectedWhen)) await execute(choice.steps);
      await verifyChoice(choice);
    }
    await verify();
    return async (afterInput = false) => { try { await verify(afterInput); } catch (error: any) { throw new Error(`[MEDIA_SETTINGS_FAILED] ${error.message}`); } };
  } catch (error: any) {
    if (error?.name === 'AbortError') throw error;
    if (error?.message?.includes('[MEDIA_UNAVAILABLE]')) throw error;
    throw new Error(`[MEDIA_SETTINGS_FAILED] ${error.message}`);
  }
}
