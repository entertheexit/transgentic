import { describe, expect, it, vi } from 'vitest';
import { SessionManager } from '../src/main/webviews/sessionManager.js';

describe('Isolated provider view ownership', () => {
  it('discards only the failed ChatGPT image window and leaves the drawer intact', () => {
    const manager = new SessionManager();
    const partition = 'persist:transgentic_chatgpt';
    const key = `chatgpt:${partition}:requests`;
    const drawer = { isDestroyed: () => false } as any;
    const composer = { isDestroyed: () => false } as any;
    const window = { isDestroyed: () => false, webContents: composer, destroy: vi.fn() };
    const windows = (manager as any).backgroundWindows;
    manager.getAdapter('chatgpt')!.setWebContents(drawer);
    windows.set(key, window);

    manager.discardChatGptImageView(partition, drawer);
    expect(window.destroy).not.toHaveBeenCalled();
    expect(windows.get(key)).toBe(window);

    manager.discardChatGptImageView(partition, composer);
    expect(window.destroy).toHaveBeenCalledOnce();
    expect(windows.has(key)).toBe(false);
    expect(manager.getWebContents('chatgpt')).toBe(drawer);
  });

  it.each(['temporaryConversations', 'normalConversations'])('keeps %s out of the shared auth/cookie-sync adapter', collection => {
    const manager = new SessionManager();
    const shared = { isDestroyed: () => false } as any;
    const managed = { isDestroyed: () => false } as any;
    manager.getAdapter('chatgpt')!.setWebContents(shared);
    (manager as any)[collection].set('test', { window: { isDestroyed: () => false, webContents: managed } });
    const refresh = vi.spyOn(manager, 'refreshProviderStatus').mockResolvedValue({} as any);
    manager.registerWebContents('chatgpt', managed);
    expect(manager.isIsolatedProviderView(managed)).toBe(true);
    expect(manager.getWebContents('chatgpt')).toBe(shared);
    expect(refresh).not.toHaveBeenCalled();
  });

  it('keeps a model discovery probe from replacing the Gemini request view', () => {
    const manager = new SessionManager();
    const request = { isDestroyed: () => false } as any;
    const probe = { isDestroyed: () => false } as any;
    manager.getAdapter('gemini')!.setWebContents(request);
    (manager as any).isolatedProviderViews.add(probe);
    const refresh = vi.spyOn(manager, 'refreshProviderStatus').mockResolvedValue({} as any);

    manager.registerWebContents('gemini', probe);

    expect(manager.isIsolatedProviderView(probe)).toBe(true);
    expect(manager.getWebContents('gemini')).toBe(request);
    expect(refresh).not.toHaveBeenCalled();
  });
});
