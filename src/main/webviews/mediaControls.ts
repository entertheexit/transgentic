import type { MediaLocator, RecipeGeneration, MediaSettings, MediaStep, MediaChoice } from '../../shared/media.js';

/** Self-contained so the same resolver can run in provider pages and DOM fixtures. */
export function findMediaControl(locator: MediaLocator, anyVisible = false): Element | null {
  const l = innerWidth < 768 && locator.compact ? { ...locator, ...locator.compact } : locator;
  const visible = (el: Element) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.display !== 'none' && s.visibility !== 'hidden' && s.opacity !== '0'; };
  const normalize = (v: string | null) => (v || '').replace(/\s+/g, ' ').trim().toLowerCase();
  let root: ParentNode = document;
  if (l.scope) { const scopes = Array.from(document.querySelectorAll(l.scope)).filter(visible); if (!scopes.length) return null; if (scopes.length !== 1) throw new Error('Media control scope is ambiguous.'); root = scopes[0]; }
  const selectors = typeof l.selectors === 'string' ? [l.selectors] : l.selectors || [l.role === 'button' ? 'button,[role="button"]' : '[role]'];
  for (const selector of selectors) {
    let els = Array.from(root.querySelectorAll(selector)).filter(visible);
    if (l.role) els = els.filter(el => (el.getAttribute('role') || (el.tagName === 'BUTTON' ? 'button' : '')).toLowerCase() === l.role!.toLowerCase());
    const names = (typeof l.name === 'string' ? [l.name] : l.name || []).map(normalize);
    if (names.length) els = els.filter(el => [el.getAttribute('aria-label'), el.getAttribute('title'), el.textContent].some(text => names.some(name => l.nameMatch === 'contains' ? normalize(text).includes(name) : normalize(text) === name)));
    if (!els.length) continue;
    if (l.index !== undefined) {
      if (els.length !== l.expectedCount) throw new Error(`Media option count changed (${els.length} visible, ${root.querySelectorAll(selector).length} total, expected ${l.expectedCount}, viewport ${innerWidth}). Update the recipe.`);
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

export async function applyMediaControls(config: RecipeGeneration, settings: MediaSettings, run: <T>(script: string) => Promise<T>, signal?: AbortSignal, escape?: () => void): Promise<() => Promise<void>> {
  const inspect = async (target: MediaLocator, click: boolean | 'pointerDown' = false, anyVisible = false): Promise<boolean> => {
    const action = click === 'pointerDown' ? '(el.closest("button,[role=button]") || el).dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true, button: 0, buttons: 1, pointerType: "mouse", isPrimary: true }));' : click ? '(el.closest("button,[role=button],[role=option],[role=menuitemradio],[role=radio]") || el).click();' : '';
    const result = await run<boolean | { error: string }>(`(() => { try { const el = (${findMediaControl.toString()})(${JSON.stringify(target)}, ${anyVisible}); if (!el) return false; ${action} return true; } catch (error) { return { error: String(error.message || error) }; } })()`);
    if (typeof result !== 'boolean') throw new Error(result.error);
    return result;
  };
  const wait = async (target: MediaLocator, click: boolean | 'pointerDown' = false, absent = false) => {
    const deadline = Date.now() + 5000;
    let structureError: Error | undefined;
    do {
      if (signal?.aborted) throw Object.assign(new Error('Media setup cancelled.'), { name: 'AbortError' });
      let present = false;
      try { present = await inspect(target, click, absent); structureError = undefined; }
      catch (error) {
        // Animated menus may expose only part of their option group initially.
        // Never select until the complete count guard succeeds.
        if (!(error instanceof Error) || !error.message.startsWith('Media option count changed (')) throw error;
        structureError = error;
      }
      if (absent ? !present : present) return;
      await new Promise(resolve => setTimeout(resolve, 100));
    } while (Date.now() < deadline);
    if (structureError) throw structureError;
    throw new Error(`Media ${absent ? 'menu close' : click ? 'selection' : 'selected-value'} check failed for ${target.scope || ''} ${JSON.stringify(target.selectors || target.role)}${target.index === undefined ? '' : ` option ${target.index}`}.`);
  };
  const execute = async (steps: MediaStep[] = []) => {
    for (const step of steps) {
      if (signal?.aborted) throw Object.assign(new Error('Media setup cancelled.'), { name: 'AbortError' });
      if (step.action === 'click') await wait(step.target, true);
      else if (step.action === 'pointerDown') await wait(step.target, 'pointerDown');
      else if (step.action === 'clickIfPresent') await inspect(step.target, true);
      else if (step.action === 'waitAbsent') await wait(step.target, false, true);
      else if (escape) escape();
      else throw new Error('Escape action is unavailable.');
    }
  };
  const verifyChoice = async (choice: MediaChoice) => {
    await execute(choice.verificationSteps);
    try { await wait(choice.selectedWhen); } finally { await execute(choice.closeSteps); }
  };
  try {
    if (!await inspect(config.activeWhen)) {
      await execute(config.activationSteps);
      await wait(config.activeWhen);
    }
    const verify = async () => {
      await wait(config.activeWhen);
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
      if (!await inspect(choice.selectedWhen)) await execute(choice.steps);
      await verifyChoice(choice);
    }
    await verify();
    return async () => { try { await verify(); } catch (error: any) { throw new Error(`[MEDIA_SETTINGS_FAILED] ${error.message}`); } };
  } catch (error: any) {
    if (error?.name === 'AbortError') throw error;
    throw new Error(`[MEDIA_SETTINGS_FAILED] ${error.message}`);
  }
}
