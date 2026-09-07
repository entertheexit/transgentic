/**
 * InputDispatcher provides realistic user input simulation routines for WebContents.
 * It simulates natural typing and event dispatching (beforeinput, input, keydown, keypress, keyup, change)
 * rather than simple direct .value DOM overwrites.
 */
export class InputDispatcher {
  /**
   * Generates JavaScript code to inject text into an input or contenteditable element
   * simulating realistic browser events with robust polling for element readiness.
   */
  public static getDispatchScript(selector: string, text: string): string {
    const escapedText = JSON.stringify(text);
    return `
      (async function() {
        try {
          const pollElement = async (sel, maxWait = 4000) => {
            const start = Date.now();
            while (Date.now() - start < maxWait) {
              const element = document.querySelector(sel);
              if (element) return element;
              await new Promise((r) => setTimeout(r, 100));
            }
            return null;
          };

          const el = await pollElement(${JSON.stringify(selector)});
          if (!el) return { success: false, error: 'Element not found: ' + ${JSON.stringify(selector)} };

          el.focus();

          const isInputOrTextarea = el.tagName === 'INPUT' || el.tagName === 'TEXTAREA';
          const textToInsert = ${escapedText};

          if (isInputOrTextarea) {
            // Focus and clear existing value
            el.focus();
            el.select?.();

            // Clear React 16/17/18/19 internal value tracker so React detects state change
            if (el._valueTracker) {
              try {
                el._valueTracker.setValue('');
              } catch (e) {}
            }

            // Set value via Prototype Setter to trigger React/Next.js/Vue state binding
            const proto = el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
            const nativeSetter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
            if (nativeSetter) {
              nativeSetter.call(el, textToInsert);
            } else {
              el.value = textToInsert;
            }

            const beforeInputEvent = new InputEvent('beforeinput', {
              bubbles: true,
              cancelable: true,
              inputType: 'insertText',
              data: textToInsert,
            });
            el.dispatchEvent(beforeInputEvent);

            const inputEvent = new InputEvent('input', {
              bubbles: true,
              cancelable: true,
              inputType: 'insertText',
              data: textToInsert,
            });
            el.dispatchEvent(inputEvent);

            const changeEvent = new Event('change', { bubbles: true });
            el.dispatchEvent(changeEvent);
          } else {
            // Rich text / ContentEditable / ProseMirror
            el.focus();

            // Select all current content
            const selection = window.getSelection();
            const range = document.createRange();
            range.selectNodeContents(el);
            selection?.removeAllRanges();
            selection?.addRange(range);

            let inserted = false;
            try {
              inserted = document.execCommand('insertText', false, textToInsert);
            } catch (cmdErr) {
              inserted = false;
            }

            if (!inserted) {
              // Direct paragraph & text node insertion for ProseMirror compatibility
              const p = el.querySelector('p');
              if (p) {
                p.textContent = textToInsert;
              } else {
                el.innerText = textToInsert;
              }
            }

            // Dispatch synthetic beforeinput and input events
            const beforeInputEvent = new InputEvent('beforeinput', {
              bubbles: true,
              cancelable: true,
              inputType: 'insertText',
              data: textToInsert,
            });
            el.dispatchEvent(beforeInputEvent);

            const inputEvent = new InputEvent('input', {
              bubbles: true,
              cancelable: true,
              inputType: 'insertText',
              data: textToInsert,
            });
            el.dispatchEvent(inputEvent);

            const changeEvent = new Event('change', { bubbles: true });
            el.dispatchEvent(changeEvent);
          }

          return { success: true };
        } catch (err) {
          return { success: false, error: err.message };
        }
      })()
    `;
  }

  /**
   * Generates JavaScript code to click a button or dispatch keyboard Enter to submit a prompt.
   */
  public static getSubmitScript(buttonSelector: string, inputSelector?: string): string {
    return `
      (async function() {
        try {
          const isButtonActive = (el) => {
            if (!el) return false;
            if (el.disabled || el.hasAttribute('disabled')) return false;
            if (el.getAttribute('aria-disabled') === 'true') return false;
            if (el.closest('header, nav, aside, [data-sidebar]')) return false;
            return Boolean(el.offsetWidth || el.offsetHeight || (typeof el.getClientRects === 'function' && el.getClientRects().length > 0));
          };

          // 1. Give dynamic send buttons a brief window (up to 400ms) to become enabled/active after input injection
          const startWait = Date.now();
          let targetBtn = null;

          while (Date.now() - startWait < 400) {
            // Check direct send button candidates (ChatGPT, Gemini, Grok, Claude)
            const direct = document.querySelector(
              'button[data-testid="send-button"], ' +
              'button:has(img[alt="Send"]), ' +
              'button[aria-label*="ส่ง" i], ' +
              'button[aria-label*="Send" i], ' +
              'button[data-testid*="send" i], ' +
              'button.composer-submit-button-color, ' +
              'button.send-button'
            );
            if (isButtonActive(direct)) {
              targetBtn = direct;
              break;
            }

            // Check recipe buttonSelector candidates
            if (${JSON.stringify(buttonSelector || '')}) {
              const matched = document.querySelectorAll(${JSON.stringify(buttonSelector || '')});
              for (const b of matched) {
                if (isButtonActive(b)) {
                  targetBtn = b;
                  break;
                }
              }
              if (targetBtn) break;
            }

            await new Promise((r) => setTimeout(r, 40));
          }

          // STRICT SINGLE-ACTION RULE:
          // If active button is found, trigger single click sequence and return immediately.
          // NEVER fire secondary Enter key events when button is clicked!
          if (targetBtn) {
            targetBtn.focus?.();
            const pointerDown = new PointerEvent('pointerdown', { bubbles: true, cancelable: true });
            const mouseDown = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
            const pointerUp = new PointerEvent('pointerup', { bubbles: true, cancelable: true });
            const mouseUp = new MouseEvent('mouseup', { bubbles: true, cancelable: true });

            targetBtn.dispatchEvent(pointerDown);
            targetBtn.dispatchEvent(mouseDown);
            targetBtn.dispatchEvent(pointerUp);
            targetBtn.dispatchEvent(mouseUp);
            try {
              targetBtn.click();
            } catch(e) {}
            return { success: true, method: 'button_click' };
          }

          // 2. Fallback: Dispatch keyboard Enter on input element ONLY if button was NOT clicked
          if (${JSON.stringify(inputSelector || '')}) {
            const inputEl = document.querySelector(${JSON.stringify(inputSelector || '')});
            if (inputEl) {
              inputEl.focus?.();

              const enterDown = new KeyboardEvent('keydown', {
                key: 'Enter',
                code: 'Enter',
                keyCode: 13,
                which: 13,
                bubbles: true,
                cancelable: true,
              });
              const enterUp = new KeyboardEvent('keyup', {
                key: 'Enter',
                code: 'Enter',
                keyCode: 13,
                which: 13,
                bubbles: true,
                cancelable: true,
              });

              const enterHandled = !inputEl.dispatchEvent(enterDown);
              inputEl.dispatchEvent(enterUp);

              // STRICT SINGLE-ACTION IDEMPOTENCY RULE:
              // If the element's keydown listener handled the Enter key (e.preventDefault() was called, like ProseMirror in ChatGPT/Claude or Quill in Gemini),
              // the prompt is ALREADY submitted! NEVER call form.requestSubmit() when enter was already handled!
              // Only call form.requestSubmit() if NO keydown listener handled the Enter key AND an enclosing form exists.
              if (!enterHandled) {
                const form = inputEl.closest('form');
                if (form) {
                  try {
                    form.requestSubmit();
                    return { success: true, method: 'form_submit' };
                  } catch(e) {}
                }
              }

              return { success: true, method: 'enter_key' };
            }
          }

          return { success: false, error: 'Neither submit button nor input element was actionable' };
        } catch (err) {
          return { success: false, error: err.message };
        }
      })()
    `;
  }
}
