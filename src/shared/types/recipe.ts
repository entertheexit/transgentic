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
  /** Declared upload controls. Recipes without this remain text-only. */
  inputAttachments?: RecipeAttachmentInput;
}

export interface RecipeElementLocator {
  /** Ordered CSS selector fallbacks. */
  selectors?: SelectorCandidate;
  /** Explicit or implicit ARIA role (for example `button` or `menuitem`). */
  role?: string;
  /** Exact normalized accessible-name alternatives, including localized labels. */
  name?: SelectorCandidate;
  /** Accessible-name comparison. Exact remains the backward-compatible default. */
  nameMatch?: 'exact' | 'contains';
}

export interface RecipeClickStep {
  action: 'click';
  target: RecipeElementLocator;
}

/** Backward-compatible name used by attachment recipes. */
export type RecipeAttachmentRevealStep = RecipeClickStep;

export interface RecipeTemporaryChat {
  /** Native provider temporary/private chat support. */
  enabled: boolean;
  /** Ordered provider UI actions that activate the native mode. */
  activationSteps?: RecipeClickStep[];
  /** Positive proof that the currently open conversation is temporary. */
  activeWhen?: RecipeElementLocator;
  /** Positive proof that a newly opened conversation is in normal mode. */
  inactiveWhen?: RecipeElementLocator;
}

export interface RecipeAttachmentInput {
  /** Native file input element populated through Electron's DevTools protocol. */
  fileInput: SelectorCandidate;
  /** Optional button that reveals or creates the native file input. */
  trigger?: SelectorCandidate;
  /** Ordered UI clicks used only when the native file input is not already usable. */
  revealSteps?: RecipeAttachmentRevealStep[];
  /** Optional selector whose visible element/chip proves upload readiness. */
  ready?: SelectorCandidate;
  /** Optional button used to clear uploaded chips after a pre-submit failure. */
  cleanup?: SelectorCandidate;
  acceptedKinds: Array<'image' | 'document' | 'video'>;
  acceptedMimeTypes?: string[];
  multiple?: boolean;
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
  /** Native provider Temporary Chat activation and verification. */
  temporaryChat?: RecipeTemporaryChat;
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

  const normalizeTextCandidate = (value: unknown): SelectorCandidate | undefined => {
    if (typeof value === 'string') {
      const normalized = value.trim();
      return normalized || undefined;
    }
    if (!Array.isArray(value)) return undefined;
    const normalized = Array.from(new Set(value.map(item => String(item).trim()).filter(Boolean)));
    if (!normalized.length) return undefined;
    return normalized.length === 1 ? normalized[0] : normalized;
  };

  const sanitizeElementLocator = (value: any): RecipeElementLocator | undefined => {
    if (!value || typeof value !== 'object') return undefined;
    const selectors = normalizeSelectorCandidate(value.selectors);
    const role = typeof value.role === 'string' ? value.role.trim().toLowerCase() : '';
    const name = normalizeTextCandidate(value.name);
    const nameMatch = value.nameMatch === 'contains' ? 'contains' : 'exact';
    if (!selectors && !role) return undefined;
    return {
      ...(selectors ? { selectors } : {}),
      ...(role ? { role } : {}),
      ...(name ? { name } : {}),
      ...(name && nameMatch === 'contains' ? { nameMatch } : {}),
    };
  };

  const sanitizeAttachmentInput = (value: any): RecipeAttachmentInput | undefined => {
    if (!value || typeof value !== 'object') return undefined;
    const fileInput = normalizeSelectorCandidate(value.fileInput);
    if (!fileInput) return undefined;
    const acceptedKinds = Array.isArray(value.acceptedKinds)
      ? Array.from(new Set(value.acceptedKinds.filter((kind: unknown) => ['image', 'document', 'video'].includes(String(kind))))) as RecipeAttachmentInput['acceptedKinds']
      : [];
    if (!acceptedKinds.length) return undefined;
    const revealSteps = Array.isArray(value.revealSteps)
      ? value.revealSteps.flatMap((step: any) => {
          const target = step?.action === 'click' ? sanitizeElementLocator(step.target) : undefined;
          return target ? [{ action: 'click' as const, target }] : [];
        })
      : [];
    return {
      fileInput,
      ...(normalizeSelectorCandidate(value.trigger) ? { trigger: normalizeSelectorCandidate(value.trigger) } : {}),
      ...(revealSteps.length ? { revealSteps } : {}),
      ...(normalizeSelectorCandidate(value.ready) ? { ready: normalizeSelectorCandidate(value.ready) } : {}),
      ...(normalizeSelectorCandidate(value.cleanup) ? { cleanup: normalizeSelectorCandidate(value.cleanup) } : {}),
      acceptedKinds,
      ...(Array.isArray(value.acceptedMimeTypes) ? { acceptedMimeTypes: value.acceptedMimeTypes.map(String).map((mime: string) => mime.trim().toLowerCase()).filter(Boolean) } : {}),
      multiple: value.multiple === true,
    };
  };

  const sanitizeTemporaryChat = (value: any): RecipeTemporaryChat | undefined => {
    if (value === undefined) return undefined;
    if (!value || typeof value !== 'object') {
      errors.push('temporaryChat must be an object.');
      return undefined;
    }
    if (typeof value.enabled !== 'boolean') {
      errors.push('temporaryChat.enabled boolean is required.');
      return undefined;
    }
    if (!value.enabled) return { enabled: false };
    if (!Array.isArray(value.activationSteps) || value.activationSteps.length === 0) {
      errors.push('temporaryChat.activationSteps must contain at least one click step when enabled.');
    }
    const activationSteps = Array.isArray(value.activationSteps)
      ? value.activationSteps.flatMap((step: any, index: number) => {
          const target = step?.action === 'click' ? sanitizeElementLocator(step.target) : undefined;
          if (!target) errors.push(`temporaryChat.activationSteps[${index}] requires a click action and a valid target.`);
          return target ? [{ action: 'click' as const, target }] : [];
        })
      : [];
    const activeWhen = sanitizeElementLocator(value.activeWhen);
    const inactiveWhen = sanitizeElementLocator(value.inactiveWhen);
    if (!activeWhen) errors.push('temporaryChat.activeWhen requires selectors or role.');
    if (!inactiveWhen) errors.push('temporaryChat.inactiveWhen requires selectors or role.');
    if (!activationSteps.length || !activeWhen || !inactiveWhen) return undefined;
    return { enabled: true, activationSteps, activeWhen, inactiveWhen };
  };

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
  const temporaryChat = sanitizeTemporaryChat(raw.temporaryChat);

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
      for (const [modeName, modeValue] of Object.entries(raw.response.modes)) {
        const attachmentInput = (modeValue as any)?.inputAttachments;
        if (!attachmentInput) continue;
        if (!normalizeSelectorCandidate(attachmentInput.fileInput)) {
          errors.push(`response.modes.${modeName}.inputAttachments.fileInput selector is required.`);
        }
        if (!Array.isArray(attachmentInput.acceptedKinds) || !attachmentInput.acceptedKinds.some((kind: unknown) => ['image', 'document', 'video'].includes(String(kind)))) {
          errors.push(`response.modes.${modeName}.inputAttachments.acceptedKinds must include image, document, or video.`);
        }
        if (attachmentInput.revealSteps !== undefined) {
          if (!Array.isArray(attachmentInput.revealSteps)) {
            errors.push(`response.modes.${modeName}.inputAttachments.revealSteps must be an array.`);
          } else {
            attachmentInput.revealSteps.forEach((step: any, index: number) => {
              if (step?.action !== 'click') {
                errors.push(`response.modes.${modeName}.inputAttachments.revealSteps[${index}].action must be "click".`);
              }
              if (!sanitizeElementLocator(step?.target)) {
                errors.push(`response.modes.${modeName}.inputAttachments.revealSteps[${index}].target requires selectors or role.`);
              }
            });
          }
        }
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
          ...(sanitizeAttachmentInput(raw.response.modes.text?.inputAttachments) ? { inputAttachments: sanitizeAttachmentInput(raw.response.modes.text.inputAttachments) } : {}),
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
                ...(sanitizeAttachmentInput(raw.response.modes.image.inputAttachments) ? { inputAttachments: sanitizeAttachmentInput(raw.response.modes.image.inputAttachments) } : {}),
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
                ...(sanitizeAttachmentInput(raw.response.modes.video.inputAttachments) ? { inputAttachments: sanitizeAttachmentInput(raw.response.modes.video.inputAttachments) } : {}),
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
                ...(sanitizeAttachmentInput(raw.response.modes.music.inputAttachments) ? { inputAttachments: sanitizeAttachmentInput(raw.response.modes.music.inputAttachments) } : {}),
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
    ...(temporaryChat ? { temporaryChat } : {}),
    ...(raw.newChatUrl ? { newChatUrl: String(raw.newChatUrl).trim() } : {}),
    ...(Array.isArray(raw.resetUrlPatterns) ? { resetUrlPatterns: raw.resetUrlPatterns } : {}),
  };

  return { valid: true, errors: [], recipe: sanitized };
}

export { BUILTIN_RECIPES } from "../generated/builtinRecipes.js";
