/**
 * Transgentic Auth Sync - Background Service Worker
 * Silent Background Cookie Refresh & Auto-Sync Engine
 * 
 * Periodically and non-destructively synchronizes authenticated AI session
 * cookies from Google Chrome to Transgentic's local session partitions.
 */

const ext = typeof chrome !== 'undefined' && chrome.runtime ? chrome : (typeof browser !== 'undefined' ? browser : null);

const HEALTHCHECK_URL = 'http://127.0.0.1:58420/api/health';
const SYNC_SESSION_URL = 'http://127.0.0.1:58420/api/auth/sync-session';
const ALARM_NAME = 'transgentic_silent_refresh';
const DEFAULT_INTERVAL_MINUTES = 15;

const STORAGE_KEY_CONFIG = 'background_sync_config';

const DEFAULT_SYNC_CONFIG = {
  services: {
    chatgpt: false,
    claude: false,
    gemini: false,
    grok: false,
  },
  syncIntervalMinutes: DEFAULT_INTERVAL_MINUTES,
  lastSuccessfulSync: {},
};

/**
 * Provider metadata & logout guard validators.
 * Sync will ONLY proceed if critical session tokens are valid and non-empty.
 */
const SERVICES_METADATA = {
  chatgpt: {
    id: 'chatgpt',
    name: 'OpenAI ChatGPT',
    defaultOrigin: 'https://chatgpt.com',
    domains: ['chatgpt.com', '.chatgpt.com', '.openai.com', 'openai.com', 'auth.openai.com', 'auth0.openai.com'],
    // Logout Guard: must have valid next-auth session token
    isValidSession: (cookies) => {
      return cookies.some((c) =>
        (
          c.name === '__Secure-next-auth.session-token' ||
          c.name.startsWith('__Secure-next-auth.session-token.') ||
          c.name === '__Host-next-auth.session-token'
        ) &&
        typeof c.value === 'string' &&
        c.value.length > 40 &&
        c.value !== 'deleted' &&
        c.value !== 'null'
      );
    },
  },
  claude: {
    id: 'claude',
    name: 'Anthropic Claude',
    defaultOrigin: 'https://claude.ai',
    domains: ['claude.ai', '.claude.ai', '.anthropic.com', 'anthropic.com'],
    // Logout Guard: must have valid sessionKey starting with sk-ant-sid
    isValidSession: (cookies) => {
      return cookies.some((c) =>
        c.name === 'sessionKey' &&
        typeof c.value === 'string' &&
        c.value.startsWith('sk-ant-sid') &&
        c.value.length > 20 &&
        c.value !== 'deleted' &&
        c.value !== 'null'
      );
    },
  },
  gemini: {
    id: 'gemini',
    name: 'Google Gemini',
    defaultOrigin: 'https://gemini.google.com',
    domains: ['gemini.google.com', '.google.com', 'google.com', 'accounts.google.com'],
    // Logout Guard: must have valid primary PSID token
    isValidSession: (cookies) => {
      return cookies.some((c) =>
        (c.name === '__Secure-1PSID' || c.name === '__Secure-3PSID' || c.name === 'SID') &&
        typeof c.value === 'string' &&
        c.value.length > 20 &&
        c.value !== 'deleted' &&
        c.value !== 'null'
      );
    },
  },
  grok: {
    id: 'grok',
    name: 'xAI Grok',
    defaultOrigin: 'https://grok.com',
    domains: ['grok.com', '.grok.com', 'x.ai', '.x.ai'],
    // Logout Guard: must have valid sso / session token belonging to grok.com or x.ai
    isValidSession: (cookies) => {
      return cookies.some((c) => {
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
    },
  },
};

/**
 * Reads background sync configuration from chrome.storage.local.
 */
async function getSyncConfig() {
  try {
    const res = await ext.storage.local.get([STORAGE_KEY_CONFIG]);
    if (res && res[STORAGE_KEY_CONFIG]) {
      const stored = res[STORAGE_KEY_CONFIG];
      const interval = (stored.syncIntervalMinutes === 30 || !stored.syncIntervalMinutes)
        ? DEFAULT_INTERVAL_MINUTES
        : stored.syncIntervalMinutes;
      return {
        ...DEFAULT_SYNC_CONFIG,
        ...stored,
        syncIntervalMinutes: interval,
        services: {
          ...DEFAULT_SYNC_CONFIG.services,
          ...(stored.services || {}),
        },
        lastSuccessfulSync: {
          ...(stored.lastSuccessfulSync || {}),
        },
      };
    }
  } catch (e) {}
  return { ...DEFAULT_SYNC_CONFIG };
}

/**
 * Saves background sync configuration to chrome.storage.local.
 */
async function saveSyncConfig(config) {
  try {
    await ext.storage.local.set({ [STORAGE_KEY_CONFIG]: config });
  } catch (e) {}
}

/**
 * Sets up repeating alarm for background synchronization.
 */
async function setupAlarm(intervalMinutes) {
  const period = Math.max(1, intervalMinutes || DEFAULT_INTERVAL_MINUTES);
  try {
    await ext.alarms.clear(ALARM_NAME);
    ext.alarms.create(ALARM_NAME, {
      periodInMinutes: period,
      delayInMinutes: 1,
    });
  } catch (e) {}
}

/**
 * Extracts cookies for a target provider across its registered domains.
 */
async function extractServiceCookies(service) {
  const cookieMap = new Map();
  const domains = new Set(service.domains || []);

  if (service.domain) {
    const cleanDomain = service.domain.replace(/^\./, '').split(':')[0].toLowerCase();
    domains.add(cleanDomain);
    domains.add('.' + cleanDomain);
    const parts = cleanDomain.split('.');
    if (parts.length > 2) {
      const apex = parts.slice(-2).join('.');
      domains.add(apex);
      domains.add('.' + apex);
    }
  }

  try {
    const stored = await ext.storage.local.get([`dynamicDomain_${service.id}`]);
    if (stored && stored[`dynamicDomain_${service.id}`]?.domain) {
      const d = stored[`dynamicDomain_${service.id}`].domain.toLowerCase();
      domains.add(d);
      domains.add('.' + d.replace(/^\./, ''));
    }
  } catch {}

  for (const domain of domains) {
    try {
      const cookies = await ext.cookies.getAll({ domain });
      for (const c of (cookies || [])) {
        const key = `${c.domain}:${c.name}:${c.path}`;
        if (!cookieMap.has(key)) {
          cookieMap.set(key, {
            name: c.name,
            value: c.value,
            domain: c.domain,
            hostOnly: c.hostOnly,
            path: c.path,
            secure: c.secure,
            httpOnly: c.httpOnly,
            sameSite: c.sameSite,
            expirationDate: c.expirationDate,
          });
        }
      }
    } catch {}
  }

  const urls = new Set();
  if (service.defaultOrigin) urls.add(service.defaultOrigin);
  if (service.url) urls.add(service.url);
  for (const u of urls) {
    try {
      const cookies = await ext.cookies.getAll({ url: u });
      for (const c of (cookies || [])) {
        const key = `${c.domain}:${c.name}:${c.path}`;
        if (!cookieMap.has(key)) {
          cookieMap.set(key, {
            name: c.name,
            value: c.value,
            domain: c.domain,
            hostOnly: c.hostOnly,
            path: c.path,
            secure: c.secure,
            httpOnly: c.httpOnly,
            sameSite: c.sameSite,
            expirationDate: c.expirationDate,
          });
        }
      }
    } catch {}
  }

  return Array.from(cookieMap.values());
}

/**
 * Silent Background Execution Engine:
 * 1. Pings Transgentic healthcheck.
 * 2. Checks enabled services in config.
 * 3. Enforces Logout Guard per service.
 * 4. Dispatches non-destructive session payloads.
 */
async function runSilentSync() {
  // 1. Healthcheck Pre-Flight Guard: Silently ping Transgentic
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000);
    const healthRes = await fetch(HEALTHCHECK_URL, {
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!healthRes.ok) {
      return; // Silent abort: Transgentic returned non-200
    }

    const healthData = await healthRes.json().catch(() => null);
    if (!healthData || (healthData.status !== 'online' && healthData.status !== 'ok')) {
      return; // Silent abort
    }
  } catch {
    // Transgentic is closed or unreachable: silently abort without errors
    return;
  }

  // 2. Read configuration for enabled services
  const config = await getSyncConfig();
  if (!config || !config.services) return;

  // Support both built-in services and dynamically installed custom recipes
  let customRecipesMap = {};
  try {
    const res = await ext.storage.local.get(['installed_custom_recipes']);
    if (res?.installed_custom_recipes && Array.isArray(res.installed_custom_recipes)) {
      for (const r of res.installed_custom_recipes) {
        const idKey = r.id;
        const customKey = r.id.startsWith('custom_') || r.id.startsWith('webview_') ? r.id : `custom_${r.id}`;
        const domain = r.domainMatch || r.domain || (r.url ? (new URL(r.url).hostname) : '');
        const meta = {
          id: r.id,
          name: r.title || r.name || r.id,
          defaultOrigin: r.url || (domain ? `https://${domain}` : ''),
          domains: [domain].filter(Boolean),
          domain,
          isValidSession: (cookies) => Array.isArray(cookies) && cookies.length > 0,
        };
        customRecipesMap[idKey] = meta;
        customRecipesMap[customKey] = meta;
      }
    }
  } catch {}

  const enabledServiceIds = Object.keys(config.services).filter(
    (id) => config.services[id] === true && (SERVICES_METADATA[id] || customRecipesMap[id])
  );

  if (enabledServiceIds.length === 0) {
    return; // No services opted into background sync
  }

  const now = Date.now();
  let hasUpdates = false;

  // 3. Process each enabled service non-destructively
  for (const serviceId of enabledServiceIds) {
    const service = SERVICES_METADATA[serviceId] || customRecipesMap[serviceId];
    try {
      // Tabless cookie extraction from Chrome cookie jar
      const cookies = await extractServiceCookies(service);
      if (!cookies || cookies.length === 0) {
        continue;
      }

      // Logout Guard: are primary session keys present and non-empty?
      if (!service.isValidSession(cookies)) {
        // Strict Guard: User is logged out on Chrome or cookies are expired.
        // DO NOT send empty/invalid payload to Transgentic! Preserve existing session.
        continue;
      }

      // Read preferred account for this provider if one was designated
      let targetAccountId = undefined;
      try {
        const prefKey = `preferredAccount_${serviceId}`;
        const pref = await ext.storage.local.get([prefKey]);
        if (pref && pref[prefKey] && pref[prefKey] !== 'primary') {
          targetAccountId = pref[prefKey];
        }
      } catch {}

      // POST to Transgentic background receiver
      const payload = {
        provider: service.id,
        source: 'background_auto_refresh',
        targetAccountId,
        origin: service.defaultOrigin,
        cookies,
        userAgent: navigator.userAgent,
      };

      const syncRes = await fetch(SYNC_SESSION_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (syncRes.ok) {
        config.lastSuccessfulSync = config.lastSuccessfulSync || {};
        config.lastSuccessfulSync[serviceId] = now;
        hasUpdates = true;
      }
    } catch {
      // Silently ignore individual service failures in background
    }
  }

  if (hasUpdates) {
    await saveSyncConfig(config);
  }
}

// Register browser alarms & lifecycle listeners
if (ext && ext.runtime) {
  ext.runtime.onInstalled.addListener(async () => {
    const config = await getSyncConfig();
    await setupAlarm(config.syncIntervalMinutes);
    // Silent initial sync on install/update
    runSilentSync().catch(() => {});
  });

  ext.runtime.onStartup.addListener(async () => {
    const config = await getSyncConfig();
    await setupAlarm(config.syncIntervalMinutes);
    // Silent sync on browser startup
    runSilentSync().catch(() => {});
  });
}

if (ext && ext.alarms) {
  ext.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === ALARM_NAME) {
      runSilentSync().catch(() => {});
    }
  });
}

// Communication channel with popup.js
if (ext && ext.runtime && ext.runtime.onMessage) {
  ext.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'TRIGGER_SILENT_SYNC') {
      runSilentSync()
        .then(() => sendResponse({ success: true }))
        .catch(() => sendResponse({ success: false }));
      return true; // Keep message channel open for async response
    }

    if (message.type === 'UPDATE_ALARM') {
      setupAlarm(message.intervalMinutes)
        .then(() => sendResponse({ success: true }))
        .catch(() => sendResponse({ success: false }));
      return true;
    }

    if (message.action === 'save_and_sync_recipe' || message.action === 'recipe_inspected' || message.type === 'RECIPE_INSPECTED') {
      const recipe = message.recipe;
      const targetDomain = recipe?.domain || recipe?.domainMatch;
      const targetUrl = message.url || recipe?.url || (targetDomain ? `https://${targetDomain}` : '');

      if (recipe && targetDomain) {
        ext.storage.local.set({ lastInspectedRecipe: recipe });
        extractServiceCookies({
          id: recipe.id,
          domain: targetDomain,
          domains: [targetDomain],
          url: targetUrl,
        }).then(async (cookies) => {
          try {
            const res = await fetch('http://127.0.0.1:58420/api/recipes/install-and-sync', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                recipe,
                cookies,
                userAgent: navigator.userAgent,
                origin: targetUrl,
              }),
            });
            const data = await res.json().catch(() => ({ success: false }));
            sendResponse({ success: data.success === true, cookiesCount: cookies.length, error: data.error, data });
          } catch (err) {
            sendResponse({ success: false, error: err.message });
          }
        }).catch((err) => {
          sendResponse({ success: false, error: err.message });
        });
        return true; // Keep message channel open for async response
      }
      sendResponse({ received: true });
      return true;
    }
  });
}

// Auto-re-inject inspector on tab navigation if a wizard session is active on the same domain
if (ext && ext.tabs && ext.tabs.onUpdated) {
  ext.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' && tab && tab.url && tab.url.startsWith('http')) {
      try {
        const stored = await ext.storage.local.get('transgentic_wizard_session');
        const session = stored?.transgentic_wizard_session;
        if (session && session.inProgress && session.domain) {
          const tabUrl = new URL(tab.url);
          if (tabUrl.hostname === session.domain || tabUrl.hostname.endsWith('.' + session.domain)) {
            if (ext.scripting && ext.scripting.executeScript) {
              await ext.scripting.executeScript({
                target: { tabId },
                files: ['content/inspectorOverlay.js'],
              });
            }
          }
        }
      } catch {}
    }
  });
}
