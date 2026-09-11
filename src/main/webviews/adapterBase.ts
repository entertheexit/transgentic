import { WebContents } from 'electron';
import { ProviderId, TaskMode } from '../../shared/types.js';
import { ProjectMetadata } from '../storage/projectManager.js';
import { InputDispatcher } from '../security/inputDispatcher.js';
import { InputSimulator, InputSimulatorOptions } from '../security/inputSimulator.js';
import { GhostCursor, GhostCursorOptions } from '../security/ghostCursor.js';
import { DomObserver, DomInspectionResult } from './domObserver.js';
import { TimeoutManager } from '../config/timeouts.js';

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
}

export abstract class BaseProviderAdapter {
  abstract readonly providerId: ProviderId;
  abstract readonly name: string;
  abstract readonly url: string;
  abstract readonly partition: string;

  protected webContents: WebContents | null = null;
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

  protected isDomBusy = false;
  private domLockQueue: (() => void)[] = [];

  /**
   * Acquires an exclusive DOM mutex lock for this provider.
   * Prevents concurrent inputs, button clicks, or navigation events on the same webview.
   */
  public async acquireDomLock(): Promise<() => void> {
    if (this.isDomBusy) {
      await new Promise<void>((resolve) => this.domLockQueue.push(resolve));
    }
    this.isDomBusy = true;
    return () => {
      this.isDomBusy = false;
      const next = this.domLockQueue.shift();
      if (next) {
        this.isDomBusy = true;
        next();
      }
    };
  }

  public isLocked(): boolean {
    return this.isDomBusy;
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
      console.error(`[Transgentic] Failed script code:\n`, code);
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
      await this.executeScript(`
        (function() {
          try {
            const el = document.querySelector(${JSON.stringify(effectiveSelector)});
            if (el) {
              el.focus();
              if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
                el.select?.();
              } else {
                const sel = window.getSelection();
                const range = document.createRange();
                range.selectNodeContents(el);
                sel?.removeAllRanges();
                sel?.addRange(range);
              }
            }
          } catch (e) {}
        })()
      `);

      // 2. Try native webContents insertText if available
      if (this.webContents && typeof this.webContents.insertText === 'function') {
        await this.webContents.insertText(text);
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
    options?: GhostCursorOptions
  ): Promise<{ success: boolean; error?: string }> {
    const effectiveButton = await this.getEffectiveSelector('submitButton', buttonSelector);
    const effectiveInput = inputSelector ? await this.getEffectiveSelector('inputPrompt', inputSelector) : undefined;
    const script = InputDispatcher.getSubmitScript(effectiveButton, effectiveInput);
    const res = await this.executeScript<{ success: boolean; error?: string; method?: string }>(script);

    // CRITICAL IDEMPOTENCY GUARD:
    // If DOM button click or DOM Enter key succeeded, DO NOT dispatch native Return!
    // Native Return is strictly an emergency fallback ONLY if DOM dispatch completely failed.
    if (!res || !res.success) {
      try {
        if (this.webContents && typeof this.webContents.sendInputEvent === 'function') {
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
      const script = `
        (function() {
          const directBtn = document.querySelector(
            'button[data-testid="stop-button"], ' +
            'button[aria-label*="Stop" i], ' +
            'button[aria-label*="Cancel" i], ' +
            'button.stop-button'
          );
          if (directBtn) {
            directBtn.click();
            return true;
          }
          const buttons = Array.from(document.querySelectorAll('button, [role="button"]'));
          for (const btn of buttons) {
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
    let maxBudgetMs = options.timeoutMs || TimeoutManager.getTimeout(mode, this.providerId);

    const startTime = Date.now();
    let lastActivityTime = Date.now();
    let lastText = '';
    let lastMediaUrl = '';
    let stableTicks = 0;
    const inspectScript = DomObserver.getInspectionScript(this.providerId, mode, (this as any).recipe);

    while (Date.now() - startTime < maxBudgetMs) {
      // 1. Check for request cancellation / client disconnect
      if (abortSignal?.aborted) {
        await this.abortGeneration();
        throw new Error(`Request cancelled: ${this.name} generation aborted.`);
      }

      await new Promise((r) => setTimeout(r, 1100));

      const inspection = await this.executeScript<DomInspectionResult>(inspectScript);

      if (inspection.isRateLimited) {
        throw new Error(`${this.name} rate limit or quota exceeded during response generation.`);
      }

      // If model is actively thinking or rendering media, ensure budget accommodates deep reasoning & media generation (at least 420s)
      if (inspection.isThinking || inspection.isMediaRendering) {
        maxBudgetMs = Math.max(maxBudgetMs, (mode === 'video' || mode === 'music') ? 420_000 : 300_000);
      }

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
      const hasContent = (cleanCurrentText.length > 0) || !!effectiveMediaUrl;
      const isActivelyGenerating = inspection.isGenerating || inspection.isThinking || inspection.isMediaRendering;

      if (hasContent) {
        const isMediaStable = !effectiveMediaUrl || (inspection.mediaUrl === lastMediaUrl);
        const isTextStable = (inspection.text === lastText);
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
          const finalInspect = await this.executeScript<DomInspectionResult>(inspectScript);
          const rawFinal = (finalInspect.text && finalInspect.text.trim().length > 0) ? finalInspect.text : lastText;
          const finalText = cleanModelOutput(rawFinal);

          let finalMediaUrl = finalInspect.mediaUrl || effectiveMediaUrl;
          let finalMediaType = finalInspect.mediaType || inspection.mediaType || (mode === 'video' ? 'video' : mode === 'music' ? 'audio' : mode === 'image' ? 'image' : undefined);

          // If the media URL is from contribution.usercontent.google.com (which requires authenticated Google session cookies),
          // download the binary buffer directly within the authenticated webview session to guarantee 100% authenticated retrieval
          if (finalMediaUrl && finalMediaUrl.includes('contribution.usercontent.google.com')) {
            try {
              const inWebviewDataUrl = await this.executeScript<string | null>(`
                (async function() {
                  try {
                    const res = await window.fetch(${JSON.stringify(finalMediaUrl)}, { credentials: 'include' });
                    if (!res.ok) return null;
                    const blob = await res.blob();
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
      if (Date.now() - lastActivityTime > 40_000 && !inspection.isThinking && !inspection.isMediaRendering) {
        if (effectiveMediaUrl) {
          return {
            text: cleanModelOutput(lastText),
            media: {
              type: (inspection.mediaType || (mode === 'image' ? 'image' : mode === 'video' ? 'video' : 'audio')) as any,
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

    if (lastMediaUrl) {
      return {
        text: cleanModelOutput(lastText),
        media: {
          type: (mode === 'image' ? 'image' : mode === 'video' ? 'video' : 'audio') as any,
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
  public async navigateToConversation(targetUrl: string): Promise<void> {
    if (!this.webContents || this.webContents.isDestroyed()) return;
    const releaseLock = await this.acquireDomLock();
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
  public async navigateToNewChat(): Promise<void> {
    if (!this.webContents || this.webContents.isDestroyed()) return;
    const releaseLock = await this.acquireDomLock();
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
      if (currentUrl !== normTarget) {
        await this.webContents.loadURL(target);
        await new Promise((r) => setTimeout(r, 1500));
      }
    } catch {} finally {
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
    abortSignal?: AbortSignal
  ): Promise<ProviderAdapterResult>;
}
