/**
 * Transgentic Auth Sync Chrome Extension
 * Safely extracts session cookies from host Google Chrome and dispatches them
 * to the local Transgentic Electron session partition.
 * 
 * Supports multiple Chrome profiles seamlessly: each Chrome profile can map
 * to a distinct account partition in Transgentic.
 */

const ext = typeof chrome !== 'undefined' && chrome.runtime ? chrome : (typeof browser !== 'undefined' ? browser : null);

const LOCAL_RECEIVER_URL = 'http://127.0.0.1:58420/api/auth/sync-session';
const LOCAL_ACCOUNTS_URL = 'http://127.0.0.1:58420/api/auth/accounts';
const LOCAL_PRESETS_URL = 'http://127.0.0.1:58420/api/auth/presets';
const LOCAL_HEALTH_URL = 'http://127.0.0.1:58420/health';

const UNSUPPORTED_SVG_HTML = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="provider-svg-icon"><circle cx="12" cy="12" r="10"></circle><path d="m15 9-6 6"></path><path d="m9 9 6 6"></path></svg>';
const GLOBE_SVG_HTML = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="provider-svg-icon"><circle cx="12" cy="12" r="10"></circle><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"></path><path d="M2 12h20"></path></svg>';
const SUCCESS_SVG_HTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="status-svg-icon"><circle cx="12" cy="12" r="10"></circle><path d="m9 12 2 2 4-4"></path></svg>';
const FAIL_SVG_HTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="status-svg-icon"><circle cx="12" cy="12" r="10"></circle><path d="m15 9-6 6"></path><path d="m9 9 6 6"></path></svg>';
const SYNC_SPIN_SVG_HTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="status-svg-icon spinning"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"></path><path d="M3 3v5h5"></path><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"></path><path d="M16 21h5v-5"></path></svg>';

const PROVIDERS = {
  gemini: {
    id: 'gemini',
    name: 'Google Gemini',
    iconSvg: 'icons/services/gemini.svg',
    svgHtml: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="provider-svg-icon"><path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"></path><path d="M20 3v4"></path><path d="M22 5h-4"></path><path d="M4 17v2"></path><path d="M5 18H3"></path></svg>',
    themeClass: 'theme-gemini',
    defaultOrigin: 'https://gemini.google.com',
    domains: ['gemini.google.com', '.google.com', 'google.com', 'accounts.google.com'],
    match: (url) => url.includes('gemini.google.com') || (url.includes('google.com') && url.includes('gemini')),
  },
  chatgpt: {
    id: 'chatgpt',
    name: 'OpenAI ChatGPT',
    iconSvg: 'icons/services/chatgpt.svg',
    svgHtml: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="provider-svg-icon"><path d="M12 8V4H8"></path><rect width="16" height="12" x="4" y="8" rx="2"></rect><path d="M2 14h2"></path><path d="M20 14h2"></path><path d="M15 13v2"></path><path d="M9 13v2"></path></svg>',
    themeClass: 'theme-chatgpt',
    defaultOrigin: 'https://chatgpt.com',
    domains: ['chatgpt.com', '.chatgpt.com', '.openai.com', 'openai.com', 'auth.openai.com', 'auth0.openai.com'],
    match: (url) => url.includes('chatgpt.com') || url.includes('openai.com'),
  },
  claude: {
    id: 'claude',
    name: 'Anthropic Claude',
    iconSvg: 'icons/services/claude.svg',
    svgHtml: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="provider-svg-icon"><path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z"></path><path d="M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z"></path><path d="M15 13a4.5 4.5 0 0 1-3-4 4.5 4.5 0 0 1-3 4"></path><path d="M17.599 6.5a3 3 0 0 0 .399-1.375"></path><path d="M6.003 5.125A3 3 0 0 0 6.401 6.5"></path><path d="M3.477 10.896a4 4 0 0 1 .585-.396"></path><path d="M19.938 10.5a4 4 0 0 1 .585.396"></path><path d="M6 18a4 4 0 0 1-1.967-.516"></path><path d="M19.967 17.484A4 4 0 0 1 18 18"></path></svg>',
    themeClass: 'theme-claude',
    defaultOrigin: 'https://claude.ai',
    domains: ['claude.ai', '.claude.ai', '.anthropic.com', 'anthropic.com'],
    match: (url) => url.includes('claude.ai') || url.includes('anthropic.com'),
  },
  grok: {
    id: 'grok',
    name: 'xAI Grok',
    iconSvg: 'icons/services/grok.svg',
    svgHtml: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="provider-svg-icon"><rect width="16" height="16" x="4" y="4" rx="2"></rect><rect width="6" height="6" x="9" y="9" rx="1"></rect><path d="M15 2v2"></path><path d="M15 20v2"></path><path d="M2 15h2"></path><path d="M2 9h2"></path><path d="M20 15h2"></path><path d="M20 9h2"></path><path d="M9 2v2"></path><path d="M9 20v2"></path></svg>',
    themeClass: 'theme-grok',
    defaultOrigin: 'https://grok.com',
    domains: ['grok.com', '.grok.com', 'x.ai', '.x.ai'],
    match: (url) => url.includes('grok.com') || url.includes('x.ai'),
  },
};

const LOCAL_RECIPES_URL = 'http://127.0.0.1:58420/api/recipes';
const LOCAL_RECIPES_INSTALL_URL = 'http://127.0.0.1:58420/api/recipes/install-and-sync';
const LOCAL_RECIPES_DETECT_URL = 'http://127.0.0.1:58420/api/recipes/detect-selectors';

let currentTab = null;
let currentProvider = null;
let isTransgenticOnline = false;
let installedRecipes = [];
let isWizardBound = false;

// UI Elements
const portStatusEl = document.getElementById('portStatus');
const portTextEl = document.getElementById('portText');
const offlineBannerEl = document.getElementById('offlineBanner');
const brandSubtitleEl = document.getElementById('brandSubtitle');
const providerCardEl = document.getElementById('providerCard');
const providerBadgeEl = document.getElementById('providerBadge');
const providerIconWrapperEl = document.getElementById('providerIconWrapper');
const providerIconImgEl = document.getElementById('providerIconImg');
const providerFallbackEmojiEl = document.getElementById('providerFallbackEmoji');
const providerNameEl = document.getElementById('providerName');
const providerDomainEl = document.getElementById('providerDomain');
const accountSelectEl = document.getElementById('accountSelect');
const newAccountRowEl = document.getElementById('newAccountRow');
const newAccountAliasEl = document.getElementById('newAccountAlias');
const syncCurrentBtn = document.getElementById('syncCurrentBtn');
const syncAllBtn = document.getElementById('syncAllBtn');
const statusAreaEl = document.getElementById('statusArea');
const statusIconEl = document.getElementById('statusIcon');
const statusTitleEl = document.getElementById('statusTitle');
const statusMessageEl = document.getElementById('statusMessage');
const statusDetailsEl = document.getElementById('statusDetails');
const geminiTipBannerEl = document.getElementById('geminiTipBanner');
const geminiEnableAutoBtn = document.getElementById('geminiEnableAutoBtn');
const geminiAutoActiveBadge = document.getElementById('geminiAutoActiveBadge');

// Recipe Wizard UI Elements
const standardActionsContainer = document.getElementById('standardActionsContainer');
const recipeWizardSection = document.getElementById('recipeWizardSection');
const unrecognizedDomainBanner = document.getElementById('unrecognizedDomainBanner');
const recipeFileInput = document.getElementById('recipeFileInput');
const btnLoadExample = document.getElementById('btnLoadExample');
const recipeJsonArea = document.getElementById('recipeJsonArea');
const recipeValidationBadge = document.getElementById('recipeValidationBadge');
const validationIcon = document.getElementById('validationIcon');
const validationText = document.getElementById('validationText');
const installAndSyncBtn = document.getElementById('installAndSyncBtn');
const btnCopyAgenticPrompt = document.getElementById('btnCopyAgenticPrompt');
const btnAutoDetectSelectors = document.getElementById('btnAutoDetectSelectors');
const btnAutoDetectText = document.getElementById('btnAutoDetectText');
const btnLaunchInspector = document.getElementById('btnLaunchInspector');

// Initialize popup
document.addEventListener('DOMContentLoaded', async () => {
  // Dynamically load version from manifest.json
  try {
    const manifest = ext?.runtime?.getManifest?.();
    if (manifest?.version && brandSubtitleEl) {
      brandSubtitleEl.textContent = `Sync V${manifest.version}`;
    }
  } catch (e) {}

  await checkHealthAndInit();
  await loadInstalledRecipes();
  await inspectActiveTab();
  await initBackgroundSyncUI();

  // Periodic health check every 2.5s for seamless recovery
  setInterval(async () => {
    const wasOnline = isTransgenticOnline;
    await checkHealthAndInit();
    if (!wasOnline && isTransgenticOnline && currentProvider) {
      await loadAccountProfiles(currentProvider.id);
    }
  }, 2500);

  if (accountSelectEl) {
    accountSelectEl.addEventListener('change', () => {
      if (accountSelectEl.value === '__new__') {
        newAccountRowEl.classList.remove('hidden');
        newAccountAliasEl.focus();
      } else {
        newAccountRowEl.classList.add('hidden');
        if (currentProvider && accountSelectEl.value && ext?.storage?.local) {
          const storageKey = `preferredAccount_${currentProvider.id}`;
          ext.storage.local.set({ [storageKey]: accountSelectEl.value });
        }
      }
    });
  }

  syncCurrentBtn.addEventListener('click', handleSyncCurrent);
  syncAllBtn.addEventListener('click', handleSyncAll);
});

/**
 * Verifies that the Transgentic MCP server is listening on port 58420.
 */
async function checkHealthAndInit() {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 1200);
    const res = await fetch(LOCAL_HEALTH_URL, { method: 'GET', signal: controller.signal });
    clearTimeout(timeoutId);

    if (res.ok) {
      isTransgenticOnline = true;
      portStatusEl.className = 'port-badge online';
      portTextEl.textContent = 'ONLINE :58420';
      offlineBannerEl.classList.add('hidden');
      accountSelectEl.disabled = false;
      syncAllBtn.disabled = false;
      if (currentProvider) {
        syncCurrentBtn.disabled = false;
      }
      return true;
    }
  } catch (e) {}

  isTransgenticOnline = false;
  portStatusEl.className = 'port-badge offline';
  portTextEl.textContent = 'OFFLINE';
  offlineBannerEl.classList.remove('hidden');
  accountSelectEl.disabled = true;
  syncCurrentBtn.disabled = true;
  syncAllBtn.disabled = true;
  return false;
}

/**
 * Fetches registered account profiles for the provider from Transgentic
 * and restores this Chrome profile's preferred account.
 */
async function loadAccountProfiles(providerId) {
  if (!accountSelectEl) return;

  if (!isTransgenticOnline) {
    accountSelectEl.innerHTML = `
      <option value="primary">Offline (Start Transgentic to view accounts)</option>
    `;
    accountSelectEl.disabled = true;
    return;
  }

  try {
    const res = await fetch(`${LOCAL_ACCOUNTS_URL}?provider=${providerId}`);
    if (res.ok) {
      const data = await res.json();
      const accounts = data.accounts || [];

      accountSelectEl.innerHTML = '';

      if (accounts.length > 0) {
        accounts.forEach((acc) => {
          const opt = document.createElement('option');
          opt.value = acc.id;
          opt.textContent = `${acc.alias} (${acc.isMain ? 'Main' : 'Profile'})`;
          accountSelectEl.appendChild(opt);
        });
      }

      // Add option to create new profile slot directly
      const newOpt = document.createElement('option');
      newOpt.value = '__new__';
      newOpt.textContent = '➕ Add as New Profile in Transgentic...';
      accountSelectEl.appendChild(newOpt);

      accountSelectEl.disabled = false;

      // Check if this specific profile has a saved preferred account
      try {
        const storageKey = `preferredAccount_${providerId}`;
        const saved = await ext?.storage?.local?.get([storageKey]);
        const savedId = saved ? saved[storageKey] : null;
        if (savedId && accounts.some((a) => a.id === savedId)) {
          accountSelectEl.value = savedId;
        } else if (data.activeAccountId && accounts.some((a) => a.id === data.activeAccountId)) {
          accountSelectEl.value = data.activeAccountId;
        } else if (accounts.length > 0) {
          accountSelectEl.value = accounts[0].id;
        }
      } catch (e) {
        console.warn('Could not read saved profile preference:', e);
      }
      return;
    }
  } catch (e) {
    console.warn('Could not fetch accounts from Transgentic:', e);
  }

  // Fallback if network issue
  accountSelectEl.innerHTML = `
    <option value="primary">Primary (Default Profile)</option>
  `;
}

/**
 * Loads installed custom recipes from Transgentic backend.
 */
async function loadInstalledRecipes() {
  // First load from local storage cache for instant offline rendering
  try {
    const cached = await ext?.storage?.local?.get?.(['installed_custom_recipes']);
    if (cached?.installed_custom_recipes && Array.isArray(cached.installed_custom_recipes)) {
      installedRecipes = cached.installed_custom_recipes;
    }
  } catch {}

  if (!isTransgenticOnline) return;
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 1500);
    const res = await fetch(LOCAL_RECIPES_URL, { method: 'GET', signal: controller.signal });
    clearTimeout(timeoutId);
    if (res.ok) {
      const data = await res.json();
      if (data && Array.isArray(data.recipes)) {
        installedRecipes = data.recipes;
        try {
          await ext?.storage?.local?.set?.({ installed_custom_recipes: data.recipes });
        } catch {}
      }
    }
  } catch (e) {
    console.debug('Could not load recipes from Transgentic:', e);
  }
}

/**
 * Inspects active browser tab to match known AI providers or prompt Custom Recipe Wizard.
 */
async function inspectActiveTab() {
  try {
    const tabs = await ext.tabs.query({ active: true, currentWindow: true });
    if (!tabs || tabs.length === 0) return;

    currentTab = tabs[0];
    const url = currentTab.url || '';

    // 1. Check built-in providers
    let matched = null;
    for (const p of Object.values(PROVIDERS)) {
      if (p.match(url)) {
        matched = p;
        break;
      }
    }

    // 2. Check installed custom recipes
    let hostname = '';
    try {
      if (url) hostname = new URL(url).hostname;
    } catch {}

    if (!matched && hostname && installedRecipes && installedRecipes.length > 0) {
      for (const r of installedRecipes) {
        const recipeDomain = r.domain || (r.url ? (new URL(r.url).hostname) : '');
        const isMatch = Boolean(
          recipeDomain === hostname ||
          (hostname && (hostname.endsWith('.' + recipeDomain) || recipeDomain.endsWith('.' + hostname))) ||
          (r.url && url && (url.startsWith(r.url) || r.url.includes(hostname)))
        );
        if (isMatch) {
          const cleanDisplayName = r.title || r.name || r.id;
          matched = {
            id: r.id.startsWith('custom_') || r.id.startsWith('webview_') ? r.id : `custom_${r.id}`,
            name: cleanDisplayName,
            serviceDomain: recipeDomain || r.domain,
            iconSvg: 'icons/ui/globe.svg',
            svgHtml: GLOBE_SVG_HTML,
            themeClass: 'theme-custom',
            defaultOrigin: r.url || `https://${recipeDomain || r.domain}`,
            domains: [recipeDomain || r.domain],
            isCustomRecipe: true,
            recipe: r,
            match: (u) => {
              try {
                const h = new URL(u).hostname;
                return h === recipeDomain || h.endsWith('.' + recipeDomain) || recipeDomain.endsWith('.' + h);
              } catch { return false; }
            },
          };
          break;
        }
      }
    }

    if (matched) {
      // Recognized provider (built-in or installed recipe)
      currentProvider = matched;
      standardActionsContainer?.classList.remove('hidden');
      recipeWizardSection?.classList.add('hidden');

      providerCardEl.className = `card provider-card ${matched.themeClass || ''}`;
      providerIconWrapperEl.className = `provider-icon-wrapper ${matched.themeClass || ''}`;
      providerIconWrapperEl.innerHTML = matched.svgHtml || GLOBE_SVG_HTML;
      providerBadgeEl.textContent = matched.isCustomRecipe ? 'RECIPE ACTIVE' : 'DETECTED';
      providerBadgeEl.className = `badge active ${matched.themeClass || ''}`;

      providerNameEl.textContent = matched.name;
      providerDomainEl.textContent = matched.serviceDomain || hostname || url;

      syncCurrentBtn.className = `btn btn-primary ${matched.themeClass || ''}`;
      syncAllBtn.className = `btn btn-secondary ${matched.themeClass || ''}`;
      syncCurrentBtn.querySelector('.btn-text').textContent = `Sync ${matched.name || matched.serviceDomain}`;
      syncCurrentBtn.disabled = !isTransgenticOnline;

      await loadAccountProfiles(matched.id);

      if (matched.id === 'gemini') {
        geminiTipBannerEl?.classList.remove('hidden');
        if (typeof window.updateGeminiTipState === 'function') {
          await window.updateGeminiTipState();
        }
      } else {
        geminiTipBannerEl?.classList.add('hidden');
      }
    } else if (url && (url.startsWith('http://') || url.startsWith('https://'))) {
      // Unrecognized Web Domain -> Custom Recipe Wizard!
      currentProvider = null;
      standardActionsContainer?.classList.add('hidden');
      recipeWizardSection?.classList.remove('hidden');
      geminiTipBannerEl?.classList.add('hidden');

      providerCardEl.className = 'card provider-card theme-wizard';
      providerIconWrapperEl.className = 'provider-icon-wrapper';
      providerIconWrapperEl.innerHTML = GLOBE_SVG_HTML;
      providerBadgeEl.textContent = 'RECIPE NEEDED';
      providerBadgeEl.className = 'badge badge-warning';

      providerNameEl.textContent = currentTab.title ? currentTab.title.slice(0, 32) : 'Custom AI Target';
      providerDomainEl.textContent = hostname;

      setupRecipeWizardHandlers(hostname, url, currentTab.title || '');
    } else {
      // Internal browser page (chrome:// etc.)
      currentProvider = null;
      standardActionsContainer?.classList.add('hidden');
      recipeWizardSection?.classList.add('hidden');
      geminiTipBannerEl?.classList.add('hidden');

      providerCardEl.className = 'card provider-card';
      providerIconWrapperEl.className = 'provider-icon-wrapper unsupported';
      providerIconWrapperEl.innerHTML = UNSUPPORTED_SVG_HTML;
      providerBadgeEl.textContent = 'UNSUPPORTED TAB';
      providerBadgeEl.className = 'badge unsupported';

      providerNameEl.textContent = 'Non-AI Web Page';
      providerDomainEl.textContent = url ? 'Internal browser page' : 'No active page';
      syncCurrentBtn.disabled = true;
    }
  } catch (err) {
    console.error('Failed to inspect active tab:', err);
  }
}

/**
 * Binds and configures the Custom Recipe Wizard actions.
 */
function setupRecipeWizardHandlers(hostname, url, pageTitle) {
  if (isWizardBound) return;
  isWizardBound = true;

  const cleanDomain = hostname.replace(/^(www|app|chat)\./, '');
  const slug = cleanDomain.split('.')[0].toLowerCase().replace(/[^a-z0-9_-]/g, '') || 'custom_ai';
  const displayName = pageTitle.split(/[-|–]/)[0].trim() || slug.toUpperCase();

  function showValidation(type, message) {
    if (!recipeValidationBadge) return;
    recipeValidationBadge.className = `validation-badge ${type}`;
    recipeValidationBadge.classList.remove('hidden');

    const cleanMessage = (message || '')
      .replace(/^[\s✓✔⚠️❌✕!•\-\:]+/, '')
      .trim();

    if (validationIcon) {
      if (type === 'success') {
        validationIcon.innerHTML = '<img src="icons/ui/check.svg" class="ui-svg-icon" alt="Success" />';
      } else if (type === 'warning') {
        validationIcon.innerHTML = '<img src="icons/ui/warning.svg" class="ui-svg-icon" alt="Warning" />';
      } else {
        validationIcon.innerHTML = '<img src="icons/ui/fail.svg" class="ui-svg-icon" alt="Error" />';
      }
    }
    if (validationText) validationText.textContent = cleanMessage;
  }

  async function validateRecipeJson(jsonString) {
    if (!jsonString || !jsonString.trim()) {
      recipeValidationBadge?.classList.add('hidden');
      if (installAndSyncBtn) installAndSyncBtn.disabled = true;
      return null;
    }

    let parsed = null;
    try {
      parsed = JSON.parse(jsonString);
    } catch (e) {
      showValidation('error', 'Invalid JSON syntax: ' + e.message);
      if (installAndSyncBtn) installAndSyncBtn.disabled = true;
      return null;
    }

    // Auto-detect and adapt legacy preconfig manifests or partial schemas
    let modified = false;
    if (!parsed.selectors || typeof parsed.selectors !== 'object') {
      parsed.selectors = {
        inputPrompt: "#prompt-textarea, textarea[placeholder*='ถาม' i], textarea[data-slot='textarea'], textarea, input[placeholder*='ถาม' i], input[placeholder*='Ask' i], div[contenteditable='true'], div[role='textbox']",
        submitButton: "button[data-testid='send-button'], button:has(img[alt='Send']), button[aria-label*='ส่ง' i], button[aria-label*='Send' i], button[type='submit'], form button[type='submit']",
        responseContainer: "[data-message-author-role='assistant'], [data-role='assistant'], div[class*='message-assistant'], div[class*='assistant-message'], div[class*='bot-message'], .message-bubble, main div.items-start, .response-turn",
        textResponse: ".response-content-markdown, .streamdown-chat-md, .markdown, .markdown-content, .prose, .prose-chat, [data-testid='message-text'], [data-testid='response-text']",
        stopButton: "button[data-testid='stop-button'], button[aria-label*='หยุด' i], button[aria-label*='Stop' i]"
      };
      modified = true;
    } else {
      if (!parsed.selectors.inputPrompt) {
        parsed.selectors.inputPrompt = "#prompt-textarea, textarea[placeholder*='ถาม' i], textarea[data-slot='textarea'], textarea, input[placeholder*='ถาม' i], input[placeholder*='Ask' i], div[contenteditable='true'], div[role='textbox']";
        modified = true;
      }
      if (!parsed.selectors.submitButton) {
        parsed.selectors.submitButton = "button[data-testid='send-button'], button:has(img[alt='Send']), button[aria-label*='ส่ง' i], button[aria-label*='Send' i], button[type='submit'], form button[type='submit']";
        modified = true;
      }
    }

    if (!parsed.domain && !parsed.domainMatch) {
      parsed.domain = hostname;
      parsed.domainMatch = hostname;
      modified = true;
    }
    if (!parsed.url) {
      parsed.url = url;
      modified = true;
    }
    if (!parsed.id) {
      parsed.id = slug;
      modified = true;
    }
    if (!parsed.name && !parsed.title) {
      parsed.name = displayName;
      parsed.title = displayName;
      modified = true;
    }

    if (modified) {
      recipeJsonArea.value = JSON.stringify(parsed, null, 2);
    }

    // Test selectors live against active tab
    try {
      if (currentTab?.id && ext?.scripting?.executeScript) {
        const [result] = await ext.scripting.executeScript({
          target: { tabId: currentTab.id },
          func: (inputSel, submitSel, respSel) => {
            return {
              input: Boolean(inputSel && document.querySelector(inputSel)),
              submit: Boolean(submitSel && document.querySelector(submitSel)),
              response: Boolean(respSel && document.querySelector(respSel))
            };
          },
          args: [
            parsed.selectors.inputPrompt,
            parsed.selectors.submitButton,
            parsed.selectors.responseContainer || parsed.selectors.textResponse
          ]
        });

        const checks = result?.result;
        if (checks?.input && checks?.submit) {
          showValidation('success', 'In-tab check passed: inputPrompt and submitButton verified on active page!');
        } else if (checks?.input) {
          showValidation('success', 'In-tab check: inputPrompt verified on active page!');
        } else {
          showValidation('warning', 'inputPrompt selector not found on active page. Check DOM structure.');
        }
      } else {
        showValidation('success', 'Recipe schema valid. Ready to sync.');
      }
    } catch (err) {
      showValidation('success', 'Recipe syntax valid (DOM check unavailable)');
    }

    if (installAndSyncBtn) installAndSyncBtn.disabled = !isTransgenticOnline;
    return parsed;
  }

  // File Upload
  recipeFileInput?.addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const content = ev.target?.result;
      if (typeof content === 'string') {
        recipeJsonArea.value = content;
        validateRecipeJson(content);
      }
    };
    reader.readAsText(file);
  });

  // Load Starter Template
  btnLoadExample?.addEventListener('click', () => {
    const template = {
      id: slug,
      name: displayName,
      domain: hostname,
      url: url,
      selectors: {
        inputPrompt: "#prompt-textarea, textarea[placeholder*='ถาม' i], textarea[data-slot='textarea'], textarea, input[placeholder*='ถาม' i], input[placeholder*='Ask' i], div[contenteditable='true'], div[role='textbox']",
        submitButton: "button[data-testid='send-button'], button:has(img[alt='Send']), button[aria-label*='ส่ง' i], button[aria-label*='Send' i], button[type='submit'], form button[type='submit']",
        responseContainer: "[data-message-author-role='assistant'], [data-role='assistant'], div[class*='message-assistant'], div[class*='assistant-message'], div[class*='bot-message'], .message-bubble, main div.items-start, .response-turn",
        textResponse: ".response-content-markdown, .streamdown-chat-md, .markdown, .markdown-content, .prose, .prose-chat, [data-testid='message-text'], [data-testid='response-text']",
        modelSwitcher: "button[data-testid='model-selector-trigger']",
        stopButton: "button[data-testid='stop-button'], button[aria-label*='หยุด' i], button[aria-label*='Stop' i]"
      },
      responseStructure: {
        textSelector: ".response-content-markdown, .markdown, .prose, [data-testid='message-text']"
      },
      modes: ["general", "coding"],
      author: "Transgentic User"
    };
    recipeJsonArea.value = JSON.stringify(template, null, 2);
    validateRecipeJson(recipeJsonArea.value);
  });

  // Textarea input
  recipeJsonArea?.addEventListener('input', () => {
    validateRecipeJson(recipeJsonArea.value);
  });

  // Action A: Install & Sync
  installAndSyncBtn?.addEventListener('click', async () => {
    const recipe = await validateRecipeJson(recipeJsonArea.value);
    if (!recipe) return;

    installAndSyncBtn.disabled = true;
    installAndSyncBtn.querySelector('.btn-text').textContent = 'Syncing...';
    showStatus('syncing', 'Synchronizing Custom Recipe & Session...', 'Confirm the installation in the Transgentic desktop app.');

    try {
      const targetDomain = recipe.domain || recipe.domainMatch || hostname;
      const targetUrl = recipe.url || url;
      const cookies = await extractAllCookiesForDomain(targetDomain, targetUrl);
      const payload = {
        recipe,
        cookies,
        origin: targetUrl,
        userAgent: navigator.userAgent
      };

      const res = await fetch(LOCAL_RECIPES_INSTALL_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json().catch(() => ({ success: false, error: `HTTP ${res.status}: Server communication error` }));
      if (data.success) {
        // Also call session sync endpoint with the extracted cookies to guarantee full profile mapping & webview reload
        try {
          const selectedValue = accountSelectEl ? accountSelectEl.value : undefined;
          const targetAccountId = (selectedValue && selectedValue !== '__new__' && selectedValue !== 'primary') ? selectedValue : undefined;
          const sessionPayload = {
            provider: data.providerId || recipe.id || slug,
            name: displayName || recipe.name || recipe.title,
            domain: targetDomain,
            targetAccountId: targetAccountId,
            origin: targetUrl,
            url: targetUrl,
            cookies: cookies,
            userAgent: navigator.userAgent
          };
          await sendSessionToTransgentic(sessionPayload);
        } catch (sErr) {
          console.warn('[Popup] Post-install session sync fallback warning:', sErr);
        }

        showStatus('success', 'Custom Recipe & Session Synchronized!', `${data.message || 'Installed successfully'} (${cookies.length} cookies synced)`);
        await loadInstalledRecipes();
        setTimeout(async () => {
          hideStatus();
          await inspectActiveTab();
        }, 1800);
      } else {
        const errorText = formatErrorMessage(data.error) || 'Server rejected recipe installation.';
        showStatus('error', 'Sync Failed', errorText);
        installAndSyncBtn.disabled = false;
        installAndSyncBtn.querySelector('.btn-text').textContent = 'Save Recipe & Sync Session';
      }
    } catch (err) {
      showStatus('error', 'Sync Failed', 'Could not communicate with Transgentic app: ' + formatErrorMessage(err));
      installAndSyncBtn.disabled = false;
      installAndSyncBtn.querySelector('.btn-text').textContent = 'Save Recipe & Sync Session';
    }
  });

  // Action B Option 1: Copy Agentic Preset Prompt
  btnCopyAgenticPrompt?.addEventListener('click', async () => {
    btnCopyAgenticPrompt.disabled = true;
    btnCopyAgenticPrompt.querySelector('span').textContent = '⏳ Extracting DOM...';

    try {
      let domSnippet = '';
      if (currentTab?.id && ext?.scripting?.executeScript) {
        const [result] = await ext.scripting.executeScript({
          target: { tabId: currentTab.id },
          func: () => {
            const clone = document.body.cloneNode(true);
            const removeTags = ['script', 'style', 'svg', 'path', 'iframe', 'noscript', 'img', 'video', 'audio'];
            removeTags.forEach((t) => clone.querySelectorAll(t).forEach((el) => el.remove()));
            const interesting = clone.querySelectorAll('form, textarea, input, button, [contenteditable], [role="textbox"], [data-testid], main, article');
            let s = '';
            interesting.forEach((el) => {
              s += el.outerHTML.slice(0, 400) + '\n';
            });
            return (s.length > 200 ? s : clone.innerHTML).slice(0, 5000);
          }
        });
        domSnippet = result?.result || '';
      }

      const prompt = `You are an expert web automation engineer creating a Transgentic Custom Recipe JSON for:
- Service: ${displayName} (${url})
- Domain: ${hostname}

Transgentic uses JSON recipes to drive autonomous sessions with AI web services without custom code.

Here is the pruned DOM structure of the page:
\`\`\`html
${domSnippet}
\`\`\`

Generate a valid Transgentic Custom Recipe JSON conforming to this schema:
{
  "id": "${slug}",
  "name": "${displayName}",
  "domain": "${hostname}",
  "url": "${url}",
  "selectors": {
    "inputPrompt": "CSS selector for prompt input",
    "submitButton": "CSS selector for submit button",
    "responseContainer": "CSS selector for response container",
    "textResponse": "CSS selector for response text",
    "modelSwitcher": "CSS selector (optional)",
    "stopButton": "CSS selector (optional)"
  },
  "response": {
    "container": "CSS selector for response container",
    "textSelector": "CSS selector for response text",
    "modes": {
      "text": {
        "enabled": true,
        "mediaKind": "text",
        "inputAttachments": {
          "fileInput": "Observed input[type=file] selector",
          "revealSteps": [{ "action": "click", "target": { "selectors": "Stable CSS fallback", "role": "button", "name": ["Exact accessible label"] } }],
          "acceptedKinds": ["image", "document"],
          "multiple": true
        }
      }
    }
  },
  "author": "Agentic Assistant"
}

Only include inputAttachments when upload controls or a native file input are present in the supplied DOM. Store only the minimum reveal clicks and avoid generated framework IDs.
Respond ONLY with valid JSON.`;

      await navigator.clipboard.writeText(prompt);
      btnCopyAgenticPrompt.innerHTML = '<span class="btn-option-icon"><img src="icons/ui/check.svg" class="ui-svg-icon" alt="" /></span><span class="btn-option-text">Copied Prompt to Clipboard!</span>';
      setTimeout(() => {
        btnCopyAgenticPrompt.disabled = false;
        btnCopyAgenticPrompt.innerHTML = '<span class="btn-option-icon"><img src="icons/ui/copy.svg" class="ui-svg-icon" alt="" /></span><span class="btn-option-text">Copy Prompt to Clipboard</span>';
      }, 3000);
    } catch (err) {
      btnCopyAgenticPrompt.disabled = false;
      btnCopyAgenticPrompt.innerHTML = '<span class="btn-option-icon"><img src="icons/ui/fail.svg" class="ui-svg-icon" alt="" /></span><span class="btn-option-text">Failed: ' + err.message + '</span>';
    }
  });

  // Action B Option 2: Local LLM Auto-Detect
  btnAutoDetectSelectors?.addEventListener('click', async () => {
    btnAutoDetectSelectors.disabled = true;
    btnAutoDetectSelectors.innerHTML = '<span class="btn-option-icon"><img src="icons/ui/sync.svg" class="ui-svg-icon spinning" alt="" /></span><span class="btn-option-text" id="btnAutoDetectText">Analyzing DOM with Local LLM...</span>';

    try {
      let domSnippet = '';
      if (currentTab?.id && ext?.scripting?.executeScript) {
        const [result] = await ext.scripting.executeScript({
          target: { tabId: currentTab.id },
          func: () => {
            const clone = document.body.cloneNode(true);
            const removeTags = ['script', 'style', 'svg', 'path', 'iframe', 'noscript'];
            removeTags.forEach((t) => clone.querySelectorAll(t).forEach((el) => el.remove()));
            const interesting = clone.querySelectorAll('form, textarea, input, button, [contenteditable], [role="textbox"], [data-testid], main');
            let s = '';
            interesting.forEach((el) => {
              s += el.outerHTML.slice(0, 400) + '\n';
            });
            return (s.length > 200 ? s : clone.innerHTML).slice(0, 5000);
          }
        });
        domSnippet = result?.result || '';
      }

      const res = await fetch(LOCAL_RECIPES_DETECT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          domSnippet,
          url,
          title: pageTitle
        })
      });

      const data = await res.json();
      if (data.success && data.recipe) {
        recipeJsonArea.value = JSON.stringify(data.recipe, null, 2);
        await validateRecipeJson(recipeJsonArea.value);
        btnAutoDetectSelectors.innerHTML = '<span class="btn-option-icon"><img src="icons/ui/check.svg" class="ui-svg-icon" alt="" /></span><span class="btn-option-text" id="btnAutoDetectText">Selectors Detected!</span>';
      } else {
        btnAutoDetectSelectors.innerHTML = '<span class="btn-option-icon"><img src="icons/ui/warning.svg" class="ui-svg-icon" alt="" /></span><span class="btn-option-text" id="btnAutoDetectText">Detection Failed: ' + (data.error || 'Unknown error') + '</span>';
      }
    } catch (err) {
      btnAutoDetectSelectors.innerHTML = '<span class="btn-option-icon"><img src="icons/ui/fail.svg" class="ui-svg-icon" alt="" /></span><span class="btn-option-text" id="btnAutoDetectText">Error: ' + err.message + '</span>';
    }

    setTimeout(() => {
      btnAutoDetectSelectors.disabled = false;
      btnAutoDetectSelectors.innerHTML = '<span class="btn-option-icon"><img src="icons/ui/sync.svg" class="ui-svg-icon" alt="" /></span><span class="btn-option-text" id="btnAutoDetectText">Auto-Detect with Local LLM</span>';
    }, 3500);
  });

  // Action B Option 3: Launch In-Tab Visual Inspector
  btnLaunchInspector?.addEventListener('click', async () => {
    if (!currentTab?.id) return;
    try {
      await ext.scripting.executeScript({
        target: { tabId: currentTab.id },
        files: ['content/inspectorOverlay.js']
      });
      window.close();
    } catch (err) {
      alert('Could not launch inspector on this page: ' + err.message);
    }
  });
}

/**
 * Robust cookie extraction querying exact domain, dotted domain, apex root domain, and URLs.
 */
async function extractAllCookiesForDomain(targetDomain, targetUrl) {
  const cookieMap = new Map();
  const domainsToQuery = new Set();
  const urlsToQuery = new Set();

  if (targetDomain) {
    const cleanDomain = targetDomain.replace(/^\./, '').split(':')[0].toLowerCase();
    domainsToQuery.add(cleanDomain);
    domainsToQuery.add('.' + cleanDomain);
    const parts = cleanDomain.split('.');
    if (parts.length > 2) {
      const apex = parts.slice(-2).join('.');
      domainsToQuery.add(apex);
      domainsToQuery.add('.' + apex);
    }
  }

  if (targetUrl) {
    urlsToQuery.add(targetUrl);
    try {
      const u = new URL(targetUrl);
      urlsToQuery.add(u.origin);
    } catch {}
  }

  if (currentTab && currentTab.url) {
    urlsToQuery.add(currentTab.url);
    try {
      const cu = new URL(currentTab.url);
      urlsToQuery.add(cu.origin);
    } catch {}
  }

  for (const d of domainsToQuery) {
    try {
      const cookies = await ext.cookies.getAll({ domain: d });
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

  for (const u of urlsToQuery) {
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
 * Extracts cookies for a given provider across its domains and origin URLs.
 */
async function extractProviderCookies(provider) {
  const cookieMap = new Map();

  // 1. Gather all domains explicitly declared on the provider
  const explicitDomains = provider.domains || [];
  for (const d of explicitDomains) {
    const list = await extractAllCookiesForDomain(d, provider.defaultOrigin);
    for (const c of list) {
      cookieMap.set(`${c.domain}:${c.name}:${c.path}`, c);
    }
  }

  // 2. Query service domain & active tab
  if (provider.serviceDomain) {
    const list = await extractAllCookiesForDomain(provider.serviceDomain, provider.defaultOrigin || currentTab?.url);
    for (const c of list) {
      cookieMap.set(`${c.domain}:${c.name}:${c.path}`, c);
    }
  }

  // 3. Fallback to active tab url if available
  if (currentTab && currentTab.url) {
    try {
      const tabCookies = await ext.cookies.getAll({ url: currentTab.url });
      for (const c of (tabCookies || [])) {
        cookieMap.set(`${c.domain}:${c.name}:${c.path}`, {
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
    } catch {}
  }

  return Array.from(cookieMap.values());
}

/**
 * Dispatches session payload to Transgentic local server.
 */
async function sendSessionToTransgentic(payload) {
  const response = await fetch(LOCAL_RECEIVER_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const errorMsg = formatErrorMessage(errorData.error) || formatErrorMessage(errorData.message) || `HTTP ${response.status}: Failed to synchronize session`;
    throw new Error(errorMsg);
  }

  return await response.json();
}

/**
 * Handler for 1-click single provider sync.
 */
async function handleSyncCurrent() {
  if (!currentProvider || !isTransgenticOnline) return;

  setLoadingState(true, `Extracting ${currentProvider.name} cookies...`);

  try {
    const cookies = await extractProviderCookies(currentProvider);
    if (cookies.length === 0) {
      throw new Error(`No cookies found for ${currentProvider.name}. Please ensure you are logged in to your account.`);
    }

    const selectedValue = accountSelectEl.value;
    let targetAccountId = undefined;
    let newAccountAlias = undefined;

    if (selectedValue === '__new__') {
      const customName = newAccountAliasEl.value.trim();
      newAccountAlias = customName || `Browser Profile (${new Date().toLocaleDateString()})`;
    } else if (selectedValue && selectedValue !== 'primary') {
      targetAccountId = selectedValue;
      if (ext?.storage?.local) {
        ext.storage.local.set({ [`preferredAccount_${currentProvider.id}`]: selectedValue });
      }
    }

    const activeOrigin = (currentTab && currentTab.url) ? currentTab.url : currentProvider.defaultOrigin;
    let activeDomain = '';
    try { activeDomain = new URL(activeOrigin).hostname; } catch {}

    const syncName = currentProvider.serviceDomain || activeDomain || currentProvider.name;

    const payload = {
      provider: currentProvider.id,
      name: syncName,
      domain: activeDomain || currentProvider.serviceDomain,
      targetAccountId: targetAccountId,
      newAccountAlias: newAccountAlias,
      origin: activeOrigin,
      url: currentTab?.url || activeOrigin,
      cookies: cookies,
      userAgent: navigator.userAgent,
    };

    if (currentProvider.isCustomRecipe && ext?.storage?.local) {
      ext.storage.local.set({
        [`dynamicDomain_${currentProvider.id}`]: {
          domain: activeDomain || currentProvider.serviceDomain,
          origin: activeOrigin,
        },
      });
    }

    const res = await sendSessionToTransgentic(payload);

    // Reload account list to reflect any newly created profile
    await loadAccountProfiles(currentProvider.id);
    newAccountRowEl.classList.add('hidden');
    newAccountAliasEl.value = '';

    showStatus(
      'success',
      'Session Synchronized!',
      `Successfully injected ${cookies.length} session cookies into Transgentic partition.`,
      `Provider: ${currentProvider.serviceDomain || currentProvider.name} • Saved to: ${newAccountAlias || accountSelectEl.options[accountSelectEl.selectedIndex]?.text}`
    );
  } catch (err) {
    showStatus('error', 'Sync Failed', formatErrorMessage(err), 'Make sure Transgentic is open and running.');
  } finally {
    setLoadingState(false);
  }
}

/**
 * Handler for batch syncing core built-in AI providers.
 */
async function handleSyncAll() {
  if (!isTransgenticOnline) return;

  setLoadingState(true, 'Scanning core AI service cookies in this Chrome profile...');

  const results = [];
  let totalCookies = 0;

  try {
    for (const p of Object.values(PROVIDERS)) {
      if (p.isCustomRecipe) continue;
      try {
        const cookies = await extractProviderCookies(p);
        if (cookies.length > 0) {
          const payload = {
            provider: p.id,
            origin: p.defaultOrigin,
            cookies: cookies,
            userAgent: navigator.userAgent,
          };
          await sendSessionToTransgentic(payload);
          results.push(`${p.name} (${cookies.length})`);
          totalCookies += cookies.length;
        }
      } catch (err) {
        console.warn(`Sync skipped for ${p.name}:`, err);
      }
    }

    if (results.length > 0) {
      showStatus(
        'success',
        'All AI Sessions Synced!',
        `Imported ${totalCookies} cookies across: ${results.join(', ')}`,
        'All active partitions updated.'
      );
    } else {
      showStatus(
        'error',
        'No Sessions Found',
        'No active AI service cookies found in this Chrome profile. Log in to Gemini, ChatGPT, Claude, or Grok in this Chrome profile first.',
        ''
      );
    }
  } catch (err) {
    showStatus('error', 'Batch Sync Error', formatErrorMessage(err), '');
  } finally {
    setLoadingState(false);
  }
}

function formatErrorMessage(err) {
  if (!err) return '';
  if (typeof err === 'string') return err;
  if (Array.isArray(err)) {
    return err.map(e => formatErrorMessage(e)).filter(Boolean).join(', ');
  }
  if (typeof err === 'object') {
    if (err.message && typeof err.message === 'string') return err.message;
    if (err.error && typeof err.error === 'string') return err.error;
    if (err.error && typeof err.error === 'object') return formatErrorMessage(err.error);
    if (Array.isArray(err.errors)) return err.errors.map(e => formatErrorMessage(e)).filter(Boolean).join(', ');
    try {
      const jsonStr = JSON.stringify(err);
      if (jsonStr !== '{}') return jsonStr;
    } catch {}
    return err.toString && err.toString() !== '[object Object]' ? err.toString() : 'An unexpected error occurred';
  }
  return String(err);
}

function setLoadingState(isLoading, message = '') {
  syncCurrentBtn.disabled = isLoading || !currentProvider || !isTransgenticOnline;
  syncAllBtn.disabled = isLoading || !isTransgenticOnline;

  if (isLoading) {
    statusAreaEl.classList.remove('hidden');
    statusAreaEl.className = 'status-area';
    statusIconEl.innerHTML = SYNC_SPIN_SVG_HTML;
    statusTitleEl.textContent = 'Syncing...';
    statusMessageEl.textContent = formatErrorMessage(message);
    statusDetailsEl.textContent = 'Communicating with Transgentic on port 58420';
  }
}

function showStatus(type, title, message, details = '') {
  statusAreaEl.classList.remove('hidden');
  statusAreaEl.className = `status-area ${type === 'error' ? 'error' : (type === 'warning' ? 'warning' : 'success')}`;
  if (type === 'success') {
    statusIconEl.innerHTML = '<img src="icons/ui/check.svg" class="status-svg-icon" alt="Success" />';
  } else if (type === 'warning') {
    statusIconEl.innerHTML = '<img src="icons/ui/warning.svg" class="status-svg-icon" alt="Warning" />';
  } else if (type === 'error') {
    statusIconEl.innerHTML = '<img src="icons/ui/fail.svg" class="status-svg-icon" alt="Error" />';
  } else {
    statusIconEl.innerHTML = SYNC_SPIN_SVG_HTML;
  }

  const rawTitle = typeof title === 'string' ? title : formatErrorMessage(title);
  const cleanTitle = (rawTitle || '').replace(/^[\s✓✔⚠️❌✕!•\-\:]+/, '').trim();
  const cleanMessage = formatErrorMessage(message).replace(/^[\s✓✔⚠️❌✕!•\-\:]+/, '').trim();

  statusTitleEl.textContent = cleanTitle;
  statusMessageEl.textContent = cleanMessage;
  statusDetailsEl.textContent = formatErrorMessage(details);
}

// -------------------------------------------------------------
// Silent Background Auto-Refresh UI Logic
// -------------------------------------------------------------

const BG_STORAGE_KEY_CONFIG = 'background_sync_config';
const BG_DEFAULT_SYNC_CONFIG = {
  services: {
    chatgpt: false,
    claude: false,
    gemini: false,
    grok: false,
  },
  syncIntervalMinutes: 15,
  lastSuccessfulSync: {},
};

async function getBgSyncConfig() {
  try {
    const res = await ext?.storage?.local?.get?.([BG_STORAGE_KEY_CONFIG]);
    if (res && res[BG_STORAGE_KEY_CONFIG]) {
      const stored = res[BG_STORAGE_KEY_CONFIG];
      const interval = (stored.syncIntervalMinutes === 30 || !stored.syncIntervalMinutes) ? 15 : stored.syncIntervalMinutes;
      return {
        ...BG_DEFAULT_SYNC_CONFIG,
        ...stored,
        syncIntervalMinutes: interval,
        services: {
          ...BG_DEFAULT_SYNC_CONFIG.services,
          ...(stored.services || {}),
        },
        lastSuccessfulSync: {
          ...(stored.lastSuccessfulSync || {}),
        },
      };
    }
  } catch (e) {}
  return { ...BG_DEFAULT_SYNC_CONFIG };
}

async function saveBgSyncConfig(config) {
  try {
    await ext?.storage?.local?.set?.({ [BG_STORAGE_KEY_CONFIG]: config });
  } catch (e) {}
}

function formatRelativeTime(timestamp) {
  if (!timestamp) return 'Never';
  const diffMs = Date.now() - timestamp;
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return 'Synced just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `Synced ${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `Synced ${diffHr}h ago`;
  const diffDays = Math.floor(diffHr / 24);
  return `Synced ${diffDays}d ago`;
}

async function initBackgroundSyncUI() {
  const bgSyncHeader = document.getElementById('bgSyncHeader');
  const bgSyncBody = document.getElementById('bgSyncBody');
  const bgSyncChevron = document.getElementById('bgSyncChevron');
  const bgSyncSummaryBadge = document.getElementById('bgSyncSummaryBadge');

  if (!bgSyncHeader || !bgSyncBody) return;

  // Toggle collapsible card
  bgSyncHeader.addEventListener('click', () => {
    bgSyncBody.classList.toggle('collapsed');
    bgSyncChevron.classList.toggle('collapsed');
  });

  const config = await getBgSyncConfig();
  const serviceKeys = ['chatgpt', 'claude', 'gemini', 'grok'];

  // Dynamically render installed custom recipes into the background sync list
  const customContainer = document.getElementById('bgSyncCustomContainer');
  if (customContainer) {
    customContainer.innerHTML = '';
    for (const r of (installedRecipes || [])) {
      const key = r.id.startsWith('custom_') || r.id.startsWith('webview_') ? r.id : `custom_${r.id}`;
      const displayName = r.title || r.name || r.id;
      const displayDomain = r.domainMatch || r.domain || (r.url ? (new URL(r.url).hostname) : 'Custom Webview');
      const row = document.createElement('div');
      row.className = 'bg-sync-row';
      row.innerHTML = `
        <div class="bg-sync-service-meta">
          <span class="bg-sync-service-name">${displayName}</span>
          <span class="bg-sync-service-domain">${displayDomain}</span>
          <span class="bg-sync-service-status" id="bgSyncTime_${key}">Off</span>
        </div>
        <label class="toggle-switch">
          <input type="checkbox" id="bgSyncToggle_${key}" data-service="${key}">
          <span class="toggle-slider"></span>
        </label>
      `;
      customContainer.appendChild(row);
      if (!serviceKeys.includes(key)) {
        serviceKeys.push(key);
      }
    }
  }

  function updateUI() {
    let activeCount = 0;
    for (const key of serviceKeys) {
      const toggleEl = document.getElementById(`bgSyncToggle_${key}`);
      const statusEl = document.getElementById(`bgSyncTime_${key}`);
      const isEnabled = config.services[key] === true;

      if (toggleEl) {
        toggleEl.checked = isEnabled;
      }

      if (statusEl) {
        if (!isEnabled) {
          statusEl.textContent = 'Off';
          statusEl.className = 'bg-sync-service-status';
        } else {
          activeCount++;
          const lastSync = config.lastSuccessfulSync && config.lastSuccessfulSync[key];
          if (lastSync) {
            statusEl.textContent = formatRelativeTime(lastSync);
            statusEl.className = 'bg-sync-service-status synced';
          } else {
            statusEl.textContent = 'Active • Pending sync';
            statusEl.className = 'bg-sync-service-status pending';
          }
        }
      }
    }

    if (bgSyncSummaryBadge) {
      if (activeCount > 0) {
        bgSyncSummaryBadge.textContent = `${activeCount} Active • ${config.syncIntervalMinutes || 15}m`;
        bgSyncSummaryBadge.className = 'badge active';
      } else {
        bgSyncSummaryBadge.textContent = `Disabled • ${config.syncIntervalMinutes || 15}m`;
        bgSyncSummaryBadge.className = 'badge';
      }
    }

    // Synchronize Gemini tip banner state if open
    updateGeminiTipState();
  }

  function updateGeminiTipState() {
    if (!geminiTipBannerEl) return;
    const isGeminiAuto = config.services && config.services.gemini === true;
    if (isGeminiAuto) {
      geminiEnableAutoBtn?.classList.add('hidden');
      geminiAutoActiveBadge?.classList.remove('hidden');
    } else {
      geminiEnableAutoBtn?.classList.remove('hidden');
      geminiAutoActiveBadge?.classList.add('hidden');
    }
  }

  window.updateGeminiTipState = updateGeminiTipState;
  window.refreshBgSyncUI = updateUI;

  // Bind quick enable button in Gemini tip banner
  if (geminiEnableAutoBtn) {
    geminiEnableAutoBtn.addEventListener('click', async () => {
      config.services.gemini = true;
      await saveBgSyncConfig(config);

      const toggleEl = document.getElementById('bgSyncToggle_gemini');
      if (toggleEl) toggleEl.checked = true;

      // Expand background sync body if collapsed so user sees the toggle active
      if (bgSyncBody && bgSyncBody.classList.contains('collapsed')) {
        bgSyncBody.classList.remove('collapsed');
        bgSyncChevron?.classList.remove('collapsed');
      }

      updateUI();

      // Trigger immediate background sync
      try {
        ext?.runtime?.sendMessage?.({ type: 'TRIGGER_SILENT_SYNC' }, () => {
          setTimeout(async () => {
            const refreshed = await getBgSyncConfig();
            config.lastSuccessfulSync = refreshed.lastSuccessfulSync;
            updateUI();
          }, 1200);
        });
      } catch (e) {}
    });
  }

  updateUI();

  // Attach toggle change listeners
  for (const key of serviceKeys) {
    const toggleEl = document.getElementById(`bgSyncToggle_${key}`);
    if (toggleEl) {
      toggleEl.addEventListener('change', async () => {
        config.services[key] = toggleEl.checked;
        await saveBgSyncConfig(config);
        updateUI();

        // If newly enabled, request immediate silent sync from service worker
        if (toggleEl.checked) {
          try {
            ext?.runtime?.sendMessage?.({ type: 'TRIGGER_SILENT_SYNC' }, () => {
              // Refresh timestamps after sync finishes
              setTimeout(async () => {
                const refreshed = await getBgSyncConfig();
                config.lastSuccessfulSync = refreshed.lastSuccessfulSync;
                updateUI();
              }, 1200);
            });
          } catch (e) {}
        }
      });
    }
  }
}
