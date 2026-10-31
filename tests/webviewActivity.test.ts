import { expect, it, vi } from 'vitest';
import { CustomRecipeAdapter } from '../src/main/webviews/customRecipeAdapter.js';

it.each(['success', 'failure', 'cancelled'])('restores hidden-view throttling after %s', async outcome => {
  const setBackgroundThrottling = vi.fn();
  const error = Object.assign(new Error(outcome), { name: outcome === 'cancelled' ? 'AbortError' : 'Error' });
  const adapter = {
    webContents: { isDestroyed: () => false, getBackgroundThrottling: () => true, setBackgroundThrottling },
    executePromptInView: vi.fn(async () => {
      expect(setBackgroundThrottling).toHaveBeenLastCalledWith(false);
      if (outcome !== 'success') throw error;
      return { text: 'reply' };
    }),
  };
  const promise = CustomRecipeAdapter.prototype.executePrompt.call(adapter as any, 'synthetic', 'general');
  if (outcome === 'success') await expect(promise).resolves.toEqual({ text: 'reply' });
  else await expect(promise).rejects.toBe(error);
  expect(setBackgroundThrottling.mock.calls).toEqual([[false], [true]]);
});

it('preserves an already unthrottled view without changing its policy', async () => {
  const setBackgroundThrottling = vi.fn();
  const adapter = {
    webContents: { isDestroyed: () => false, getBackgroundThrottling: () => false, setBackgroundThrottling },
    executePromptInView: vi.fn().mockResolvedValue({ text: 'reply' }),
  };
  await CustomRecipeAdapter.prototype.executePrompt.call(adapter as any, 'synthetic', 'general');
  expect(setBackgroundThrottling).not.toHaveBeenCalled();
});

it('waits for cumulative readiness across separate native upload kinds', async () => {
  const batches: Array<{ files: string[]; expected: number }> = [];
  const adapter = {
    webContents: { debugger: { isAttached: () => true } },
    findDeclaredFileInput: vi.fn().mockResolvedValue({}),
    attachFileBatch: vi.fn(async (_upload, files, _signal, expected) => {
      batches.push({ files: files.map(file => file.name), expected });
    }),
  };
  await (CustomRecipeAdapter.prototype as any).attachFiles.call(adapter, { ready: '.chip' }, [
    { kind: 'image', name: 'fixture.png' },
    { kind: 'document', name: 'first.txt' },
    { kind: 'document', name: 'second.txt' },
  ]);
  expect(batches).toEqual([
    { files: ['fixture.png'], expected: 1 },
    { files: ['first.txt', 'second.txt'], expected: 3 },
  ]);
});

it('does not add a later upload batch when an earlier batch fails', async () => {
  const attachFileBatch = vi.fn().mockRejectedValue(new Error('upload failed'));
  const adapter = { webContents: { debugger: { isAttached: () => true } }, findDeclaredFileInput: vi.fn().mockResolvedValue({}), attachFileBatch };
  await expect((CustomRecipeAdapter.prototype as any).attachFiles.call(adapter, { ready: '.chip' }, [
    { kind: 'image', name: 'fixture.png' }, { kind: 'document', name: 'fixture.txt' },
  ])).rejects.toThrow('upload failed');
  expect(attachFileBatch).toHaveBeenCalledTimes(1);
});
