import { describe, it, expect, beforeEach } from 'vitest';
import { AccountRegistryManager } from '../src/main/registry/accountRegistry.js';

describe('AccountRegistryManager Unit Tests', () => {
  beforeEach(() => {
    AccountRegistryManager.initialize();
  });

  it('should initialize default profiles for all 4 AI providers', () => {
    const store = AccountRegistryManager.getAll();
    expect(store.chatgpt).toBeDefined();
    expect(store.claude).toBeDefined();
    expect(store.gemini).toBeDefined();
    expect(store.grok).toBeDefined();

    expect(store.chatgpt.accounts.length).toBeGreaterThanOrEqual(1);
    expect(store.chatgpt.accounts[0].isMain).toBe(true);
    expect(store.chatgpt.accounts[0].priorityIndex).toBe(0);
    expect(store.chatgpt.accounts[0].partitionKey).toBe('persist:transgentic_chatgpt');
  });

  it('should add a new account profile with dedicated partition key', () => {
    const newAcc = AccountRegistryManager.addAccount('chatgpt', 'Personal Plus');
    expect(newAcc.alias).toBe('Personal Plus');
    expect(newAcc.provider).toBe('chatgpt');
    expect(newAcc.partitionKey).toContain('persist:transgentic_chatgpt_acc_chatgpt_');
    expect(newAcc.isMain).toBe(false);
    expect(newAcc.status).toBe('ready');

    const providerStore = AccountRegistryManager.getForProvider('chatgpt');
    expect(providerStore.accounts.some((a) => a.id === newAcc.id)).toBe(true);
  });

  it('should update account alias cleanly', () => {
    const newAcc = AccountRegistryManager.addAccount('claude', 'Work Team');
    const updated = AccountRegistryManager.updateAlias('claude', newAcc.id, 'Work Enterprise');
    expect(updated.alias).toBe('Work Enterprise');

    const store = AccountRegistryManager.getForProvider('claude');
    const found = store.accounts.find((a) => a.id === newAcc.id);
    expect(found?.alias).toBe('Work Enterprise');
  });

  it('should set main account and update flags', () => {
    const newAcc = AccountRegistryManager.addAccount('gemini', 'Second Gemini');
    const store = AccountRegistryManager.setMainAccount('gemini', newAcc.id);

    const target = store.accounts.find((a) => a.id === newAcc.id);
    const others = store.accounts.filter((a) => a.id !== newAcc.id);

    expect(target?.isMain).toBe(true);
    others.forEach((o) => expect(o.isMain).toBe(false));
  });

  it('should reorder accounts and recalculate priorityIndex', () => {
    const acc1 = AccountRegistryManager.addAccount('grok', 'Grok Profile 2');
    const acc2 = AccountRegistryManager.addAccount('grok', 'Grok Profile 3');

    const storeBefore = AccountRegistryManager.getForProvider('grok');
    const reverseIds = [...storeBefore.accounts.map((a) => a.id)].reverse();

    const storeAfter = AccountRegistryManager.reorderAccounts('grok', reverseIds);
    expect(storeAfter.accounts[0].id).toBe(reverseIds[0]);
    expect(storeAfter.accounts[0].priorityIndex).toBe(0);
    expect(storeAfter.accounts[1].priorityIndex).toBe(1);
  });

  it('should prevent deleting the only account in a provider', () => {
    const store = AccountRegistryManager.getForProvider('gemini');
    // Delete added accounts first
    while (store.accounts.length > 1) {
      AccountRegistryManager.deleteAccount('gemini', store.accounts[store.accounts.length - 1].id);
    }
    expect(() => AccountRegistryManager.deleteAccount('gemini', store.accounts[0].id)).toThrowError();
  });

  it('should mark account rate limited and filter out in getReadyAccounts during cooldown', () => {
    const newAcc = AccountRegistryManager.addAccount('claude', 'RateLimited Test Profile');
    AccountRegistryManager.markRateLimited('claude', newAcc.id, 3600);

    const readyAccounts = AccountRegistryManager.getReadyAccounts('claude');
    expect(readyAccounts.some((a) => a.id === newAcc.id)).toBe(false);

    // After marking ready, it should be included again
    AccountRegistryManager.markReady('claude', newAcc.id);
    const readyAgain = AccountRegistryManager.getReadyAccounts('claude');
    expect(readyAgain.some((a) => a.id === newAcc.id)).toBe(true);
  });

  it('should strictly return the single explicitly selected active account without auto-rotation', () => {
    const currentActive = AccountRegistryManager.getActiveAccount('claude')!;
    const acc2 = AccountRegistryManager.addAccount('claude', 'Second Backup Profile');

    // Current active is preserved
    expect(AccountRegistryManager.getActiveAccount('claude')?.id).toBe(currentActive.id);

    // If currentActive is rate-limited, getActiveAccount still strictly returns currentActive (no automatic account switching)
    AccountRegistryManager.markRateLimited('claude', currentActive.id, 3600);
    expect(AccountRegistryManager.getActiveAccount('claude')?.id).toBe(currentActive.id);

    // Only explicit user selection changes the active account
    AccountRegistryManager.setActiveAccount('claude', acc2.id);
    expect(AccountRegistryManager.getActiveAccount('claude')?.id).toBe(acc2.id);
  });
});
