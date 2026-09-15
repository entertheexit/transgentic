import { isCliProvider } from '../../shared/cli.js';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { app, session, Session, WebContents, BrowserWindow } from 'electron';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
import { BaseProviderAdapter } from './adapterBase.js';
import { CustomRecipeAdapter } from './customRecipeAdapter.js';
import { BUILTIN_RECIPES } from '../../shared/types/recipe.js';
import { ProviderId, ProviderStatus, ProviderStatusState, TemporaryChatSessionInfo } from '../../shared/types.js';
import { SessionProfileManager } from '../security/antiDetection.js';
import { globalRateLimiter } from '../mcp/rateLimiter.js';
import { ModelRegistryManager } from '../registry/modelRegistry.js';
import { ModelScraperEngine } from '../registry/modelScrapers.js';
import { AccountRegistryManager } from '../registry/accountRegistry.js';
import { ServiceManifestManager } from '../registry/serviceManifest.js';
import { globalThreadManager } from '../registry/threadManager.js';

function getStealthPreloadPath(): string | undefined {
  try {
    const candidates = [
      path.join(__dirname, '../preload/stealthPreload.cjs'),
      path.join(app.getAppPath(), 'dist-electron/main/preload/stealthPreload.cjs'),
      path.join(process.cwd(), 'dist-electron/main/preload/stealthPreload.cjs'),
    ];
    for (const p of candidates) {
      if (fs.existsSync(p)) return p;
    }
  } catch {}
  return undefined;
}

interface TemporaryConversationEntry extends TemporaryChatSessionInfo {
  window: BrowserWindow;
  adapter: CustomRecipeAdapter;
}
interface NormalConversationEntry extends TemporaryConversationEntry { mode: 'normal'; }

export interface TemporaryConversationHandle {
  info: TemporaryChatSessionInfo;
  adapter: CustomRecipeAdapter;
  webContents: WebContents;
}

export class SessionManager {
  private adapters: Map<ProviderId, BaseProviderAdapter> = new Map();
  public sessions: Map<ProviderId, Session> = new Map();
  private partitionSessions: Map<string, Session> = new Map();
  private statuses: Map<ProviderId, ProviderStatus> = new Map();
  private openWindows: Map<string, BrowserWindow> = new Map();
  private backgroundWindows: Map<string, BrowserWindow> = new Map();
  private temporaryConversations = new Map<string, TemporaryConversationEntry>();
  private normalConversations = new Map<string, NormalConversationEntry>();
  private temporaryGeneration = 0;
  private static readonly MAX_TEMPORARY_CONVERSATIONS = 8;
  private static readonly TEMPORARY_TTL_MS = 24 * 60 * 60 * 1000;
  private statusListeners: Array<(statuses: Record<ProviderId, ProviderStatus>) => void> = [];
  private temporaryConversationListeners: Array<(sessions: TemporaryChatSessionInfo[]) => void> = [];
  private temporaryConversationEndedListeners: Array<(session: TemporaryChatSessionInfo) => void> = [];
  private healthCheckInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.registerAdapter(new CustomRecipeAdapter(BUILTIN_RECIPES.chatgpt));
    this.registerAdapter(new CustomRecipeAdapter(BUILTIN_RECIPES.claude));
    this.registerAdapter(new CustomRecipeAdapter(BUILTIN_RECIPES.gemini));
    this.registerAdapter(new CustomRecipeAdapter(BUILTIN_RECIPES.grok));
  }

  public registerAdapter(adapter: BaseProviderAdapter): void {
    const id = adapter.providerId;
    const previous = this.adapters.get(id);
    if (
      previous instanceof CustomRecipeAdapter &&
      adapter instanceof CustomRecipeAdapter &&
      previous.recipe.version !== adapter.recipe.version
    ) {
    this.endTemporaryConversations(id);
    this.endNormalConversations(id);
    }
    this.adapters.set(id, adapter);
    this.statuses.set(id, {
      id,
      name: adapter.name,
      url: adapter.url,
      partition: adapter.partition,
      state: 'disconnected',
      rateLimitCount: 0,
      isAuthenticated: false,
    });
  }

  public unregisterAdapter(providerId: ProviderId): void {
    this.endTemporaryConversations(providerId);
    this.endNormalConversations(providerId);
    this.adapters.delete(providerId);
    this.statuses.delete(providerId);
    this.sessions.delete(providerId);
  }

  /**
   * Configures a Chromium session with normalized UA and standard header handling.
   */
  public configureSession(partitionKey: string): Session {
    if (this.partitionSessions.has(partitionKey)) {
      return this.partitionSessions.get(partitionKey)!;
    }

    if (!session || typeof session.fromPartition !== 'function') {
      return null as any;
    }

    const normalizedUA = SessionProfileManager.getNormalizedUserAgent();
    const sess = session.fromPartition(partitionKey, { cache: true });
    sess.setUserAgent(normalizedUA);

    // Normalize request headers to match standard top-level browser navigation
    sess.webRequest.onBeforeSendHeaders((details, callback) => {
      const activeUA = sess.getUserAgent() || normalizedUA;
      let requestHeaders = SessionProfileManager.sanitizeHeaders({ ...details.requestHeaders }, activeUA) as Record<string, string>;
      requestHeaders['User-Agent'] = activeUA;
      requestHeaders['Sec-Fetch-Dest'] = details.requestHeaders['Sec-Fetch-Dest'] || 'document';
      requestHeaders['Sec-Fetch-Mode'] = details.requestHeaders['Sec-Fetch-Mode'] || 'navigate';
      requestHeaders['Sec-Fetch-Site'] = details.requestHeaders['Sec-Fetch-Site'] || 'none';
      requestHeaders['Sec-Fetch-User'] = details.requestHeaders['Sec-Fetch-User'] || '?1';

      callback({ cancel: false, requestHeaders });
    });

    // Strip headers that prevent embedding in webviews
    sess.webRequest.onHeadersReceived((details, callback) => {
      const responseHeaders = { ...details.responseHeaders };
      for (const key of Object.keys(responseHeaders)) {
        const lower = key.toLowerCase();
        if (
          lower === 'x-frame-options' ||
          lower === 'content-security-policy' ||
          lower === 'content-security-policy-report-only'
        ) {
          delete responseHeaders[key];
        }
      }
      callback({ cancel: false, responseHeaders });
    });

    this.partitionSessions.set(partitionKey, sess);
    return sess;
  }

  /**
   * Initializes persistent sessions, applies profile configurations,
   * performs startup auth discovery, and starts the periodic health check.
   */
  public initializeSessions(): void {
    AccountRegistryManager.initialize();
    const allAccounts = AccountRegistryManager.getAll();

    for (const [id, adapter] of this.adapters.entries()) {
      const store = allAccounts[id];
      if (store && store.accounts) {
        for (const acc of store.accounts) {
          const sess = this.configureSession(acc.partitionKey);
          if (acc.id === store.activeAccountId) {
            this.sessions.set(id, sess);
          }
        }
      } else {
        const sess = this.configureSession(adapter.partition);
        this.sessions.set(id, sess);
      }
    }

    // Run immediate startup authentication discovery
    this.refreshAllStatuses();

    // Start periodic background session health check (every 8 seconds)
    this.startPeriodicHealthCheck(8000);
  }

  /**
   * Starts recurring background health checks to detect logouts, token revocations, or new logins.
   */
  public startPeriodicHealthCheck(intervalMs: number = 8000): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }

    this.healthCheckInterval = setInterval(() => {
      this.refreshAllStatuses().catch(() => {});
      this.cleanupTemporaryConversations();
      this.cleanupNormalConversations();
    }, intervalMs);
  }

  /**
   * Refreshes authentication & connection state for all registered providers in parallel.
   */
  public async refreshAllStatuses(): Promise<Record<ProviderId, ProviderStatus>> {
    const ids = Array.from(this.adapters.keys());
    await Promise.all(ids.map((id) => this.refreshProviderStatus(id).catch(() => null)));
    return this.getAllStatuses();
  }

  /**
   * Ensures an active WebContents exists in the background for prompt execution
   * even when the user is not actively viewing the drawer.
   */
  public async ensureWebContents(id: ProviderId, targetPartition?: string): Promise<WebContents> {
    if (isCliProvider(id)) throw new Error('CLI services do not use browser sessions.');
    const adapter = this.adapters.get(id);
    if (!adapter) throw new Error(`Unknown provider ${id}`);

    const activeAcc = AccountRegistryManager.getActiveAccount(id);
    const effectivePartition = targetPartition || activeAcc?.partitionKey || adapter.partition;
    adapter.setCustomPartition(effectivePartition);

    // If adapter already has an active, non-destroyed webContents with matching partition, return it
    const existing = adapter.getWebContents();
    if (existing && !existing.isDestroyed()) {
      return existing;
    }

    // Check if background window exists for this partition
    const bgKey = `${id}:${effectivePartition}`;
    let bgWin = this.backgroundWindows.get(bgKey);
    if (bgWin && !bgWin.isDestroyed()) {
      adapter.setWebContents(bgWin.webContents);
      return bgWin.webContents;
    }

    this.configureSession(effectivePartition);

    const preloadScript = getStealthPreloadPath();
    const normalizedUA = SessionProfileManager.getNormalizedUserAgent();
    bgWin = new BrowserWindow({
      width: 1024,
      height: 768,
      show: false, // hidden in background
      webPreferences: {
        partition: effectivePartition,
        nodeIntegration: false,
        contextIsolation: true,
        preload: preloadScript,
      },
    });

    bgWin.webContents.setUserAgent(normalizedUA);

    bgWin.webContents.on('dom-ready', () => {
      bgWin?.webContents.executeJavaScript(SessionProfileManager.getPreloadCompatibilityScript(), true).catch(() => {});
    });

    if (adapter.url) {
      bgWin.loadURL(adapter.url);
    }
    this.backgroundWindows.set(bgKey, bgWin);
    adapter.setWebContents(bgWin.webContents);

    // Wait for did-finish-load or up to 6 seconds
    if (adapter.url) {
      await new Promise<void>((resolve) => {
        let resolved = false;
        const done = () => {
          if (!resolved) {
            resolved = true;
            resolve();
          }
        };

        bgWin!.webContents.once('did-finish-load', done);
        setTimeout(done, 6000);
      });
    }

    this.refreshProviderStatus(id);
    return bgWin.webContents;
  }

  /**
   * Opens a dedicated native BrowserWindow for the provider.
   * Allows interactive login and direct session setup.
   */
  public openProviderWindow(id: ProviderId, partitionKey?: string): BrowserWindow {
    const adapter = this.adapters.get(id);
    if (!adapter) throw new Error(`Unknown provider ${id}`);

    const activeAcc = AccountRegistryManager.getActiveAccount(id);
    const effectivePartition = partitionKey || activeAcc?.partitionKey || adapter.partition;
    const winKey = `${id}:${effectivePartition}`;

    const existing = this.openWindows.get(winKey);
    if (existing && !existing.isDestroyed()) {
      existing.show();
      existing.focus();
      return existing;
    }

    this.configureSession(effectivePartition);

    const allAccs = AccountRegistryManager.getAll()[id]?.accounts || [];
    const currentAcc = allAccs.find((a) => a.partitionKey === effectivePartition);
    const accountLabel = currentAcc ? ` [${currentAcc.alias}]` : '';

    const preloadScript = getStealthPreloadPath();
    const normalizedUA = SessionProfileManager.getNormalizedUserAgent();
    const win = new BrowserWindow({
      width: 1100,
      height: 800,
      show: true,
      title: `Transgentic - ${adapter.name}${accountLabel}`,
      alwaysOnTop: true,
      webPreferences: {
        partition: effectivePartition,
        nodeIntegration: false,
        contextIsolation: true,
        preload: preloadScript,
      },
    });

    win.setAlwaysOnTop(true, 'floating');
    win.show();
    win.focus();
    win.moveTop();

    win.on('focus', () => {
      win.moveTop();
    });

    win.webContents.setUserAgent(normalizedUA);

    win.webContents.on('dom-ready', () => {
      win.webContents.executeJavaScript(SessionProfileManager.getPreloadCompatibilityScript(), true).catch(() => {});
    });

    win.loadURL(adapter.url);

    this.registerWebContents(id, win.webContents);

    const pollInterval = setInterval(() => {
      if (win.isDestroyed()) {
        clearInterval(pollInterval);
      } else {
        this.refreshProviderStatus(id);
      }
    }, 2000);

    win.on('closed', () => {
      clearInterval(pollInterval);
      this.openWindows.delete(winKey);
      this.refreshProviderStatus(id);
    });

    win.webContents.on('did-finish-load', () => {
      this.refreshProviderStatus(id);
    });

    this.openWindows.set(winKey, win);
    return win;
  }

  /**
   * Opens the provider URL in the user's default OS browser (e.g. Google Chrome).
   */
  public async openExternalInSystemChrome(id: ProviderId): Promise<void> {
    const adapter = this.adapters.get(id);
    if (adapter) {
      const { shell } = await import('electron');
      await shell.openExternal(adapter.url);
    }
  }

  public registerWebContents(id: ProviderId, webContents: WebContents): void {
    const adapter = this.adapters.get(id);
    if (adapter) {
      adapter.setWebContents(webContents);
      this.refreshProviderStatus(id);

      try {
        import('../healing/healingManager.js').then(({ globalHealingManager }) => {
          if (globalHealingManager.getConfig().checkOnPageLoad) {
            globalHealingManager.auditProvider(id, webContents).catch(() => {});
          }
        }).catch(() => {});
      } catch {}
    }
  }

  public getAdapter(id: ProviderId): BaseProviderAdapter | undefined {
    return this.adapters.get(id);
  }

  public getWebContents(id: ProviderId): WebContents | null {
    return this.adapters.get(id)?.getWebContents() || null;
  }

  public getProviderFromUrl(url: string): ProviderId | null {
    if (!url) return null;
    const lower = url.toLowerCase();
    if (lower.includes('chatgpt.com') || lower.includes('openai.com')) return 'chatgpt';
    if (lower.includes('claude.ai') || lower.includes('anthropic.com')) return 'claude';
    if (lower.includes('gemini.google.com')) return 'gemini';
    if (lower.includes('grok.com') || lower.includes('x.ai')) return 'grok';

    try {
      const hostname = new URL(url).hostname;
      const hash = crypto.createHash('sha256').update(hostname).digest('hex');
      const hashId = `webview_${hash}` as ProviderId;
      if (this.adapters.has(hashId)) return hashId;

      for (const [id, adapter] of this.adapters.entries()) {
        if ((id.startsWith('webview_') || id.startsWith('custom_')) && adapter) {
          try {
            if (adapter.url && new URL(adapter.url).hostname === hostname) return id as ProviderId;
            const recipeDomain = (adapter as CustomRecipeAdapter)?.recipe?.domainMatch;
            if (recipeDomain && (hostname === recipeDomain || hostname.endsWith('.' + recipeDomain))) {
              return id as ProviderId;
            }
          } catch {}
        }
      }
    } catch {}

    return null;
  }

  public getAdapters(): BaseProviderAdapter[] {
    return Array.from(this.adapters.values());
  }

  public getAllStatuses(): Record<ProviderId, ProviderStatus> {
    const result: Record<string, ProviderStatus> = {};
    const manifestServices = ServiceManifestManager.getManifest().services;
    for (const [id, status] of this.statuses.entries()) {
      const activeAcc = AccountRegistryManager.getActiveAccount(id);
      const isRateLimited = globalRateLimiter.isRateLimited(id) || activeAcc?.status === 'rate_limited';
      const remaining = globalRateLimiter.getCooldownRemaining(id);
      const rateMetrics = globalRateLimiter.getStatus(id);
      const adapter = this.adapters.get(id);
      const manifestService = manifestServices[id];
      const dynamicName = adapter?.name || manifestService?.name || status.name;
      const dynamicUrl = adapter?.url || manifestService?.url || status.url;

      result[id] = {
        ...status,
        name: dynamicName,
        url: dynamicUrl,
        partition: activeAcc?.partitionKey || status.partition,
        state: isRateLimited ? 'rate_limited' : status.state,
        rateLimitedUntil: isRateLimited ? (activeAcc?.rateLimitedUntil || (Date.now() + remaining * 1000)) : undefined,
        rateLimitCount: rateMetrics.rateLimitCount,
        temporaryChat: {
          supported: adapter instanceof CustomRecipeAdapter && adapter.supportsTemporaryChat(),
          availability: adapter instanceof CustomRecipeAdapter && adapter.supportsTemporaryChat()
            ? (status.temporaryChat?.availability || 'unknown')
            : 'unavailable',
          ...(status.temporaryChat?.reason ? { reason: status.temporaryChat.reason } : {}),
        },
      };
    }
    return result as Record<ProviderId, ProviderStatus>;
  }

  public async refreshProviderStatus(id: ProviderId): Promise<ProviderStatus> {
    const adapter = this.adapters.get(id);
    let current = this.statuses.get(id);
    const manifestService = ServiceManifestManager.getManifest().services[id];
    if (!current) {
      current = {
        id,
        name: adapter?.name || manifestService?.name || id,
        url: adapter?.url || manifestService?.url || '',
        partition: adapter?.partition || manifestService?.partition || `persist:transgentic_${id}`,
        state: 'disconnected',
        rateLimitCount: 0,
        isAuthenticated: false,
      };
      this.statuses.set(id, current);
    }
    if (adapter) {
      if (adapter.name) current.name = adapter.name;
      if (adapter.url) current.url = adapter.url;
    }
    if (manifestService) {
      if (manifestService.name && !manifestService.name.toLowerCase().includes('experimental')) {
        current.name = manifestService.name;
      }
      if (manifestService.url) {
        current.url = manifestService.url;
      }
    }
    const activeAcc = AccountRegistryManager.getActiveAccount(id);
    const effectivePartition = activeAcc?.partitionKey || adapter?.partition || manifestService?.partition || current.partition;
    const sess = this.configureSession(effectivePartition);
    const previousAuth = current.isAuthenticated;

    try {
      let hasAuthCookies = false;
      if (sess) {
        const nowSec = Date.now() / 1000;
        const cookies = await sess.cookies.get({});
        if (id === 'chatgpt') {
          hasAuthCookies = cookies.some((c) => {
            const isNotExpired = !c.expirationDate || c.expirationDate > nowSec;
            if (!isNotExpired) return false;
            const isDomain = Boolean(c.domain && (c.domain.includes('chatgpt.com') || c.domain.includes('openai.com')));
            if (!isDomain) return false;
            return (
              (
                c.name === '__Secure-next-auth.session-token' ||
                c.name.startsWith('__Secure-next-auth.session-token.') ||
                c.name === '__Host-next-auth.session-token'
              ) &&
              typeof c.value === 'string' &&
              c.value.length > 40
            );
          });
        } else if (id === 'claude') {
          hasAuthCookies = cookies.some((c) => {
            const isNotExpired = !c.expirationDate || c.expirationDate > nowSec;
            if (!isNotExpired) return false;
            const isDomain = Boolean(c.domain && c.domain.includes('claude.ai'));
            if (!isDomain) return false;
            return (
              c.name === 'sessionKey' &&
              typeof c.value === 'string' &&
              c.value.startsWith('sk-ant-sid') &&
              c.value.length > 20
            );
          });
        } else if (id === 'gemini') {
          const hasPsidTs = cookies.some((c) => {
            const isNotExpired = !c.expirationDate || c.expirationDate > nowSec;
            if (!isNotExpired) return false;
            const isDomain = Boolean(c.domain && c.domain.includes('google.com'));
            if (!isDomain) return false;
            return (
              (c.name === '__Secure-1PSIDTS' || c.name === '__Secure-3PSIDTS') &&
              typeof c.value === 'string' &&
              c.value.length > 20 &&
              c.value !== 'deleted' &&
              c.value !== 'null'
            );
          });

          const hasPsid = cookies.some((c) => {
            const isNotExpired = !c.expirationDate || c.expirationDate > nowSec;
            if (!isNotExpired) return false;
            const isDomain = Boolean(c.domain && c.domain.includes('google.com'));
            if (!isDomain) return false;
            return (
              (c.name === '__Secure-1PSID' || c.name === '__Secure-3PSID') &&
              typeof c.value === 'string' &&
              c.value.length > 30 &&
              c.value !== 'deleted' &&
              c.value !== 'null'
            );
          });

          hasAuthCookies = hasPsidTs && hasPsid;
        } else if (id === 'grok') {
          hasAuthCookies = cookies.some((c) => {
            const isNotExpired = !c.expirationDate || c.expirationDate > nowSec;
            if (!isNotExpired) return false;
            // Grok cookies MUST belong to grok.com or x.ai, NEVER x.com or twitter.com
            const isGrokDomain = Boolean(c.domain && (c.domain.includes('grok.com') || c.domain.includes('x.ai')));
            if (!isGrokDomain) return false;
            return (
              (
                c.name === 'sso' ||
                c.name === 'sso-rw' ||
                c.name === '__Secure-next-auth.session-token' ||
                c.name === 'xai-session'
              ) &&
              typeof c.value === 'string' &&
              c.value.length >= 30 &&
              c.value !== 'deleted' &&
              c.value !== 'null'
            );
          });
        } else if (id.startsWith('webview_') || id.startsWith('custom_') || manifestService?.providerType === 'webview') {
          // Check custom recipe auth rules if available
          const recipeAuth = (adapter as CustomRecipeAdapter)?.recipe?.auth;
          if (recipeAuth?.authCookies && recipeAuth.authCookies.length > 0) {
            const validAuthCookies = cookies.filter((c: any) => {
              const isNotExpired = !c.expirationDate || c.expirationDate > nowSec;
              if (!isNotExpired) return false;

              if (recipeAuth.cookieDomains && recipeAuth.cookieDomains.length > 0) {
                const matchesDomain = recipeAuth.cookieDomains.some((d) => c.domain && c.domain.includes(d));
                if (!matchesDomain) return false;
              }

              if (recipeAuth.excludeCookieDomains && recipeAuth.excludeCookieDomains.length > 0) {
                const isExcluded = recipeAuth.excludeCookieDomains.some((d) => c.domain && c.domain.includes(d));
                if (isExcluded) return false;
              }

              const minLen = recipeAuth.minCookieLength ?? 10;
              const val = typeof c.value === 'string' ? c.value : '';
              return val.length >= minLen && val !== 'deleted' && val !== 'null';
            });

            if (recipeAuth.requireAllCookies) {
              const matchedNames = new Set(validAuthCookies.map((c: any) => c.name));
              hasAuthCookies = recipeAuth.authCookies.every((name) => matchedNames.has(name));
            } else {
              hasAuthCookies = validAuthCookies.some((c: any) =>
                recipeAuth.authCookies!.some((target) => c.name === target || c.name.startsWith(target + '.'))
              );
            }
          }

          if (!hasAuthCookies) {
            hasAuthCookies = cookies.some((c) => {
              const isNotExpired = !c.expirationDate || c.expirationDate > nowSec;
              if (!isNotExpired) return false;
              const isAuthName = (
                c.name.toLowerCase().includes('session') ||
                c.name.toLowerCase().includes('token') ||
                c.name.toLowerCase().includes('auth') ||
                c.name.toLowerCase().includes('sid') ||
                c.name.toLowerCase().includes('user') ||
                c.name.toLowerCase().includes('jwt') ||
                c.name.toLowerCase().includes('login') ||
                c.name.toLowerCase().includes('sso') ||
                c.name === 'last_session_data'
              );
              return (
                (isAuthName && typeof c.value === 'string' && c.value.length > 5) ||
                (typeof c.value === 'string' && c.value.length >= 20)
              );
            });
            if (!hasAuthCookies && cookies.length >= 2) {
              hasAuthCookies = true;
            }
          }
        }
      }

      let isDomAuth: boolean | null = null;
      let isRateLimited = false;
      const webContents = adapter?.getWebContents();

      if (webContents && !webContents.isDestroyed()) {
        try {
          isDomAuth = await adapter!.checkAuthStatus();
          const rateStatus = await adapter!.checkRateLimit();
          isRateLimited = rateStatus.isRateLimited;
          if (adapter instanceof CustomRecipeAdapter && adapter.supportsTemporaryChat()) {
            const availability = await adapter.inspectTemporaryChatAvailability();
            current.temporaryChat = {
              supported: true,
              availability: availability.availability,
              ...(availability.reason ? { reason: availability.reason } : {}),
            };
          }
        } catch {
          isDomAuth = null;
        }
      }

      // If active DOM is loaded, DOM auth is the source of truth (detects explicit logouts immediately).
      // Otherwise, partition cookies indicate valid stored session.
      let isAuth = false;
      if (isDomAuth !== null) {
        isAuth = isDomAuth;
        if (isDomAuth === false) {
          // If live DOM reports false (e.g. login screen or intermediate redirect)
          // but partition contains valid session cookies, retain authenticated state
          if (hasAuthCookies) {
            isAuth = true;
          } else if (activeAcc) {
            AccountRegistryManager.markStatus(id, activeAcc.id, 'unauthenticated');
          }
        }
      } else {
        // When drawer is closed, partition cookies indicate valid stored session.
        isAuth = hasAuthCookies;
      }

      current.isAuthenticated = isAuth;

      if (isRateLimited || globalRateLimiter.isRateLimited(id)) {
        current.state = 'rate_limited';
        if (activeAcc) {
          AccountRegistryManager.markStatus(id, activeAcc.id, 'rate_limited');
        }
      } else if (isAuth) {
        current.state = 'ready';
        current.lastActive = Date.now();
        if (activeAcc && activeAcc.status !== 'ready') {
          AccountRegistryManager.markStatus(id, activeAcc.id, 'ready');
        }

        // If newly authenticated, trigger model discovery in background
        if (!previousAuth && webContents && !webContents.isDestroyed()) {
          ModelScraperEngine.discoverModels(id, webContents).then((models) => {
            if (models && models.length > 0) {
              ModelRegistryManager.mergeDiscoveredModels(id, models);
            }
          }).catch(() => {});
        }
      } else {
        current.state = 'disconnected';
        if (activeAcc && activeAcc.status !== 'unauthenticated') {
          AccountRegistryManager.markStatus(id, activeAcc.id, 'unauthenticated');
        }
        if (previousAuth && activeAcc) this.endTemporaryConversations(id, activeAcc.id);
      }
    } catch {
      current.state = 'disconnected';
      current.isAuthenticated = false;
    }

    this.notifyStatusChange();
    return current;
  }

  public getStatus(id: ProviderId): ProviderStatus | undefined {
    return this.statuses.get(id);
  }

  public updateProviderState(id: ProviderId, state: ProviderStatusState): void {
    const current = this.statuses.get(id);
    if (current) {
      current.state = state;
      if (state === 'ready') current.lastActive = Date.now();
      this.notifyStatusChange();
    }
  }
  public markTemporaryUnavailable(id: ProviderId, reason: string): void {
    const current = this.statuses.get(id);
    if (!current) return;
    current.temporaryChat = { supported: true, availability: 'unavailable', reason };
    this.notifyStatusChange();
  }

  public async ensureTemporaryConversation(params: {
    key: string;
    providerId: ProviderId;
    accountId: string;
    partitionKey: string;
    forceNew?: boolean;
    abortSignal?: AbortSignal;
  }): Promise<TemporaryConversationHandle> {
    const existing = this.temporaryConversations.get(params.key);
    if (existing && !params.forceNew) {
      if (existing.providerId !== params.providerId || existing.accountId !== params.accountId || existing.partitionKey !== params.partitionKey) {
        throw new Error('[TEMPORARY_CHAT_ENDED] Temporary Chat belongs to a different provider or account. Start a new Temporary Chat.');
      }
      if (existing.window.isDestroyed() || !await existing.adapter.verifyTemporaryChat()) {
        existing.state = 'ended';
        this.endTemporaryConversation(params.key);
        throw new Error('[TEMPORARY_CHAT_ENDED] The original Temporary Chat can no longer be verified. Start a new Temporary Chat.');
      }
      existing.state = 'verified';
      existing.lastActiveAt = Date.now();
      existing.adapter.setTemporaryChatRequired(true);
      this.notifyTemporaryConversations();
      return this.toTemporaryConversationHandle(existing);
    }
    if (existing) this.endTemporaryConversation(params.key);
    if (this.temporaryConversations.size + this.normalConversations.size >= SessionManager.MAX_TEMPORARY_CONVERSATIONS) {
      throw new Error('[TEMPORARY_CHAT_LIMIT] Eight managed browser conversations are already open. End one before starting another.');
    }
    const source = this.adapters.get(params.providerId);
    if (!(source instanceof CustomRecipeAdapter) || !source.supportsTemporaryChat()) {
      throw new Error('[TEMPORARY_CHAT_UNSUPPORTED] This provider does not support native Temporary Chat.');
    }
    this.configureSession(params.partitionKey);
    const adapter = new CustomRecipeAdapter(source.recipe);
    adapter.setCustomPartition(params.partitionKey);
    const win = new BrowserWindow({
      width: 1100,
      height: 800,
      show: false,
      title: `Transgentic - ${adapter.name} - Temporary Chat`,
      webPreferences: {
        partition: params.partitionKey,
        nodeIntegration: false,
        contextIsolation: true,
        preload: getStealthPreloadPath(),
      },
    });
    win.webContents.setUserAgent(SessionProfileManager.getNormalizedUserAgent());
    win.webContents.on('dom-ready', () => {
      win.webContents.executeJavaScript(SessionProfileManager.getPreloadCompatibilityScript(), true).catch(() => {});
    });
    adapter.setWebContents(win.webContents);
    const now = Date.now();
    const entry: TemporaryConversationEntry = {
      key: params.key,
      mode: 'temporary',
      providerId: params.providerId,
      accountId: params.accountId,
      partitionKey: params.partitionKey,
      sessionId: crypto.randomUUID(),
      generation: ++this.temporaryGeneration,
      state: 'preparing',
      recipeVersion: source.recipe.version,
      createdAt: now,
      lastActiveAt: now,
      window: win,
      adapter,
    };
    this.temporaryConversations.set(params.key, entry);
    win.on('closed', () => {
      const current = this.temporaryConversations.get(params.key);
      if (current === entry) {
        entry.state = 'ended';
        adapter.detach();
        this.temporaryConversations.delete(params.key);
        globalThreadManager.removeTemporarySessionByKey(params.key);
        this.notifyTemporaryConversationEnded(entry);
        this.notifyTemporaryConversations();
      }
    });
    try {
      await adapter.activateTemporaryChat(params.abortSignal);
      entry.state = 'verified';
      entry.lastActiveAt = Date.now();
      this.notifyTemporaryConversations();
      return this.toTemporaryConversationHandle(entry);
    } catch (error) {
      entry.state = 'unverified';
      this.endTemporaryConversation(params.key);
      throw error;
    }
  }

  private toTemporaryConversationHandle(entry: TemporaryConversationEntry): TemporaryConversationHandle {
    const { window: _window, adapter: _adapter, ...info } = entry;
    return { info: { ...info }, adapter: entry.adapter, webContents: entry.window.webContents };
  }

  public getTemporaryConversation(key: string): TemporaryConversationHandle | undefined {
    const entry = this.temporaryConversations.get(key);
    return entry ? this.toTemporaryConversationHandle(entry) : undefined;
  }
  public getManagedConversation(key: string): TemporaryConversationHandle | undefined {
    const entry = this.temporaryConversations.get(key) || this.normalConversations.get(key);
    return entry ? this.toTemporaryConversationHandle(entry) : undefined;
  }

  public listTemporaryConversations(): TemporaryChatSessionInfo[] {
    return [
      ...Array.from(this.temporaryConversations.values()),
      ...Array.from(this.normalConversations.values()),
    ].map(({ window: _window, adapter: _adapter, ...info }) => ({ ...info }));
  }

  public onTemporaryConversationsUpdate(listener: (sessions: TemporaryChatSessionInfo[]) => void): () => void {
    this.temporaryConversationListeners.push(listener);
    return () => { this.temporaryConversationListeners = this.temporaryConversationListeners.filter(item => item !== listener); };
  }

  public onTemporaryConversationEnded(listener: (session: TemporaryChatSessionInfo) => void): () => void {
    this.temporaryConversationEndedListeners.push(listener);
    return () => { this.temporaryConversationEndedListeners = this.temporaryConversationEndedListeners.filter(item => item !== listener); };
  }

  private notifyTemporaryConversations(): void {
    const sessions = this.listTemporaryConversations();
    for (const listener of this.temporaryConversationListeners) listener(sessions);
  }

  private notifyTemporaryConversationEnded(entry: TemporaryConversationEntry): void {
    const { window: _window, adapter: _adapter, ...info } = entry;
    for (const listener of this.temporaryConversationEndedListeners) listener({ ...info });
  }

  public openTemporaryConversation(key: string): boolean {
    const entry = this.temporaryConversations.get(key) || this.normalConversations.get(key);
    if (!entry || entry.window.isDestroyed()) return false;
    entry.window.show();
    entry.window.focus();
    entry.lastActiveAt = Date.now();
    return true;
  }

  public endTemporaryConversation(key: string): boolean {
    if (this.normalConversations.has(key)) return this.endNormalConversation(key);
    const entry = this.temporaryConversations.get(key);
    if (!entry) return false;
    this.temporaryConversations.delete(key);
    entry.state = 'ended';
    entry.adapter.detach();
    globalThreadManager.removeTemporarySessionByKey(key);
    if (!entry.window.isDestroyed()) entry.window.close();
    this.notifyTemporaryConversationEnded(entry);
    this.notifyTemporaryConversations();
    return true;
  }

  public endTemporaryConversations(providerId?: ProviderId, accountId?: string): void {
    for (const [key, entry] of Array.from(this.temporaryConversations.entries())) {
      if ((!providerId || entry.providerId === providerId) && (!accountId || entry.accountId === accountId)) {
        this.endTemporaryConversation(key);
      }
    }
    this.endNormalConversations(providerId, accountId);
  }

  private cleanupTemporaryConversations(): void {
    const cutoff = Date.now() - SessionManager.TEMPORARY_TTL_MS;
    for (const [key, entry] of this.temporaryConversations.entries()) {
      if (entry.lastActiveAt < cutoff || entry.window.isDestroyed()) this.endTemporaryConversation(key);
    }
  }

  public async ensureNormalConversation(params: { key: string; providerId: ProviderId; accountId: string; partitionKey: string; forceNew?: boolean; abortSignal?: AbortSignal }): Promise<TemporaryConversationHandle> {
    const previous = this.normalConversations.get(params.key);
    if (previous && !params.forceNew) {
      if (previous.providerId !== params.providerId || previous.accountId !== params.accountId || previous.partitionKey !== params.partitionKey) {
        throw new Error('[CONVERSATION_BOUND] This conversation belongs to a different provider or account.');
      }
      if (previous.window.isDestroyed()) { this.endNormalConversation(params.key); throw new Error('[CONVERSATION_ENDED] The browser conversation has ended.'); }
      previous.lastActiveAt = Date.now();
      return this.toTemporaryConversationHandle(previous);
    }
    if (previous) this.endNormalConversation(params.key);
    if (this.temporaryConversations.size + this.normalConversations.size >= SessionManager.MAX_TEMPORARY_CONVERSATIONS) throw new Error('[CONVERSATION_LIMIT] Eight managed browser conversations are already open. End one before starting another.');
    const source = this.adapters.get(params.providerId);
    if (!(source instanceof CustomRecipeAdapter)) throw new Error('[CONVERSATION_UNSUPPORTED] This provider has no WebView recipe.');
    this.configureSession(params.partitionKey);
    const adapter = new CustomRecipeAdapter(source.recipe);
    adapter.setCustomPartition(params.partitionKey);
    const win = new BrowserWindow({ width: 1100, height: 800, show: false, title: `Transgentic - ${adapter.name} - Conversation`,
      webPreferences: { partition: params.partitionKey, nodeIntegration: false, contextIsolation: true, preload: getStealthPreloadPath() } });
    win.webContents.setUserAgent(SessionProfileManager.getNormalizedUserAgent());
    win.webContents.on('dom-ready', () => { win.webContents.executeJavaScript(SessionProfileManager.getPreloadCompatibilityScript(), true).catch(() => {}); });
    adapter.setWebContents(win.webContents);
    const now = Date.now();
    const entry: NormalConversationEntry = { key: params.key, mode: 'normal', providerId: params.providerId, accountId: params.accountId,
      partitionKey: params.partitionKey, sessionId: crypto.randomUUID(), generation: ++this.temporaryGeneration, state: 'preparing',
      recipeVersion: source.recipe.version, createdAt: now, lastActiveAt: now, window: win, adapter };
    this.normalConversations.set(params.key, entry);
    win.on('closed', () => { if (this.normalConversations.get(params.key) === entry) {
      this.normalConversations.delete(params.key); adapter.detach(); entry.state = 'ended'; this.notifyTemporaryConversations();
    }});
    try {
      await adapter.navigateToNewChat({ forceReload: true });
      if (params.abortSignal?.aborted) throw Object.assign(new Error('Request cancelled.'), { name: 'AbortError' });
      if (!await adapter.checkAuthStatus()) throw new Error('[CONVERSATION_LOGIN_REQUIRED] Sign in before using this provider.');
      entry.state = 'verified'; this.notifyTemporaryConversations();
      return this.toTemporaryConversationHandle(entry);
    } catch (error) { this.endNormalConversation(params.key); throw error; }
  }

  public endNormalConversation(key: string): boolean {
    const entry = this.normalConversations.get(key);
    if (!entry) return false;
    this.normalConversations.delete(key); entry.state = 'ended'; entry.adapter.detach();
    if (!entry.window.isDestroyed()) entry.window.close();
    this.notifyTemporaryConversations(); return true;
  }

  public endNormalConversations(providerId?: ProviderId, accountId?: string): void {
    for (const [key, entry] of Array.from(this.normalConversations.entries())) {
      if ((!providerId || entry.providerId === providerId) && (!accountId || entry.accountId === accountId)) this.endNormalConversation(key);
    }
  }

  private cleanupNormalConversations(): void {
    const cutoff = Date.now() - SessionManager.TEMPORARY_TTL_MS;
    for (const [key, entry] of this.normalConversations.entries()) if (entry.lastActiveAt < cutoff || entry.window.isDestroyed()) this.endNormalConversation(key);
  }

  public onStatusUpdate(callback: (statuses: Record<ProviderId, ProviderStatus>) => void): () => void {
    this.statusListeners.push(callback);
    return () => {
      this.statusListeners = this.statusListeners.filter((cb) => cb !== callback);
    };
  }

  private notifyStatusChange(): void {
    const all = this.getAllStatuses();
    for (const listener of this.statusListeners) {
      try {
        listener(all);
      } catch {}
    }
  }

  /**
   * Completely purges all browser storage data across all partitions and windows
   * (cookies, localStorage, indexedDB, cache, service workers, auth cache, etc.).
   */
  public async clearAllBrowserStorage(): Promise<{ clearedPartitions: number }> {
    this.endTemporaryConversations();
    this.endNormalConversations();
    // 1. Close all open drawer/background windows
    for (const [, win] of this.openWindows.entries()) {
      if (!win.isDestroyed()) {
        try { win.close(); } catch {}
      }
    }
    this.openWindows.clear();

    for (const [, win] of this.backgroundWindows.entries()) {
      if (!win.isDestroyed()) {
        try { win.close(); } catch {}
      }
    }
    this.backgroundWindows.clear();

    // 2. Detach adapters
    for (const adapter of this.adapters.values()) {
      try { adapter.detach(); } catch {}
    }

    // 3. Collect all active partitions
    const partitionKeys = new Set<string>();
    for (const adapter of this.adapters.values()) {
      partitionKeys.add(adapter.partition);
    }
    for (const key of this.partitionSessions.keys()) {
      partitionKeys.add(key);
    }
    try {
      const allAccounts = AccountRegistryManager.getAll();
      for (const store of Object.values(allAccounts)) {
        if (store && store.accounts) {
          for (const acc of store.accounts) {
            partitionKeys.add(acc.partitionKey);
          }
        }
      }
    } catch {}

    // 4. Clear storage on all collected sessions + default session
    let clearedCount = 0;
    const storagesToClear: any[] = [
      'cookies',
      'localstorage',
      'indexdb',
      'websql',
      'serviceworkers',
      'cachestorage',
      'shadercache',
      'filesystem',
    ];

    for (const key of partitionKeys) {
      try {
        const sess = session.fromPartition(key);
        await sess.clearStorageData({ storages: storagesToClear });
        await sess.clearCache();
        await sess.clearAuthCache();
        await sess.clearHostResolverCache();
        clearedCount++;
      } catch (err) {
        console.error(`[SessionManager] Failed to clear partition ${key}:`, err);
      }
    }

    try {
      await session.defaultSession.clearStorageData({ storages: storagesToClear });
      await session.defaultSession.clearCache();
      await session.defaultSession.clearAuthCache();
    } catch {}

    // 5. Reset internal states
    for (const [id, current] of this.statuses.entries()) {
      current.isAuthenticated = false;
      current.state = 'disconnected';
    }
    this.notifyStatusChange();

    return { clearedPartitions: clearedCount };
  }

  public destroy(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
    this.endTemporaryConversations();
    this.endNormalConversations();
  }
}

export const globalSessionManager = new SessionManager();
