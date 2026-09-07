import { session, Session } from 'electron';
import { ProviderId } from '../../shared/types.js';

export interface SyncCookieItem {
  name: string;
  value: string;
  domain?: string;
  hostOnly?: boolean;
  path?: string;
  secure?: boolean;
  httpOnly?: boolean;
  sameSite?: 'unspecified' | 'no_restriction' | 'lax' | 'strict';
  expirationDate?: number;
}

export class PartitionLifecycleManager {
  /**
   * Generates a strict partition key for a provider and optional account ID.
   */
  public static getPartitionKey(provider: ProviderId, accountId?: string): string {
    if (!accountId || accountId === `acc_${provider}_default` || accountId === 'primary') {
      return `persist:transgentic_${provider}`;
    }
    return `persist:transgentic_${provider}_${accountId}`;
  }

  /**
   * Returns an active Electron Session bound strictly to the partition.
   */
  public static getPartitionSession(partitionKey: string): Session {
    return session.fromPartition(partitionKey, { cache: true });
  }

  /**
   * Injects an array of cookies into a designated partition cleanly without duplicate host/domain collisions.
   */
  public static async syncCookiesToPartition(
    partitionKey: string,
    cookies: SyncCookieItem[],
    defaultDomain: string,
    originUrl?: string
  ): Promise<number> {
    if (!session || typeof session.fromPartition !== 'function') {
      return 0;
    }

    const targetSession = this.getPartitionSession(partitionKey);
    let injectedCount = 0;

    // Set each cookie cleanly matching its exact host/domain scope (non-destructive upsert)
    for (const item of cookies) {
      if (!item.name || typeof item.value !== 'string') continue;

      const rawDomain = item.domain || defaultDomain;
      const isDomainCookie = !item.hostOnly && (rawDomain.startsWith('.') || (!item.domain && defaultDomain.startsWith('.')));
      const cleanDomain = rawDomain.replace(/^\./, '');
      const path = item.path || '/';
      const isSecure = item.secure ?? true;
      const isHttpOnly = item.httpOnly ?? false;
      const exp = item.expirationDate || Math.floor(Date.now() / 1000) + 180 * 86400;

      let validSameSite: 'unspecified' | 'no_restriction' | 'lax' | 'strict' = 'unspecified';
      if (item.sameSite === 'no_restriction') validSameSite = 'no_restriction';
      else if (item.sameSite === 'lax') validSameSite = 'lax';
      else if (item.sameSite === 'strict') validSameSite = 'strict';

      const url = `https://${cleanDomain}${path.startsWith('/') ? path : '/' + path}`;

      const cookieDetails: any = {
        url: url,
        name: item.name,
        value: item.value,
        path: path,
        secure: isSecure,
        httpOnly: isHttpOnly,
        sameSite: validSameSite,
        expirationDate: exp,
      };

      if (isDomainCookie) {
        cookieDetails.domain = rawDomain.startsWith('.') ? rawDomain : `.${rawDomain}`;
      }

      try {
        await targetSession.cookies.set(cookieDetails);
        injectedCount++;
      } catch (err) {
        // Fallback with basic options if strict details error out
        try {
          await targetSession.cookies.set({
            url: url,
            name: item.name,
            value: item.value,
            path: path,
            secure: isSecure,
          });
          injectedCount++;
        } catch {}
      }
    }

    // 3. Flush cookie jar to disk
    try {
      await targetSession.cookies.flushStore();
    } catch {}

    return injectedCount;
  }

  /**
   * Completely wipes all storage data, caches, cookies, and local data
   * when an account profile partition is deleted.
   */
  public static async deleteAccountPartition(
    provider: ProviderId,
    accountId: string,
    partitionKey?: string
  ): Promise<void> {
    const effectivePartition = partitionKey || this.getPartitionKey(provider, accountId);
    if (!session || typeof session.fromPartition !== 'function') {
      return;
    }

    try {
      const targetSession = session.fromPartition(effectivePartition);
      await targetSession.clearStorageData({
        storages: [
          'cookies',
          'filesystem',
          'indexdb',
          'localstorage',
          'shadercache',
          'websql',
          'serviceworkers',
          'cachestorage',
        ],
      });
      await targetSession.clearCache();
      await targetSession.clearAuthCache();
      await targetSession.cookies.flushStore();
    } catch (err) {
      console.warn(`[PartitionLifecycle] Notice while clearing partition ${effectivePartition}:`, err);
    }
  }

  /**
   * Utility to purge partition data.
   */
  public static async clearPartitionData(partitionKey: string): Promise<void> {
    if (!session || typeof session.fromPartition !== 'function') {
      return;
    }

    try {
      const targetSession = session.fromPartition(partitionKey);
      await targetSession.clearStorageData();
      await targetSession.clearCache();
      await targetSession.clearAuthCache();
    } catch {}
  }
}
