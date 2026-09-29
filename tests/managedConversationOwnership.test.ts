import { describe, expect, it, vi } from 'vitest';
import { SessionManager } from '../src/main/webviews/sessionManager.js';

describe('Managed provider view ownership', () => {
  it.each(['temporaryConversations', 'normalConversations'])('keeps %s out of the shared auth/cookie-sync adapter', collection => {
    const manager = new SessionManager();
    const shared = { isDestroyed: () => false } as any;
    const managed = { isDestroyed: () => false } as any;
    manager.getAdapter('chatgpt')!.setWebContents(shared);
    (manager as any)[collection].set('test', { window: { isDestroyed: () => false, webContents: managed } });
    const refresh = vi.spyOn(manager, 'refreshProviderStatus').mockResolvedValue({} as any);
    manager.registerWebContents('chatgpt', managed);
    expect(manager.isManagedConversation(managed)).toBe(true);
    expect(manager.getWebContents('chatgpt')).toBe(shared);
    expect(refresh).not.toHaveBeenCalled();
  });
});
