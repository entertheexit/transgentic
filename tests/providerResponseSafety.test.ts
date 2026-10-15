import { afterEach, describe, expect, it, vi } from 'vitest';
import vm from 'node:vm';
import { DomObserver } from '../src/main/webviews/domObserver.js';
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

async function inspect(provider: 'chatgpt' | 'claude' | 'grok' | 'gemini' | 'webview_custom_example', nodes: any[], recipe?: any) {
  const markers = { chatgpt: 'generated-image-gallery', claude: 'font-claude-message', grok: 'response-turn', gemini: 'model-response', webview_custom_example: 'assistant-turn' };
  return vm.runInNewContext(DomObserver.getInspectionScript(provider, 'general', recipe), {
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
  it.each(['chatgpt', 'claude', 'grok', 'gemini'])('%s surfaces verification immediately rather than waiting for a timeout', async providerId => {
    vi.useFakeTimers();
    const executeScript = vi.fn().mockResolvedValue({ ...idle, isSecurityWarning: true, securityWarningReason: 'Sign in again' });
    const promise = BaseProviderAdapter.prototype.pollGeneration.call({ providerId, name: providerId, executeScript } as any, { mode: 'general' });
    const assertion = expect(promise).rejects.toThrow('[PROVIDER_ACTION_REQUIRED]');
    await vi.advanceTimersByTimeAsync(1100);
    await assertion;
    expect(executeScript).toHaveBeenCalledOnce();
  });
  it('does not return a completed reply when verification appears in the final snapshot', async () => {
    vi.useFakeTimers();
    const executeScript = vi.fn().mockResolvedValueOnce({ ...idle, text: 'Reply', hasActionButtons: true })
      .mockResolvedValue({ ...idle, text: 'Reply', isSecurityWarning: true, securityWarningReason: 'Verification challenge' });
    const promise = BaseProviderAdapter.prototype.pollGeneration.call({ providerId: 'claude', name: 'Claude', executeScript } as any, { mode: 'general' });
    const assertion = expect(promise).rejects.toThrow('Verification challenge');
    await vi.advanceTimersByTimeAsync(1900);
    await assertion;
  });
});

describe('Provider notices versus conversation text', () => {
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
  it.each(['Verify you are human', 'Session expired', 'Your account is restricted'])('detects an actual UI notice: %s', async notice => {
    expect(await notices('Ordinary reply', notice)).toMatchObject({ isSecurityWarning: true });
  });
});
