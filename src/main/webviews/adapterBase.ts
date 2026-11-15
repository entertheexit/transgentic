import { WebContents } from 'electron';
import { ProviderId, TaskMode } from '../../shared/types.js';
import { ProjectMetadata } from '../storage/projectManager.js';
import { InputDispatcher } from '../security/inputDispatcher.js';
import { InputSimulator, InputSimulatorOptions } from '../security/inputSimulator.js';
import { GhostCursor, GhostCursorOptions } from '../security/ghostCursor.js';
import { DomObserver, DomInspectionResult } from './domObserver.js';
import { TimeoutManager } from '../config/timeouts.js';
import { toCombinedCssSelector, type CustomRecipe } from '../../shared/types/recipe.js';
import type { StagedAttachment } from '../../shared/attachments.js';

export interface ProviderAdapterResult {
  text: string;
  media?: {
    type: 'image' | 'video' | 'audio';
    data: string; // Base64 or URL
    suggestedName?: string;
  };
}

const THINKING_PATTERNS = [
  /^(Thinking|Thought|Working|Worked|Searching|Reasoning|Processing|Generating)(\.\.\.)?$/i,
  /^(Thought|Worked|Reasoned|Searched)\s+for.*$/i,
  /^Processing,?\s*please\s*wait.*$/i,
  /^(Thinking)?Generating\s+(a\s+)?.*image.*hang\s*tight.*$/i,
  /^(Thinking)?Generating\s+(an?\s+)?.*image.*$/i,
  /^(Thinking)?Creating\s+(an?\s+)?.*image.*$/i,
  /^Thinking\s*Generating.*$/i,
  /^.*hang\s*tight\.?$/i,
  /^(กำลังประมวลผล|กำลังประมวลผล\s*กรุณารอสักครู่.*|กรุณารอสักครู่.*|กำลังสร้าง.*|กำลังสร้างวิดีโอ.*|กำลังสร้างเพลง.*|กำลังสร้างเสียง.*|กำลังสร้างรูปภาพ.*|กำลังคิด.*|กำลังค้นหา.*|.*\d+%\s*กรุณารอสักครู่.*)$/i,
  /^(AI\s*อาจผิดพลาดได้.*|หลีกเลี่ยงการใส่ข้อมูลส่วนตัว.*|AI\s*may\s*make\s*mistakes.*)$/i,
];

export function cleanModelOutput(text: string): string {
  if (!text) return '';
  const trimmed = text.trim();
  if (THINKING_PATTERNS.some((pattern) => pattern.test(trimmed))) {
    return '';
  }
  return trimmed
    .replace(/^(Worked|Working|Thought|Thinking|Searched|Reasoned)\s+for\s+\d+s?\b\s*>?\s*/i, '')
    .replace(/^(Thinking)?Generating\s+(a\s+)?(more\s+)?(detailed\s+)?image\s*[-—–]\s*hang\s*tight\.?\s*/i, '')
    .replace(/^(Thinking)?Generating\s+(an?\s+)?(detailed\s+)?image\.\.\.\s*/i, '')
    .replace(/^(Thinking)?Creating\s+(an?\s+)?image\.\.\.\s*/i, '')
    .replace(/^(Worked|Working|Thinking|Processing|กำลังประมวลผล|กำลังคิด|กำลังสร้างวิดีโอ|กำลังสร้างเพลง|กำลังสร้างเสียง|กำลังสร้าง)\.\.\.\s*/i, '')
    .replace(/^(กำลังประมวลผล\s*กรุณารอสักครู่\s*)+/i, '')
    .replace(/^(กำลังสร้าง(?:วิดีโอ|เพลง|เสียง|รูปภาพ)?(?:แล้ว)?\s*(?:\d*%)?\s*กรุณารอสักครู่(?:อาจใช้เวลาประมาณหนึ่งนาที)?\s*)+/i, '')
    .replace(/^(Processing,?\s*please\s*wait\.?\s*)+/i, '')
    .replace(/^Thinking\s*/i, '')
    .replace(/\n*\d+\s+sources?\s*$/i, '')
    .replace(/^AI\s*อาจผิดพลาดได้.*หลีกเลี่ยงการใส่ข้อมูลส่วนตัวหรือความลับ\s*/i, '')
    .replace(/^AI\s*may\s*make\s*mistakes.*$/i, '')
    .trim();
}

export interface PollGenerationOptions {
  mode: TaskMode;
  timeoutMs?: number;
  abortSignal?: AbortSignal;
  onChunk?: (chunk: string) => void;
  metadata?: ProjectMetadata;
  excludedMediaUrls?: string[];
  previousResponse?: Pick<DomInspectionResult, 'text' | 'responseTurnCount'>;
}

export abstract class BaseProviderAdapter {
  abstract readonly providerId: ProviderId;
  abstract readonly name: string;
  abstract readonly url: string;
  abstract readonly partition: string;

  protected webContents: WebContents | null = null;
  protected suppressScriptDiagnostics = false;
  protected customPartition: string | null = null;

  public setCustomPartition(partition?: string | null): void {
    this.customPartition = partition || null;
  }

  public getActivePartition(): string {
    return this.customPartition || this.partition;
  }

  public setWebContents(webContents: WebContents): void {
    this.webContents = webContents;
  }

  public detach(): void {
    this.webContents = null;
  }

  public getWebContents(): WebContents | null {
    return this.webContents;
  }

  private static readonly viewLocks = new WeakMap<WebContents, { busy: boolean; queue: (() => void)[] }>();
  private readonly detachedLock = { busy: false, queue: [] as (() => void)[] };

  private getDomLock() {
    const view = this.webContents;
    if (!view) return this.detachedLock;
    let lock = BaseProviderAdapter.viewLocks.get(view);
    if (!lock) {
      lock = { busy: false, queue: [] };
      BaseProviderAdapter.viewLocks.set(view, lock);
    }
    return lock;
  }

  /** Serialize DOM operations across adapters attached to the same browser view. */
  public async acquireDomLock(): Promise<() => void> {
    const lock = this.getDomLock();
    if (lock.busy) await new Promise<void>(resolve => lock.queue.push(resolve));
    lock.busy = true;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      const next = lock.queue.shift();
      if (next) next();
      else lock.busy = false;
    };
  }

  public isLocked(): boolean {
    return this.getDomLock().busy;
  }

  /**
   * Evaluates a script inside the provider's WebContents.
   * Auto-ensures background WebContents exists if not currently active.
   */
  protected async executeScript<T>(code: string): Promise<T> {
    if (!this.webContents || this.webContents.isDestroyed()) {
      const { globalSessionManager } = await import('./sessionManager.js');
      this.webContents = await globalSessionManager.ensureWebContents(this.providerId);
    }
    try {
      return await this.webContents.executeJavaScript(code, true);
    } catch (err: any) {
      console.error(`[Transgentic] executeScript failed for provider ${this.providerId}:`, err?.message || err);
      if (!this.suppressScriptDiagnostics) console.error(`[Transgentic] Failed script code:\n`, code);
      throw err;
    }
  }

  /**
   * Resolves selector with any active self-healed overrides prioritized first.
   */
  public async getEffectiveSelector(
    landmark: 'inputPrompt' | 'submitButton' | 'stopButton' | 'modelDropdownTrigger',
    defaultSelector: string
  ): Promise<string> {
    try {
      const { globalHealingManager } = await import('../healing/healingManager.js');
      const custom = globalHealingManager.getCustomSelectors(this.providerId);
      if (custom && custom[landmark]) {
        return `${custom[landmark]}, ${defaultSelector}`;
      }
    } catch {}
    return defaultSelector;
  }

  /**
   * Dispatches text input to a target element using synthetic event cascades (beforeinput, input, change).
   */
  protected async dispatchRealisticInput(
    selector: string,
    text: string,
    options?: InputSimulatorOptions
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const effectiveSelector = await this.getEffectiveSelector('inputPrompt', selector);
      // 1. Focus element and clear selection
      const focused = await this.executeScript<boolean>(`
        (function() {
          try {
            const el = ${InputDispatcher.getInputTargetScript(effectiveSelector)};
            if (el) {
              el.focus();
              if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
                el.select?.();
              } else {
                const sel = el.getRootNode?.().getSelection?.() || window.getSelection();
                const range = document.createRange();
                range.selectNodeContents(el);
                sel?.removeAllRanges();
                sel?.addRange(range);
              }
              return (el.getRootNode?.() || document).activeElement === el;
            }
          } catch (e) {}
          return false;
        })()
      `);
      // Do not insert into whichever element happened to have focus when
      // the matching composer is hidden or has not mounted yet.
      if (focused && this.webContents && typeof this.webContents.insertText === 'function') {
        await this.webContents.insertText(text);
        const inserted = await this.executeScript<boolean>(`(function() {
          const el = ${InputDispatcher.getInputTargetScript(effectiveSelector)};
          if (!el) return false;
          const value = el.tagName === 'INPUT' || el.tagName === 'TEXTAREA'
            ? el.value : el.innerText || el.textContent || '';
          return value.replace(/\\r\\n/g, '\\n') === ${JSON.stringify(text)}.replace(/\\r\\n/g, '\\n');
        })()`);
        // Replacing trusted native input a second time can discard the provider's
        // editor state or an inline mode chip. Use DOM insertion only as fallback.
        if (inserted) return { success: true };
      }
    } catch {}

    // 3. Guarantee full DOM event cascades
    const effectiveFinalSelector = await this.getEffectiveSelector('inputPrompt', selector);
    const script = InputDispatcher.getDispatchScript(effectiveFinalSelector, text);
    return this.executeScript<{ success: boolean; error?: string }>(script);
  }

  /**
   * Dispatches realistic submission using button pointer/click cascades with Enter key fallback.
   */
  protected async dispatchRealisticSubmit(
    buttonSelector: string,
    inputSelector?: string,
    options?: GhostCursorOptions,
    requireButton = false,
    beforeSubmit?: () => void,
    submitReadyTimeoutMs?: number,
  ): Promise<{ success: boolean; error?: string; method?: string }> {
    const effectiveButton = await this.getEffectiveSelector('submitButton', buttonSelector);
    const effectiveInput = inputSelector ? await this.getEffectiveSelector('inputPrompt', inputSelector) : undefined;
    if (this.webContents && typeof this.webContents.sendInputEvent === 'function') {
      type SubmitTarget = { x?: number; y?: number; ambiguous?: boolean; offscreen?: boolean; obscured?: boolean };
      let target: SubmitTarget | null;
      const targetDeadline = Date.now() + (submitReadyTimeoutMs ?? 2_000);
      do {
        target = await this.executeScript<SubmitTarget | null>(
          InputDispatcher.getSubmitTargetScript(effectiveButton, effectiveInput)
        );
        // Closing provider menus can retain a pointer-intercepting backdrop
        // during their exit animation. Wait without clicking through it.
        if (target && !target.obscured && !target.offscreen) break;
        if (!target && !submitReadyTimeoutMs) break;
        if (Date.now() >= targetDeadline) break;
        await new Promise(resolve => setTimeout(resolve, 50));
      } while (true);
      if (target?.ambiguous) return { success: false, error: 'Multiple declared submit controls are actionable.' };
      if (target?.obscured) return { success: false, error: 'The declared submit control is covered by another provider control.' };
      if (target?.offscreen) return { success: false, error: 'The declared submit control is outside the provider viewport.' };
      if (Number.isFinite(target?.x) && Number.isFinite(target?.y)) {
        const debuggerApi = this.webContents.debugger;
        if (debuggerApi && typeof debuggerApi.sendCommand === 'function') {
          let attachedHere = false;
          let pressed = false;
          try {
            if (!debuggerApi.isAttached()) {
              debuggerApi.attach('1.3');
              attachedHere = true;
            }
            const position = { x: target!.x!, y: target!.y!, button: 'left', clickCount: 1 };
            await debuggerApi.sendCommand('Input.dispatchMouseEvent', { type: 'mouseMoved', ...position, buttons: 0 });
            beforeSubmit?.();
            pressed = true;
            // sendInputEvent requires a focused BrowserWindow. Protocol input is
            // trusted by the provider without focusing hidden execution windows.
            await debuggerApi.sendCommand('Input.dispatchMouseEvent', { type: 'mousePressed', ...position, buttons: 1 });
            await debuggerApi.sendCommand('Input.dispatchMouseEvent', { type: 'mouseReleased', ...position, buttons: 0 });
            return { success: true, method: 'trusted_button_click' };
          } catch (error) {
            if (!pressed && error instanceof Error && error.name === 'AbortError') throw error;
            throw new Error(pressed
              ? '[WEBVIEW_SUBMISSION_UNCERTAIN] Trusted submission was attempted but could not be confirmed.'
              : '[WEBVIEW_INPUT_UNAVAILABLE] Trusted browser input is unavailable. The prompt was not submitted.');
          } finally {
            try {
              if (attachedHere && debuggerApi.isAttached()) debuggerApi.detach();
            } catch { /* A closing view must not change the submission outcome. */ }
          }
        }
        beforeSubmit?.();
        try {
          const position = { x: target!.x!, y: target!.y!, button: 'left' as const, clickCount: 1 };
          this.webContents.sendInputEvent({ type: 'mouseDown', ...position });
          this.webContents.sendInputEvent({ type: 'mouseUp', ...position });
          return { success: true, method: 'native_button_click' };
        } catch {
          // A native event may already have reached the provider. Never follow it
          // with a DOM click or Enter fallback that could submit twice.
          throw new Error('[WEBVIEW_SUBMISSION_UNCERTAIN] Native submission was attempted but could not be confirmed.');
        }
      }
      if (requireButton) return { success: false, error: 'The declared submit control is unavailable.' };
    }
    const script = InputDispatcher.getSubmitScript(effectiveButton, effectiveInput, requireButton);
    beforeSubmit?.();
    const res = await this.executeScript<{ success: boolean; error?: string; method?: string }>(script);

    // CRITICAL IDEMPOTENCY GUARD:
    // If DOM button click or DOM Enter key succeeded, DO NOT dispatch native Return!
    // Native Return is strictly an emergency fallback ONLY if DOM dispatch completely failed.
    if ((!res || !res.success) && !requireButton) {
      try {
        const focused = effectiveInput && await this.executeScript<boolean>(`(function() {
          const el = ${InputDispatcher.getInputTargetScript(effectiveInput)};
          if (!el) return false;
          el.focus();
          return (el.getRootNode?.() || document).activeElement === el;
        })()`);
        if (focused && this.webContents && typeof this.webContents.sendInputEvent === 'function') {
          this.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Return' });
          this.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Return' });
          return { success: true, error: undefined };
        }
      } catch {}
    }

    return res;
  }

  /**
   * Executes a Bézier curve mouse movement and click on any DOM selector (e.g. model dropdowns, tabs).
   */
  public async dispatchGhostClick(
    selector: string,
    options?: GhostCursorOptions
  ): Promise<{ success: boolean; error?: string }> {
    const script = GhostCursor.getClickScript(selector, options);
    return this.executeScript<{ success: boolean; error?: string }>(script);
  }

  /**
   * Attempts to cancel/abort an ongoing generation by clicking the Webview's Stop button.
   */
  public async abortGeneration(): Promise<boolean> {
    try {
      const recipe = (this as BaseProviderAdapter & { recipe?: CustomRecipe }).recipe;
      const declared = toCombinedCssSelector(recipe?.selectors.stopButton);
      const script = `
        (function() {
          const findAll = selector => typeof queryAll === 'function'
            ? queryAll(document, selector)
            : Array.from(document.querySelectorAll(selector));
          const declared = ${JSON.stringify(declared)};
          const actionable = button => !button.disabled &&
            button.getAttribute('aria-disabled') !== 'true' &&
            !button.closest('[hidden], [inert], [aria-hidden="true"]') &&
            button.getClientRects().length > 0 &&
            getComputedStyle(button).visibility === 'visible';
          const directBtn = findAll(declared || (
            'button[data-testid="stop-button"], ' +
            'button[aria-label*="Stop" i], ' +
            'button[aria-label*="Cancel" i], ' +
            'button.stop-button'
          )).find(actionable);
          if (directBtn) {
            directBtn.click();
            return true;
          }
          if (declared) return false;
          const buttons = findAll('button, [role="button"]');
          for (const btn of buttons.filter(actionable)) {
            const label = (btn.getAttribute('aria-label') || '').toLowerCase();
            const text = (btn.textContent || '').toLowerCase();
            const hasSquare = !!btn.querySelector('.lucide-square, svg rect');
            if (
              label.includes('stop') ||
              label.includes('cancel') ||
              text.includes('stop generating') ||
              text.includes('หยุดสร้าง') ||
              (hasSquare && (text.includes('stop') || label.includes('stop') || btn.classList.contains('bg-bg-brand-secondary')))
            ) {
              btn.click();
              return true;
            }
          }
          return false;
        })()
      `;
      return await this.executeScript<boolean>(script);
    } catch {
      return false;
    }
  }

  /**
   * Resilient DOM polling engine with adaptive watchdog for Deep Reasoning (Thinking Mode),
   * video/music rendering progress bars, and stabilization buffers.
   */
  public async pollGeneration(options: PollGenerationOptions): Promise<ProviderAdapterResult> {
    const { mode, abortSignal, onChunk } = options;
    const expectsMedia = mode === 'image' || mode === 'video' || mode === 'music';
    let maxBudgetMs = options.timeoutMs || TimeoutManager.getTimeout(mode, this.providerId);

    const startTime = Date.now();
    let lastActivityTime = Date.now();
    let previousInspectionText: string | undefined;
    let previousInspectionMediaUrl: string | undefined;
    let lastText = '';
    let lastMediaUrl = '';
    let stableTicks = 0;
    const inspectScript = DomObserver.getInspectionScript(this.providerId, mode, (this as any).recipe, options.excludedMediaUrls, !expectsMedia);
    const checkProviderState = (inspection: DomInspectionResult) => {
      if (inspection.error) {
        throw new Error(`[DOM_INSPECTION_FAILED] ${this.name}: ${inspection.error}`);
      }
      if (inspection.mediaUnavailableReason) {
        throw new Error(`[MEDIA_UNAVAILABLE] ${this.name}: ${inspection.mediaUnavailableReason}`);
      }
      if (inspection.isSecurityWarning) {
        throw new Error(`[PROVIDER_ACTION_REQUIRED] ${this.name}: ${inspection.securityWarningReason || 'Provider verification or sign-in is required.'}`);
      }
      if (inspection.isRateLimited) {
        throw new Error(`${this.name} rate limit or quota exceeded during response generation.`);
      }
    };

    const readResponse = async () => {
      const inspection = await this.executeScript<DomInspectionResult>(inspectScript);
      checkProviderState(inspection);
      // Some providers deliver music in an MP4 player. The saved artifact
      // validator checks that the container actually has an audio track.
      const matchesMode = !expectsMedia ||
        (mode === 'music' ? inspection.mediaType === 'audio' || inspection.mediaType === 'video' : inspection.mediaType === mode);
      if (!matchesMode && inspection.mediaUrl) {
        inspection.mediaUrl = undefined;
        inspection.mediaType = undefined;
      }
      const previous = options.previousResponse;
      if (previous?.responseTurnCount && inspection.responseTurnCount === previous.responseTurnCount &&
          inspection.text === previous.text) {
        return { ...inspection, text: '' };
      }
      return inspection;
    };

    const checkCancellation = async () => {
      if (!abortSignal?.aborted) return;
      await this.abortGeneration();
      throw Object.assign(new Error(`Request cancelled: ${this.name} generation aborted.`), { name: 'AbortError' });
    };

    while (Date.now() - startTime < maxBudgetMs) {
      await checkCancellation();

      await new Promise((r) => setTimeout(r, 1100));

      await checkCancellation();
      const inspection = await readResponse();

      // If model is actively thinking or rendering media, ensure budget accommodates deep reasoning & media generation (at least 420s)
      if (inspection.isThinking || inspection.isMediaRendering) {
        maxBudgetMs = Math.max(maxBudgetMs, (mode === 'video' || mode === 'music') ? 420_000 : 300_000);
      }

      const previousText = previousInspectionText;
      previousInspectionText = inspection.text;
      const previousMediaUrl = previousInspectionMediaUrl;
      previousInspectionMediaUrl = inspection.mediaUrl;

      // 2. Stream chunk updates if new text streamed
      if (inspection.text && inspection.text !== lastText) {
        const delta = inspection.text.startsWith(lastText) ? inspection.text.slice(lastText.length) : inspection.text;
        if (onChunk && delta) {
          onChunk(delta);
        }
        lastText = inspection.text;
        lastActivityTime = Date.now(); // Reset activity watchdog on streaming progress
      }

      // Track media URL updates
      if (inspection.mediaUrl && inspection.mediaUrl !== lastMediaUrl) {
        lastMediaUrl = inspection.mediaUrl;
        lastActivityTime = Date.now(); // Reset activity watchdog on media arrival
      }

      // 3. Reset watchdog if model is actively Thinking or Media is rendering
      if (inspection.isThinking || inspection.isMediaRendering || inspection.isGenerating) {
        lastActivityTime = Date.now();
      }

      // 4. Completion Detection:
      const cleanCurrentText = cleanModelOutput(lastText);
      const effectiveMediaUrl = inspection.mediaUrl || lastMediaUrl;
      const hasContent = expectsMedia ? !!inspection.mediaUrl : cleanCurrentText.length > 0 || !!effectiveMediaUrl;
      const isActivelyGenerating = inspection.isGenerating || inspection.isThinking || inspection.isMediaRendering;

      if (hasContent) {
        const isMediaStable = inspection.mediaUrl === previousMediaUrl;
        const isTextStable = inspection.text === previousText;
        const isStable = isTextStable && isMediaStable;

        if (!isActivelyGenerating && inspection.hasActionButtons) {
          // Both: Not generating AND action buttons confirmed on completed turn
          if (isStable) {
            stableTicks += 2;
          } else {
            stableTicks = 0;
          }
        } else if (!isActivelyGenerating) {
          // Generation stopped and content is stable across consecutive ticks
          if (isStable) {
            stableTicks++;
          } else {
            stableTicks = 0;
          }
        } else {
          // Still actively generating with Stop button or streaming indicator visible
          stableTicks = 0;
        }

        if (stableTicks >= 2) {
          // 5. Stabilization Buffer (800ms) to ensure final tokens settle
          await new Promise((r) => setTimeout(r, 800));

          // Grab final snapshot
          await checkCancellation();
          const finalInspect = await readResponse();
          await checkCancellation();
          if (expectsMedia && (
            finalInspect.mediaUrl !== inspection.mediaUrl ||
            finalInspect.isGenerating || finalInspect.isThinking || finalInspect.isMediaRendering
          )) {
            stableTicks = 0;
            previousInspectionMediaUrl = finalInspect.mediaUrl;
            continue;
          }
          const rawFinal = (finalInspect.text && finalInspect.text.trim().length > 0) ? finalInspect.text : lastText;
          const finalText = cleanModelOutput(rawFinal);

          let finalMediaUrl = finalInspect.mediaUrl || effectiveMediaUrl;
          let finalMediaType = finalInspect.mediaType || inspection.mediaType || (mode === 'video' ? 'video' : mode === 'music' ? 'audio' : mode === 'image' ? 'image' : undefined);

          // Blob URLs belong to the provider view. Resolve them before the
          // result reaches the main process asset downloader.
          const isProviderBlob = finalMediaUrl?.startsWith('blob:') === true;
          if (finalMediaUrl && (isProviderBlob || finalMediaUrl.includes('contribution.usercontent.google.com'))) {
            try {
              const inWebviewDataUrl = await this.executeScript<string | null>(`
                (async function() {
                  try {
                    const res = await window.fetch(${JSON.stringify(finalMediaUrl)}, { credentials: 'include', signal: AbortSignal.timeout(15000) });
                    if (!res.ok) return null;
                    const blob = await res.blob();
                    if (!blob.size || blob.size > 100 * 1024 * 1024) return null;
                    return await new Promise((resolve) => {
                      const reader = new FileReader();
                      reader.onloadend = () => resolve(reader.result);
                      reader.onerror = () => resolve(null);
                      reader.readAsDataURL(blob);
                    });
                  } catch (e) {
                    return null;
                  }
                })()
              `);
              if (inWebviewDataUrl && inWebviewDataUrl.startsWith('data:')) {
                finalMediaUrl = inWebviewDataUrl;
              }
            } catch {}
            if (isProviderBlob && finalMediaUrl.startsWith('blob:')) {
              throw new Error('[MEDIA_DOWNLOAD_FAILED] The provider view could not read the generated media.');
            }
          }

          if ((mode === 'video' || finalMediaType === 'video') && finalMediaUrl) {
            const isMusic = mode === 'music' || finalInspect.mediaType === 'audio';
            return {
              text: finalText,
              media: {
                type: 'video',
                data: finalMediaUrl,
                suggestedName: `${this.providerId}_${isMusic ? 'music' : 'video'}`,
              },
            };
          }

          if ((mode === 'music' || finalMediaType === 'audio') && finalMediaUrl) {
            return {
              text: finalText,
              media: {
                type: 'audio',
                data: finalMediaUrl,
                suggestedName: `${this.providerId}_music`,
              },
            };
          }

          if ((mode === 'image' || finalMediaType === 'image' || (!finalText && finalMediaUrl)) && finalMediaUrl) {
            return {
              text: finalText,
              media: {
                type: 'image',
                data: finalMediaUrl,
                suggestedName: `${this.providerId}_image`,
              },
            };
          }

          return { text: finalText };
        }
      } else {
        stableTicks = 0;
      }

      // 6. Idle Watchdog Check (If dead/frozen with 0 activity for 40s while not thinking)
      if (!expectsMedia && Date.now() - lastActivityTime > 40_000 && !inspection.isThinking && !inspection.isMediaRendering) {
        if (effectiveMediaUrl) {
          return {
            text: cleanModelOutput(lastText),
            media: {
              type: inspection.mediaType || 'audio',
              data: effectiveMediaUrl,
              suggestedName: `${this.providerId}_${mode}`,
            },
          };
        }
        const cleaned = cleanModelOutput(lastText);
        if (cleaned.length > 0) {
          return { text: cleaned };
        }
      }
    }

    if (lastMediaUrl && !expectsMedia) {
      return {
        text: cleanModelOutput(lastText),
        media: {
          type: 'audio',
          data: lastMediaUrl,
          suggestedName: `${this.providerId}_${mode}`,
        },
      };
    }

    const cleanedFinal = cleanModelOutput(lastText);
    if (cleanedFinal.length > 0) {
      return { text: cleanedFinal };
    }

    throw new Error(`Timeout after ${Math.round(maxBudgetMs / 1000)}s waiting for ${this.name} response completion.`);
  }

  /**
   * Retrieves the current active conversation URL from the Webview.
   */
  public async getConversationUrl(): Promise<string | null> {
    if (!this.webContents || this.webContents.isDestroyed()) return null;
    try {
      const url = this.webContents.getURL();
      // Ensure it's not a generic root page
      if (url && url.startsWith('http')) {
        return url;
      }
    } catch {}
    return null;
  }

  /**
   * Navigates the Webview to a specific conversation URL.
   */
  public async navigateToConversation(targetUrl: string, options?: { assumeLocked?: boolean }): Promise<void> {
    if (!this.webContents || this.webContents.isDestroyed()) return;
    const releaseLock = options?.assumeLocked ? () => {} : await this.acquireDomLock();
    try {
      const currentUrl = this.webContents.getURL();
      if (currentUrl === targetUrl) return;

      await this.webContents.loadURL(targetUrl);
      await new Promise((r) => setTimeout(r, 2000));
    } catch {} finally {
      releaseLock();
    }
  }

  /**
   * Navigates the Webview to the provider's new chat page.
   */
  protected async loadNewChatPage(target: string): Promise<void> {
    if (!this.webContents || this.webContents.isDestroyed()) throw new Error('Provider browser view is unavailable.');
    try {
      await this.webContents.loadURL(target);
    } catch (error: any) {
      // Only new, pre-submission navigation is safe to retry. Never suppress the
      // failure or accept an old conversation that happens to remain on screen.
      const transient = error?.code === 'ERR_FAILED' || error?.errno === -2 || /ERR_FAILED \(-2\)/.test(String(error?.message || ''));
      if (!transient || this.webContents.isDestroyed()) throw error;
      await new Promise(resolve => setTimeout(resolve, 300));
      await this.webContents.loadURL(target);
    }
  }

  public async navigateToNewChat(options?: { forceReload?: boolean; assumeLocked?: boolean }): Promise<void> {
    if (!this.webContents || this.webContents.isDestroyed()) return;
    const releaseLock = options?.assumeLocked ? () => {} : await this.acquireDomLock();
    try {
      let target = (this as any).recipe?.newChatUrl || (this as any).recipe?.url || this.url;
      if (!target) {
        if (this.providerId === 'claude') target = 'https://claude.ai/new';
        else if (this.providerId === 'chatgpt') target = 'https://chatgpt.com';
        else if (this.providerId === 'gemini') target = 'https://gemini.google.com/app';
        else if (this.providerId === 'grok') target = 'https://grok.com';
      }

      if (!target) return;

      const currentUrl = (this.webContents.getURL() || '').replace(/\/$/, '');
      const normTarget = target.replace(/\/$/, '');
      if (options?.forceReload || currentUrl !== normTarget) {
        await this.loadNewChatPage(target);
        await new Promise((r) => setTimeout(r, 1500));
      }
    } catch (error) {
      throw new Error(`Could not open a new chat for ${this.name}: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      releaseLock();
    }
  }

  /**
   * Checks if user is authenticated in the web session.
   */
  abstract checkAuthStatus(): Promise<boolean>;

  /**
   * Checks if the DOM is currently displaying a rate-limit banner or 429 toast.
   */
  abstract checkRateLimit(): Promise<{ isRateLimited: boolean; reason?: string }>;

  /**
   * Sends a prompt to the Web UI, waits for completion, and returns the extracted content.
   */
  abstract executePrompt(
    prompt: string,
    mode: TaskMode,
    metadata?: ProjectMetadata,
    onChunk?: (chunk: string) => void,
    abortSignal?: AbortSignal,
    attachments?: readonly StagedAttachment[],
    mediaSettings?: import('../../shared/media.js').MediaSettings,
    mediaModel?: string,
    onSubmitted?: () => void
  ): Promise<ProviderAdapterResult>;
}
