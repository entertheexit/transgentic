import { describe, expect, it, vi } from 'vitest';
import vm from 'node:vm';
import { DomObserver } from '../src/main/webviews/domObserver.js';
import { CustomRecipeAdapter } from '../src/main/webviews/customRecipeAdapter.js';
import { BUILTIN_RECIPES } from '../src/shared/types/recipe.js';

const dataUrl = 'data:image/png;base64,aW1hZ2U=';

// ChatGPT's image-only replies now use a gallery without assistant-turn attributes.
async function inspectGallery({ loaded = true, user = false, stopped = true, wrapped = false, followingText = false } = {}) {
  const image = {
    src: dataUrl, complete: loaded, naturalWidth: loaded ? 100 : 0, naturalHeight: loaded ? 100 : 0,
    getAttribute: (name: string) => name === 'alt' ? user ? 'User attachment' : 'Generated image 1' : dataUrl,
    closest: () => user ? {} : null,
  };
  const gallery = {
    offsetWidth: 400, offsetHeight: 400,
    textContent: '', innerText: '', closest: () => user ? {} : null,
    matches: () => true, contains: () => false,
    querySelector: () => null,
    querySelectorAll: (selector: string) => selector.includes('img[') ? [image] : [],
    cloneNode: () => ({ textContent: '', querySelectorAll: () => [] }),
  };
  const caption = {
    textContent: 'Here is your image.', innerText: 'Here is your image.',
    querySelectorAll: () => [], cloneNode: () => ({ textContent: 'Here is your image.', querySelectorAll: () => [] }),
  };
  const assistant = {
    ...gallery, matches: () => false, contains: (el: unknown) => wrapped && el === gallery,
    querySelector: (selector: string) => selector.includes('assistant-message') ? caption : null,
    querySelectorAll: (selector: string) => wrapped && selector.includes('img[') ? [image] : [],
  };
  const stop = {
    getClientRects: () => [{}], matches: () => true,
    getAttribute: () => 'Stop generating', querySelector: () => null,
  };
  const document = {
    body: { innerText: '' }, querySelector: () => null,
    querySelectorAll: (selector: string) => selector.includes('[data-testid="generated-image-gallery"]') ? wrapped ? [assistant, gallery] : followingText ? [gallery, assistant] : [gallery]
      : selector === 'button, [role="button"]' && !stopped ? [stop] : [],
    createElement: () => ({ getContext: () => ({ drawImage: () => {} }), toDataURL: () => dataUrl }),
  };
  // Installed/healed recipes may still have only the former assistant selectors.
  const oldRecipe = { ...BUILTIN_RECIPES.chatgpt, response: { ...BUILTIN_RECIPES.chatgpt.response, container: '[data-message-author-role="assistant"]' } };
  return await vm.runInNewContext(DomObserver.getInspectionScript('chatgpt', 'image', oldRecipe), {
    document, getComputedStyle: () => ({ display: 'block', visibility: 'visible', opacity: '1' }),
  });
}

describe('ChatGPT image-only completion detection', () => {
  it('completes a loaded gallery even with an older installed recipe', async () => {
    expect(await inspectGallery()).toMatchObject({ mediaUrl: dataUrl, mediaType: 'image', hasActionButtons: true, isGenerating: false, text: '' });
  });
  it('never returns the uploaded reference image as generated output', async () => {
    expect(await inspectGallery({ user: true })).toMatchObject({ mediaUrl: undefined, hasActionButtons: false });
  });
  it('waits for the generated image to load', async () => {
    expect(await inspectGallery({ loaded: false })).toMatchObject({ mediaUrl: undefined, hasActionButtons: false });
  });
  it('keeps waiting while a real Stop button indicates generation is active', async () => {
    expect(await inspectGallery({ stopped: false })).toMatchObject({ isGenerating: true, hasActionButtons: false });
  });
  it('preserves captions when a gallery is inside an assistant turn', async () => {
    expect(await inspectGallery({ wrapped: true })).toMatchObject({ mediaUrl: dataUrl, text: 'Here is your image.' });
  });
  it('does not reuse an earlier gallery for a later text response', async () => {
    expect(await inspectGallery({ followingText: true })).toMatchObject({ mediaUrl: undefined, text: 'Here is your image.' });
  });
});

describe('ChatGPT inline image composer', () => {
  const enter = (CustomRecipeAdapter.prototype as any).dispatchPromptAfterImagePill;

  it('keeps an exact unsent draft without typing it twice', async () => {
    const insertText = vi.fn();
    const adapter = {
      webContents: { isDestroyed: () => false, insertText },
      executeScript: vi.fn().mockResolvedValue('already-entered'),
    };
    expect(await enter.call(adapter, '[contenteditable="true"]', 'A purple circle')).toEqual({ success: true });
    expect(insertText).not.toHaveBeenCalled();
  });

  it('inserts after the image pill and verifies both mode and prompt before success', async () => {
    const insertText = vi.fn();
    const executeScript = vi.fn().mockResolvedValueOnce('ready').mockResolvedValueOnce(true);
    const adapter = { webContents: { isDestroyed: () => false, insertText }, executeScript };
    expect(await enter.call(adapter, '[contenteditable="true"]', 'A purple circle')).toEqual({ success: true });
    expect(insertText).toHaveBeenCalledExactlyOnceWith('A purple circle');
    expect(executeScript.mock.calls[0][0]).toContain('range.setStartAfter(pill)');
    expect(executeScript.mock.calls[1][0]).toContain('data-inline-selection-pill');
  });

  it('refuses to append to an unrelated draft', async () => {
    const insertText = vi.fn();
    const adapter = {
      webContents: { isDestroyed: () => false, insertText },
      executeScript: vi.fn().mockResolvedValue('occupied:12'),
    };
    expect(await enter.call(adapter, '[contenteditable="true"]', 'A purple circle')).toMatchObject({ success: false });
    expect(insertText).not.toHaveBeenCalled();
  });
});
