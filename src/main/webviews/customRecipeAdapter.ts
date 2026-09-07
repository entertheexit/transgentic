import { session } from 'electron';
import { BaseProviderAdapter, ProviderAdapterResult } from './adapterBase.js';
import { ProviderId, TaskMode } from '../../shared/types.js';
import { CustomRecipe, toCombinedCssSelector, RecipeModes } from '../../shared/types/recipe.js';
import { ProjectMetadata } from '../storage/projectManager.js';

/**
 * CustomRecipeAdapter
 * Generic, dynamic webview provider adapter configured purely via CustomRecipe JSON.
 */
export class CustomRecipeAdapter extends BaseProviderAdapter {
  public readonly recipe: CustomRecipe;
  readonly providerId: ProviderId;
  readonly partition: string;

  constructor(recipe: CustomRecipe) {
    super();
    this.recipe = recipe;
    const isBuiltin = ['chatgpt', 'claude', 'gemini', 'grok'].includes(recipe.id);
    this.providerId = (isBuiltin || recipe.id.startsWith('custom_') || recipe.id.startsWith('webview_') ? recipe.id : `custom_${recipe.id}`) as ProviderId;
    this.partition = recipe.partition || (isBuiltin ? `persist:transgentic_${recipe.id}` : (recipe.id.startsWith('custom_') ? `persist:transgentic_${recipe.id}` : `persist:transgentic_custom_${recipe.id}`));
  }

  get name(): string {
    return this.recipe.title || 'Webview Provider';
  }

  get url(): string {
    return this.recipe.url || `https://${this.recipe.domainMatch}`;
  }

  async checkAuthStatus(): Promise<boolean> {
    try {
      const authCfg = this.recipe.auth;
      let webContents = this.getWebContents();
      if (!webContents || webContents.isDestroyed()) {
        const { globalSessionManager } = await import('./sessionManager.js');
        webContents = globalSessionManager.getWebContents(this.providerId);
      }

      // 1. Authoritative DOM inspection if WebContents is active
      if (webContents && !webContents.isDestroyed()) {
        const currentUrl = (webContents.getURL() || '').toLowerCase();
        if (authCfg?.loginUrls && authCfg.loginUrls.length > 0) {
          const isExplicitLoginUrl = authCfg.loginUrls.some((u) => currentUrl.includes(u.toLowerCase()));
          if (isExplicitLoginUrl) {
            return false;
          }
        }

        const domResult = await this.executeScript<boolean | null>(`
          (function() {
            try {
              // 1. Client bootstrap verification (e.g. ChatGPT JSON state)
              const bootstrapSel = ${JSON.stringify(authCfg?.clientBootstrapSelector || null)};
              if (bootstrapSel) {
                const bEl = document.querySelector(bootstrapSel);
                if (bEl && bEl.textContent) {
                  try {
                    const data = JSON.parse(bEl.textContent);
                    if (data && (data.authStatus === 'logged_in' || (data.session && data.session.user) || data.accessToken)) {
                      return true;
                    }
                    if (data && (data.authStatus === 'logged_out' || data.authStatus === 'unauthenticated')) {
                      return false;
                    }
                  } catch (e) {}
                }
              }

              // 2. Explicit logged-out markers
              const loggedOutSel = ${JSON.stringify(toCombinedCssSelector(authCfg?.loggedOutSelector || null))};
              if (loggedOutSel) {
                const hasLoggedOutEl = !!document.querySelector(loggedOutSel);
                if (hasLoggedOutEl) return false;
              }

              const loggedOutTexts = ${JSON.stringify(authCfg?.loggedOutTextPatterns || [])};
              if (loggedOutTexts.length > 0 && document.body) {
                const bodyText = document.body.innerText || '';
                for (const pattern of loggedOutTexts) {
                  if (bodyText.includes(pattern)) return false;
                }
              }

              // 3. Explicit logged-in markers
              const loggedInSel = ${JSON.stringify(toCombinedCssSelector(authCfg?.loggedInSelector || null))};
              if (loggedInSel && !!document.querySelector(loggedInSel)) {
                return true;
              }

              // 4. Default check: is the input prompt present?
              const inputSel = ${JSON.stringify(toCombinedCssSelector(this.recipe.selectors.inputPrompt))};
              if (inputSel && !!document.querySelector(inputSel)) {
                return true;
              }

              return null;
            } catch (e) {
              return null;
            }
          })()
        `);

        if (domResult === true) return true;
        if (domResult === false) return false;
      }

      // 2. Partition cookies check
      const sess = session.fromPartition(this.getActivePartition());
      if (sess) {
        const nowSec = Date.now() / 1000;
        const cookies = await sess.cookies.get({}).catch(() => []);
        if (cookies && cookies.length > 0) {
          if (authCfg?.authCookies && authCfg.authCookies.length > 0) {
            const validAuthCookies = cookies.filter((c: any) => {
              const isNotExpired = !c.expirationDate || c.expirationDate > nowSec;
              if (!isNotExpired) return false;

              if (authCfg.cookieDomains && authCfg.cookieDomains.length > 0) {
                const matchesDomain = authCfg.cookieDomains.some((d) => c.domain && c.domain.includes(d));
                if (!matchesDomain) return false;
              }

              if (authCfg.excludeCookieDomains && authCfg.excludeCookieDomains.length > 0) {
                const isExcluded = authCfg.excludeCookieDomains.some((d) => c.domain && c.domain.includes(d));
                if (isExcluded) return false;
              }

              const minLen = authCfg.minCookieLength ?? 15;
              const val = typeof c.value === 'string' ? c.value : '';
              return val.length >= minLen && val !== 'deleted' && val !== 'null';
            });

            if (authCfg.requireAllCookies) {
              const matchedNames = new Set(validAuthCookies.map((c: any) => c.name));
              return authCfg.authCookies.every((name) => matchedNames.has(name));
            } else {
              return validAuthCookies.some((c: any) =>
                authCfg.authCookies!.some((target) => c.name === target || c.name.startsWith(target + '.'))
              );
            }
          }

          // Fallback heuristic for custom recipes without explicit auth cookie list
          const hasAuth = cookies.some((c: any) =>
            (
              c.name.includes('session') ||
              c.name.includes('token') ||
              c.name.includes('auth') ||
              c.name.includes('id') ||
              c.name.includes('user')
            ) && typeof c.value === 'string' && c.value.length > 8
          );
          if (hasAuth || cookies.length >= 3) {
            return true;
          }
        }
      }

      return false;
    } catch {
      return false;
    }
  }

  async checkRateLimit(): Promise<{ isRateLimited: boolean; reason?: string }> {
    const rateCfg = this.recipe.rateLimit;
    const defaultPatterns = [
      "Rate limit reached",
      "Too many requests",
      "Quota exceeded",
      "You've reached your limit",
      "Rate limit exceeded",
      "Please try again later",
      "Claude is at capacity right now",
      "You have run out of Grok queries",
      "run out of Grok",
      "โควต้าเต็ม",
      "กรุณารอสักครู่"
    ];
    const activePatterns = rateCfg?.textPatterns && rateCfg.textPatterns.length > 0
      ? [...rateCfg.textPatterns, ...defaultPatterns]
      : defaultPatterns;

    try {
      return await this.executeScript<{ isRateLimited: boolean; reason?: string }>(`
        (function() {
          const bodyText = document.body ? (document.body.innerText || '') : '';
          const patterns = ${JSON.stringify(activePatterns)};
          for (const p of patterns) {
            if (bodyText.includes(p)) {
              return { isRateLimited: true, reason: p };
            }
          }
          const selector = ${JSON.stringify(rateCfg?.selector || '[role="alert"], [data-testid="request-error-banner"], .alert-error, .text-red-500')};
          const errorAlert = document.querySelector(selector);
          if (errorAlert && (errorAlert.textContent || '').length > 0) {
            const text = errorAlert.textContent.trim().slice(0, 100);
            if (text.toLowerCase().includes('limit') || text.includes('429') || text.toLowerCase().includes('quota')) {
              return { isRateLimited: true, reason: text };
            }
          }
          return { isRateLimited: false };
        })()
      `);
    } catch {
      return { isRateLimited: false };
    }
  }

  async executePrompt(
    prompt: string,
    mode: TaskMode,
    project?: ProjectMetadata,
    onChunk?: (chunk: string) => void,
    abortSignal?: AbortSignal
  ): Promise<ProviderAdapterResult> {
    // 1. Ensure WebContents is active
    if (!this.webContents || this.webContents.isDestroyed()) {
      const { globalSessionManager } = await import('./sessionManager.js');
      this.webContents = await globalSessionManager.ensureWebContents(this.providerId);
    }

    const modeKey = mode as keyof RecipeModes;
    const modeConfig = this.recipe.response?.modes?.[modeKey];

    // 2. Ensure page is loaded (navigating to mode-specific pageUrl if present)
    const baseEntryUrl = this.url;
    let targetUrl = baseEntryUrl;
    if (modeConfig?.pageUrl) {
      if (modeConfig.pageUrl.startsWith('http://') || modeConfig.pageUrl.startsWith('https://')) {
        targetUrl = modeConfig.pageUrl;
      } else {
        try {
          targetUrl = new URL(modeConfig.pageUrl, baseEntryUrl).toString();
        } catch {
          targetUrl = baseEntryUrl;
        }
      }
    }

    if (targetUrl) {
      try {
        const curUrl = this.webContents.getURL();
        if (!curUrl || curUrl === 'about:blank' || (modeConfig?.pageUrl && !curUrl.includes(modeConfig.pageUrl))) {
          await this.webContents.loadURL(targetUrl);
          await new Promise((r) => setTimeout(r, 1500));
        }
      } catch {}
    }

    const isAuth = await this.checkAuthStatus();
    if (!isAuth) {
      throw new Error(`Custom provider "${this.name}" is not authenticated. Please open the provider drawer to log in or sync cookies.`);
    }

    const rateStatus = await this.checkRateLimit();
    if (rateStatus.isRateLimited) {
      throw new Error(`Provider "${this.name}" is rate limited: ${rateStatus.reason}`);
    }

    // 3. Recover from stranded routes if defined (e.g. /projects or /settings)
    if (this.recipe.resetUrlPatterns && this.recipe.resetUrlPatterns.length > 0) {
      try {
        const curPath = await this.executeScript<string>(`window.location.pathname`).catch(() => '');
        for (const resetRule of this.recipe.resetUrlPatterns) {
          if (curPath && curPath.startsWith(resetRule.pattern)) {
            const redirectUrl = resetRule.redirectTo.startsWith('http')
              ? resetRule.redirectTo
              : new URL(resetRule.redirectTo, this.url).toString();
            await this.webContents.loadURL(redirectUrl);
            await new Promise((r) => setTimeout(r, 600));
            break;
          }
        }
      } catch {}
    }

    // 4. Dispatch prompt into the recipe's inputPrompt selector (or mode override)
    const rawInput = modeConfig?.inputSelector || this.recipe.selectors.inputPrompt;
    const inputSelector = toCombinedCssSelector(rawInput);
    const inputResult = await this.dispatchRealisticInput(inputSelector, prompt);

    if (!inputResult?.success) {
      throw new Error(`Failed to inject prompt into "${this.name}": ${inputResult?.error || 'Target input not found'}`);
    }

    // 4. Humanized delay before submitting to ensure editor updates state
    await new Promise((r) => setTimeout(r, 250));

    // 5. Submit prompt via single-action idempotent dispatcher
    const rawSubmit = modeConfig?.submitSelector || this.recipe.selectors.submitButton;
    const submitSelector = toCombinedCssSelector(rawSubmit);
    await this.dispatchRealisticSubmit(submitSelector, inputSelector);

    // Short buffer for page to register submission and begin streaming
    await new Promise((r) => setTimeout(r, 600));

    // 5. Polling with dynamic timeout budget
    return await this.pollGeneration({
      mode,
      metadata: project,
      onChunk,
      abortSignal,
    });
  }
}
