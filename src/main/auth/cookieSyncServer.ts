import { BrowserWindow } from 'electron';
import { globalSessionManager } from '../webviews/sessionManager.js';
import { AccountRegistryManager } from '../registry/accountRegistry.js';
import { ProviderId } from '../../shared/types.js';
import { bindHostUserAgentToPartition, bindUserAgentToPartition } from '../utils/userAgent.js';
import { PartitionLifecycleManager, SyncCookieItem } from './partitionLifecycle.js';

export { SyncCookieItem };

export interface SyncSessionPayload {
  provider: string;
  targetAccountId?: string;
  newAccountAlias?: string;
  origin?: string;
  domain?: string;
  url?: string;
  cookies?: SyncCookieItem[] | string;
  localStorage?: Record<string, string>;
  sessionStorage?: Record<string, string>;
  userAgent?: string;
}

export class CookieSyncManager {
  private static readonly PROVIDER_DEFAULT_ORIGINS: Partial<Record<ProviderId, string>> = {
    gemini: 'https://gemini.google.com',
    chatgpt: 'https://chatgpt.com',
    claude: 'https://claude.ai',
    grok: 'https://grok.com',
  };

  private static readonly PROVIDER_DEFAULT_DOMAINS: Partial<Record<ProviderId, string>> = {
    gemini: '.google.com',
    chatgpt: '.chatgpt.com',
    claude: '.claude.ai',
    grok: '.grok.com',
  };

  private static readonly PROVIDER_PRIMARY_AUTH_COOKIE: Partial<Record<ProviderId, string>> = {
    gemini: '__Secure-1PSID',
    chatgpt: '__Secure-next-auth.session-token',
    claude: 'sessionKey',
    grok: 'auth_token',
  };

  /**
   * Normalizes provider ID from client string / URL origin.
   */
  public static normalizeProviderId(raw: string): ProviderId {
    const lower = (raw || '').toLowerCase().trim();
    if (lower.includes('gemini') || lower.includes('google')) {
      return 'gemini';
    }
    if (lower.includes('claude') || lower.includes('anthropic')) {
      return 'claude';
    }
    if (lower.includes('chatgpt') || lower.includes('openai')) {
      return 'chatgpt';
    }
    if (lower.includes('grok') || lower.includes('xai') || lower.includes('x.ai') || lower.includes('x.com')) {
      return 'grok';
    }
    return lower as ProviderId;
  }

  /**
   * Parses flexible raw cookie string, cURL header, DevTools table or JSON into structured items.
   */
  public static parseRawCookies(raw: string | SyncCookieItem[], defaultDomain: string, providerId?: ProviderId): SyncCookieItem[] {
    if (Array.isArray(raw)) return raw;
    if (typeof raw !== 'string') return [];

    let input = raw.trim();

    // 1. JSON parsing check
    if ((input.startsWith('{') && input.endsWith('}')) || (input.startsWith('[') && input.endsWith(']'))) {
      try {
        const parsed = JSON.parse(input);
        if (Array.isArray(parsed)) {
          return parsed as SyncCookieItem[];
        }
        if (parsed.cookies) {
          return this.parseRawCookies(parsed.cookies, defaultDomain, providerId);
        }
      } catch {}
    }

    // 2. cURL or Header check (e.g. -H 'cookie: ...' or 'Cookie: ...')
    const cookieHeaderMatch = input.match(/(?:cookie:\s*|'cookie:\s*|\"cookie:\s*)([^'\"\r\n]+)/i);
    if (cookieHeaderMatch && cookieHeaderMatch[1]) {
      input = cookieHeaderMatch[1].trim();
    }

    // 3. Tab-separated DevTools Application Cookies table (Name \t Value \t Domain \t Path ...)
    if (input.includes('\t')) {
      const lines = input.split(/\r?\n/);
      const items: SyncCookieItem[] = [];
      for (const line of lines) {
        const parts = line.split('\t').map(p => p.trim());
        if (parts.length >= 2 && parts[0] && parts[1]) {
          const name = parts[0];
          if (name.toLowerCase() === 'name' || name.toLowerCase() === 'cookie name') continue; // Header row
          const value = parts[1];
          const domain = parts[2] || defaultDomain;
          const path = parts[3] || '/';
          const isHttpOnly = parts[6] === '✓' || parts[6] === 'true' || name.startsWith('__Secure') || name.includes('token') || name.includes('auth');
          const isSecure = parts[7] === '✓' || parts[7] === 'true' || true;
          const sameSiteRaw = (parts[8] || '').toLowerCase();
          const sameSite = sameSiteRaw.includes('strict') ? 'strict' : sameSiteRaw.includes('none') ? 'no_restriction' : 'lax';

          items.push({
            name,
            value,
            domain: domain.startsWith('.') ? domain : `.${domain}`,
            path,
            secure: isSecure,
            httpOnly: isHttpOnly,
            sameSite,
          });
        }
      }
      if (items.length > 0) return items;
    }

    // 4. Raw single token paste (e.g. user pasted only the JWT session token string)
    if (!input.includes('=') && input.length > 25 && providerId) {
      const primaryCookieName = this.PROVIDER_PRIMARY_AUTH_COOKIE[providerId] || '__Secure-next-auth.session-token';
      return [
        {
          name: primaryCookieName,
          value: input,
          domain: defaultDomain,
          path: '/',
          secure: true,
          httpOnly: true,
          sameSite: 'lax',
        },
      ];
    }

    // 5. Standard Semicolon-separated key=value string
    const items: SyncCookieItem[] = [];
    const pairs = input.split(';');
    for (const pair of pairs) {
      const idx = pair.indexOf('=');
      if (idx === -1) continue;
      const name = pair.substring(0, idx).trim();
      const value = pair.substring(idx + 1).trim();
      if (!name) continue;
      items.push({
        name,
        value,
        domain: defaultDomain,
        path: '/',
        secure: true,
        httpOnly: name.startsWith('__Secure') || name.includes('token') || name.includes('auth'),
        sameSite: 'lax',
      });
    }

    return items;
  }

  /**
   * Synchronizes cookies and session storage into the provider's persistent partition.
   */
  public static async syncSession(payload: SyncSessionPayload): Promise<{ success: boolean; message: string; provider: ProviderId }> {
    if (!payload || !payload.provider) {
      throw new Error('Missing required "provider" field in session sync payload.');
    }

    let providerId = this.normalizeProviderId(payload.provider);

    const { ServiceManifestManager } = await import('../registry/serviceManifest.js');
    const { ModelRegistryManager } = await import('../registry/modelRegistry.js');
    const { globalRecipeManager } = await import('../registry/recipeManager.js');

    // Match provider ID whether passed with or without custom_ prefix
    const currentManifest = ServiceManifestManager.getManifest();
    if (!currentManifest.services[providerId]) {
      if (currentManifest.services[`custom_${providerId}`]) {
        providerId = `custom_${providerId}` as ProviderId;
      } else if (providerId.startsWith('custom_') && currentManifest.services[providerId.replace(/^custom_/, '') as ProviderId]) {
        providerId = providerId.replace(/^custom_/, '') as ProviderId;
      }
    }

    if (providerId.startsWith('webview_') || providerId.startsWith('custom_') || providerId.startsWith('recipe_')) {
      if (providerId.startsWith('webview_') && !ServiceManifestManager.getManifest().services[providerId]) {
        ServiceManifestManager.installPreconfig(providerId);
      }
      ServiceManifestManager.setServiceEnabled(providerId, true);
      // Dynamically populate/update url and name in manifest from sync payload
      const manifest = ServiceManifestManager.getManifest();
      const entry = manifest.services[providerId];
      if (entry) {
        const updates: Record<string, any> = { enabled: true };
        if (payload.domain && (!entry.name || entry.name.toLowerCase().includes('experimental'))) {
          updates.name = payload.domain;
        }
        if (payload.url && (!entry.url || entry.url !== payload.url)) {
          updates.url = payload.url;
        } else if (payload.origin && !entry.url) {
          updates.url = payload.origin;
        }
        ServiceManifestManager.updateServiceEntry(providerId, updates);
      }
      try {
        ModelRegistryManager.updateProviderConfig(providerId, { serviceEnabled: true });
      } catch {}
    }

    // Ensure session manager has an adapter registered for this provider
    let adapter = globalSessionManager.getAdapter(providerId);
    if (!adapter) {
      const recipe = globalRecipeManager.getRecipe(providerId);
      if (recipe) {
        const { CustomRecipeAdapter } = await import('../webviews/customRecipeAdapter.js');
        adapter = new CustomRecipeAdapter(recipe);
        globalSessionManager.registerAdapter(adapter);
      }
    }

    const activeAcc = AccountRegistryManager.getActiveAccount(providerId);
    let targetAcc = payload.targetAccountId
      ? AccountRegistryManager.getForProvider(providerId).accounts.find((a) => a.id === payload.targetAccountId)
      : undefined;

    if (!targetAcc && payload.newAccountAlias) {
      targetAcc = AccountRegistryManager.addAccount(providerId, payload.newAccountAlias.trim());
      globalSessionManager.configureSession(targetAcc.partitionKey);
    } else if (!targetAcc) {
      targetAcc = activeAcc;
    }

    const manifestService = ServiceManifestManager.getManifest().services[providerId];
    const partitionKey = targetAcc?.partitionKey || adapter?.partition || manifestService?.partition || PartitionLifecycleManager.getPartitionKey(providerId, payload.targetAccountId);
    let fallbackOrigin = '';
    let fallbackDomain = '';
    if (manifestService?.url) {
      try {
        const u = new URL(manifestService.url);
        fallbackOrigin = u.origin;
        fallbackDomain = u.hostname;
      } catch {}
    }

    const defaultOrigin = this.PROVIDER_DEFAULT_ORIGINS[providerId] || payload.origin || fallbackOrigin || '';
    const defaultDomain = this.PROVIDER_DEFAULT_DOMAINS[providerId] || (payload.origin ? new URL(payload.origin).hostname : fallbackDomain) || '';
    const originUrl = payload.origin || defaultOrigin;

    // 1. Ensure synced Chrome User-Agent (or host Chrome fallback) is bound to target partition
    if (payload.userAgent) {
      await bindUserAgentToPartition(partitionKey, payload.userAgent);
    } else {
      await bindHostUserAgentToPartition(partitionKey);
    }

    // 2. Process & Set Cookies into isolated partition via PartitionLifecycleManager
    const cookieList = this.parseRawCookies(payload.cookies || '', defaultDomain, providerId);
    const injectedCount = await PartitionLifecycleManager.syncCookiesToPartition(
      partitionKey,
      cookieList,
      defaultDomain,
      originUrl
    );

    // 3. Inject LocalStorage & SessionStorage if webContents available
    adapter = adapter || globalSessionManager.getAdapter(providerId);
    const webContents = adapter?.getWebContents();

    if (webContents && !webContents.isDestroyed()) {
      if (payload.localStorage && Object.keys(payload.localStorage).length > 0) {
        const lsScript = `
          (function() {
            try {
              const entries = ${JSON.stringify(payload.localStorage)};
              for (const [k, v] of Object.entries(entries)) {
                localStorage.setItem(k, v);
              }
            } catch(e) {}
          })()
        `;
        webContents.executeJavaScript(lsScript, true).catch(() => {});
      }

      if (payload.sessionStorage && Object.keys(payload.sessionStorage).length > 0) {
        const ssScript = `
          (function() {
            try {
              const entries = ${JSON.stringify(payload.sessionStorage)};
              for (const [k, v] of Object.entries(entries)) {
                sessionStorage.setItem(k, v);
              }
            } catch(e) {}
          })()
        `;
        webContents.executeJavaScript(ssScript, true).catch(() => {});
      }

      // Reload webContents with clean authenticated state
      if (adapter && adapter.url) {
        webContents.loadURL(adapter.url).catch(() => {
          webContents.reload();
        });
      } else {
        webContents.reload();
      }
    } else {
      const openWebContents = globalSessionManager.getWebContents(providerId);
      if (openWebContents && !openWebContents.isDestroyed()) {
        openWebContents.reload();
      }
    }

    // 5. Trigger Provider Status Refresh & mark account ready
    if (activeAcc) {
      AccountRegistryManager.markStatus(providerId, activeAcc.id, 'ready');
    }
    await globalSessionManager.refreshProviderStatus(providerId);

    // 6. Broadcast IPC Event to all windows
    BrowserWindow.getAllWindows().forEach((win) => {
      if (!win.isDestroyed()) {
        win.webContents.send('auth:session-synced', {
          provider: providerId,
          cookiesCount: injectedCount,
          timestamp: Date.now(),
          success: true,
        });
        win.webContents.send('provider-status-updated', globalSessionManager.getAllStatuses());
        win.webContents.send('services-manifest-updated', ServiceManifestManager.getManifest());
        win.webContents.send('models-updated', ModelRegistryManager.getRegistry());
      }
    });

    return {
      success: true,
      message: `Successfully synchronized ${injectedCount} session cookies for ${providerId}.`,
      provider: providerId,
    };
  }
}
