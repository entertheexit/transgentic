import { describe, expect, it, vi } from 'vitest';
import { CustomRecipeAdapter } from '../src/main/webviews/customRecipeAdapter.js';
import { BUILTIN_RECIPES, validateCustomRecipe } from '../src/shared/types/recipe.js';

const enter = (CustomRecipeAdapter.prototype as any).dispatchPromptPreservingAttachments;
function view(...states: string[]) {
  const insertText = vi.fn();
  const executeScript = vi.fn();
  for (const state of states) executeScript.mockResolvedValueOnce(state);
  return { webContents: { isDestroyed: () => false, insertText }, executeScript };
}

describe('Inline attachment prompt insertion', () => {
  it('inserts the prompt once after the references and requires preservation proof', async () => {
    const adapter = view('ready', 'preserved');
    expect(await enter.call(adapter, '[contenteditable=true]', 'Describe these', '[data-inline-image-id]', 2)).toEqual({ success: true });
    expect(adapter.webContents.insertText).toHaveBeenCalledExactlyOnceWith('Describe these');
  });

  it('does not retype an exact existing prompt', async () => {
    const adapter = view('already-entered');
    expect(await enter.call(adapter, '[contenteditable=true]', 'Describe these', '[data-inline-image-id]', 2)).toEqual({ success: true });
    expect(adapter.webContents.insertText).not.toHaveBeenCalled();
  });

  it.each(['occupied', 'attachments-missing', 'not-focused'])('does not type into an invalid editor: %s', async state => {
    const adapter = view(state);
    expect(await enter.call(adapter, '[contenteditable=true]', 'Describe these', '[data-inline-image-id]', 2)).toMatchObject({ success: false });
    expect(adapter.webContents.insertText).not.toHaveBeenCalled();
  });

  it.each(['attachments-missing', 'prompt-mismatch'])('rejects the request if insertion loses content: %s', async state => {
    const adapter = view('ready', state);
    expect(await enter.call(adapter, '[contenteditable=true]', 'Describe these', '[data-inline-image-id]', 2)).toMatchObject({ success: false });
  });

  it.each(['attachments-missing', 'prompt-mismatch'])('fails the final pre-submit check for %s', async state => {
    const adapter = view(state);
    const verify = (CustomRecipeAdapter.prototype as any).verifyInlineAttachmentPrompt;
    expect(await verify.call(adapter, '[contenteditable=true]', 'Describe these', '[data-inline-image-id]', 2)).toBe(false);
  });

  it('requires an uninterrupted upload readiness interval before returning', async () => {
    vi.useFakeTimers();
    try {
      const debuggerApi = { isAttached: () => false, attach: vi.fn(), detach: vi.fn(), sendCommand: vi.fn(async () => ({})) };
      const adapter = {
        webContents: { debugger: debuggerApi },
        findDeclaredFileInput: vi.fn(async () => ({ nodeId: 1 })),
        executeScript: vi.fn().mockResolvedValue(true).mockResolvedValueOnce(true).mockResolvedValueOnce(false),
      };
      let ready = false;
      const batch = (CustomRecipeAdapter.prototype as any).attachFileBatch.call(adapter,
        { fileInput: 'input[type=file]', ready: '.chip', readyStableMs: 500 },
        [{ path: '/fixture.png' }], undefined, 1).then(() => { ready = true; });
      await vi.advanceTimersByTimeAsync(700);
      expect(ready).toBe(false);
      await vi.advanceTimersByTimeAsync(250);
      await batch;
      expect(ready).toBe(true);
    } finally { vi.useRealTimers(); }
  });

  it('preserves the declarative inline attachment contract through recipe validation', () => {
    const recipe = structuredClone(BUILTIN_RECIPES.meta);
    recipe.response.modes.text.inputAttachments = {
      fileInput: 'input[type=file]', acceptedKinds: ['image'], multiple: true,
      preserveInComposer: '[data-inline-image-id]', readyStableMs: 8000,
    };
    expect(validateCustomRecipe(recipe).recipe?.response.modes.text.inputAttachments).toMatchObject({ preserveInComposer: '[data-inline-image-id]', readyStableMs: 8000 });
    recipe.response.modes.text.inputAttachments.readyStableMs = 10001;
    expect(validateCustomRecipe(recipe).recipe?.response.modes.text.inputAttachments?.readyStableMs).toBeUndefined();
  });
});
