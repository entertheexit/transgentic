import { describe, expect, it } from 'vitest';
import vm from 'node:vm';
import { DomObserver } from '../src/main/webviews/domObserver.js';
import { BUILTIN_RECIPES } from '../src/shared/types/recipe.js';

const url = 'https://assets.grok.com/users/test/generated/current/image.jpg';
async function inspect({ loaded = true, reference = false, excluded = false, portal = true } = {}) {
  const image = { tagName: 'IMG', src: url, currentSrc: url, complete: loaded, naturalWidth: loaded ? 960 : 0,
    closest: () => reference ? {} : null, getAttribute: () => url };
  const selector = BUILTIN_RECIPES.grok.response.modes.image!.contentSelector;
  const document = { body: { innerText: '' }, querySelector: (s: string) => s === '#grok-content-area' ? { querySelectorAll: () => portal ? [] : [image] } : null,
    querySelectorAll: (s: string) => s === selector ? [image] : [] };
  return vm.runInNewContext(DomObserver.getInspectionScript('grok', 'image', BUILTIN_RECIPES.grok, excluded ? [url] : []), { document });
}

describe('Grok Imagine completion', () => {
  it('captures a loaded result portalled outside the main canvas', async () => {
    expect(await inspect()).toMatchObject({ mediaUrl: url, mediaType: 'image', hasActionButtons: true, isGenerating: false });
  });
  it.each([{ reference: true }, { excluded: true }, { loaded: false }])('does not complete with a reference, prior asset or unloaded image: %j', async options => {
    expect(await inspect(options)).toMatchObject({ mediaUrl: undefined, hasActionButtons: false });
  });
});
