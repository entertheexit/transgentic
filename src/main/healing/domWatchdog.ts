import { WebContents } from 'electron';
import { ProviderId } from '../../shared/types.js';
import type { RecipeAttachmentInput } from '../../shared/types/recipe.js';

export interface LandmarkInspection {
  found: boolean;
  exists: boolean;
  selector?: string;
  activeSelector?: string;
  tagName?: string;
  details?: string;
}

export interface DomInspectionReport {
  providerId: ProviderId;
  timestamp: number;
  healthy: boolean;
  allLandmarksHealthy: boolean;
  landmarks: {
    inputPrompt: LandmarkInspection;
    submitButton: LandmarkInspection;
    stopButton: LandmarkInspection;
    modelDropdownTrigger: LandmarkInspection;
  };
  attachmentLandmarks?: Record<string, LandmarkInspection>;
  missingLandmarks: string[];
  htmlSnippet?: string;
}

export interface WatchdogOptions {
  checkModelSelector?: boolean;
}

export class DomWatchdog {
  /**
   * Known landmarks selector candidate pool per provider and generic fallbacks.
   */
  public static readonly DEFAULT_SELECTORS: Record<
    'inputPrompt' | 'submitButton' | 'stopButton' | 'modelDropdownTrigger',
    string[]
  > = {
    inputPrompt: [
      '#prompt-textarea',
      'div.ProseMirror[contenteditable="true"]',
      'div[contenteditable="true"]',
      'rich-textarea div[contenteditable="true"]',
      '.ql-editor[contenteditable="true"]',
      'textarea[data-id="root"]',
      'textarea',
      'input[type="text"]',
    ],
    submitButton: [
      'button[data-testid="send-button"]',
      'button[aria-label*="Send prompt" i]',
      'button[aria-label*="Send message" i]',
      'button[aria-label*="Send" i]',
      'button[aria-label*="send" i]',
      'button[data-testid*="send" i]',
      'button[data-testid*="submit" i]',
      'button.composer-submit-button-color',
      'button.send-button',
      'button[type="submit"]',
      'button[data-testid="composer-speech-button"]',
      'button[aria-label*="Voice" i]',
      'button[aria-label*="Dictate" i]',
    ],
    stopButton: [
      'button[data-testid="stop-button"]',
      'button[aria-label*="Stop generating" i]',
      'button[aria-label*="Stop response" i]',
      'button[aria-label*="Stop responding" i]',
      'button[aria-label*="Stop generation" i]',
      'button[aria-label*="Stop" i]',
      'button.stop-button',
      '[data-is-streaming="true"]',
      '[data-testid*="streaming"]',
      '.streaming-indicator',
    ],
    modelDropdownTrigger: [
      '[data-testid="model-selector-button"]',
      'button[aria-haspopup="menu"]',
      'button[aria-haspopup="listbox"]',
      'button[aria-label*="model" i]',
      'button[aria-label*="Model" i]',
      'button[aria-label*="Fast" i]',
      'button[aria-label*="Grok" i]',
      'button[data-testid="model-selector"]',
      'button[data-testid*="model" i]',
      'button.model-selector',
      'div.model-switcher',
      'button[aria-haspopup="dialog"]',
      '[data-testid="model-card"]',
      'button[id*="model"]',
      'div[class*="model"]',
    ],
  };

  /**
   * Generates DOM evaluation script to audit control landmarks.
   */
  public static getAuditScript(
    providerId: ProviderId,
    options: WatchdogOptions = { checkModelSelector: true },
    customSelectors?: Partial<Record<'inputPrompt' | 'submitButton' | 'stopButton' | 'modelDropdownTrigger', string>>,
    attachmentConfigs?: Partial<Record<string, RecipeAttachmentInput>>
  ): string {
    const checkModel = options.checkModelSelector ?? true;
    return `
      (async function() {
        try {
          const isVisible = (el) => {
            if (!el) return false;
            return !!(el.offsetWidth || el.offsetHeight || (typeof el.getClientRects === 'function' && el.getClientRects().length > 0));
          };

          const checkCandidate = (selectorList, customOverride) => {
            if (customOverride) {
              try {
                const el = document.querySelector(customOverride);
                if (el) {
                  return { found: true, exists: true, selector: customOverride, activeSelector: customOverride, tagName: el.tagName.toLowerCase() };
                }
              } catch (e) {}
            }
            for (const sel of selectorList) {
              try {
                const el = document.querySelector(sel);
                if (el) {
                  return { found: true, exists: true, selector: sel, activeSelector: sel, tagName: el.tagName.toLowerCase() };
                }
              } catch (e) {}
            }
            return { found: false, exists: false };
          };

          const inputCandidates = ${JSON.stringify(DomWatchdog.DEFAULT_SELECTORS.inputPrompt)};
          const submitCandidates = ${JSON.stringify(DomWatchdog.DEFAULT_SELECTORS.submitButton)};
          const stopCandidates = ${JSON.stringify(DomWatchdog.DEFAULT_SELECTORS.stopButton)};
          const modelCandidates = ${JSON.stringify(DomWatchdog.DEFAULT_SELECTORS.modelDropdownTrigger)};

          const custom = ${JSON.stringify(customSelectors || {})};
          const attachmentConfigs = ${JSON.stringify(attachmentConfigs || {})};

          // Allow SPAs (Grok, ChatGPT, Claude) up to 3500ms to mount their React composer elements
          let inputRes = checkCandidate(inputCandidates, custom.inputPrompt);
          if (!inputRes.found) {
            const start = Date.now();
            while (Date.now() - start < 3500) {
              await new Promise((r) => setTimeout(r, 150));
              inputRes = checkCandidate(inputCandidates, custom.inputPrompt);
              if (inputRes.found) break;
            }
          }

          let submitRes = checkCandidate(submitCandidates, custom.submitButton);
          let stopRes = checkCandidate(stopCandidates, custom.stopButton);
          
          // In modern chat UIs (e.g. ChatGPT, Claude, Grok), the submit button dynamically appears
          // or activates when text is typed, or supports direct Enter key submission.
          if (!submitRes.found && inputRes.found) {
            submitRes = {
              found: true,
              exists: true,
              selector: custom.submitButton || submitCandidates[0],
              activeSelector: custom.submitButton || submitCandidates[0],
              details: 'Standby (Ready on input or Enter key)'
            };
          }

          // Stop button might only appear dynamically during active streaming.
          // If composer exists, mark stopButton as standby-ready unless a known broken flag is raised.
          if (!stopRes.found && inputRes.found) {
            stopRes = {
              found: true,
              exists: true,
              selector: custom.stopButton || stopCandidates[0],
              activeSelector: custom.stopButton || stopCandidates[0],
              details: 'Standby (Dynamically appears during generation)'
            };
          }

          let modelRes = checkCandidate(modelCandidates, custom.modelDropdownTrigger);
          if (!modelRes.found && inputRes.found) {
            // Check for buttons in the composer or header matching model keywords like Fast, Grok, Think, DeepSearch
            try {
              const buttons = Array.from(document.querySelectorAll('button, div[role="button"]'));
              const modelBtn = buttons.find((b) => {
                const text = (b.textContent || '').trim().toLowerCase();
                const aria = (b.getAttribute('aria-label') || '').toLowerCase();
                return (
                  text === 'fast' || text.startsWith('grok') || text.includes('gpt-') || text.includes('claude') || text.includes('sonnet') || text.includes('think') ||
                  aria.includes('fast') || aria.includes('model') || aria.includes('grok')
                );
              });
              if (modelBtn) {
                modelRes = {
                  found: true,
                  exists: true,
                  selector: custom.modelDropdownTrigger || modelCandidates[0],
                  activeSelector: custom.modelDropdownTrigger || modelCandidates[0],
                  details: 'Detected model switcher (' + (modelBtn.textContent || '').trim() + ')'
                };
              }
            } catch (e) {}
          }

          // Extract targeted HTML snippet around composer / footer for self-healing AI analysis
          let snippet = '';
          const composerEl = document.querySelector('form, #prompt-textarea, [contenteditable="true"], footer, div[class*="composer"], div[class*="bottom"]');
          if (composerEl) {
            const container = composerEl.closest('form') || composerEl.parentElement || composerEl;
            snippet = (container.outerHTML || '').slice(0, 3000);
          } else if (document.body) {
            snippet = (document.body.innerHTML || '').slice(0, 3000);
          }

          const missing = [];
          if (!inputRes.found) missing.push('inputPrompt');
          if (!submitRes.found) missing.push('submitButton');
          if (!stopRes.found) missing.push('stopButton');
          if (${checkModel} && !modelRes.found) missing.push('modelDropdownTrigger');

          const attachmentLandmarks = {};
          const normalizeText = value => String(value || '').replace(/\\s+/g, ' ').trim().toLocaleLowerCase();
          const selectorList = value => Array.isArray(value) ? value : value ? [value] : [];
          const findUnique = selectors => {
            let ambiguous = false;
            let invalid = false;
            for (const selector of selectorList(selectors)) {
              try {
                const nodes = Array.from(document.querySelectorAll(selector));
                if (nodes.length === 1) return { element: nodes[0], selector };
                if (nodes.length > 1) ambiguous = true;
              } catch (error) { invalid = true; }
            }
            return { ambiguous, invalid };
          };
          const implicitRole = el => el?.getAttribute?.('role')?.toLowerCase() || (el?.tagName === 'BUTTON' ? 'button' : el?.tagName === 'A' && el.hasAttribute('href') ? 'link' : '');
          const accessibleNames = el => {
            const labelledBy = (el?.getAttribute?.('aria-labelledby') || '').split(/\\s+/).filter(Boolean).map(id => document.getElementById(id)?.textContent || '');
            return [el?.getAttribute?.('aria-label'), el?.getAttribute?.('title'), ...labelledBy, el?.textContent].filter(Boolean).map(normalizeText);
          };
          const findLocator = locator => {
            const names = selectorList(locator?.name).map(normalizeText);
            const selectors = selectorList(locator?.selectors);
            const pools = selectors.length
              ? selectors.map(selector => { try { return { selector, nodes: Array.from(document.querySelectorAll(selector)) }; } catch { return { selector, nodes: [] }; } })
              : [{ selector: '', nodes: Array.from(document.querySelectorAll(locator?.role === 'button' ? 'button,[role="button"]' : '[role="' + CSS.escape(locator?.role || '') + '"]')) }];
            let ambiguous = false;
            for (const pool of pools) {
              const nodes = pool.nodes.filter(el => (!locator?.role || implicitRole(el) === String(locator.role).toLowerCase()) && (!names.length || accessibleNames(el).some(name => names.includes(name))));
              if (nodes.length === 1) return { element: nodes[0], selector: pool.selector };
              if (nodes.length > 1) ambiguous = true;
            }
            return { ambiguous };
          };

          for (const [mode, upload] of Object.entries(attachmentConfigs)) {
            const inputKey = 'attachment.' + mode + '.fileInput';
            let inputResult = findUnique(upload.fileInput);
            if (inputResult.element) {
              attachmentLandmarks[inputKey] = { found: true, exists: true, selector: inputResult.selector, activeSelector: inputResult.selector, tagName: inputResult.element.tagName.toLowerCase(), details: 'Direct native input available; reveal steps are optional.' };
              for (let index = 0; index < (upload.revealSteps || []).length; index++) {
                const key = 'attachment.' + mode + '.revealSteps.' + index + '.selectors';
                attachmentLandmarks[key] = { found: true, exists: true, details: 'Standby (not required while direct input is available)' };
              }
            } else {
              const revealSteps = upload.revealSteps?.length ? upload.revealSteps : upload.trigger ? [{ action: 'click', target: { selectors: upload.trigger } }] : [];
              for (let index = 0; index < revealSteps.length; index++) {
                const key = 'attachment.' + mode + '.revealSteps.' + index + '.selectors';
                const found = findLocator(revealSteps[index].target);
                if (!found.element) {
                  attachmentLandmarks[key] = { found: false, exists: false, details: found.ambiguous ? 'Ambiguous locator' : 'Locator not found' };
                  missing.push(key);
                  break;
                }
                attachmentLandmarks[key] = { found: true, exists: true, selector: found.selector, activeSelector: found.selector, tagName: found.element.tagName.toLowerCase() };
                found.element.click();
                await new Promise(resolve => setTimeout(resolve, 120));
              }
              inputResult = findUnique(upload.fileInput);
              if (inputResult.element) {
                attachmentLandmarks[inputKey] = { found: true, exists: true, selector: inputResult.selector, activeSelector: inputResult.selector, tagName: inputResult.element.tagName.toLowerCase() };
              } else {
                attachmentLandmarks[inputKey] = { found: false, exists: false, details: inputResult.ambiguous ? 'Ambiguous native inputs' : 'Native input not found after reveal flow' };
                missing.push(inputKey);
              }
            }
            for (const optionalKey of ['ready', 'cleanup']) {
              if (!upload[optionalKey]) continue;
              const key = 'attachment.' + mode + '.' + optionalKey;
              const found = findUnique(upload[optionalKey]);
              if (found.element) {
                attachmentLandmarks[key] = { found: true, exists: true, selector: found.selector, activeSelector: found.selector, tagName: found.element.tagName.toLowerCase() };
              } else if (found.invalid) {
                attachmentLandmarks[key] = { found: false, exists: false, selector: selectorList(upload[optionalKey])[0], details: 'Invalid selector' };
                missing.push(key);
              } else {
                attachmentLandmarks[key] = { found: true, exists: false, selector: selectorList(upload[optionalKey])[0], details: 'Standby (may only appear after files are attached)' };
              }
            }
          }

          const isCoreReady = inputRes.found && submitRes.found;
          const allReady = isCoreReady && missing.length === 0;

          return {
            providerId: '${providerId}',
            timestamp: Date.now(),
            healthy: allReady,
            allLandmarksHealthy: allReady,
            landmarks: {
              inputPrompt: inputRes,
              submitButton: submitRes,
              stopButton: stopRes,
              modelDropdownTrigger: modelRes
            },
            attachmentLandmarks,
            missingLandmarks: Array.from(new Set(missing)),
            htmlSnippet: snippet
          };
        } catch (err) {
          return {
            providerId: '${providerId}',
            timestamp: Date.now(),
            healthy: false,
            allLandmarksHealthy: false,
            landmarks: {
              inputPrompt: { found: false, exists: false, details: err.message },
              submitButton: { found: false, exists: false },
              stopButton: { found: false, exists: false },
              modelDropdownTrigger: { found: false, exists: false }
            },
            missingLandmarks: ['inputPrompt', 'submitButton', 'stopButton', 'modelDropdownTrigger'],
            htmlSnippet: ''
          };
        }
      })()
    `;
  }

  /**
   * Audits live WebContents for DOM integrity across all 4 landmarks.
   */
  public static async audit(
    providerId: ProviderId,
    webContents: WebContents,
    options: WatchdogOptions = { checkModelSelector: true },
    customSelectors?: Partial<Record<'inputPrompt' | 'submitButton' | 'stopButton' | 'modelDropdownTrigger', string>>,
    attachmentConfigs?: Partial<Record<string, RecipeAttachmentInput>>
  ): Promise<DomInspectionReport> {
    if (!webContents || webContents.isDestroyed()) {
      return {
        providerId,
        timestamp: Date.now(),
        healthy: false,
        allLandmarksHealthy: false,
        landmarks: {
          inputPrompt: { found: false, exists: false, details: 'WebContents unavailable or destroyed' },
          submitButton: { found: false, exists: false },
          stopButton: { found: false, exists: false },
          modelDropdownTrigger: { found: false, exists: false },
        },
        missingLandmarks: ['inputPrompt', 'submitButton', 'stopButton', 'modelDropdownTrigger'],
      };
    }

    try {
      const script = this.getAuditScript(providerId, options, customSelectors, attachmentConfigs);
      const result: DomInspectionReport = await webContents.executeJavaScript(script, true);
      return {
        ...result,
        allLandmarksHealthy: result.healthy ?? result.allLandmarksHealthy ?? false,
      };
    } catch (err: any) {
      return {
        providerId,
        timestamp: Date.now(),
        healthy: false,
        allLandmarksHealthy: false,
        landmarks: {
          inputPrompt: { found: false, exists: false, details: err?.message || 'Audit evaluation failed' },
          submitButton: { found: false, exists: false },
          stopButton: { found: false, exists: false },
          modelDropdownTrigger: { found: false, exists: false },
        },
        missingLandmarks: ['inputPrompt', 'submitButton', 'stopButton', 'modelDropdownTrigger'],
      };
    }
  }

  /**
   * Generates a prompt asking a coding model or local LLM to deduce replacement CSS selectors.
   */
  public static buildHealingPrompt(report: DomInspectionReport): string {
    const snippet = report.htmlSnippet || '';
    const missing = report.missingLandmarks || [];

    return `
[SYSTEM DIRECTIVE: DOM SELF-HEALING ENGINE]
You are repairing broken web automation selectors for the provider "${report.providerId}".
The following critical control landmarks failed to locate elements in the DOM:
Missing Landmarks: ${missing.join(', ')}

Analyze the HTML snippet below and produce CSS selectors to find these missing controls:
- inputPrompt: textarea, contenteditable container, or primary prompt input.
- submitButton: send or submit button to generate response.
- stopButton: abort/stop button or streaming indicator element.
- modelDropdownTrigger: button, dropdown trigger, or chevron to switch AI models.
- attachment.<mode>.revealSteps.<index>.selectors: the named button/menu item at that upload-flow position.
- attachment.<mode>.fileInput: the native input[type="file"] used by that mode.
- attachment.<mode>.ready or cleanup: the corresponding upload chip/readiness or removal control.

HTML SNIPPET:
\`\`\`html
${snippet.slice(0, 2500)}
\`\`\`

OUTPUT REQUIREMENT:
Respond ONLY with a valid JSON object without markdown formatting, code fences, or explanations.
Example format:
{
  "inputPrompt": "#prompt-textarea",
  "submitButton": "button[type='submit']",
  "attachment.text.revealSteps.0.selectors": "button[aria-label='Add attachment']",
  "attachment.text.fileInput": "input[type='file']"
}
`.trim();
  }
}
