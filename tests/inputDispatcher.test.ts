import { describe, it, expect } from 'vitest';
import { InputDispatcher } from '../src/main/security/inputDispatcher.js';

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
});
