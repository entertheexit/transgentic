import { describe, expect, it, vi } from 'vitest';
import { CustomRecipeAdapter } from '../src/main/webviews/customRecipeAdapter.js';
import { BUILTIN_RECIPES } from '../src/shared/types/recipe.js';

const image = { name: 'logo.JPG', mimeType: 'image/jpeg' };
const pdf = { name: 'notes.pdf', mimeType: 'application/pdf' };

describe('Provider attachment input selection', () => {
  const adapter = new CustomRecipeAdapter(BUILTIN_RECIPES.gemini) as any;

  it.each([
    ['image/*', [image], true],
    ['.jpg,.png', [image], true],
    ['image/jpeg', [image], true],
    ['.pdf,.txt', [image], false],
    ['image/*', [image, pdf], false],
    ['', [image, pdf], true],
  ])('honors native accept=%s for the complete batch', (accept, files, expected) => {
    expect(adapter.fileInputAccepts(accept, files)).toBe(expected);
  });

  it('selects the image input instead of the earlier document input', async () => {
    const debuggerApi = { sendCommand: vi.fn(async (method, params) => {
      if (method === 'DOM.getDocument') return { root: { nodeId: 1 } };
      if (method === 'DOM.querySelectorAll') return { nodeIds: [2, 3] };
      if (method === 'DOM.describeNode') return { node: { nodeName: 'INPUT', attributes: ['type', 'file', 'accept', params.nodeId === 2 ? '.pdf,.txt' : 'image/*'] } };
    }) };
    expect(await adapter.findDeclaredFileInput(debuggerApi, 'input[type=file]', [image])).toEqual({ nodeId: 3 });
  });

  it('still rejects two equally eligible inputs instead of taking the first', async () => {
    const debuggerApi = { sendCommand: vi.fn(async method => {
      if (method === 'DOM.getDocument') return { root: { nodeId: 1 } };
      if (method === 'DOM.querySelectorAll') return { nodeIds: [2, 3] };
      if (method === 'DOM.describeNode') return { node: { nodeName: 'INPUT', attributes: ['type', 'file', 'accept', 'image/*'] } };
    }) };
    expect(await adapter.findDeclaredFileInput(debuggerApi, 'input[type=file]', [image])).toEqual({ ambiguous: true });
  });
});
