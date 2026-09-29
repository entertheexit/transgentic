import { afterEach, describe, expect, it, vi } from 'vitest';
import { CustomRecipeAdapter } from '../src/main/webviews/customRecipeAdapter.js';
import { BUILTIN_RECIPES } from '../src/shared/types/recipe.js';

afterEach(() => vi.useRealTimers());

describe('Pre-submission new chat navigation', () => {
  it('retries one transient ERR_FAILED without accepting the previous conversation', async () => {
    vi.useFakeTimers();
    const adapter = new CustomRecipeAdapter(BUILTIN_RECIPES.chatgpt);
    const loadURL = vi.fn().mockRejectedValueOnce(Object.assign(new Error('ERR_FAILED (-2)'), { errno: -2 })).mockResolvedValueOnce(undefined);
    adapter.setWebContents({ isDestroyed: () => false, getURL: () => 'https://chatgpt.com/c/old', loadURL } as any);
    const result = adapter.navigateToNewChat({ forceReload: true });
    await vi.runAllTimersAsync();
    await result;
    expect(loadURL.mock.calls).toEqual([[BUILTIN_RECIPES.chatgpt.newChatUrl], [BUILTIN_RECIPES.chatgpt.newChatUrl]]);
    expect(adapter.isLocked()).toBe(false);
  });

  it.each(['ERR_FAILED (-2)', 'ERR_CERT_AUTHORITY_INVALID (-202)'])('reports persistent %s and releases the DOM lock', async message => {
    vi.useFakeTimers();
    const adapter = new CustomRecipeAdapter(BUILTIN_RECIPES.chatgpt);
    const loadURL = vi.fn().mockRejectedValue(new Error(message));
    adapter.setWebContents({ isDestroyed: () => false, getURL: () => 'https://chatgpt.com/c/old', loadURL } as any);
    const result = expect(adapter.navigateToNewChat({ forceReload: true })).rejects.toThrow(`Could not open a new chat for OpenAI ChatGPT: ${message}`);
    await vi.runAllTimersAsync();
    await result;
    expect(loadURL).toHaveBeenCalledTimes(message.includes('ERR_FAILED') ? 2 : 1);
    expect(adapter.isLocked()).toBe(false);
  });
});
