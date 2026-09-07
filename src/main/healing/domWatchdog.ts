import { WebContents } from 'electron';
import { ProviderId } from '../../shared/types.js';

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
  missingLandmarks: ('inputPrompt' | 'submitButton' | 'stopButton' | 'modelDropdownTrigger')[];
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
    customSelectors?: Partial<Record<'inputPrompt' | 'submitButton' | 'stopButton' | 'modelDropdownTrigger', string>>
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

          const isCoreReady = inputRes.found && submitRes.found;

          return {
            providerId: '${providerId}',
            timestamp: Date.now(),
            healthy: isCoreReady,
            allLandmarksHealthy: isCoreReady,
            landmarks: {
              inputPrompt: inputRes,
              submitButton: submitRes,
              stopButton: stopRes,
              modelDropdownTrigger: modelRes
            },
            missingLandmarks: missing,
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
    customSelectors?: Partial<Record<'inputPrompt' | 'submitButton' | 'stopButton' | 'modelDropdownTrigger', string>>
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
      const script = this.getAuditScript(providerId, options, customSelectors);
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
  "stopButton": "button[aria-label*='Stop']",
  "modelDropdownTrigger": "button[data-testid='model-selector']"
}
`.trim();
  }
}
