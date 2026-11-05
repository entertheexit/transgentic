import { describe, expect, it } from 'vitest';
import { selectMenuPosition } from '../src/renderer/components/PopoverSelect.js';

describe('selector menu positioning', () => {
  it('opens below when the menu fits', () => {
    expect(selectMenuPosition({ top: 100, bottom: 130, left: 30, width: 200 }, 180, 800, 600))
      .toEqual({ left: 30, top: 136, width: 200, maxHeight: 456 });
  });
  it('opens above and limits a long menu to available space', () => {
    expect(selectMenuPosition({ top: 500, bottom: 530, left: 700, width: 180 }, 900, 800, 600))
      .toEqual({ left: 612, top: 8, width: 180, maxHeight: 486 });
  });
  it('clamps wide selectors to the viewport', () => {
    expect(selectMenuPosition({ top: 30, bottom: 60, left: -20, width: 1000 }, 100, 320, 400))
      .toEqual({ left: 8, top: 66, width: 304, maxHeight: 326 });
  });
});
