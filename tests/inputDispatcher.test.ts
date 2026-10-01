import { describe, it, expect, vi } from 'vitest';
import { runInNewContext } from 'node:vm';
import { InputDispatcher } from '../src/main/security/inputDispatcher.js';
import { BaseProviderAdapter } from '../src/main/webviews/adapterBase.js';

// Execute the injected scripts against a small DOM fixture, including the
// duplicate hidden composer retained by ChatGPT's temporary-chat layout.
function browserFixture() {
  let now = 0;
  const editors: any[] = [];
  const buttons: any[] = [];
  const document: any = {
    activeElement: null,
    querySelectorAll: (selector: string) => selector.startsWith('button') ? buttons : editors,
    createRange: () => ({ selectNodeContents() {} }),
    execCommand: (_command: string, _ui: boolean, text: string) => {
      document.activeElement.innerText = text;
      return true;
    },
  };
  const element = (visible: boolean, tagName = 'DIV', disabled = false) => {
    const el: any = {
      tagName, disabled, innerText: '', offsetWidth: visible ? 300 : 0, offsetHeight: visible ? 60 : 0,
      getBoundingClientRect: () => ({ width: visible ? 300 : 0, height: visible ? 60 : 0 }),
      getClientRects: () => visible ? [{}] : [],
      getAttribute: () => null,
      hasAttribute: (name: string) => name === 'disabled' && disabled,
      closest: () => null,
      focus: vi.fn(() => { document.activeElement = el; }),
      dispatchEvent: vi.fn(() => true),
      click: vi.fn(),
    };
    (tagName === 'BUTTON' ? buttons : editors).push(el);
    return el;
  };
  class BrowserEvent {
    constructor(public type: string, options: object) { Object.assign(this, options); }
  }
  const context = {
    document,
    window: { getSelection: () => ({ removeAllRanges() {}, addRange() {} }) },
    getComputedStyle: () => ({ display: 'block', visibility: 'visible' }),
    InputEvent: BrowserEvent, Event: BrowserEvent, PointerEvent: BrowserEvent,
    MouseEvent: BrowserEvent, KeyboardEvent: BrowserEvent,
    Date: { now: () => now },
    setTimeout: (callback: () => void, ms: number) => { now += ms; callback(); },
  };
  return { element, run: (script: string) => runInNewContext(script, context) };
}

describe('InputDispatcher', () => {
  it('should generate dispatch script with realistic events for target selector and text', () => {
    const script = InputDispatcher.getDispatchScript('#prompt-textarea', 'Hello World');
    expect(script).toContain('InputEvent');
    expect(script).toContain('beforeinput');
    expect(script).toContain('insertText');
    expect(script).toContain('#prompt-textarea');
    expect(script).toContain('Hello World');
  });

  it('should generate submit script with pointer/mouse and keyboard events', () => {
    const script = InputDispatcher.getSubmitScript('button[data-testid="send-button"]', '#prompt-textarea');
    expect(script).toContain('PointerEvent');
    expect(script).toContain('pointerdown');
    expect(script).toContain('KeyboardEvent');
    expect(script).toContain('Enter');
    expect(script).toContain('send-button');
    expect(script).toContain('#prompt-textarea');
  });

  it('should enforce single-action submission by returning button_click immediately without Enter fallback', () => {
    const script = InputDispatcher.getSubmitScript('button.send-btn', '#composer');
    expect(script).toContain("if (targetBtn) {");
    expect(script).toContain("return { success: true, method: 'button_click' };");
    // Ensure enter key block is only reached if !targetBtn
    const buttonClickIdx = script.indexOf("return { success: true, method: 'button_click' }");
    const enterDispatchIdx = script.indexOf("inputEl.dispatchEvent(enterDown)");
    expect(buttonClickIdx).toBeLessThan(enterDispatchIdx);
  });

  it('should prevent duplicate form submit when Enter keydown is handled by ProseMirror/editor', () => {
    const script = InputDispatcher.getSubmitScript('button.send-btn', '#composer');
    expect(script).toContain("const enterHandled = !inputEl.dispatchEvent(enterDown);");
    expect(script).toContain("if (!enterHandled) {");
    expect(script).toContain("form.requestSubmit();");
    // form.requestSubmit MUST be inside if (!enterHandled) to prevent same-chat duplicate submits
    const handledIdx = script.indexOf("if (!enterHandled) {");
    const requestSubmitIdx = script.indexOf("form.requestSubmit();");
    expect(handledIdx).toBeGreaterThan(-1);
    expect(requestSubmitIdx).toBeGreaterThan(handledIdx);
  });

  it('inserts into the visible composer when a hidden matching editor comes first', async () => {
    const browser = browserFixture();
    const hidden = browser.element(false);
    const visible = browser.element(true);
    const response = await browser.run(InputDispatcher.getDispatchScript('.ProseMirror', 'Weather test'));
    expect(response.success).toBe(true);
    expect(hidden.innerText).toBe('');
    expect(hidden.focus).not.toHaveBeenCalled();
    expect(hidden.dispatchEvent).not.toHaveBeenCalled();
    expect(visible.innerText).toBe('Weather test');
    expect(visible.dispatchEvent).toHaveBeenCalled();
  });

  it('does not report input success when only a hidden or disabled composer exists', async () => {
    const browser = browserFixture();
    const hidden = browser.element(false);
    const disabled = browser.element(true, 'DIV', true);
    const response = await browser.run(InputDispatcher.getDispatchScript('.ProseMirror', 'Weather test'));
    expect(response.success).toBe(false);
    expect(hidden.focus).not.toHaveBeenCalled();
    expect(disabled.focus).not.toHaveBeenCalled();
  });

  it('focuses the visible composer before native insertion', async () => {
    const browser = browserFixture();
    const hidden = browser.element(false);
    const visible = browser.element(true);
    const insertText = vi.fn(async () => { expect(visible.focus).toHaveBeenCalledTimes(1); });
    const adapter = {
      getEffectiveSelector: async (_landmark: string, selector: string) => selector,
      executeScript: browser.run,
      webContents: { insertText },
    };
    const response = await (BaseProviderAdapter.prototype as any).dispatchRealisticInput.call(adapter, '.ProseMirror', 'Weather test');
    expect(response.success).toBe(true);
    expect(insertText).toHaveBeenCalledTimes(1);
    expect(hidden.focus).not.toHaveBeenCalled();
  });

  it('never inserts native text or sends native Return when only a hidden composer exists', async () => {
    const browser = browserFixture();
    browser.element(false);
    const insertText = vi.fn();
    const sendInputEvent = vi.fn();
    const adapter = {
      getEffectiveSelector: async (_landmark: string, selector: string) => selector,
      executeScript: browser.run,
      webContents: { insertText, sendInputEvent },
    };
    const input = await (BaseProviderAdapter.prototype as any).dispatchRealisticInput.call(adapter, '.ProseMirror', 'Weather test');
    const submit = await (BaseProviderAdapter.prototype as any).dispatchRealisticSubmit.call(adapter, 'button.send', '.ProseMirror');
    expect(input.success).toBe(false);
    expect(submit.success).toBe(false);
    expect(insertText).not.toHaveBeenCalled();
    expect(sendInputEvent).not.toHaveBeenCalled();
  });

  it('clicks a later visible send button exactly once and never dispatches Enter', async () => {
    const browser = browserFixture();
    const editor = browser.element(true);
    const hidden = browser.element(false, 'BUTTON');
    const visible = browser.element(true, 'BUTTON');
    const response = await browser.run(InputDispatcher.getSubmitScript('button.send', '.ProseMirror'));
    expect(response.method).toBe('button_click');
    expect(hidden.click).not.toHaveBeenCalled();
    expect(visible.click).toHaveBeenCalledTimes(1);
    expect(editor.dispatchEvent).not.toHaveBeenCalled();
  });

  it('uses only the visible editor for the Enter fallback', async () => {
    const browser = browserFixture();
    const hidden = browser.element(false);
    const visible = browser.element(true);
    const response = await browser.run(InputDispatcher.getSubmitScript('button.send', '.ProseMirror'));
    expect(response.method).toBe('enter_key');
    expect(hidden.dispatchEvent).not.toHaveBeenCalled();
    expect(visible.dispatchEvent).toHaveBeenCalledTimes(2);
  });

  it('does not dispatch Enter into a hidden editor when the visible send button is disabled', async () => {
    const browser = browserFixture();
    const hidden = browser.element(false);
    browser.element(true, 'BUTTON', true);
    const response = await browser.run(InputDispatcher.getSubmitScript('button.send', '.ProseMirror'));
    expect(response.success).toBe(false);
    expect(hidden.dispatchEvent).not.toHaveBeenCalled();
  });
});
