import { afterEach, describe, expect, it, vi } from 'vitest';
import { CustomRecipeAdapter } from '../src/main/webviews/customRecipeAdapter.js';
import { SessionManager } from '../src/main/webviews/sessionManager.js';
import { inspectTemporaryChatInBackground } from '../src/main/webviews/temporaryChatProbe.js';
import { BUILTIN_RECIPES } from '../src/shared/types/recipe.js';
import { ModelScraperEngine } from '../src/main/registry/modelScrapers.js';
import { AccountRegistryManager } from '../src/main/registry/accountRegistry.js';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

function hiddenWindow(load: Promise<void> = Promise.resolve()) {
  let destroyed = false;
  return {
    loadURL: vi.fn(() => load), isDestroyed: () => destroyed,
    destroy: vi.fn(() => { destroyed = true; }),
    webContents: { isDestroyed: () => destroyed, executeJavaScript: vi.fn() },
  } as any;
}

afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

describe('Read-only background availability page', () => {
  it('inspects a separate adapter and destroys the page without activating a mode', async () => {
    const source = new CustomRecipeAdapter(BUILTIN_RECIPES.chatgpt);
    const view = hiddenWindow();
    const inspect = vi.spyOn(CustomRecipeAdapter.prototype, 'inspectTemporaryChatAvailability').mockResolvedValue({ availability: 'available' });
    const activate = vi.spyOn(CustomRecipeAdapter.prototype, 'activateTemporaryChat');
    expect(await inspectTemporaryChatInBackground(source, view, 'persist:test')).toEqual({ availability: 'available' });
    expect(view.loadURL).toHaveBeenCalledWith(source.url);
    expect(inspect.mock.instances[0]).not.toBe(source);
    expect(source.getWebContents()).toBeNull();
    expect(activate).not.toHaveBeenCalled();
    expect(view.destroy).toHaveBeenCalledOnce();
  });

  it('bounds loading and ignores a late load completion', async () => {
    vi.useFakeTimers();
    const load = deferred<void>();
    const view = hiddenWindow(load.promise);
    const inspect = vi.spyOn(CustomRecipeAdapter.prototype, 'inspectTemporaryChatAvailability');
    const task = inspectTemporaryChatInBackground(new CustomRecipeAdapter(BUILTIN_RECIPES.chatgpt), view, 'persist:test', 1000);
    await vi.advanceTimersByTimeAsync(1000);
    expect(await task).toBeUndefined();
    expect(view.destroy).toHaveBeenCalledOnce();
    load.resolve();
    await vi.advanceTimersByTimeAsync(500);
    expect(inspect).not.toHaveBeenCalled();
  });

  it('waits for hydration rather than treating a missing initial control as final', async () => {
    vi.useFakeTimers();
    const inspect = vi.spyOn(CustomRecipeAdapter.prototype, 'inspectTemporaryChatAvailability')
      .mockResolvedValueOnce({ availability: 'unknown' }).mockResolvedValue({ availability: 'available' });
    const view = hiddenWindow();
    const task = inspectTemporaryChatInBackground(new CustomRecipeAdapter(BUILTIN_RECIPES.chatgpt), view, 'persist:test', 1000);
    await vi.advanceTimersByTimeAsync(150);
    expect(await task).toEqual({ availability: 'available' });
    expect(inspect).toHaveBeenCalledTimes(2);
    expect(view.destroy).toHaveBeenCalledOnce();
  });
});

describe('Explicit provider recheck ownership', () => {
  function setup(view = hiddenWindow()) {
    let account: any = { id: 'a', partitionKey: 'persist:account-a' };
    vi.spyOn(AccountRegistryManager, 'getActiveAccount').mockImplementation(() => account);
    vi.spyOn(AccountRegistryManager, 'markStatus').mockImplementation(() => {});
    const manager = new SessionManager();
    const create = vi.spyOn(manager as any, 'createAvailabilityProbeWindow').mockReturnValue(view);
    vi.spyOn(manager, 'configureSession').mockReturnValue({ cookies: { get: async () => [] } } as any);
    vi.spyOn(CustomRecipeAdapter.prototype, 'inspectTemporaryChatAvailability').mockResolvedValue({ availability: 'available' });
    return { manager, create, setAccount: (value: any) => { account = value; } };
  }

  it('deduplicates checks and keeps their account-bound result across routine refreshes', async () => {
    const load = deferred<void>();
    const { manager, create } = setup(hiddenWindow(load.promise));
    const first = manager.recheckTemporaryChatAvailability('chatgpt');
    expect(manager.recheckTemporaryChatAvailability('chatgpt')).toBe(first);
    expect(manager.getStatus('chatgpt')?.temporaryChat?.checking).toBe(true);
    await manager.refreshProviderStatus('chatgpt');
    expect(manager.getStatus('chatgpt')?.temporaryChat?.checking).toBe(true);
    load.resolve();
    expect((await first).temporaryChat?.availability).toBe('available');
    expect(create).toHaveBeenCalledExactlyOnceWith('persist:account-a');
    expect(manager.getAdapter('chatgpt')?.getWebContents()).toBeNull();
    await manager.refreshProviderStatus('chatgpt');
    expect(manager.getStatus('chatgpt')?.temporaryChat).toMatchObject({ availability: 'available', checking: false });
  });

  it('keeps a routine active-view refresh from overriding the explicit check', async () => {
    const load = deferred<void>();
    const { manager } = setup(hiddenWindow(load.promise));
    const source = manager.getAdapter('chatgpt')!;
    const existingView = { isDestroyed: () => false } as any;
    source.setWebContents(existingView);
    vi.spyOn(source, 'checkAuthStatus').mockResolvedValue(true);
    vi.spyOn(source, 'checkRateLimit').mockResolvedValue({ isRateLimited: false });
    vi.spyOn(ModelScraperEngine, 'discoverModels').mockResolvedValue([]);
    const task = manager.recheckTemporaryChatAvailability('chatgpt');
    await manager.refreshProviderStatus('chatgpt');
    expect(manager.getStatus('chatgpt')?.temporaryChat?.checking).toBe(true);
    load.resolve();
    expect((await task).temporaryChat?.availability).toBe('available');
    expect(source.getWebContents()).toBe(existingView);
  });

  it('discards an older active-view inspection after a newer background check', async () => {
    const { manager } = setup();
    const source = manager.getAdapter('chatgpt')!;
    source.setWebContents({ isDestroyed: () => false } as any);
    vi.spyOn(source, 'checkAuthStatus').mockResolvedValue(true);
    vi.spyOn(source, 'checkRateLimit').mockResolvedValue({ isRateLimited: false });
    vi.spyOn(ModelScraperEngine, 'discoverModels').mockResolvedValue([]);
    const oldInspection = deferred<any>();
    vi.mocked(CustomRecipeAdapter.prototype.inspectTemporaryChatAvailability).mockImplementationOnce(() => oldInspection.promise);
    const refresh = manager.refreshProviderStatus('chatgpt');
    await Promise.resolve();
    expect(manager.getStatus('chatgpt')?.temporaryChat?.checking).toBe(true);
    expect((await manager.recheckTemporaryChatAvailability('chatgpt')).temporaryChat?.availability).toBe('available');
    oldInspection.resolve({ availability: 'unknown' });
    await refresh;
    expect(manager.getStatus('chatgpt')?.temporaryChat?.availability).toBe('available');
  });

  it('does not expose a cached result for a newly selected account before refresh', async () => {
    const { manager, setAccount } = setup();
    await manager.recheckTemporaryChatAvailability('chatgpt');
    expect(manager.getAllStatuses().chatgpt.temporaryChat?.availability).toBe('available');
    setAccount({ id: 'b', partitionKey: 'persist:account-b' });
    expect(manager.getAllStatuses().chatgpt.temporaryChat?.availability).toBe('unknown');
    expect(manager.getAllStatuses().chatgpt.temporaryChat?.checkedAt).toBeUndefined();
  });

  it('discards a result when the account changes while loading', async () => {
    const load = deferred<void>();
    const { manager, setAccount } = setup(hiddenWindow(load.promise));
    const task = manager.recheckTemporaryChatAvailability('chatgpt');
    setAccount({ id: 'b', partitionKey: 'persist:account-b' });
    load.resolve();
    expect((await task).temporaryChat?.availability).toBe('unknown');
    expect(manager.getStatus('chatgpt')?.temporaryChat?.checking).not.toBe(true);
  });

  it('discards a result after recipe replacement', async () => {
    const load = deferred<void>();
    const { manager } = setup(hiddenWindow(load.promise));
    const task = manager.recheckTemporaryChatAvailability('chatgpt');
    manager.registerAdapter(new CustomRecipeAdapter({ ...BUILTIN_RECIPES.chatgpt, version: '99.0.0' }));
    load.resolve();
    expect((await task).temporaryChat?.availability).toBe('unknown');
  });

  it('does not recreate a provider removed during a check', async () => {
    const load = deferred<void>();
    const { manager } = setup(hiddenWindow(load.promise));
    const task = manager.recheckTemporaryChatAvailability('chatgpt');
    const rejected = expect(task).rejects.toThrow('Provider removed');
    manager.unregisterAdapter('chatgpt');
    load.resolve();
    await rejected;
    expect(manager.getStatus('chatgpt')).toBeUndefined();
  });

  it('reports failed page creation without changing authentication and permits retry', async () => {
    const { manager, create } = setup();
    const status = manager.getStatus('chatgpt')!;
    status.isAuthenticated = true;
    create.mockImplementationOnce(() => { throw new Error('Window creation failed'); });
    const failed = await manager.recheckTemporaryChatAvailability('chatgpt');
    expect(failed.isAuthenticated).toBe(true);
    expect(failed.temporaryChat).toMatchObject({ checking: false, checkFailed: true, availability: 'unknown' });
    expect((await manager.recheckTemporaryChatAvailability('chatgpt')).temporaryChat?.availability).toBe('available');
  });

  it('clears checking after a network timeout and allows a fresh retry', async () => {
    vi.useFakeTimers();
    const load = deferred<void>();
    const { manager, create } = setup(hiddenWindow(load.promise));
    const task = manager.recheckTemporaryChatAvailability('chatgpt');
    await vi.advanceTimersByTimeAsync(8000);
    expect((await task).temporaryChat).toMatchObject({ checking: false, checkFailed: true, availability: 'unknown' });
    create.mockReturnValue(hiddenWindow());
    expect((await manager.recheckTemporaryChatAvailability('chatgpt')).temporaryChat?.availability).toBe('available');
    load.resolve();
    await vi.advanceTimersByTimeAsync(100);
    expect(manager.getStatus('chatgpt')?.temporaryChat?.availability).toBe('available');
  });

  it('keeps the normal refresh path for providers without Temporary Chat', async () => {
    const { manager, create } = setup();
    const refresh = vi.spyOn(manager, 'refreshProviderStatus').mockResolvedValue({ id: 'meta' } as any);
    await manager.recheckTemporaryChatAvailability('meta');
    expect(refresh).toHaveBeenCalledWith('meta');
    expect(create).not.toHaveBeenCalled();
  });
});
