import { session } from 'electron';
import { BaseProviderAdapter, ProviderAdapterResult } from './adapterBase.js';
import { ProviderId, TaskMode } from '../../shared/types.js';
import { CustomRecipe, normalizeSelectorList, toCombinedCssSelector, RecipeModes, RecipeAttachmentRevealStep, SelectorCandidate } from '../../shared/types/recipe.js';
import { ProjectMetadata } from '../storage/projectManager.js';
import type { StagedAttachment } from '../../shared/attachments.js';

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
    abortSignal?: AbortSignal,
    attachments: readonly StagedAttachment[] = []
  ): Promise<ProviderAdapterResult> {
    // 1. Ensure WebContents is active
    if (!this.webContents || this.webContents.isDestroyed()) {
      const { globalSessionManager } = await import('./sessionManager.js');
      this.webContents = await globalSessionManager.ensureWebContents(this.providerId);
    }

    const modeKey = (mode === 'general' || mode === 'writing' || mode === 'coding' ? 'text' : mode) as keyof RecipeModes;
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

    const upload = modeConfig?.inputAttachments;
    let attached = false;
    let submitted = false;
    try {
      if (attachments.length) {
        if (!upload) throw new Error(`Provider "${this.name}" does not declare attachment upload support for ${mode} mode.`);
        const unsupported = attachments.find(file => {
          const mimeAccepted = !upload.acceptedMimeTypes?.length || upload.acceptedMimeTypes.some(pattern => pattern === file.mimeType || (pattern.endsWith('/*') && file.mimeType.startsWith(pattern.slice(0, -1))));
          return !upload.acceptedKinds.includes(file.kind) || !mimeAccepted;
        });
        if (unsupported) throw new Error(`Provider "${this.name}" does not accept ${unsupported.mimeType} attachments in ${mode} mode.`);
        if (!upload.multiple && attachments.length > 1) throw new Error(`Provider "${this.name}" accepts only one attachment in ${mode} mode.`);
        attached = true;
        await this.attachFiles(upload, attachments, abortSignal);
      }

      // Dispatch only after every attachment is present and ready.
      const rawInput = modeConfig?.inputSelector || this.recipe.selectors.inputPrompt;
      const inputSelector = toCombinedCssSelector(rawInput);
      const inputResult = await this.dispatchRealisticInput(inputSelector, prompt);
      if (!inputResult?.success) throw new Error(`Failed to inject prompt into "${this.name}": ${inputResult?.error || 'Target input not found'}`);
      await new Promise((r) => setTimeout(r, 250));

      const rawSubmit = modeConfig?.submitSelector || this.recipe.selectors.submitButton;
      const submitSelector = toCombinedCssSelector(rawSubmit);
      await this.dispatchRealisticSubmit(submitSelector, inputSelector);
      submitted = true;
    } catch (error) {
      if (attached && !submitted) await this.clearAttachedFiles(upload).catch(() => {});
      throw error;
    }

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

  private async attachFiles(upload: NonNullable<RecipeModes[keyof RecipeModes]>['inputAttachments'], attachments: readonly StagedAttachment[], abortSignal?: AbortSignal): Promise<void> {
    if (!upload || !this.webContents) throw new Error('Attachment upload controls are unavailable.');
    if (abortSignal?.aborted) { const error = new Error('Request cancelled.'); error.name = 'AbortError'; throw error; }
    const debuggerApi = this.webContents.debugger;
    const attachedHere = !debuggerApi.isAttached();
    let chooserBackendNodeId: number | undefined;
    const chooserListener = (_event: unknown, method: string, params: any) => {
      if (method === 'Page.fileChooserOpened' && typeof params?.backendNodeId === 'number') {
        chooserBackendNodeId = params.backendNodeId;
      }
    };
    try {
      if (attachedHere) debuggerApi.attach('1.3');
      if (typeof debuggerApi.on === 'function') debuggerApi.on('message', chooserListener);
      await debuggerApi.sendCommand('Page.enable').catch(() => {});
      await debuggerApi.sendCommand('Page.setInterceptFileChooserDialog', { enabled: true }).catch(() => {});

      let input = await this.findDeclaredFileInput(debuggerApi, upload.fileInput);
      if (!input.nodeId) {
        const revealSteps: RecipeAttachmentRevealStep[] = upload.revealSteps?.length
          ? upload.revealSteps
          : upload.trigger
            ? [{ action: 'click', target: { selectors: upload.trigger } }]
            : [];
        for (const step of revealSteps) {
          await this.executeAttachmentRevealStep(step, abortSignal);
        }
        if (revealSteps.length && !chooserBackendNodeId) input = await this.waitForDeclaredFileInput(debuggerApi, upload.fileInput, abortSignal);
      }

      let setFileParams: Record<string, unknown> | undefined;
      if (chooserBackendNodeId) {
        const chooserMatches = await this.backendNodeMatchesFileInput(debuggerApi, chooserBackendNodeId, upload.fileInput);
        if (!chooserMatches) throw new Error(`The file chooser opened by "${this.name}" did not match the declared attachment input.`);
        setFileParams = { backendNodeId: chooserBackendNodeId };
      } else if (input.nodeId) {
        setFileParams = { nodeId: input.nodeId };
      }
      if (!setFileParams) {
        const suffix = input.ambiguous ? ' matched multiple inputs' : ' was not found';
        throw new Error(`Attachment file input${suffix} for "${this.name}".`);
      }
      await debuggerApi.sendCommand('DOM.setFileInputFiles', { ...setFileParams, files: attachments.map(file => file.path) });
    } finally {
      await debuggerApi.sendCommand('Page.setInterceptFileChooserDialog', { enabled: false }).catch(() => {});
      if (typeof debuggerApi.removeListener === 'function') debuggerApi.removeListener('message', chooserListener);
      if (attachedHere && debuggerApi.isAttached()) debuggerApi.detach();
    }

    const selector = toCombinedCssSelector(upload.fileInput);
    const readySelector = toCombinedCssSelector(upload.ready);
    const deadline = Date.now() + 15_000;
    while (Date.now() < deadline) {
      if (abortSignal?.aborted) { const error = new Error('Request cancelled.'); error.name = 'AbortError'; throw error; }
      const ready = await this.executeScript<boolean>(`(function(){const input=document.querySelector(${JSON.stringify(selector)});if(!input||!input.files||input.files.length!==${attachments.length})return false;const readySel=${JSON.stringify(readySelector)};if(!readySel)return true;const nodes=[...document.querySelectorAll(readySel)];return nodes.length>=${attachments.length}&&nodes.every(el=>{const s=getComputedStyle(el);return s.display!=='none'&&s.visibility!=='hidden'})})()`).catch(() => false);
      if (ready) return;
      await new Promise(resolve => setTimeout(resolve, 150));
    }
    throw new Error(`Provider "${this.name}" did not confirm attachment readiness before submission.`);
  }

  private async findDeclaredFileInput(debuggerApi: any, candidate: SelectorCandidate): Promise<{ nodeId?: number; ambiguous?: boolean }> {
    const documentNode: any = await debuggerApi.sendCommand('DOM.getDocument', { depth: 0, pierce: true });
    let ambiguous = false;
    for (const selector of normalizeSelectorList(candidate)) {
      let queried: any;
      try {
        queried = await debuggerApi.sendCommand('DOM.querySelectorAll', { nodeId: documentNode.root.nodeId, selector });
      } catch {
        const single = await debuggerApi.sendCommand('DOM.querySelector', { nodeId: documentNode.root.nodeId, selector }).catch(() => ({}));
        queried = { nodeIds: single?.nodeId ? [single.nodeId] : [] };
      }
      const usable: number[] = [];
      for (const nodeId of queried?.nodeIds || []) {
        const described: any = await debuggerApi.sendCommand('DOM.describeNode', { nodeId }).catch(() => null);
        const node = described?.node;
        const attrs = Array.isArray(node?.attributes) ? node.attributes : [];
        const attrMap = new Map<string, string>();
        for (let index = 0; index < attrs.length; index += 2) attrMap.set(String(attrs[index]).toLowerCase(), String(attrs[index + 1] ?? ''));
        if (String(node?.nodeName || '').toLowerCase() === 'input' && attrMap.get('type')?.toLowerCase() === 'file' && !attrMap.has('disabled')) usable.push(nodeId);
      }
      if (usable.length === 1) return { nodeId: usable[0] };
      if (usable.length > 1) ambiguous = true;
    }
    return { ambiguous };
  }

  private async waitForDeclaredFileInput(debuggerApi: any, candidate: SelectorCandidate, abortSignal?: AbortSignal): Promise<{ nodeId?: number; ambiguous?: boolean }> {
    const deadline = Date.now() + 5_000;
    let last: { nodeId?: number; ambiguous?: boolean } = {};
    while (Date.now() < deadline) {
      if (abortSignal?.aborted) { const error = new Error('Request cancelled.'); error.name = 'AbortError'; throw error; }
      last = await this.findDeclaredFileInput(debuggerApi, candidate);
      if (last.nodeId || last.ambiguous) return last;
      await new Promise(resolve => setTimeout(resolve, 125));
    }
    return last;
  }

  private async backendNodeMatchesFileInput(debuggerApi: any, backendNodeId: number, candidate: SelectorCandidate): Promise<boolean> {
    try {
      const resolved: any = await debuggerApi.sendCommand('DOM.resolveNode', { backendNodeId });
      if (!resolved?.object?.objectId) return false;
      const checked: any = await debuggerApi.sendCommand('Runtime.callFunctionOn', {
        objectId: resolved.object.objectId,
        functionDeclaration: `function(selectors){return this instanceof HTMLInputElement&&this.type==='file'&&!this.disabled&&selectors.some(selector=>{try{return this.matches(selector)}catch{return false}})}`,
        arguments: [{ value: normalizeSelectorList(candidate) }],
        returnByValue: true,
      });
      return checked?.result?.value === true;
    } catch {
      return false;
    }
  }

  private async executeAttachmentRevealStep(step: RecipeAttachmentRevealStep, abortSignal?: AbortSignal): Promise<void> {
    const deadline = Date.now() + 5_000;
    while (Date.now() < deadline) {
      if (abortSignal?.aborted) { const error = new Error('Request cancelled.'); error.name = 'AbortError'; throw error; }
      const result = await this.executeScript<{ success: boolean; missing?: boolean; ambiguous?: boolean }>(`
        (function() {
          const locator = ${JSON.stringify(step.target)};
          const normalize = value => String(value || '').replace(/\\s+/g, ' ').trim().toLocaleLowerCase();
          const names = (Array.isArray(locator.name) ? locator.name : locator.name ? [locator.name] : []).map(normalize);
          const implicitRole = el => {
            const explicit = el.getAttribute('role');
            if (explicit) return explicit.toLowerCase();
            if (el.tagName === 'BUTTON') return 'button';
            if (el.tagName === 'A' && el.hasAttribute('href')) return 'link';
            if (el.tagName === 'INPUT' && ['button', 'submit', 'reset'].includes((el.type || '').toLowerCase())) return 'button';
            return '';
          };
          const accessibleNames = el => {
            const labelledBy = (el.getAttribute('aria-labelledby') || '').split(/\\s+/).filter(Boolean).map(id => document.getElementById(id)?.textContent || '');
            const associated = el.labels ? Array.from(el.labels).map(label => label.textContent || '') : [];
            return [el.getAttribute('aria-label'), el.getAttribute('title'), ...labelledBy, ...associated, el.textContent].filter(Boolean).map(normalize);
          };
          const visible = el => {
            const style = getComputedStyle(el);
            const rect = el.getBoundingClientRect();
            return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity || 1) !== 0 && rect.width > 0 && rect.height > 0;
          };
          const selectorCandidates = Array.isArray(locator.selectors) ? locator.selectors : locator.selectors ? [locator.selectors] : [];
          const pools = selectorCandidates.length ? selectorCandidates.map(selector => { try { return Array.from(document.querySelectorAll(selector)); } catch { return []; } }) : [Array.from(document.querySelectorAll(locator.role === 'button' ? 'button,[role="button"]' : '[role="' + CSS.escape(locator.role || '') + '"]'))];
          for (const pool of pools) {
            const matches = pool.filter(el => {
              if (locator.role && implicitRole(el) !== String(locator.role).toLowerCase()) return false;
              if (names.length && !accessibleNames(el).some(value => names.includes(value))) return false;
              return visible(el) && !el.disabled && el.getAttribute('aria-disabled') !== 'true';
            });
            if (matches.length > 1) return { success: false, ambiguous: true };
            if (matches.length === 1) {
              matches[0].scrollIntoView({ block: 'nearest', inline: 'nearest' });
              matches[0].click();
              return { success: true };
            }
          }
          return { success: false, missing: true };
        })()
      `).catch(() => ({ success: false, missing: true } as { success: boolean; missing?: boolean; ambiguous?: boolean }));
      if (result.success) return;
      if (result.ambiguous) throw new Error(`Attachment reveal control was ambiguous for "${this.name}".`);
      await new Promise(resolve => setTimeout(resolve, 125));
    }
    throw new Error(`Attachment reveal control was not found for "${this.name}".`);
  }

  private async clearAttachedFiles(upload?: NonNullable<RecipeModes[keyof RecipeModes]>['inputAttachments']): Promise<void> {
    if (!upload) return;
    const cleanup = toCombinedCssSelector(upload.cleanup);
    const input = toCombinedCssSelector(upload.fileInput);
    await this.executeScript(`(function(){const cleanup=${JSON.stringify(cleanup)};if(cleanup){for(const el of document.querySelectorAll(cleanup))el.click()}const input=document.querySelector(${JSON.stringify(input)});if(input){try{input.value='';input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}))}catch{}}try{document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',code:'Escape',bubbles:true}));document.dispatchEvent(new KeyboardEvent('keyup',{key:'Escape',code:'Escape',bubbles:true}))}catch{}})()`);
  }
}
