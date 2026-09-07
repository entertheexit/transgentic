import { afterEach, describe, it, expect, vi } from 'vitest';
import { UPDATE_CHECK_INTERVAL_MS } from '../src/shared/release.js';
import { createUpdateChecker, getAvailableUpdate } from '../src/main/updates.js';

describe('release update checks', () => {
  afterEach(() => vi.useRealTimers());

  it('refreshes the cached release after an hour', async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ tag_name: 'v1.0.1' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ tag_name: 'v1.0.2' }) });
    const check = createUpdateChecker(fetcher);
    expect((await check('1.0.0'))?.version).toBe('1.0.1');
    await vi.advanceTimersByTimeAsync(UPDATE_CHECK_INTERVAL_MS - 1);
    expect((await check('1.0.0'))?.version).toBe('1.0.1');
    await vi.advanceTimersByTimeAsync(1);
    expect((await check('1.0.0'))?.version).toBe('1.0.2');
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('retries a failed check on the next hourly check', async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn().mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({ ok: true, json: async () => ({ tag_name: 'v1.0.1' }) });
    const check = createUpdateChecker(fetcher);
    expect(await check('1.0.0')).toBeNull();
    await vi.advanceTimersByTimeAsync(UPDATE_CHECK_INTERVAL_MS);
    expect((await check('1.0.0'))?.version).toBe('1.0.1');
  });
  it('compares version components numerically and never offers a downgrade', () => {
    expect(getAvailableUpdate('1.9.0', { tag_name: 'v1.10.0' })?.version).toBe('1.10.0');
    expect(getAvailableUpdate('2.0.0', { tag_name: 'v1.10.0' })).toBeNull();
    expect(getAvailableUpdate('1.0.0', { tag_name: 'v1.0.0' })).toBeNull();
    expect(getAvailableUpdate('1.0.0+local', { tag_name: 'v1.0.0' })).toBeNull();
    expect(getAvailableUpdate('1.0.0-beta.1', { tag_name: 'v1.0.0' })?.version).toBe('1.0.0');
  });

  it('ignores draft, prerelease, and malformed results', () => {
    for (const result of [null, {}, { tag_name: 2 }, { tag_name: 'next' },
      { tag_name: 'v2.0.0-beta' }, { tag_name: 'v2.0.0', draft: true },
      { tag_name: 'v2.0.0', prerelease: true }]) {
      expect(getAvailableUpdate('1.0.0', result)).toBeNull();
    }
  });

  it('constructs the release link from the trusted repository, not response URLs', () => {
    expect(getAvailableUpdate('1.0.0', { tag_name: 'v1.0.1', html_url: 'https://example.com' })?.url)
      .toBe('https://github.com/entertheexit/transgentic/releases/tag/v1.0.1');
  });

  it('coalesces launch requests and caches their result', async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ tag_name: 'v1.0.1' }) });
    const check = createUpdateChecker(fetcher);
    const [a, b] = await Promise.all([check('1.0.0'), check('1.0.0')]);
    expect(a?.version).toBe('1.0.1');
    expect(b).toEqual(a);
    await check('1.0.0');
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
  });

  it('fails quietly on offline, rate-limited, missing, or invalid responses', async () => {
    for (const fetcher of [
      vi.fn().mockRejectedValue(new Error('offline')),
      vi.fn().mockResolvedValue({ ok: false, status: 403 }),
      vi.fn().mockResolvedValue({ ok: false, status: 404 }),
      vi.fn().mockResolvedValue({ ok: true, json: async () => { throw new Error('invalid JSON'); } }),
    ]) {
      const check = createUpdateChecker(fetcher);
      expect(await check('1.0.0')).toBeNull();
      expect(await check('1.0.0')).toBeNull();
      expect(fetcher).toHaveBeenCalledTimes(1);
    }
  });
});
