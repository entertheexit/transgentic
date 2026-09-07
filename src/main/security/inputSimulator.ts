/**
 * Granular Keystroke Cadence Simulator
 * 
 * Simulates realistic human typing cadence with:
 * - Dynamic character-by-character latency (50ms - 180ms)
 * - Probabilistic human typos (2-3% chance) followed by immediate realistic backspace correction
 * - Full synthetic event lifecycle (keydown -> keypress -> beforeinput -> insertText -> input -> keyup)
 * - Native ContentEditable, ProseMirror, Quill, and Textarea compatibility
 * - Natural micro-bursts for longer text to maintain optimal speed without sacrificing anti-bot entropy
 */

export interface InputSimulatorOptions {
  minDelayMs?: number;
  maxDelayMs?: number;
  typoProbability?: number; // 0.025 = 2.5% chance per character
  burstMode?: boolean;
}

export class InputSimulator {
  /**
   * Generates a self-contained asynchronous browser script that simulates realistic
   * human typing cadence with typo injection and natural event dispatching.
   */
  public static getTypingScript(
    selector: string,
    text: string,
    options: InputSimulatorOptions = {}
  ): string {
    const minDelay = options.minDelayMs ?? 45;
    const maxDelay = options.maxDelayMs ?? 160;
    const typoChance = options.typoProbability ?? 0.025;
    const burstMode = options.burstMode ?? (text.length > 80);

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
          if (!el) {
            return { success: false, error: 'Target input element not found: ' + ${JSON.stringify(selector)} };
          }

          el.focus();
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });

          const textToType = ${JSON.stringify(text)};
          const isInputOrTextarea = el.tagName === 'INPUT' || el.tagName === 'TEXTAREA';

          // Neighboring keyboard keys for realistic typos (QWERTY layout)
          const QWERTY_NEIGHBORS = {
            'a': ['q', 'w', 's', 'z'],
            'b': ['v', 'g', 'h', 'n'],
            'c': ['x', 'd', 'f', 'v'],
            'd': ['s', 'e', 'r', 'f', 'c', 'x'],
            'e': ['w', 's', 'd', 'r', '3', '4'],
            'f': ['d', 'r', 't', 'g', 'v', 'c'],
            'g': ['f', 't', 'y', 'h', 'b', 'v'],
            'h': ['g', 'y', 'u', 'j', 'n', 'b'],
            'i': ['u', 'j', 'k', 'o', '8', '9'],
            'j': ['h', 'u', 'i', 'k', 'm', 'n'],
            'k': ['j', 'i', 'o', 'l', 'm'],
            'l': ['k', 'o', 'p', ';'],
            'm': ['n', 'j', 'k'],
            'n': ['b', 'h', 'j', 'm'],
            'o': ['i', 'k', 'l', 'p', '9', '0'],
            'p': ['o', 'l', '[', '-', '0'],
            'q': ['1', '2', 'w', 'a'],
            'r': ['e', 'd', 'f', 't', '4', '5'],
            's': ['a', 'w', 'e', 'd', 'x', 'z'],
            't': ['r', 'f', 'g', 'y', '5', '6'],
            'u': ['y', 'h', 'j', 'i', '7', '8'],
            'v': ['c', 'f', 'g', 'b'],
            'w': ['q', 'a', 's', 'e', '2', '3'],
            'x': ['z', 's', 'd', 'c'],
            'y': ['t', 'g', 'h', 'u', '6', '7'],
            'z': ['a', 's', 'x'],
            ' ': [' ', 'c', 'v', 'b', 'n', 'm']
          };

          const randomWait = (min, max) => new Promise(res => {
            // Gaussian-like random jitter
            const r1 = Math.random();
            const r2 = Math.random();
            const gaussian = Math.sqrt(-2.0 * Math.log(r1 || 0.0001)) * Math.cos(2.0 * Math.PI * r2);
            const mean = (min + max) / 2;
            const dev = (max - min) / 4;
            const delay = Math.max(min, Math.min(max, mean + gaussian * dev));
            setTimeout(res, delay);
          });

          // Focus and clear initial contents if necessary
          if (isInputOrTextarea) {
            el.focus();
            el.select?.();
          } else {
            el.focus();
            const sel = window.getSelection();
            const range = document.createRange();
            range.selectNodeContents(el);
            sel?.removeAllRanges();
            sel?.addRange(range);
          }

          // Single character insertion with full synthetic event cascade
          const dispatchCharEvents = (char) => {
            const keyCode = char.charCodeAt(0);
            const isLetter = char.length === 1 && char.match(/[a-z0-9]/i);

            // 1. keydown
            const keydownEvt = new KeyboardEvent('keydown', {
              key: char,
              code: isLetter ? 'Key' + char.toUpperCase() : 'Quote',
              keyCode: keyCode,
              which: keyCode,
              bubbles: true,
              cancelable: true
            });
            el.dispatchEvent(keydownEvt);

            // 2. keypress
            const keypressEvt = new KeyboardEvent('keypress', {
              key: char,
              code: isLetter ? 'Key' + char.toUpperCase() : 'Quote',
              keyCode: keyCode,
              which: keyCode,
              bubbles: true,
              cancelable: true
            });
            el.dispatchEvent(keypressEvt);

            // 3. beforeinput
            const beforeInputEvt = new InputEvent('beforeinput', {
              bubbles: true,
              cancelable: true,
              inputType: 'insertText',
              data: char
            });
            el.dispatchEvent(beforeInputEvt);

            // 4. Actual DOM insertion
            if (isInputOrTextarea) {
              const start = el.selectionStart ?? el.value.length;
              const end = el.selectionEnd ?? el.value.length;
              el.value = el.value.slice(0, start) + char + el.value.slice(end);
              el.selectionStart = el.selectionEnd = start + char.length;
            } else {
              let inserted = false;
              try {
                inserted = document.execCommand('insertText', false, char);
              } catch (e) {
                inserted = false;
              }
              if (!inserted) {
                const sel = window.getSelection();
                if (sel && sel.rangeCount > 0) {
                  const range = sel.getRangeAt(0);
                  range.deleteContents();
                  const textNode = document.createTextNode(char);
                  range.insertNode(textNode);
                  range.setStartAfter(textNode);
                  range.setEndAfter(textNode);
                  sel.removeAllRanges();
                  sel.addRange(range);
                } else {
                  el.innerText += char;
                }
              }
            }

            // 5. input event
            const inputEvt = new InputEvent('input', {
              bubbles: true,
              cancelable: true,
              inputType: 'insertText',
              data: char
            });
            el.dispatchEvent(inputEvt);

            // 6. keyup
            const keyupEvt = new KeyboardEvent('keyup', {
              key: char,
              code: isLetter ? 'Key' + char.toUpperCase() : 'Quote',
              keyCode: keyCode,
              which: keyCode,
              bubbles: true,
              cancelable: true
            });
            el.dispatchEvent(keyupEvt);
          };

          // Backspace removal with event cascade
          const dispatchBackspace = () => {
            const down = new KeyboardEvent('keydown', { key: 'Backspace', code: 'Backspace', keyCode: 8, which: 8, bubbles: true, cancelable: true });
            el.dispatchEvent(down);

            const before = new InputEvent('beforeinput', { bubbles: true, cancelable: true, inputType: 'deleteContentBackward' });
            el.dispatchEvent(before);

            if (isInputOrTextarea) {
              const start = el.selectionStart ?? el.value.length;
              if (start > 0) {
                el.value = el.value.slice(0, start - 1) + el.value.slice(start);
                el.selectionStart = el.selectionEnd = start - 1;
              }
            } else {
              try {
                document.execCommand('delete', false);
              } catch (e) {}
            }

            const input = new InputEvent('input', { bubbles: true, cancelable: true, inputType: 'deleteContentBackward' });
            el.dispatchEvent(input);

            const up = new KeyboardEvent('keyup', { key: 'Backspace', code: 'Backspace', keyCode: 8, which: 8, bubbles: true, cancelable: true });
            el.dispatchEvent(up);
          };

          // Chunk insertion for fast natural bursts on large prompts
          const dispatchChunkBurst = (chunk) => {
            const beforeInput = new InputEvent('beforeinput', {
              bubbles: true,
              cancelable: true,
              inputType: 'insertText',
              data: chunk
            });
            el.dispatchEvent(beforeInput);

            if (isInputOrTextarea) {
              const start = el.selectionStart ?? el.value.length;
              const end = el.selectionEnd ?? el.value.length;
              el.value = el.value.slice(0, start) + chunk + el.value.slice(end);
              el.selectionStart = el.selectionEnd = start + chunk.length;
            } else {
              let inserted = false;
              try {
                inserted = document.execCommand('insertText', false, chunk);
              } catch (e) {
                inserted = false;
              }
              if (!inserted) {
                el.innerText += chunk;
              }
            }

            const input = new InputEvent('input', {
              bubbles: true,
              cancelable: true,
              inputType: 'insertText',
              data: chunk
            });
            el.dispatchEvent(input);
          };

          // Typing loop
          const minD = ${minDelay};
          const maxD = ${maxDelay};
          const typoProb = ${typoChance};
          const isBurst = ${burstMode};

          if (isBurst && textToType.length > 120) {
            // Burst-mode typing: groups words and sentences with human typing rhythm
            const words = textToType.split(/(\\s+)/);
            for (let i = 0; i < words.length; i++) {
              const word = words[i];
              
              // 2-3% chance of typo on a word
              if (Math.random() < typoProb && word.length > 2) {
                const typoChar = word[0];
                const lower = typoChar.toLowerCase();
                const neighbors = QWERTY_NEIGHBORS[lower] || ['e', 'a', 's'];
                const badChar = neighbors[Math.floor(Math.random() * neighbors.length)] || 'x';
                
                dispatchCharEvents(badChar);
                await randomWait(120, 260); // brief pause realizing typo
                dispatchBackspace();
                await randomWait(80, 160);
              }

              // Dispatch the word chunk with micro-jitter
              dispatchChunkBurst(word);

              // Natural micro-pause between words and punctuation
              if (word.includes('.') || word.includes('\\n') || word.includes('?') || word.includes('!')) {
                await randomWait(150, 320);
              } else if (word === ' ' || word === '\\t') {
                await randomWait(25, 75);
              } else {
                await randomWait(35, 110);
              }
            }
          } else {
            // Character-by-character typing loop
            for (let i = 0; i < textToType.length; i++) {
              const char = textToType[i];

              // Simulated Typo check
              if (Math.random() < typoProb && char.match(/[a-z]/i)) {
                const lower = char.toLowerCase();
                const neighbors = QWERTY_NEIGHBORS[lower] || ['s', 'd', 'e'];
                const typoChar = neighbors[Math.floor(Math.random() * neighbors.length)] || 'a';
                
                dispatchCharEvents(typoChar);
                await randomWait(100, 220); // user realizes typo
                dispatchBackspace();
                await randomWait(60, 140);
              }

              dispatchCharEvents(char);

              // Inter-keystroke cadence delay
              if (char === ' ') {
                await randomWait(minD * 1.2, maxD * 1.3);
              } else if (char === '.' || char === '\\n' || char === ',' || char === '!') {
                await randomWait(minD * 2, maxD * 2.2);
              } else {
                await randomWait(minD, maxD);
              }
            }
          }

          // Final change & input dispatch to ensure reactivity triggers
          const changeEvt = new Event('change', { bubbles: true });
          el.dispatchEvent(changeEvt);

          return { success: true };
        } catch (err) {
          return { success: false, error: err ? err.message : 'Unknown typing simulation error' };
        }
      })()
    `;
  }
}
