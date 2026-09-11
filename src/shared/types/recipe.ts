/**
 * Transgentic Custom Recipe Schema (Version 1.0)
 * Defines strict JSON format for custom site adapters, visual inspector outputs,
 * and built-in provider definitions.
 */

export type RecipeAuthStrategy = 'cookie_sync';

/**
 * A selector can be a single CSS string, or an ordered array of fallback candidates.
 */
export type SelectorCandidate = string | string[];

/**
 * Normalizes a SelectorCandidate to a clean array of non-empty selector strings.
 */
export function normalizeSelectorList(candidate: SelectorCandidate | undefined | null): string[] {
  if (!candidate) return [];
  if (Array.isArray(candidate)) {
    return candidate.map(s => String(s).trim()).filter(s => s.length > 0);
  }
  const str = String(candidate).trim();
  return str.length > 0 ? [str] : [];
}

/**
 * Normalizes a candidate to either a clean single string (if 1 candidate) or string[] (if multiple).
 */
export function normalizeSelectorCandidate(candidate: SelectorCandidate | undefined | null): SelectorCandidate | undefined {
  const list = normalizeSelectorList(candidate);
  if (list.length === 0) return undefined;
  return list.length === 1 ? list[0] : list;
}

/**
 * Resolves a SelectorCandidate into a combined CSS selector (comma separated) for document.querySelector.
 */
export function toCombinedCssSelector(candidate: SelectorCandidate | undefined | null): string {
  return normalizeSelectorList(candidate).join(', ');
}

export interface RecipeSelectors {
  /** CSS selector or fallback list for the chat composer input / contenteditable element */
  inputPrompt: SelectorCandidate;
  /** CSS selector or fallback list for the submit / send prompt button */
  submitButton: SelectorCandidate;
  /** Optional CSS selector or fallback list for stop generation button */
  stopButton?: SelectorCandidate;
  /** Optional CSS selector or fallback list for model selection dropdown trigger */
  modelDropdownTrigger?: SelectorCandidate;
  /** Optional named view context overrides (e.g., newChat, activeChat) */
  contexts?: Record<string, Partial<RecipeSelectors>>;
}

export interface RecipeModeResponse {
  /** Whether this mode is supported / enabled */
  enabled: boolean;
  /** Dedicated route or subpage URL for this mode (e.g. "/imagine", "/video") */
  pageUrl?: string;
  /** Mode-specific prompt input selector override */
  inputSelector?: SelectorCandidate;
  /** Mode-specific submit button selector override */
  submitSelector?: SelectorCandidate;
  /** CSS selector or fallback list for extracted media or content within the message turn */
  contentSelector?: SelectorCandidate;
  /** Optional CSS selector or fallback list for download anchor or button */
  downloadSelector?: SelectorCandidate;
  /** Expected media kind */
  mediaKind?: 'text' | 'image' | 'video' | 'audio';
}

export interface RecipeModes {
  /** Text responses: General conversation & coding */
  text: RecipeModeResponse;
  /** Image generation mode */
  image?: RecipeModeResponse;
  /** Video generation mode */
  video?: RecipeModeResponse;
  /** Music generation mode. Result files may still use audio media formats. */
  music?: RecipeModeResponse;
}

export interface RecipeResponseStructure {
  /** CSS selector or fallback list for the assistant/bot message container */
  container: SelectorCandidate;
  /** Optional CSS selector or fallback list for inner markdown or prose text */
  textSelector?: SelectorCandidate;
  /** Optional CSS selector or fallback list for action buttons (e.g. copy message, regenerate) */
  actionButtons?: SelectorCandidate;
  /** Optional CSS selector or fallback list for active generation or thinking indicators */
  generatingIndicator?: SelectorCandidate;
  /** Selectors of elements to strip during text extraction (thinking accordions, timestamps, etc.) */
  excludeSelectors?: string[];
  /** Mode-specific extraction configurations */
  modes: RecipeModes;
}

export interface RecipeAuthConfig {
  /** Cookie names that indicate an active authenticated session */
  authCookies?: string[];
  /** Cookie domain constraints (e.g. ['grok.com', 'x.ai']) */
  cookieDomains?: string[];
  /** Excluded cookie domains (e.g. ['x.com', 'twitter.com']) */
  excludeCookieDomains?: string[];
  /** Minimum cookie value length for validity (default: 15) */
  minCookieLength?: number;
  /** Whether all specified authCookies must be present simultaneously */
  requireAllCookies?: boolean;
  /** CSS selector(s) confirming user is logged in (e.g. profile button, avatar, user menu) */
  loggedInSelector?: SelectorCandidate;
  /** CSS selector(s) indicating user is logged out (e.g. login button, sign up link, email input) */
  loggedOutSelector?: SelectorCandidate;
  /** Text substrings in document.body indicating logged out state */
  loggedOutTextPatterns?: string[];
  /** Substrings in window.location.href or pathname indicating a login page */
  loginUrls?: string[];
  /** Script tag or element selector containing client bootstrap JSON data (e.g. '#client-bootstrap') */
  clientBootstrapSelector?: string;
}

export interface RecipeRateLimitConfig {
  /** Text substrings in document.body indicating a rate limit notice */
  textPatterns?: string[];
  /** CSS selector for rate limit error banners or alerts */
  selector?: string;
}

export interface RecipeResetUrlRule {
  pattern: string;
  redirectTo: string;
}

export interface CustomRecipeModelDef {
  id: string;
  displayName: string;
  mode?: 'general' | 'coding' | 'image' | 'video' | 'music';
  modes?: string[];
  requiresTier?: string;
}

/** Site-specific model controls are supplied by the recipe, never inferred from a provider catalog. */
export interface RecipeModelSelection {
  trigger?: string;
  item: string;
  name?: string;
  idAttribute?: string;
  tier?: string;
  tabs?: string;
  confirm?: string;
  confirmText?: string;
  close?: string;
  scrollContainer?: string;
}

export interface CustomRecipe {
  modeSchemaVersion?: 2;
  version: string;
  disclaimer?: string;
  disclaimerVersion?: string;
  /** Recorded by the desktop after confirmation; imported values are not proof of consent. */
  disclaimerAcceptance?: { version: string; text: string; acceptedAt: string };
  modelSelection?: RecipeModelSelection;
  /** Unique slug or UUID identifier */
  id: string;
  /** Display title chosen by user */
  title: string;
  /** Optional name alias for title */
  name?: string;
  /** Target hostname or domain pattern (e.g. "portal.enterprise.ai") */
  domainMatch: string;
  /** Optional domain alias */
  domain?: string;
  /** Default entry URL for the service webview */
  url?: string;
  /** Direct URL to open for starting a clean / new chat */
  newChatUrl?: string;
  /** URL pathname patterns that should trigger navigation back to a valid chat view */
  resetUrlPatterns?: RecipeResetUrlRule[];
  /** Core interactive control selectors */
  selectors: RecipeSelectors;
  /** Authentication strategy */
  authStrategy: RecipeAuthStrategy;
  /** Declarative authentication configuration */
  auth?: RecipeAuthConfig;
  /** Declarative rate limiting configuration */
  rateLimit?: RecipeRateLimitConfig;
  /** ISO timestamp of recipe creation */
  createdAt: string;
  /** ISO timestamp of last update */
  updatedAt?: string;
  /** ISO timestamp of last self-healing patch */
  healedAt?: string;
  /** Entity or engine that applied the last patch */
  healer?: 'localllm' | 'visual_inspector' | 'user';
  /** Audit list of changes applied in the latest version */
  changelog?: string[];
  /** Historical versions available */
  previousVersions?: string[];
  /** Response observation & extraction schema */
  response: RecipeResponseStructure;
  /** Optional models supported by this provider */
  models?: CustomRecipeModelDef[];
  /** Optional partition override (e.g. from legacy preconfigs or dedicated profiles) */
  partition?: string;
  /** Optional author metadata */
  author?: string;
}

/**
 * Increments the patch version of a semantic version string (e.g. '1.0' -> '1.0.1', '1.0.1' -> '1.0.2').
 */
export function bumpSemanticVersion(version: string | undefined): string {
  if (!version || typeof version !== 'string') return '1.0.1';
  const parts = version.trim().split('.');
  if (parts.length === 1) {
    return `${parts[0]}.0.1`;
  }
  if (parts.length === 2) {
    return `${parts[0]}.${parts[1]}.1`;
  }
  const patch = parseInt(parts[2], 10);
  if (isNaN(patch)) {
    return `${parts[0]}.${parts[1]}.1`;
  }
  return `${parts[0]}.${parts[1]}.${patch + 1}`;
}

/**
 * Validates whether a raw object adheres to the CustomRecipe schema.
 */
export function validateCustomRecipe(raw: any): { valid: boolean; errors: string[]; recipe?: CustomRecipe } {
  const errors: string[] = [];

  if (!raw || typeof raw !== 'object') {
    return { valid: false, errors: ['Recipe payload must be a non-null object.'] };
  }

  // Gracefully normalize common defaults & aliases for all inputs
  if (!raw.version) raw.version = '1.0';
  if (!raw.authStrategy) raw.authStrategy = 'cookie_sync';
  if (!raw.title && raw.name) raw.title = raw.name;
  if (!raw.domainMatch && raw.domain) raw.domainMatch = raw.domain;
  if (raw.response?.modes && !raw.response.modes.music && raw.response.modes.audio) {
    raw.response.modes.music = raw.response.modes.audio;
    delete raw.response.modes.audio;
  }
  if (Array.isArray(raw.models)) {
    raw.models = raw.models.map((model: any) => ({
      ...model,
      ...(model?.mode === 'audio' ? { mode: 'music' } : {}),
      ...(Array.isArray(model?.modes)
        ? { modes: Array.from(new Set(model.modes.map((mode: string) => mode === 'audio' ? 'music' : mode))) }
        : {}),
    }));
  }
  raw.modeSchemaVersion = 2;

  // Flattened inspector structure: if response is missing but responseContainer or textResponse exists in selectors
  if (!raw.response && (raw.selectors?.responseContainer || raw.selectors?.textResponse || raw.responseStructure?.container)) {
    const container = raw.selectors?.responseContainer || raw.responseStructure?.container || '[data-message-author-role="assistant"], [data-role="assistant"], div[class*="message-assistant"], div[class*="assistant-message"], div[class*="bot-message"], .message-bubble, main div.items-start, .response-turn';
    raw.response = {
      container,
      textSelector: raw.selectors?.textResponse || raw.responseStructure?.textSelector || '.response-content-markdown, .streamdown-chat-md, .markdown, .markdown-content, .prose, .prose-chat, [data-testid="message-text"], [data-testid="response-text"]',
      actionButtons: 'button[aria-label*="Copy" i], button[aria-label*="คัดลอก" i], button[title*="Copy" i], button[title*="คัดลอก" i], button[aria-label*="Download" i], button[title*="Download" i], [data-testid="download-button"], svg[class*="copy" i]',
      generatingIndicator: '[class*="animate-ai-spinner"], .animate-ai-spinner-rotate, .animate-ai-spinner-pulse, [data-testid*="generating-placeholder"], .streaming-indicator',
      excludeSelectors: [
        'details',
        '[data-testid*="thought" i]',
        '[data-testid*="reasoning" i]',
        '.thinking-accordion',
        '.thought-container',
        'sources-list',
        'freemium-rag-disclaimer',
        'footer',
        '[class*="disclaimer" i]',
      ],
      modes: {
        text: { enabled: true, mediaKind: 'text' }
      }
    };
    if (raw.selectors?.imageResult || raw.responseStructure?.imageSelector) {
      raw.response.modes.image = { enabled: true, contentSelector: raw.selectors?.imageResult || raw.responseStructure?.imageSelector, mediaKind: 'image' };
    }
    if (raw.selectors?.videoResult || raw.responseStructure?.videoSelector) {
      raw.response.modes.video = { enabled: true, contentSelector: raw.selectors?.videoResult || raw.responseStructure?.videoSelector, mediaKind: 'video' };
    }
    if (raw.selectors?.audioResult || raw.responseStructure?.audioSelector) {
      raw.response.modes.music = { enabled: true, contentSelector: raw.selectors?.audioResult || raw.responseStructure?.audioSelector, mediaKind: 'audio' };
    }
  }

  // If this payload is a legacy preconfig manifest from backup/disk (has partition or providerType === 'webview', but lacks interactive selectors/response)
  const isPreconfig = Boolean(raw.partition) || (raw.providerType === 'webview' && !raw.selectors?.inputPrompt);
  if (isPreconfig) {
    if (!raw.domainMatch) {
      if (raw.domain) raw.domainMatch = raw.domain;
      else if (raw.url) {
        try { raw.domainMatch = new URL(raw.url).hostname; } catch {}
      }
      if (!raw.domainMatch) raw.domainMatch = 'custom.local';
    }
    const isUnsuitableTitle = (val?: string) => !val || val.toLowerCase().includes('experimental');
    if (isUnsuitableTitle(raw.title)) {
      const fallbackName = (!isUnsuitableTitle(raw.name) ? raw.name : '') ||
                           (!isUnsuitableTitle(raw.company) ? raw.company : '');
      raw.title = fallbackName || (raw.domainMatch !== 'custom.local' ? raw.domainMatch : 'Custom Webview');
    }
    if (!raw.id && raw.title) {
      raw.id = raw.title.toLowerCase().replace(/[^a-z0-9_-]/g, '_');
    }
    if (!raw.selectors || typeof raw.selectors !== 'object') {
      raw.selectors = {};
    }
    if (!raw.selectors.inputPrompt) {
      raw.selectors.inputPrompt = "#prompt-textarea, textarea[placeholder*=\"ถาม\" i], textarea[data-slot=\"textarea\"], textarea, input[placeholder*=\"ถาม\" i], input[placeholder*=\"Ask\" i], div[contenteditable=\"true\"], div[role=\"textbox\"]";
    }
    if (!raw.selectors.submitButton) {
      raw.selectors.submitButton = "button[data-testid=\"send-button\"], button:has(img[alt=\"Send\"]), button[aria-label*=\"ส่ง\" i], button[aria-label*=\"Send\" i], button[type=\"submit\"], form button[type=\"submit\"]";
    }
    if (!raw.selectors.stopButton) {
      raw.selectors.stopButton = "button[data-testid=\"stop-button\"], button[aria-label*=\"หยุด\" i], button[aria-label*=\"Stop\" i]";
    }
    if (!raw.response) {
      raw.response = {
        container: "[data-message-author-role=\"assistant\"], [data-role=\"assistant\"], div[class*=\"message-assistant\"], div[class*=\"assistant-message\"], div[class*=\"bot-message\"], .message-bubble, main div.items-start, .response-turn",
        textSelector: ".response-content-markdown, .streamdown-chat-md, .markdown, .markdown-content, .prose, .prose-chat, [data-testid=\"message-text\"], [data-testid=\"response-text\"]",
        actionButtons: "button[aria-label*=\"Copy\" i], button[aria-label*=\"คัดลอก\" i], button[title*=\"Download\" i], [data-testid=\"download-button\"], svg[class*=\"copy\" i]",
        generatingIndicator: "[class*=\"animate-ai-spinner\"], .animate-ai-spinner-rotate, .animate-ai-spinner-pulse, [data-testid*=\"generating-placeholder\"], .streaming-indicator",
        excludeSelectors: [
          "details",
          "[data-testid*=\"thought\" i]",
          "[data-testid*=\"reasoning\" i]",
          ".thinking-accordion",
          ".thought-container",
          "sources-list",
          "freemium-rag-disclaimer",
          "footer",
          "[class*=\"disclaimer\" i]"
        ],
        modes: {
          text: {
            enabled: true,
            contentSelector: ".response-content-markdown, .markdown, .prose, [data-testid=\"message-text\"]",
            mediaKind: "text"
          },
          image: {
            enabled: true,
            contentSelector: "img[alt*=\"Generated image\" i], img[title*=\"Generated image\" i], img[src*=\"storage.googleapis.com\"], img[src^=\"data:image/\"], img[src^=\"blob:\"], img.generated-image, .markdown-content img",
            mediaKind: "image"
          },
          video: {
            enabled: true,
            contentSelector: "video source, video[src], [data-testid=\"video\"], video, a[data-testid=\"download-button\"], a[download][href*=\"video\"], a[href*=\"download-video\"], a[href*=\"video\"]",
            downloadSelector: "a[data-testid=\"download-button\"], a[download][href*=\"video\"], a[href*=\"download-video\"]",
            mediaKind: "video"
          },
          music: {
            enabled: true,
            contentSelector: "audio, audio source, audio a[href], audio[src], audio[src^=\"blob:\"], audio[src^=\"data:audio/\"], a[download][href*=\"audio\"], a[download][href*=\"music\"], a[href*=\"/music/\"], a[href*=\".mp3\"], a[href*=\"download-audio\"], a[href*=\"download-music\"]",
            downloadSelector: "a[download][href*=\"audio\"], a[download][href*=\"music\"], a[href*=\"download-audio\"]",
            mediaKind: "audio"
          }
        }
      };
    }
  }

  if (!raw.response) {
    raw.response = {
      container: "[data-message-author-role=\"assistant\"], [data-role=\"assistant\"], div[class*=\"message-assistant\"], div[class*=\"assistant-message\"], div[class*=\"bot-message\"], .message-bubble, main div.items-start, .response-turn",
      textSelector: ".response-content-markdown, .streamdown-chat-md, .markdown, .markdown-content, .prose, .prose-chat, [data-testid=\"message-text\"], [data-testid=\"response-text\"]",
      actionButtons: "button[aria-label*=\"Copy\" i], button[aria-label*=\"คัดลอก\" i], button[title*=\"Download\" i], [data-testid=\"download-button\"], svg[class*=\"copy\" i]",
      generatingIndicator: "[class*=\"animate-ai-spinner\"], .animate-ai-spinner-rotate, .animate-ai-spinner-pulse, [data-testid*=\"generating-placeholder\"], .streaming-indicator",
      excludeSelectors: [
        "details",
        "[data-testid*=\"thought\" i]",
        "[data-testid*=\"reasoning\" i]",
        ".thinking-accordion",
        ".thought-container",
        "sources-list",
        "freemium-rag-disclaimer",
        "footer",
        "[class*=\"disclaimer\" i]"
      ],
      modes: {
        text: {
          enabled: true,
          contentSelector: ".response-content-markdown, .markdown, .prose, [data-testid=\"message-text\"]",
          mediaKind: "text"
        },
        image: {
          enabled: true,
          contentSelector: "img[alt*=\"Generated image\" i], img[title*=\"Generated image\" i], img[src*=\"storage.googleapis.com\"], img[src^=\"data:image/\"], img[src^=\"blob:\"], img.generated-image, .markdown-content img",
          mediaKind: "image"
        },
        video: {
          enabled: true,
          contentSelector: "video source, video[src], [data-testid=\"video\"], video, a[data-testid=\"download-button\"], a[download][href*=\"video\"], a[href*=\"download-video\"], a[href*=\"video\"]",
          downloadSelector: "a[data-testid=\"download-button\"], a[download][href*=\"video\"], a[href*=\"download-video\"]",
          mediaKind: "video"
        },
        music: {
          enabled: true,
          contentSelector: "audio, audio source, audio a[href], audio[src], audio[src^=\"blob:\"], audio[src^=\"data:audio/\"], a[download][href*=\"audio\"], a[download][href*=\"music\"], a[href*=\"/music/\"], a[href*=\".mp3\"], a[href*=\"download-audio\"], a[href*=\"download-music\"]",
          downloadSelector: "a[download][href*=\"audio\"], a[download][href*=\"music\"], a[href*=\"download-audio\"]",
          mediaKind: "audio"
        }
      }
    };
  }

  if (!raw.version) {
    raw.version = '1.0.0';
  } else if (typeof raw.version !== 'string' || !/^\d+(\.\d+)*$/.test(String(raw.version).trim())) {
    errors.push('Recipe version must be a valid version string (e.g. "1.0", "1.0.1").');
  }

  if (!raw.id || typeof raw.id !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(raw.id)) {
    errors.push('Recipe id must be a non-empty alphanumeric string (hyphens and underscores allowed).');
  }

  if (!raw.title || typeof raw.title !== 'string' || raw.title.trim().length === 0) {
    errors.push('Recipe title is required and must be a non-empty string.');
  }

  if (!raw.domainMatch || typeof raw.domainMatch !== 'string' || raw.domainMatch.trim().length === 0) {
    errors.push('Recipe domainMatch is required (e.g. "portal.enterprise.ai").');
  }

  if (!raw.selectors || typeof raw.selectors !== 'object') {
    errors.push('Recipe selectors object is required.');
  } else {
    const inputCandidates = normalizeSelectorList(raw.selectors.inputPrompt);
    if (inputCandidates.length === 0) {
      errors.push('selectors.inputPrompt CSS selector is required.');
    }
    const submitCandidates = normalizeSelectorList(raw.selectors.submitButton);
    if (submitCandidates.length === 0) {
      errors.push('selectors.submitButton CSS selector is required.');
    }
  }

  if (raw.authStrategy !== 'cookie_sync') {
    errors.push('authStrategy must be "cookie_sync".');
  }

  if (!raw.response || typeof raw.response !== 'object') {
    errors.push('Recipe response object is required.');
  } else {
    const containerCandidates = normalizeSelectorList(raw.response.container);
    if (containerCandidates.length === 0) {
      errors.push('response.container CSS selector is required.');
    }
    if (!raw.response.modes || typeof raw.response.modes !== 'object') {
      errors.push('response.modes definition object is required.');
    } else {
      if (typeof raw.response.modes.text?.enabled !== 'boolean') {
        errors.push('response.modes.text.enabled boolean is required.');
      }
    }
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  const sanitized: CustomRecipe = {
    modeSchemaVersion: 2,
    version: String(raw.version).trim(),
    ...(typeof raw.disclaimer === 'string' && raw.disclaimer.trim() ? { disclaimer: raw.disclaimer.trim() } : {}),
    ...(typeof raw.disclaimerVersion === 'string' ? { disclaimerVersion: raw.disclaimerVersion.trim() } : {}),
    ...(raw.disclaimerAcceptance && typeof raw.disclaimerAcceptance.version === 'string' && typeof raw.disclaimerAcceptance.text === 'string' && typeof raw.disclaimerAcceptance.acceptedAt === 'string'
      ? { disclaimerAcceptance: { version: raw.disclaimerAcceptance.version, text: raw.disclaimerAcceptance.text, acceptedAt: raw.disclaimerAcceptance.acceptedAt } } : {}),
    ...(raw.modelSelection && typeof raw.modelSelection.item === 'string' && raw.modelSelection.item.trim()
      ? { modelSelection: Object.fromEntries(Object.entries(raw.modelSelection).filter(([key, value]) =>
          ['trigger', 'item', 'name', 'idAttribute', 'tier', 'tabs', 'confirm', 'confirmText', 'close', 'scrollContainer'].includes(key) && typeof value === 'string'
        ).map(([key, value]) => [key, (value as string).trim()])) as unknown as RecipeModelSelection } : {}),
    id: raw.id.trim(),
    title: raw.title.trim(),
    domainMatch: raw.domainMatch.trim().toLowerCase(),
    url: raw.url?.trim() || `https://${raw.domainMatch.trim().toLowerCase()}`,
    selectors: {
      inputPrompt: normalizeSelectorCandidate(raw.selectors.inputPrompt)!,
      submitButton: normalizeSelectorCandidate(raw.selectors.submitButton)!,
      ...(normalizeSelectorCandidate(raw.selectors.stopButton) ? { stopButton: normalizeSelectorCandidate(raw.selectors.stopButton) } : {}),
      ...(normalizeSelectorCandidate(raw.selectors.modelDropdownTrigger) ? { modelDropdownTrigger: normalizeSelectorCandidate(raw.selectors.modelDropdownTrigger) } : {}),
      ...(raw.selectors.contexts && typeof raw.selectors.contexts === 'object' ? { contexts: raw.selectors.contexts } : {}),
    },
    authStrategy: 'cookie_sync',
    createdAt: raw.createdAt || new Date().toISOString(),
    updatedAt: raw.updatedAt || new Date().toISOString(),
    ...(raw.healedAt ? { healedAt: String(raw.healedAt) } : {}),
    ...(raw.healer ? { healer: raw.healer } : {}),
    ...(Array.isArray(raw.changelog) ? { changelog: raw.changelog.map(String) } : {}),
    ...(Array.isArray(raw.previousVersions) ? { previousVersions: raw.previousVersions.map(String) } : {}),
    response: {
      container: normalizeSelectorCandidate(raw.response.container)!,
      textSelector: normalizeSelectorCandidate(raw.response.textSelector),
      actionButtons: normalizeSelectorCandidate(raw.response.actionButtons),
      generatingIndicator: normalizeSelectorCandidate(raw.response.generatingIndicator),
      excludeSelectors: Array.isArray(raw.response.excludeSelectors) ? raw.response.excludeSelectors : [],
      modes: {
        text: {
          enabled: Boolean(raw.response.modes.text?.enabled ?? true),
          contentSelector: normalizeSelectorCandidate(raw.response.modes.text?.contentSelector),
          mediaKind: 'text',
        },
        ...(raw.response.modes.image
          ? {
              image: {
                enabled: Boolean(raw.response.modes.image.enabled),
                pageUrl: raw.response.modes.image.pageUrl?.trim() || undefined,
                inputSelector: normalizeSelectorCandidate(raw.response.modes.image.inputSelector),
                submitSelector: normalizeSelectorCandidate(raw.response.modes.image.submitSelector),
                contentSelector: normalizeSelectorCandidate(raw.response.modes.image.contentSelector),
                downloadSelector: normalizeSelectorCandidate(raw.response.modes.image.downloadSelector),
                mediaKind: 'image' as const,
              },
            }
          : {}),
        ...(raw.response.modes.video
          ? {
              video: {
                enabled: Boolean(raw.response.modes.video.enabled),
                pageUrl: raw.response.modes.video.pageUrl?.trim() || undefined,
                inputSelector: normalizeSelectorCandidate(raw.response.modes.video.inputSelector),
                submitSelector: normalizeSelectorCandidate(raw.response.modes.video.submitSelector),
                contentSelector: normalizeSelectorCandidate(raw.response.modes.video.contentSelector),
                downloadSelector: normalizeSelectorCandidate(raw.response.modes.video.downloadSelector),
                mediaKind: 'video' as const,
              },
            }
          : {}),
        ...(raw.response.modes.music
          ? {
              music: {
                enabled: Boolean(raw.response.modes.music.enabled),
                pageUrl: raw.response.modes.music.pageUrl?.trim() || undefined,
                inputSelector: normalizeSelectorCandidate(raw.response.modes.music.inputSelector),
                submitSelector: normalizeSelectorCandidate(raw.response.modes.music.submitSelector),
                contentSelector: normalizeSelectorCandidate(raw.response.modes.music.contentSelector),
                downloadSelector: normalizeSelectorCandidate(raw.response.modes.music.downloadSelector),
                mediaKind: 'audio' as const,
              },
            }
          : {}),
      },
    },
    models: Array.isArray(raw.models) ? raw.models : [],
    partition: raw.partition ? String(raw.partition).trim() : undefined,
    ...(raw.auth && typeof raw.auth === 'object'
      ? {
          auth: {
            ...(Array.isArray(raw.auth.authCookies) ? { authCookies: raw.auth.authCookies.filter(Boolean) } : {}),
            ...(Array.isArray(raw.auth.cookieDomains) ? { cookieDomains: raw.auth.cookieDomains.filter(Boolean) } : {}),
            ...(Array.isArray(raw.auth.excludeCookieDomains) ? { excludeCookieDomains: raw.auth.excludeCookieDomains.filter(Boolean) } : {}),
            ...(typeof raw.auth.minCookieLength === 'number' ? { minCookieLength: raw.auth.minCookieLength } : {}),
            ...(raw.auth.requireAllCookies !== undefined ? { requireAllCookies: Boolean(raw.auth.requireAllCookies) } : {}),
            ...(normalizeSelectorCandidate(raw.auth.loggedInSelector) ? { loggedInSelector: normalizeSelectorCandidate(raw.auth.loggedInSelector) } : {}),
            ...(normalizeSelectorCandidate(raw.auth.loggedOutSelector) ? { loggedOutSelector: normalizeSelectorCandidate(raw.auth.loggedOutSelector) } : {}),
            ...(Array.isArray(raw.auth.loggedOutTextPatterns) ? { loggedOutTextPatterns: raw.auth.loggedOutTextPatterns.filter(Boolean) } : {}),
            ...(Array.isArray(raw.auth.loginUrls) ? { loginUrls: raw.auth.loginUrls.filter(Boolean) } : {}),
            ...(raw.auth.clientBootstrapSelector ? { clientBootstrapSelector: String(raw.auth.clientBootstrapSelector).trim() } : {}),
          },
        }
      : {}),
    ...(raw.rateLimit && typeof raw.rateLimit === 'object'
      ? {
          rateLimit: {
            ...(Array.isArray(raw.rateLimit.textPatterns) ? { textPatterns: raw.rateLimit.textPatterns.filter(Boolean) } : {}),
            ...(raw.rateLimit.selector ? { selector: String(raw.rateLimit.selector).trim() } : {}),
          },
        }
      : {}),
    ...(raw.newChatUrl ? { newChatUrl: String(raw.newChatUrl).trim() } : {}),
    ...(Array.isArray(raw.resetUrlPatterns) ? { resetUrlPatterns: raw.resetUrlPatterns } : {}),
  };

  return { valid: true, errors: [], recipe: sanitized };
}

/**
 * Built-in recipe templates for the 4 primary providers.
 */
export const BUILTIN_RECIPES: Record<'chatgpt' | 'claude' | 'gemini' | 'grok', CustomRecipe> = {
  chatgpt: {
    modeSchemaVersion: 2,
    version: '1.0',
    id: 'chatgpt',
    title: 'OpenAI ChatGPT',
    domainMatch: 'chatgpt.com',
    url: 'https://chatgpt.com',
    newChatUrl: 'https://chatgpt.com',
    resetUrlPatterns: [
      { pattern: '/projects', redirectTo: '/' }
    ],
    authStrategy: 'cookie_sync',
    auth: {
      authCookies: [
        '__Secure-next-auth.session-token',
        '__Host-next-auth.session-token'
      ],
      minCookieLength: 25,
      loggedInSelector: 'button[data-testid="profile-button"], button[data-testid="user-menu"], #projects-page-search, [data-testid="project-directory-scroll-root"], a[href="/projects"], button[aria-label*="Profile" i], button[aria-label*="Account" i]',
      loggedOutSelector: 'button[data-testid="login-button"], button[data-testid="signup-button"], a[href*="/auth/login"], a[href*="/auth/signup"]',
      loginUrls: ['/auth/login', '/auth/signup'],
      clientBootstrapSelector: '#client-bootstrap'
    },
    rateLimit: {
      textPatterns: [
        "You've reached your limit",
        "Too many requests in 1 hour",
        "Please try again later",
        "Rate limit reached"
      ],
      selector: '[data-testid="request-error-banner"], .text-red-500'
    },
    createdAt: '2026-01-01T00:00:00.000Z',
    selectors: {
      inputPrompt: '#prompt-textarea, div.ProseMirror[contenteditable="true"], textarea, div[contenteditable="true"]',
      submitButton: 'button[data-testid="send-button"], button[aria-label*="Send prompt" i], button[aria-label*="Send" i], button.composer-submit-button-color, button[data-testid="composer-speech-button"] + button',
      stopButton: 'button[data-testid="stop-button"], button[aria-label*="Stop" i]',
      modelDropdownTrigger: '[data-testid="model-selector-button"], button[aria-haspopup="menu"]',
    },
    response: {
      container: '[data-message-author-role="assistant"], div[data-testid^="conversation-turn-"]:not([data-message-author-role="user"]), div.agent-turn',
      textSelector: '.response-content-markdown, .markdown, .prose',
      actionButtons: 'button[data-testid*="copy" i], button[aria-label*="Copy" i], button[aria-label*="Good response" i], button[aria-label*="Bad response" i]',
      generatingIndicator: '[class*="imagegen-loading"], [class*="placeholder-shimmer"], .animate-pulse',
      excludeSelectors: ['details', '[data-testid*="thought" i]', '[data-testid*="reasoning" i]', '.thinking-accordion'],
      modes: {
        text: {
          enabled: true,
          contentSelector: '.response-content-markdown, .markdown, .prose',
          mediaKind: 'text',
        },
        image: {
          enabled: true,
          contentSelector: 'img[src*="backend-api/estuary/content"], img[src*="estuary/content"], img[alt*="Generated image" i], div[class*="imagegen"] img, div[id^="image-"] img, img[src*="dall-e"], img[src*="oaiusercontent"], img.dall-e-image',
          mediaKind: 'image',
        },
        video: {
          enabled: true,
          contentSelector: 'video source, video[src], [data-testid*="video"] video, video, a[download][href*="video"]',
          downloadSelector: 'a[download][href*="video"]',
          mediaKind: 'video',
        },
        music: {
          enabled: true,
          contentSelector: 'audio source, audio[src], [data-testid*="audio"] audio, audio, [data-testid="audio-player"] audio',
          mediaKind: 'audio',
        },
      },
    },
  },
  claude: {
    modeSchemaVersion: 2,
    version: '1.0',
    id: 'claude',
    title: 'Anthropic Claude',
    domainMatch: 'claude.ai',
    url: 'https://claude.ai',
    newChatUrl: 'https://claude.ai/new',
    resetUrlPatterns: [
      { pattern: '/project', redirectTo: '/new' },
      { pattern: '/settings', redirectTo: '/new' }
    ],
    authStrategy: 'cookie_sync',
    auth: {
      authCookies: ['sessionKey'],
      minCookieLength: 20,
      loggedInSelector: 'div.ProseMirror[contenteditable="true"], div[contenteditable="true"], textarea[placeholder*="Claude" i], [data-testid="user-menu"], button[aria-label*="Account" i], button[aria-label*="Profile" i]',
      loggedOutSelector: 'input[type="email"], input[name="email"], input[placeholder*="email" i], a[href*="/login"], a[href*="/signup"], button[data-testid="login-button"]',
      loggedOutTextPatterns: [
        "Question what's next",
        "Continue with Google",
        "Continue with email"
      ],
      loginUrls: ['/login', '/signup']
    },
    rateLimit: {
      textPatterns: [
        "You have reached your Claude message limit",
        "You're out of free messages",
        "Claude is at capacity right now",
        "Rate limit exceeded"
      ]
    },
    createdAt: '2026-01-01T00:00:00.000Z',
    selectors: {
      inputPrompt: 'div.ProseMirror, fieldset div[contenteditable="true"], div[contenteditable="true"], textarea[placeholder*="Claude" i], textarea',
      submitButton: 'button[aria-label*="Send" i], button[type="submit"], button:has(svg)',
      stopButton: 'button[aria-label*="Stop" i], [data-is-streaming="true"]',
      modelDropdownTrigger: 'button[aria-label*="model" i], [data-testid="model-selector"]',
    },
    response: {
      container: '[data-test-render-count] .font-claude-message, .font-claude-message, div.grid-cols-1 .prose, div[data-is-streaming], div.prose',
      textSelector: '.font-claude-message, .prose',
      actionButtons: 'button[aria-label*="Copy" i], button[aria-label*="Copy text" i], button[aria-label*="Retry" i], button[aria-label*="Thumbs up" i]',
      generatingIndicator: '[data-is-streaming="true"], div[data-is-streaming]',
      modes: {
        text: {
          enabled: true,
          contentSelector: '.font-claude-message, .prose',
          mediaKind: 'text',
        },
      },
    },
  },
  gemini: {
    modeSchemaVersion: 2,
    version: '1.0',
    id: 'gemini',
    title: 'Google Gemini',
    domainMatch: 'gemini.google.com',
    url: 'https://gemini.google.com/app',
    newChatUrl: 'https://gemini.google.com/app',
    authStrategy: 'cookie_sync',
    auth: {
      authCookies: ['__Secure-1PSIDTS', '__Secure-3PSIDTS', '__Secure-1PSID', '__Secure-3PSID'],
      cookieDomains: ['google.com'],
      requireAllCookies: false,
      minCookieLength: 20,
      loggedInSelector: 'button[aria-label*="Google Account" i], img[alt*="profile" i], img[alt*="Google Account" i], a[aria-label*="Google Account" i], [data-id="avatar-button"]',
      loggedOutSelector: 'a[href*="accounts.google.com/ServiceLogin"], a[href*="accounts.google.com/signin"], a[aria-label*="Sign in" i], button[aria-label*="Sign in" i], a[data-g-label="sign-in"]',
      loginUrls: ['accounts.google.com/ServiceLogin', 'accounts.google.com/signin']
    },
    rateLimit: {
      textPatterns: [
        "You've reached your limit",
        "Gemini is currently unavailable",
        "Please wait before sending more requests"
      ]
    },
    createdAt: '2026-01-01T00:00:00.000Z',
    selectors: {
      inputPrompt: 'div.ql-editor, rich-textarea textarea, rich-textarea div[contenteditable="true"], div[contenteditable="true"]',
      submitButton: 'button[aria-label*="Send message" i], button[aria-label*="Send prompt" i], button[aria-label*="Send" i], button[aria-label*="ส่ง" i], button.send-button, button[mattooltip*="Send" i]',
      stopButton: 'button[aria-label*="Stop" i], .streaming-indicator',
      modelDropdownTrigger: 'button[aria-label*="model" i], div.model-switcher',
    },
    response: {
      container: 'model-response, response-container, structured-content-container, message-content',
      textSelector: '.response-content-markdown, .markdown, .prose',
      actionButtons: 'button[aria-label*="Copy" i], button[aria-label*="Download" i], copy-button, share-button',
      generatingIndicator: '[data-test-id="image-loading-overlay"]:not(.done-generating), .shimmer-overlay:not(.done-generating)',
      modes: {
        text: {
          enabled: true,
          contentSelector: '.response-content-markdown, .markdown, .prose',
          mediaKind: 'text',
        },
        image: {
          enabled: true,
          contentSelector: 'single-image img.loaded, single-image img[src], generated-image img.loaded, generated-image img[src], .generated-images img',
          downloadSelector: '[data-test-id="download-generated-image-button"]',
          mediaKind: 'image',
        },
        video: {
          enabled: true,
          contentSelector: 'generated-video video, video-player video, video',
          downloadSelector: 'button[aria-label*="Download video" i]',
          mediaKind: 'video',
        },
        music: {
          enabled: true,
          contentSelector: 'generated-music video, generated-music audio, video-player video, audio',
          downloadSelector: 'button[aria-label*="Download track" i]',
          mediaKind: 'audio',
        },
      },
    },
  },
  grok: {
    modeSchemaVersion: 2,
    version: '1.0',
    id: 'grok',
    title: 'xAI Grok',
    domainMatch: 'grok.com',
    url: 'https://grok.com',
    newChatUrl: 'https://grok.com',
    authStrategy: 'cookie_sync',
    auth: {
      authCookies: ['sso', 'sso-rw', '__Secure-next-auth.session-token', 'xai-session'],
      cookieDomains: ['grok.com', 'x.ai'],
      excludeCookieDomains: ['x.com', 'twitter.com'],
      minCookieLength: 25,
      loggedInSelector: 'button[aria-haspopup="menu"], button[aria-label*="user" i], button[aria-label*="profile" i], button[aria-label*="account" i], [data-testid="UserAvatar"], [data-testid="user-avatar"], [data-testid="SideNav_AccountSwitcher_Button"], img[alt*="avatar" i]',
      loggedOutSelector: 'a[href="/login"], a[href="/signin"], a[href="/signup"], button[data-testid="login-button"], button[data-testid="signin-button"], button[data-testid="signup-button"]',
      loginUrls: ['/login', '/signin', '/signup', '/auth/', '/i/flow/login']
    },
    rateLimit: {
      textPatterns: [
        "Rate limit exceeded",
        "You have run out of Grok queries",
        "run out of Grok",
        "Please wait a few moments",
        "You've reached your limit"
      ]
    },
    createdAt: '2026-01-01T00:00:00.000Z',
    selectors: {
      inputPrompt: 'textarea[placeholder*="Ask" i], textarea[placeholder*="Grok" i], textarea[placeholder*="anything" i], textarea[data-id="root"], form textarea, textarea, div[contenteditable="true"], div[role="textbox"]',
      submitButton: 'button[aria-label*="Submit" i], button[aria-label*="Send" i], button[aria-label*="Ask" i], button[aria-label*="Grok" i], button[data-testid*="send" i], button[data-testid*="submit" i], button[type="submit"], form button[type=\"submit\"], form button:not([disabled])',
      stopButton: 'button[aria-label*="Stop" i]',
      modelDropdownTrigger: 'button[aria-label*="Fast" i], button[aria-label*="Grok" i]',
    },
    response: {
      container: '#last-reply-container [id^="response-"], [data-testid="assistant-message"], .response-turn',
      textSelector: '.response-content-markdown, .streamdown-chat-md, main .prose',
      actionButtons: 'button[aria-label*="Copy" i], svg[class*="copy" i]',
      generatingIndicator: '[data-testid*="generating-placeholder"], .animate-pulse',
      modes: {
        text: {
          enabled: true,
          contentSelector: '.response-content-markdown, .streamdown-chat-md, main .prose',
          mediaKind: 'text',
        },
        image: {
          enabled: true,
          contentSelector: 'img[alt*="Generated image" i], img[src*="grok"], img.media-attachment',
          mediaKind: 'image',
        },
        video: {
          enabled: true,
          contentSelector: 'video source, video[src], video',
          mediaKind: 'video',
        },
      },
    },
  },
};
