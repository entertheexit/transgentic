import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadCliState } from '../src/renderer/utils/cliStateLoader.js';
const state = { config: { services: {}, workspaces: [] }, statuses: {}, sandboxAvailable: true };
afterEach(() => vi.useRealTimers());
describe('CLI settings loading', () => {
  it('explains a stale or missing desktop bridge instead of hanging', async () => {
    await expect(loadCliState({})).rejects.toThrow('desktop bridge is out of date');
    await expect(loadCliState(undefined)).rejects.toThrow('restart npm run dev');
  });
  it('loads state from the desktop bridge', async () => {
    await expect(loadCliState({ getCliState: async () => state })).resolves.toEqual(state);
  });
  it('rejects invalid state and reports IPC errors', async () => {
    await expect(loadCliState({ getCliState: async () => undefined as any })).rejects.toThrow('invalid CLI settings');
    await expect(loadCliState({ getCliState: async () => { throw new Error('No handler registered'); } })).rejects.toThrow('No handler registered');
  });
  it('times out when the main process never answers', async () => {
    vi.useFakeTimers();
    const result = expect(loadCliState({ getCliState: () => new Promise(() => {}) }, 100)).rejects.toThrow('did not respond');
    await vi.advanceTimersByTimeAsync(100); await result;
    expect(vi.getTimerCount()).toBe(0);
  });
});
