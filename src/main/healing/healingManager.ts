import * as fs from 'fs';
import * as path from 'path';
import { app, WebContents } from 'electron';
import { DomInspectionReport, DomWatchdog } from './domWatchdog.js';
import { HealingConfig, LocalLLMConfig, ProviderId, TransgenticConfig } from '../../shared/types.js';
import { DynamicRouter } from '../mcp/router.js';
import { LocalLlmClient } from '../localllm/localLlmClient.js';
import { globalRateLimiter } from '../mcp/rateLimiter.js';
import { globalRecipeManager } from '../registry/recipeManager.js';
import { toCombinedCssSelector } from '../../shared/types/recipe.js';

export class HealingManager {
  private static instance: HealingManager | null = null;

  public static getInstance(): HealingManager {
    if (!this.instance) {
      this.instance = new HealingManager();
    }
    return this.instance;
  }

  private config: HealingConfig = {
    autoHealingEnabled: true,
    checkIntervalMinutes: 60,
    checkOnPageLoad: true,
    checkModelSelector: true,
  };

  private localLLMConfig: LocalLLMConfig = {
    enabled: false,
    preset: 'ollama',
    baseUrl: 'http://127.0.0.1:11434',
    selectedModel: '',
    temperature: 0.2,
    contextLength: 8192,
    localMicroTask: false,
    localZeroLeak: false,
    localCompact: false,
    compactThresholdChars: 4000,
  };

  // Cached DOM audit reports
  private reports: Map<ProviderId, DomInspectionReport> = new Map();

  // Custom repaired selectors discovered by the Self-Healing engine
  private customSelectors: Map<
    ProviderId,
    Partial<Record<'inputPrompt' | 'submitButton' | 'stopButton' | 'modelDropdownTrigger', string>>
  > = new Map();

  private listeners: Array<(reports: Record<string, DomInspectionReport>) => void> = [];

  constructor() {
    this.loadPersistedData();
  }

  private getStoragePath(): string {
    try {
      if (app && typeof app.getPath === 'function') {
        return path.join(app.getPath('userData'), 'dom_healing_reports.json');
      }
    } catch {}
    return '';
  }

  public loadPersistedData(): void {
    try {
      const filePath = this.getStoragePath();
      if (!filePath) return;
      if (fs.existsSync(filePath)) {
        const raw = fs.readFileSync(filePath, 'utf-8');
        const data = JSON.parse(raw);
        if (data.reports && typeof data.reports === 'object') {
          for (const [k, v] of Object.entries(data.reports)) {
            this.reports.set(k as ProviderId, v as DomInspectionReport);
          }
        }
        if (data.customSelectors && typeof data.customSelectors === 'object') {
          for (const [k, v] of Object.entries(data.customSelectors)) {
            this.customSelectors.set(k as ProviderId, v as any);
          }
        }
      }
    } catch (e) {
      console.warn('[HealingManager] Failed to load persisted reports:', e);
    }
  }

  public savePersistedData(): void {
    try {
      const filePath = this.getStoragePath();
      if (!filePath) return;
      const data = {
        reports: Object.fromEntries(this.reports.entries()),
        customSelectors: Object.fromEntries(this.customSelectors.entries()),
      };
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
    } catch (e) {
      console.warn('[HealingManager] Failed to save persisted reports:', e);
    }
  }

  public updateConfig(healingCfg: Partial<HealingConfig>, localLlmCfg?: Partial<LocalLLMConfig>): HealingConfig {
    this.config = { ...this.config, ...healingCfg };
    if (localLlmCfg) {
      this.localLLMConfig = { ...this.localLLMConfig, ...localLlmCfg };
    }
    return { ...this.config };
  }

  private fullConfig?: TransgenticConfig;

  public setTransgenticConfig(fullConfig: TransgenticConfig): void {
    this.fullConfig = fullConfig;
    if (fullConfig.healing) {
      this.config = { ...this.config, ...fullConfig.healing };
    }
    if (fullConfig.localLLM) {
      this.localLLMConfig = { ...this.localLLMConfig, ...fullConfig.localLLM };
    }
  }

  public getConfig(): HealingConfig {
    return { ...this.config };
  }

  public getCustomSelectors(
    providerId: ProviderId
  ): Partial<Record<'inputPrompt' | 'submitButton' | 'stopButton' | 'modelDropdownTrigger', string>> {
    const fromStore = this.customSelectors.get(providerId) || {};
    try {
      const recipe = globalRecipeManager.getRecipe(providerId);
      if (recipe?.selectors) {
        return {
          inputPrompt: fromStore.inputPrompt || toCombinedCssSelector(recipe.selectors.inputPrompt) || undefined,
          submitButton: fromStore.submitButton || toCombinedCssSelector(recipe.selectors.submitButton) || undefined,
          stopButton: fromStore.stopButton || toCombinedCssSelector(recipe.selectors.stopButton) || undefined,
          modelDropdownTrigger: fromStore.modelDropdownTrigger || toCombinedCssSelector(recipe.selectors.modelDropdownTrigger) || undefined,
        };
      }
    } catch {}
    return fromStore;
  }

  public setCustomSelectors(
    providerId: ProviderId,
    selectors: Partial<Record<'inputPrompt' | 'submitButton' | 'stopButton' | 'modelDropdownTrigger', string>>
  ): void {
    const existing = this.customSelectors.get(providerId) || {};
    this.customSelectors.set(providerId, { ...existing, ...selectors });
    this.savePersistedData();
  }

  public saveRepairedSelector(
    providerId: ProviderId,
    landmark: 'inputPrompt' | 'submitButton' | 'stopButton' | 'modelDropdownTrigger',
    selector: string
  ): void {
    this.setCustomSelectors(providerId, { [landmark]: selector });
  }

  public getReport(providerId: ProviderId): DomInspectionReport | undefined {
    return this.reports.get(providerId);
  }

  public getAllReports(): Record<string, DomInspectionReport> {
    const res: Record<string, DomInspectionReport> = {};
    for (const [k, v] of this.reports.entries()) {
      res[k] = v;
    }
    return res;
  }

  public onUpdate(callback: (reports: Record<string, DomInspectionReport>) => void): () => void {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== callback);
    };
  }

  private notifyListeners(): void {
    const all = this.getAllReports();
    for (const l of this.listeners) {
      try {
        l(all);
      } catch {}
    }
  }

  /**
   * Derives resolution sequence for DOM Self-Healing:
   * Self-Healing runs EXCLUSIVELY through Local LLM (Ollama / LM Studio)
   * to prevent cloud AI safety policy refusals and webview chat history pollution.
   */
  public deriveHealingSequence(brokenProviderId?: ProviderId): ProviderId[] {
    if (this.localLLMConfig?.enabled) {
      return ['localllm'];
    }
    return [];
  }

  /**
   * Audits a provider's WebContents DOM landmarks.
   */
  public async auditProvider(providerId: ProviderId, webContents?: WebContents | null): Promise<DomInspectionReport> {
    let contents = webContents;
    if (!contents) {
      const { globalSessionManager } = await import('../webviews/sessionManager.js');
      try {
        contents = await globalSessionManager.ensureWebContents(providerId);
      } catch {
        contents = globalSessionManager.getWebContents(providerId);
      }
    }

    const { globalRecipeManager } = await import('../registry/recipeManager.js');
    const recipe = globalRecipeManager.getRecipe(providerId);
    const attachmentConfigs = recipe
      ? Object.fromEntries(Object.entries(recipe.response.modes).flatMap(([mode, config]) => config?.inputAttachments ? [[mode, config.inputAttachments]] : []))
      : {};
    const debuggerApi = (contents as any)?.debugger;
    const attachedHere = Boolean(debuggerApi && !debuggerApi.isAttached());
    try {
      if (attachedHere) debuggerApi.attach('1.3');
      if (debuggerApi?.sendCommand) {
        await debuggerApi.sendCommand('Page.enable').catch(() => {});
        await debuggerApi.sendCommand('Page.setInterceptFileChooserDialog', { enabled: true }).catch(() => {});
      }
      const report = await DomWatchdog.audit(
        providerId,
        contents as any,
        { checkModelSelector: this.config.checkModelSelector },
        this.getCustomSelectors(providerId),
        attachmentConfigs
      );

      this.reports.set(providerId, report);
      this.savePersistedData();
      this.notifyListeners();
      return report;
    } finally {
      if ((contents as any)?.executeJavaScript) {
        await (contents as any).executeJavaScript(`(function(){try{document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',code:'Escape',bubbles:true}));document.dispatchEvent(new KeyboardEvent('keyup',{key:'Escape',code:'Escape',bubbles:true}))}catch{}})()`, true).catch(() => {});
      }
      if (debuggerApi?.sendCommand) await debuggerApi.sendCommand('Page.setInterceptFileChooserDialog', { enabled: false }).catch(() => {});
      if (attachedHere && debuggerApi?.isAttached()) debuggerApi.detach();
    }
  }

  /**
   * Executes DOM Self-Healing for a broken provider by cascading through
   * the Coding Mode Pipeline (Primary -> Fallbacks -> Local LLM).
   */
  public async healProvider(
    brokenProviderId: ProviderId,
    webContents?: WebContents | null
  ): Promise<{
    success: boolean;
    healerUsed?: ProviderId;
    repairedSelectors?: Partial<Record<'inputPrompt' | 'submitButton' | 'stopButton' | 'modelDropdownTrigger', string>>;
    newVersion?: string;
    recipe?: any;
    message?: string;
    error?: string;
  }> {
    // 1. Self-Healing runs EXCLUSIVELY through Local LLM
    if (!this.localLLMConfig?.enabled) {
      return {
        success: false,
        error: `DOM Self-Healing requires Local LLM (Ollama / LM Studio) to be enabled. Cloud AI services (Claude, ChatGPT, etc.) are restricted from inspecting competing web interfaces due to safety policies.`,
      };
    }

    let contents = webContents;
    if (!contents) {
      const { globalSessionManager } = await import('../webviews/sessionManager.js');
      try {
        contents = await globalSessionManager.ensureWebContents(brokenProviderId);
      } catch {
        contents = globalSessionManager.getWebContents(brokenProviderId);
      }
    }

    if (!contents || contents.isDestroyed()) {
      return {
        success: false,
        error: `Cannot heal ${brokenProviderId}: WebContents is not running or destroyed.`,
      };
    }

    // 2. Run audit first to identify missing landmarks and HTML snippet
    const auditReport = await this.auditProvider(brokenProviderId, contents);
    if (auditReport.healthy || auditReport.missingLandmarks.length === 0) {
      return {
        success: true,
        message: `${brokenProviderId} DOM landmarks are already healthy and verified.`,
      };
    }

    const healingPrompt = DomWatchdog.buildHealingPrompt(auditReport);

    try {
      console.log(`[HealingManager] Executing manual DOM Self-Healing for ${brokenProviderId} via Local LLM (${this.localLLMConfig.preset})...`);
      const completion = await LocalLlmClient.generateCompletion(healingPrompt, this.localLLMConfig, {
        temperature: 0.1,
        maxTokens: 400,
      });

      const rawResponse = completion.text;

      // Parse JSON response
      const jsonMatch = rawResponse.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error(`Local LLM returned invalid non-JSON output`);
      }

      const suggested: Record<string, string> = JSON.parse(jsonMatch[0]);

      // Validate the suggested selectors inside the broken provider's WebContents
      const testScript = `
        (function() {
          const results = {};
          const suggested = ${JSON.stringify(suggested)};
          for (const [key, sel] of Object.entries(suggested)) {
            if (typeof sel === 'string' && sel.trim().length > 0) {
              try {
                const el = document.querySelector(sel);
                if (el) {
                  results[key] = true;
                }
              } catch (e) {}
            }
          }
          return results;
        })()
      `;

      const verifiedValid: Record<string, boolean> = await contents.executeJavaScript(testScript, true);
      const verifiedSelectors: Record<string, string> = {};

      for (const [key, isValid] of Object.entries(verifiedValid)) {
        if (isValid && suggested[key]) {
          verifiedSelectors[key] = suggested[key];
        }
      }

      if (Object.keys(verifiedSelectors).length > 0) {
        // Successfully healed one or more landmarks!
        const coreSelectors = Object.fromEntries(Object.entries(verifiedSelectors).filter(([key]) => ['inputPrompt', 'submitButton', 'stopButton', 'modelDropdownTrigger'].includes(key)));
        if (Object.keys(coreSelectors).length) this.setCustomSelectors(brokenProviderId, coreSelectors as any);

        let healedResult: any = null;
        try {
          const { globalRecipeManager } = await import('../registry/recipeManager.js');
          healedResult = globalRecipeManager.healRecipeSelectors(brokenProviderId, verifiedSelectors as any, 'localllm');
        } catch (rErr: any) {
          console.warn('[HealingManager] Notice updating recipe after DOM repair:', rErr?.message || rErr);
        }

        // Re-audit to update live state
        await this.auditProvider(brokenProviderId, contents);

        console.log(
          `[HealingManager] Successfully healed landmarks for ${brokenProviderId} using Local LLM:`,
          verifiedSelectors
        );

        return {
          success: true,
          healerUsed: 'localllm',
          repairedSelectors: verifiedSelectors,
          newVersion: healedResult?.version,
          recipe: healedResult?.recipe,
          message: `Repaired landmarks via Local LLM: ${Object.keys(verifiedSelectors).join(', ')}${healedResult?.version ? ` (Saved as v${healedResult.version})` : ''}`,
        };
      }

      return {
        success: false,
        error: `Local LLM suggested selectors that did not match elements in live DOM.`,
      };
    } catch (err: any) {
      return {
        success: false,
        error: `Local LLM healing failed: ${err?.message || err}`,
      };
    }
  }

  public handleWebContentsLoaded(_providerId: ProviderId, _webContents: WebContents): void {
    // Automatic page-load healing completely removed to protect user AI accounts
  }
}

export const globalHealingManager = HealingManager.getInstance();
