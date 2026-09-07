import fs from 'fs';
import path from 'path';
import { app } from 'electron';
import { AccountProfile, AccountRegistryStore, ProviderAccountStore, ProviderId } from '../../shared/types.js';
import { PartitionLifecycleManager } from '../auth/partitionLifecycle.js';

export class AccountRegistryManager {
  private static store: AccountRegistryStore | null = null;
  private static listeners: Array<(registry: AccountRegistryStore) => void> = [];

  private static getFilePath(): string {
    const userData = app ? app.getPath('userData') : process.cwd();
    return path.join(userData, 'accounts_registry.json');
  }

  private static getDefaultStore(): AccountRegistryStore {
    const now = Date.now();
    const providers: ProviderId[] = ['chatgpt', 'claude', 'gemini', 'grok'];
    const result: Partial<AccountRegistryStore> = {};

    for (const p of providers) {
      const defaultId = `acc_${p}_default`;
      result[p] = {
        activeAccountId: defaultId,
        accounts: [
          {
            id: defaultId,
            alias: 'Primary (Default)',
            provider: p,
            partitionKey: `persist:transgentic_${p}`,
            isMain: true,
            priorityIndex: 0,
            status: 'ready',
            createdAt: now,
          },
        ],
      };
    }

    return result as AccountRegistryStore;
  }

  public static initialize(): AccountRegistryStore {
    if (this.store) return this.store;

    const filePath = this.getFilePath();
    try {
      if (fs.existsSync(filePath)) {
        const raw = fs.readFileSync(filePath, 'utf-8');
        const parsed = JSON.parse(raw);
        this.store = this.migrateAndSanitize(parsed);
      } else {
        this.store = this.getDefaultStore();
        this.persist();
      }
    } catch (err) {
      console.warn('[AccountRegistry] Failed to load accounts_registry.json, initializing defaults:', err);
      this.store = this.getDefaultStore();
      this.persist();
    }

    return this.store;
  }

  private static migrateAndSanitize(loaded: any): AccountRegistryStore {
    const defaults = this.getDefaultStore();
    const standardProviders: ProviderId[] = ['chatgpt', 'claude', 'gemini', 'grok'];
    const allKeys = Array.from(new Set([...standardProviders, ...Object.keys(loaded || {})])) as ProviderId[];
    const result: Partial<AccountRegistryStore> = {};

    for (const p of allKeys) {
      if (!loaded || !loaded[p] || !Array.isArray(loaded[p].accounts) || loaded[p].accounts.length === 0) {
        result[p] = defaults[p] || {
          activeAccountId: `acc_${p}_default`,
          accounts: [
            {
              id: `acc_${p}_default`,
              alias: 'Primary (Default)',
              provider: p,
              partitionKey: `persist:transgentic_${p}`,
              isMain: true,
              priorityIndex: 0,
              status: 'ready',
              createdAt: Date.now(),
            },
          ],
        };
      } else {
        const accounts: AccountProfile[] = loaded[p].accounts.map((acc: any, idx: number) => ({
          id: String(acc.id || `acc_${p}_${idx}`),
          alias: String(acc.alias || (idx === 0 ? 'Primary (Default)' : `Account ${idx + 1}`)),
          provider: p,
          partitionKey: String(acc.partitionKey || (idx === 0 ? `persist:transgentic_${p}` : `persist:transgentic_${p}_${acc.id}`)),
          isMain: Boolean(acc.isMain ?? (idx === 0)),
          priorityIndex: typeof acc.priorityIndex === 'number' ? acc.priorityIndex : idx,
          status: acc.status || 'ready',
          rateLimitedUntil: acc.rateLimitedUntil,
          createdAt: acc.createdAt || Date.now(),
          lastUsedAt: acc.lastUsedAt,
        }));

        // Ensure at least one is main
        if (!accounts.some((a) => a.isMain)) {
          accounts[0].isMain = true;
        }

        // Sort by priorityIndex
        accounts.sort((a, b) => a.priorityIndex - b.priorityIndex);
        accounts.forEach((a, i) => { a.priorityIndex = i; });

        const activeId = loaded[p].activeAccountId && accounts.some((a) => a.id === loaded[p].activeAccountId)
          ? loaded[p].activeAccountId
          : (accounts.find((a) => a.isMain)?.id || accounts[0].id);

        result[p] = {
          activeAccountId: activeId,
          accounts,
        };
      }
    }

    return result as AccountRegistryStore;
  }

  private static persist(): void {
    if (!this.store) return;
    try {
      const filePath = this.getFilePath();
      const dir = path.dirname(filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(filePath, JSON.stringify(this.store, null, 2), 'utf-8');
      this.notifyListeners();
    } catch (err) {
      console.error('[AccountRegistry] Failed to persist accounts_registry.json:', err);
    }
  }

  public static onAccountsUpdated(listener: (registry: AccountRegistryStore) => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  private static notifyListeners(): void {
    if (!this.store) return;
    for (const listener of this.listeners) {
      try {
        listener(this.store);
      } catch {}
    }
  }

  public static getAll(): AccountRegistryStore {
    if (!this.store) this.initialize();
    return this.store!;
  }

  public static getForProvider(provider: ProviderId): ProviderAccountStore {
    if (!this.store) this.initialize();
    if (!this.store![provider] || !Array.isArray(this.store![provider].accounts) || this.store![provider].accounts.length === 0) {
      const defaultId = `acc_${provider}_default`;
      const defaultStore: ProviderAccountStore = {
        activeAccountId: defaultId,
        accounts: [
          {
            id: defaultId,
            alias: 'Primary (Default)',
            provider: provider,
            partitionKey: `persist:transgentic_${provider}`,
            isMain: true,
            priorityIndex: 0,
            status: 'ready',
            createdAt: Date.now(),
          },
        ],
      };
      this.store![provider] = defaultStore;
      this.persist();
      return defaultStore;
    }
    return this.store![provider];
  }

  public static setProviderPartition(provider: ProviderId, partitionKey: string): void {
    const store = this.getForProvider(provider);
    if (store && Array.isArray(store.accounts) && store.accounts.length > 0) {
      store.accounts[0].partitionKey = partitionKey;
      this.persist();
    }
  }

  public static getActiveAccount(provider: ProviderId): AccountProfile {
    const store = this.getForProvider(provider);
    if (!store || !Array.isArray(store.accounts) || store.accounts.length === 0) {
      const defaultId = `acc_${provider}_default`;
      return {
        id: defaultId,
        alias: 'Primary (Default)',
        provider,
        partitionKey: `persist:transgentic_${provider}`,
        isMain: true,
        priorityIndex: 0,
        status: 'ready',
        createdAt: Date.now(),
      };
    }
    const active = store.accounts.find((a) => a.id === store.activeAccountId);
    return active || store.accounts[0];
  }

  /**
   * Returns ready accounts sorted by priorityIndex (0 = highest priority).
   * Automatically clears rate-limited status if the cooldown has elapsed.
   */
  public static getReadyAccounts(provider: ProviderId): AccountProfile[] {
    const store = this.getForProvider(provider);
    const now = Date.now();
    let hasMutated = false;

    for (const acc of store.accounts) {
      if (acc.status === 'rate_limited' && acc.rateLimitedUntil && now >= acc.rateLimitedUntil) {
        acc.status = 'ready';
        acc.rateLimitedUntil = undefined;
        hasMutated = true;
      }
    }

    if (hasMutated) {
      this.persist();
    }

    return store.accounts
      .filter((a) => a.status === 'ready' || a.status === 'unauthenticated')
      .sort((a, b) => a.priorityIndex - b.priorityIndex);
  }

  public static addAccount(provider: ProviderId, alias: string): AccountProfile {
    const store = this.getForProvider(provider);
    const cleanAlias = alias.trim() || `Profile ${store.accounts.length + 1}`;
    const id = `acc_${provider}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    const partitionKey = `persist:transgentic_${provider}_${id}`;

    const newProfile: AccountProfile = {
      id,
      alias: cleanAlias,
      provider,
      partitionKey,
      isMain: store.accounts.length === 0,
      priorityIndex: store.accounts.length,
      status: 'ready',
      createdAt: Date.now(),
    };

    store.accounts.push(newProfile);
    this.persist();
    return newProfile;
  }

  public static updateAlias(provider: ProviderId, accountId: string, alias: string): AccountProfile {
    const store = this.getForProvider(provider);
    const acc = store.accounts.find((a) => a.id === accountId);
    if (!acc) throw new Error(`Account ${accountId} not found for ${provider}`);

    acc.alias = alias.trim() || acc.alias;
    this.persist();
    return acc;
  }

  public static setMainAccount(provider: ProviderId, accountId: string): ProviderAccountStore {
    const store = this.getForProvider(provider);
    const target = store.accounts.find((a) => a.id === accountId);
    if (!target) throw new Error(`Account ${accountId} not found for ${provider}`);

    for (const acc of store.accounts) {
      acc.isMain = acc.id === accountId;
    }

    this.persist();
    return store;
  }

  public static setActiveAccount(provider: ProviderId, accountId: string): ProviderAccountStore {
    const store = this.getForProvider(provider);
    const target = store.accounts.find((a) => a.id === accountId);
    if (!target) throw new Error(`Account ${accountId} not found for ${provider}`);

    store.activeAccountId = accountId;
    target.lastUsedAt = Date.now();
    this.persist();
    return store;
  }

  public static reorderAccounts(provider: ProviderId, accountIds: string[]): ProviderAccountStore {
    const store = this.getForProvider(provider);
    const accountMap = new Map(store.accounts.map((a) => [a.id, a]));
    const reordered: AccountProfile[] = [];

    for (const id of accountIds) {
      const acc = accountMap.get(id);
      if (acc) {
        reordered.push(acc);
        accountMap.delete(id);
      }
    }

    // Append any remaining
    for (const remaining of accountMap.values()) {
      reordered.push(remaining);
    }

    reordered.forEach((acc, idx) => {
      acc.priorityIndex = idx;
    });

    store.accounts = reordered;
    this.persist();
    return store;
  }

  public static deleteAccount(provider: ProviderId, accountId: string): ProviderAccountStore {
    const store = this.getForProvider(provider);

    if (store.accounts.length <= 1) {
      throw new Error(`Cannot delete the only account profile for ${provider}`);
    }

    const index = store.accounts.findIndex((a) => a.id === accountId);
    if (index === -1) throw new Error(`Account ${accountId} not found for ${provider}`);

    const targetAccount = store.accounts[index];
    const partitionKey = targetAccount.partitionKey;
    const wasMain = targetAccount.isMain;
    const wasActive = store.activeAccountId === accountId;

    store.accounts.splice(index, 1);

    // If main was deleted, assign first account as main
    if (wasMain && store.accounts.length > 0) {
      store.accounts[0].isMain = true;
    }

    // If active was deleted, point active to main or first account
    if (wasActive && store.accounts.length > 0) {
      store.activeAccountId = store.accounts.find((a) => a.isMain)?.id || store.accounts[0].id;
    }

    // Re-index priority
    store.accounts.forEach((acc, idx) => {
      acc.priorityIndex = idx;
    });

    this.persist();

    // Wipe partition cache and storage data
    PartitionLifecycleManager.deleteAccountPartition(provider, accountId, partitionKey).catch(() => {});

    return store;
  }

  public static markRateLimited(provider: ProviderId, accountId: string, cooldownSeconds: number = 3600): void {
    const store = this.getForProvider(provider);
    const acc = store.accounts.find((a) => a.id === accountId);
    if (acc) {
      acc.status = 'rate_limited';
      acc.rateLimitedUntil = Date.now() + cooldownSeconds * 1000;
      this.persist();
    }
  }

  public static markReady(provider: ProviderId, accountId: string): void {
    const store = this.getForProvider(provider);
    const acc = store.accounts.find((a) => a.id === accountId);
    if (acc) {
      acc.status = 'ready';
      acc.rateLimitedUntil = undefined;
      this.persist();
    }
  }

  public static markStatus(provider: ProviderId, accountId: string, status: AccountProfile['status']): void {
    const store = this.getForProvider(provider);
    const acc = store.accounts.find((a) => a.id === accountId);
    if (acc) {
      acc.status = status;
      if (status !== 'rate_limited') {
        acc.rateLimitedUntil = undefined;
      }
      this.persist();
    }
  }
}
