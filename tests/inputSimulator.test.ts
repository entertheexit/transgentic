import { describe, it, expect } from 'vitest';
import { InputSimulator } from '../src/main/security/inputSimulator.js';

describe('InputSimulator', () => {
  it('should generate a valid typing simulation script for standard inputs', () => {
    const script = InputSimulator.getTypingScript('#prompt-textarea', 'Hello world');
    expect(script).toContain('#prompt-textarea');
    expect(script).toContain('pollElement');
    expect(script).toContain('QWERTY_NEIGHBORS');
    expect(script).toContain('dispatchCharEvents');
    expect(script).toContain('dispatchBackspace');
    expect(script).toContain('InputEvent');
  });

  it('should support configurable delay and typo parameters', () => {
    const customScript = InputSimulator.getTypingScript('textarea', 'Test prompt', {
      minDelayMs: 60,
      maxDelayMs: 180,
      typoProbability: 0.03,
      burstMode: false,
    });

    expect(customScript).toContain('const minD = 60;');
    expect(customScript).toContain('const maxD = 180;');
    expect(customScript).toContain('const typoProb = 0.03;');
    expect(customScript).toContain('const isBurst = false;');
  });

  it('should include full synthetic event cascades (keydown, keypress, beforeinput, input, keyup)', () => {
    const script = InputSimulator.getTypingScript('div[contenteditable="true"]', 'Code snippet');
    expect(script).toContain("new KeyboardEvent('keydown'");
    expect(script).toContain("new KeyboardEvent('keypress'");
    expect(script).toContain("new InputEvent('beforeinput'");
    expect(script).toContain("new InputEvent('input'");
    expect(script).toContain("new KeyboardEvent('keyup'");
  });
});
