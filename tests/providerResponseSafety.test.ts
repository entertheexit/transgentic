import { afterEach, describe, expect, it, vi } from 'vitest';
import vm from 'node:vm';
import { DomObserver, providerNoticeText } from '../src/main/webviews/domObserver.js';
import { BaseProviderAdapter } from '../src/main/webviews/adapterBase.js';

afterEach(() => vi.useRealTimers());

function turn(text: string, hidden = false, displayContents = false): any {
  return {
    tagName: 'DIV', innerText: text, textContent: text,
    offsetWidth: hidden || displayContents ? 0 : 100,
    offsetHeight: hidden || displayContents ? 0 : 20,
    children: displayContents ? [turn(text)] : [],
    display: displayContents ? 'contents' : 'block',
    matches: () => false, contains: () => false, closest: () => null,
    getAttribute: () => null, querySelector: () => null, querySelectorAll: () => [],
    cloneNode: () => ({ textContent: text, querySelectorAll: () => [] }),
  };
}

async function inspect(provider: 'chatgpt' | 'claude' | 'grok' | 'gemini' | 'webview_custom_example', nodes: any[], recipe?: any, mode: 'general' | 'image' = 'general') {
  const markers = { chatgpt: 'generated-image-gallery', claude: 'font-claude-message', grok: 'response-turn', gemini: 'model-response', webview_custom_example: 'assistant-turn' };
  return vm.runInNewContext(DomObserver.getInspectionScript(provider, mode, recipe), {
    document: { body: { innerText: '' }, querySelector: () => null,
      createElement: () => ({ textContent: '' }),
      querySelectorAll: (selector: string) => selector.includes(markers[provider]) ? nodes : [] },
    getComputedStyle: (el: any) => ({ display: el.display || 'block', visibility: 'visible', opacity: '1' }),
  });
}

describe('Provider response visibility', () => {
  it('preserves ChatGPT code blocks as fenced code instead of joining the language toolbar to source', async () => {
    const source = 'function add(a: number, b: number): number {\n  return a + b;\n}';
    const response = turn('TypeScript' + source);
    response.cloneNode = () => {
      const clone = {
        textContent: 'TypeScript' + source,
        querySelectorAll: (selector: string) => selector === '[data-code-block="true"]'
          ? [{ querySelector: () => ({ textContent: source }), replaceWith: (node: { textContent: string }) => { clone.textContent = node.textContent; } }]
          : [],
      };
      return clone;
    };
    expect(await inspect('chatgpt', [response])).toMatchObject({ text: '```\n' + source + '\n```' });
  });
  it('preserves Grok code blocks as fenced code instead of joining the language toolbar to source', async () => {
    const source = 'function add(a: number, b: number): number {\n  return a + b;\n}';
    const response = turn('TypeScript' + source);
    response.cloneNode = () => {
      const clone = {
        textContent: 'TypeScript' + source,
        querySelectorAll: (selector: string) => selector === 'pre[role="group"][aria-label$=" code"]'
          ? [{ querySelector: () => ({ textContent: source }), parentElement: { parentElement: {
            replaceWith: (node: { textContent: string }) => { clone.textContent = node.textContent; },
          } } }]
          : [],
      };
      return clone;
    };
    expect(await inspect('grok', [response])).toMatchObject({ text: '```\n' + source + '\n```' });
  });
  it('preserves Claude code blocks as fenced code instead of joining the language toolbar to source', async () => {
    const source = 'function add(a: number, b: number): number {\n  return a + b;\n}';
    const response = turn('typescript' + source);
    response.cloneNode = () => {
      const clone = {
        textContent: 'typescript' + source,
        querySelectorAll: (selector: string) => selector === 'div[role="group"][aria-label$=" code"]:has(pre code)'
          ? [{ querySelector: () => ({ textContent: source }), replaceWith: (node: { textContent: string }) => { clone.textContent = node.textContent; } }]
          : [],
      };
      return clone;
    };
    expect(await inspect('claude', [response])).toMatchObject({ text: '```\n' + source + '\n```' });
  });
  it('preserves Gemini code blocks as fenced code instead of joining the language toolbar to source', async () => {
    const source = 'function add(a: number, b: number): number {\n  return a + b;\n}';
    const response = turn('TypeScript' + source);
    response.cloneNode = () => {
      const clone = {
        textContent: 'TypeScript' + source,
        querySelectorAll: (selector: string) => selector === 'code-block:has(pre code)'
          ? [{ querySelector: () => ({ textContent: source }), replaceWith: (node: { textContent: string }) => { clone.textContent = node.textContent; } }]
          : [],
      };
      return clone;
    };
    expect(await inspect('gemini', [response])).toMatchObject({ text: '```\n' + source + '\n```' });
  });
  it('uses a custom recipe code-block wrapper to preserve fences without a provider-specific rule', async () => {
    const source = 'function add(a: number, b: number): number {\n  return a + b;\n}';
    const response = turn('typescript' + source);
    response.cloneNode = () => {
      const clone = {
        textContent: 'typescript' + source,
        querySelectorAll: (selector: string) => selector === '.code-block-wrapper'
          ? [{ querySelector: () => ({ textContent: source }), replaceWith: (node: { textContent: string }) => { clone.textContent = node.textContent; } }]
          : [],
      };
      return clone;
    };
    const recipe = { response: { container: '.assistant-turn', codeBlockSelector: '.code-block-wrapper', modes: { text: { enabled: true } } } };
    expect(await inspect('webview_custom_example', [response], recipe)).toMatchObject({ text: '```\n' + source + '\n```' });
  });
  it('finds an image outside the normal Markdown response container', async () => {
    const response = turn('');
    const image = { ...turn(''), tagName: 'IMG', src: 'https://example.com/generated.png', complete: true, naturalWidth: 128 };
    response.querySelectorAll = (selector: string) => selector === 'img.generated' ? [image] : [];
    const recipe = { response: {
      container: '.markdown-only',
      modes: { image: { enabled: true, responseContainer: '.assistant-turn', contentSelector: 'img.generated' } },
    } };
    expect(await inspect('webview_custom_example', [response], recipe, 'image'))
      .toMatchObject({ mediaUrl: image.src, mediaType: 'image' });
  });

  it('extracts only a loaded, visible image from a custom response', async () => {
    const response = turn('');
    const image = (src: string, complete: boolean, width: number) => ({
      ...turn(''), tagName: 'IMG', src, complete, naturalWidth: width,
    });
    response.querySelectorAll = (selector: string) => selector === 'img.generated'
      ? [image('https://example.com/unloaded.png', false, 0), image('https://example.com/ready.png', true, 128)]
      : [];
    const recipe = { response: {
      container: '.assistant-turn',
      modes: { text: { enabled: true, contentSelector: 'img.generated' } },
    } };
    expect(await inspect('webview_custom_example', [response], recipe))
      .toMatchObject({ mediaUrl: 'https://example.com/ready.png', mediaType: 'image' });
  });

  it.each(['chatgpt', 'claude', 'grok', 'gemini'] as const)('%s ignores a hidden response after the visible response', async provider => {
    expect(await inspect(provider, [turn('Visible reply'), turn('Hidden stale reply', true)])).toMatchObject({ text: 'Visible reply' });
    expect(await inspect(provider, [turn('Hidden stale reply', true)])).toMatchObject({ text: '' });
  });
  it('accepts Gemini display:contents wrappers with visible response children', async () => {
    expect(await inspect('gemini', [turn('Visible reply', false, true)])).toMatchObject({ text: 'Visible reply' });
  });
});

describe('Provider intervention while polling', () => {
  const idle = { text: '', isGenerating: false, isThinking: false, isMediaRendering: false, isRateLimited: false, isSecurityWarning: false, hasActionButtons: false };
  it('surfaces native media access blockers on the first polling tick', async () => {
    vi.useFakeTimers();
    const executeScript = vi.fn().mockResolvedValue({ ...idle, mediaUnavailableReason: 'Subscription required' });
    const pending = BaseProviderAdapter.prototype.pollGeneration.call({ providerId: 'grok', name: 'Grok', executeScript } as any, { mode: 'video' });
    const assertion = expect(pending).rejects.toThrow('[MEDIA_UNAVAILABLE]');
    await vi.advanceTimersByTimeAsync(1100);
    await assertion;
    expect(executeScript).toHaveBeenCalledOnce();
  });
  it.each(['chatgpt', 'claude', 'grok', 'gemini'])('%s surfaces verification immediately rather than waiting for a timeout', async providerId => {
    vi.useFakeTimers();
    const executeScript = vi.fn().mockResolvedValue({ ...idle, isSecurityWarning: true, securityWarningReason: 'Sign in again' });
    const promise = BaseProviderAdapter.prototype.pollGeneration.call({ providerId, name: providerId, executeScript } as any, { mode: 'general' });
    const assertion = expect(promise).rejects.toThrow('[PROVIDER_ACTION_REQUIRED]');
    await vi.advanceTimersByTimeAsync(1100);
    await assertion;
    expect(executeScript).toHaveBeenCalledOnce();
  });
  it('waits for a generated image even when progress text has action buttons', async () => {
    vi.useFakeTimers();
    const progress = { ...idle, text: 'Preparing your image', hasActionButtons: true };
    const image = { ...idle, mediaUrl: 'https://example.com/result.png', mediaType: 'image', hasActionButtons: true };
    const executeScript = vi.fn().mockResolvedValueOnce(progress).mockResolvedValueOnce(progress)
      .mockResolvedValue(image);
    const pending = BaseProviderAdapter.prototype.pollGeneration.call(
      { providerId: 'gemini', name: 'Gemini', executeScript } as any, { mode: 'image' },
    );
    await vi.advanceTimersByTimeAsync(6500);
    await expect(pending).resolves.toMatchObject({ media: { type: 'image', data: image.mediaUrl } });
  });

  it('ignores a video returned while waiting for an image', async () => {
    vi.useFakeTimers();
    const video = { ...idle, mediaUrl: 'https://example.com/preview.mp4', mediaType: 'video', hasActionButtons: true };
    const image = { ...idle, mediaUrl: 'https://example.com/final.png', mediaType: 'image', hasActionButtons: true };
    const executeScript = vi.fn().mockResolvedValueOnce(video).mockResolvedValueOnce({ ...video })
      .mockResolvedValue(image);
    const pending = BaseProviderAdapter.prototype.pollGeneration.call(
      { providerId: 'gemini', name: 'Gemini', executeScript } as any, { mode: 'image' },
    );
    await vi.advanceTimersByTimeAsync(6500);
    await expect(pending).resolves.toMatchObject({ media: { type: 'image', data: image.mediaUrl } });
  });

  it('waits again when generation resumes during the final media check', async () => {
    vi.useFakeTimers();
    const preview = { ...idle, mediaUrl: 'https://example.com/preview.png', mediaType: 'image', hasActionButtons: true };
    const finalImage = { ...preview, mediaUrl: 'https://example.com/final.png' };
    const executeScript = vi.fn().mockResolvedValueOnce(preview).mockResolvedValueOnce(preview)
      .mockResolvedValueOnce({ ...preview, isMediaRendering: true }).mockResolvedValue(finalImage);
    const pending = BaseProviderAdapter.prototype.pollGeneration.call(
      { providerId: 'gemini', name: 'Gemini', executeScript } as any, { mode: 'image' },
    );
    await vi.advanceTimersByTimeAsync(6500);
    await expect(pending).resolves.toMatchObject({ media: { type: 'image', data: finalImage.mediaUrl } });
  });

  it('does not return a completed reply when verification appears in the final snapshot', async () => {
    vi.useFakeTimers();
    const executeScript = vi.fn().mockResolvedValueOnce({ ...idle, text: 'Reply', hasActionButtons: true })
      .mockResolvedValueOnce({ ...idle, text: 'Reply', hasActionButtons: true })
      .mockResolvedValue({ ...idle, text: 'Reply', isSecurityWarning: true, securityWarningReason: 'Verification challenge' });
    const promise = BaseProviderAdapter.prototype.pollGeneration.call({ providerId: 'claude', name: 'Claude', executeScript } as any, { mode: 'general' });
    const assertion = expect(promise).rejects.toThrow('Verification challenge');
    await vi.advanceTimersByTimeAsync(3000);
    await assertion;
  });
});

describe('Provider notices versus conversation text', () => {
  it('excludes hydration scripts and CSS-hidden quota notices', () => {
    let text = 'Visible content Rate limit exceeded hidden quota';
    const script = { remove: () => { text = text.replace('Rate limit exceeded ', ''); } };
    const hidden = { remove: () => { text = text.replace('hidden quota', ''); } };
    const result = vm.runInNewContext(`(${providerNoticeText.toString()})()`, {
      document: { body: {
        querySelectorAll: () => [{ hidden: false }, { hidden: true }],
        cloneNode: () => ({
          get textContent() { return text; },
          querySelectorAll: (selector: string) => selector === '*' ? [script, hidden] : selector.includes('script') ? [script] : [],
        }),
      } },
      getComputedStyle: (element: any) => ({ display: element.hidden ? 'none' : 'block', visibility: 'visible' }),
    });
    expect(result.trim()).toBe('Visible content');
  });

  async function notices(reply: string, notice: string, hiddenChallenge = false) {
    return vm.runInNewContext(DomObserver.getInspectionScript('claude', 'general'), {
      document: {
        body: { innerText: reply + notice, cloneNode: () => {
          const clone = { textContent: reply + notice,
            querySelectorAll: (selector: string) => selector.includes('.font-claude-message')
              ? [{ remove: () => { clone.textContent = notice; } }] : [] };
          return clone;
        } },
        querySelector: () => null,
        querySelectorAll: (selector: string) => selector.includes('#challenge-running') && hiddenChallenge ? [turn('', true)] : [],
      },
      getComputedStyle: () => ({ display: 'block', visibility: 'visible', opacity: '1' }),
    });
  }
  it('does not classify quoted verification or sign-in text as a provider notice', async () => {
    expect(await notices('Security check: explain why sites say Verify you are human or Session expired.', '', true)).toMatchObject({ isSecurityWarning: false });
  });
  it('ignores quoted quota wording but preserves actual provider quota notices', async () => {
    expect(await notices('Explain Rate limit exceeded and Too many requests.', '')).toMatchObject({ isRateLimited: false });
    expect(await notices('Ordinary reply', 'Rate limit exceeded')).toMatchObject({ isRateLimited: true });
  });
  it.each(['Verify you are human', 'Session expired', 'Your account is restricted'])('detects an actual UI notice: %s', async notice => {
    expect(await notices('Ordinary reply', notice)).toMatchObject({ isSecurityWarning: true });
  });
});
