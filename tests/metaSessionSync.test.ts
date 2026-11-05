import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { CookieSyncManager } from '../src/main/auth/cookieSyncServer.js';
import { AccountRegistryManager } from '../src/main/registry/accountRegistry.js';

const background = readFileSync(new URL('../extensions/transgentic-sync/background.js', import.meta.url), 'utf8');
const metadata = background.slice(0, background.indexOf('/**\n * Reads background sync configuration'));
const extraction = background.slice(background.indexOf('async function extractServiceCookies('), background.indexOf('/**\n * Silent Background Execution Engine:'));

function extension({ signedIn = false, visible = true, open = true, denied = false } = {}) {
  const cookies = [
    { name: 'session', value: 'test-only', domain: '.meta.ai', path: '/' },
    { name: 'other', value: 'test-only', domain: '.facebook.com', path: '/' },
    { name: 'spoof', value: 'test-only', domain: '.notmeta.ai', path: '/' },
  ];
  const chrome = {
    runtime: {},
    tabs: { query: vi.fn(async () => open ? [{ id: 1 }] : []) },
    scripting: { executeScript: vi.fn(async ({ func }: any) => {
      if (denied) throw new Error('Tab unavailable');
      return [{ result: func() }];
    }) },
    cookies: { getAll: vi.fn(async () => cookies) },
    storage: { local: { get: vi.fn(async () => ({})) } },
  };
  return runInNewContext(`${metadata}\n${extraction}\n({ service: SERVICES_METADATA.meta, defaults: DEFAULT_SYNC_CONFIG, extractServiceCookies })`, {
    chrome, URL,
    document: { querySelectorAll: () => signedIn ? [{ getClientRects: () => visible ? [1] : [] }] : [] },
    getComputedStyle: () => ({ display: 'block', visibility: 'visible' }),
  });
}

describe('Meta session synchronization boundaries', () => {
  it.each([
    [{ signedIn: true }, true],
    [{ signedIn: false }, false],
    [{ signedIn: true, visible: false }, false],
    [{ signedIn: true, open: false }, false],
    [{ signedIn: true, denied: true }, false],
  ])('guards optional background refresh for %j', async (state, expected) => {
    const worker = extension(state);
    expect(worker.defaults.services.meta).toBe(false);
    expect(await worker.service.isValidSession()).toBe(expected);
  });

  it('never includes Facebook or hostname lookalike cookies in a Meta refresh', async () => {
    const worker = extension({ signedIn: true });
    const cookies = await worker.extractServiceCookies(worker.service);
    expect(cookies.map((cookie: any) => cookie.domain)).toEqual(['.meta.ai']);
  });

  it('filters unrelated active-tab cookies from manual sync-all extraction', async () => {
    const source = readFileSync(new URL('../extensions/transgentic-sync/popup.js', import.meta.url), 'utf8');
    const start = source.indexOf('async function extractProviderCookies(');
    const end = source.indexOf('\n}', start) + 2;
    const extract = runInNewContext(`${source.slice(start, end)}\nextractProviderCookies`, {
      ext: { cookies: { getAll: async () => [{ name: 'other', domain: '.facebook.com', path: '/' }] } },
      currentTab: { url: 'https://facebook.com/' },
      extractAllCookiesForDomain: async () => [{ name: 'session', domain: '.meta.ai', path: '/' }],
    });
    expect((await extract({ id: 'meta', domains: ['meta.ai'] })).map((cookie: any) => cookie.domain)).toEqual(['.meta.ai']);
  });

  it('rejects an unrelated sync origin before creating or selecting an account', async () => {
    const addAccount = vi.spyOn(AccountRegistryManager, 'addAccount');
    try {
      await expect(CookieSyncManager.syncSession({ provider: 'meta', origin: 'https://meta.ai.example.org/', newAccountAlias: 'should not exist' }))
        .rejects.toThrow('HTTPS meta.ai origin');
      expect(addAccount).not.toHaveBeenCalled();
    } finally {
      addAccount.mockRestore();
    }
  });

  it('adds Meta to an older account store while preserving existing account partitions', () => {
    const account = { id: 'existing', alias: 'Personal', provider: 'chatgpt', partitionKey: 'persist:existing-personal', isMain: true, priorityIndex: 0 };
    const store = (AccountRegistryManager as any).migrateAndSanitize({ chatgpt: { activeAccountId: 'existing', accounts: [account] } });
    expect(store.chatgpt.activeAccountId).toBe('existing');
    expect(store.chatgpt.accounts[0].partitionKey).toBe('persist:existing-personal');
    expect(store.meta.accounts[0].partitionKey).toBe('persist:transgentic_meta');
  });
});
