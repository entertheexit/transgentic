import { describe, it, expect } from 'vitest';
import { GhostCursor } from '../src/main/security/ghostCursor.js';

describe('GhostCursor', () => {
  it('should generate a cubic Bézier trajectory script for target selector', () => {
    const script = GhostCursor.getClickScript('button[aria-label="Send"]');
    expect(script).toContain('document.querySelector("button[aria-label=\\"Send\\"]")');
    expect(script).toContain('bezier');
    expect(script).toContain('easeInOut');
    expect(script).toContain('overshoot');
    expect(script).toContain('mousemove');
    expect(script).toContain('mousedown');
    expect(script).toContain('click');
  });

  it('should support configurable hesitation and overshoot options', () => {
    const script = GhostCursor.getClickScript('button.submit', {
      overshoot: false,
      hesitationMs: 120,
      randomDrift: false,
    });
    expect(script).toContain('120 + Math.random() * 40');
    expect(script).toContain('const jitterX = false ?');
  });

  it('should generate hover scripts for non-click idle drift', () => {
    const hoverScript = GhostCursor.getHoverScript('button.model-selector');
    expect(hoverScript).toContain('window.__transgentic_mouse');
    expect(hoverScript).toContain('mousemove');
  });
});
