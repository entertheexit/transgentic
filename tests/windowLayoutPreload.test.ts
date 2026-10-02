import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

describe('window layout preload bridge', () => {
  it('returns native outcomes and removes only its own subscription on cleanup', async () => {
    let api: any;
    const outcome = { presentation: 'window', layout: { mainPaneWidth: 720, drawerOpen: false, isCompact: false, revision: 4 } };
    const ipcRenderer = { invoke: vi.fn().mockResolvedValue(outcome), on: vi.fn(), removeListener: vi.fn() };
    runInNewContext(readFileSync('src/main/preload/mainPreload.cjs', 'utf8'), {
      require: () => ({ ipcRenderer, contextBridge: { exposeInMainWorld: (_key: string, value: any) => { api = value; } } }),
      window: { addEventListener: vi.fn() }, process: { platform: 'linux' },
    });
    expect(await api.openProviderDrawer('chatgpt')).toBe(outcome);
    expect(ipcRenderer.invoke).toHaveBeenLastCalledWith('open-provider-drawer', 'chatgpt');
    await api.getWindowLayout();
    expect(ipcRenderer.invoke).toHaveBeenLastCalledWith('get-window-layout');
    const callback = vi.fn();
    const unsubscribe = api.onWindowLayoutChanged(callback);
    const [channel, listener] = ipcRenderer.on.mock.calls.at(-1)!;
    listener({}, outcome.layout);
    expect(callback).toHaveBeenCalledWith(outcome.layout);
    unsubscribe();
    expect(ipcRenderer.removeListener).toHaveBeenCalledWith(channel, listener);
  });
});
