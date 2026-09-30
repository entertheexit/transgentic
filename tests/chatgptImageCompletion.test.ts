import { describe, expect, it } from 'vitest';
import vm from 'node:vm';
import { DomObserver } from '../src/main/webviews/domObserver.js';
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
