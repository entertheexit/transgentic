import { describe, expect, it } from 'vitest';
import vm from 'node:vm';
import { DomObserver } from '../src/main/webviews/domObserver.js';
import { BUILTIN_RECIPES } from '../src/shared/types/recipe.js';

const url = 'https://assets.grok.com/users/test/generated/current/image.jpg';
async function inspect({ loaded = true, reference = false, excluded = false, portal = true, paywall = false, hiddenPaywall = false } = {}) {
  const image = { tagName: 'IMG', src: url, currentSrc: url, complete: loaded, naturalWidth: loaded ? 960 : 0,
    closest: () => reference ? {} : null, getAttribute: () => url };
  const selector = BUILTIN_RECIPES.grok.response.modes.image!.contentSelector;
  const dialog = { tagName: 'DIV', textContent: 'Unlock your creativity with Imagine',
    getBoundingClientRect: () => ({ width: hiddenPaywall ? 0 : 100, height: 100 }),
    getAttribute: (name: string) => name === 'role' ? 'dialog' : null, hasAttribute: () => false };
  const document = { body: { innerText: '' }, querySelector: (s: string) => s === '#grok-content-area' ? { querySelectorAll: () => portal ? [] : [image] } : null,
    querySelectorAll: (s: string) => s === '[role]' && paywall ? [dialog] : s === selector ? [image] : [] };
  return vm.runInNewContext(DomObserver.getInspectionScript('grok', 'image', BUILTIN_RECIPES.grok, excluded ? [url] : []), {
    document, innerWidth: 1000, getComputedStyle: () => ({ display: 'block', visibility: 'visible', opacity: '1' }),
  });
}

describe('Grok Imagine completion', () => {
  it('reports a visible native entitlement dialog instead of accepting a prior gallery asset', async () => {
    expect(await inspect({ paywall: true })).toMatchObject({ mediaUnavailableReason: expect.any(String), text: '' });
    expect(await inspect({ paywall: true, hiddenPaywall: true })).toMatchObject({ mediaUrl: url });
  });
  it('captures a loaded result portalled outside the main canvas', async () => {
    expect(await inspect()).toMatchObject({ mediaUrl: url, mediaType: 'image', hasActionButtons: true, isGenerating: false });
  });
  it.each([{ reference: true }, { excluded: true }, { loaded: false }])('does not complete with a reference, prior asset or unloaded image: %j', async options => {
    expect(await inspect(options)).toMatchObject({ mediaUrl: undefined, hasActionButtons: false });
  });
});
