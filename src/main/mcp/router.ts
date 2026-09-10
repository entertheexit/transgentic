import { isCliProvider, cliSupportsMode } from '../../shared/cli.js';
import { globalCliRuntime } from '../cli/cliRuntimeManager.js';
import fs from 'fs';
import path from 'path';
import { app } from 'electron';
import { ModeRouteConfig, ProviderId, TaskMode, LocalLLMConfig, ModePipelineConfig, RouteMatrix } from '../../shared/types.js';
import { globalRateLimiter } from './rateLimiter.js';
import { globalCircuitBreaker } from './circuitBreaker.js';
import { ServiceManifestManager } from '../registry/serviceManifest.js';

export class DynamicRouter {
  public static readonly DEFAULT_ROUTE_MATRIX: RouteMatrix = {
    main: {
      general: {
        mode: 'general',
        defaultService: 'chatgpt',
        primary: 'chatgpt',
        fallbackChain: ['claude', 'gemini', 'grok'],
        fallbacks: ['claude', 'gemini', 'grok'],
        outputFormat: 'prose_markdown',
        modelRouting: {},
        providerModels: {},
      },
      coding: {
        mode: 'coding',
        defaultService: 'claude',
        primary: 'claude',
        fallbackChain: ['chatgpt', 'gemini', 'grok'],
        fallbacks: ['chatgpt', 'gemini', 'grok'],
        outputFormat: 'json_code',
        modelRouting: {},
        providerModels: {},
      },
      writing: {
        mode: 'writing',
        defaultService: 'chatgpt',
        primary: 'chatgpt',
        fallbackChain: ['claude', 'grok', 'gemini'],
        fallbacks: ['claude', 'grok', 'gemini'],
        outputFormat: 'prose_markdown',
        modelRouting: {},
        providerModels: {},
      },
      image: {
        mode: 'image',
        defaultService: 'grok',
        primary: 'grok',
        fallbackChain: ['chatgpt', 'gemini'],
        fallbacks: ['chatgpt', 'gemini'],
        outputFormat: 'file_download',
        modelRouting: {},
        providerModels: {},
      },
      video: {
        mode: 'video',
        defaultService: 'grok',
        primary: 'grok',
        fallbackChain: ['gemini'],
        fallbacks: ['gemini'],
        outputFormat: 'file_download',
        modelRouting: {},
        providerModels: {},
      },
      audio: {
        mode: 'audio',
        defaultService: 'gemini',
        primary: 'gemini',
        fallbackChain: [],
        fallbacks: [],
        outputFormat: 'file_download',
        modelRouting: {},
        providerModels: {},
      },
    },
    co: {
      general: {
        mode: 'general',
        defaultService: 'claude',
        primary: 'claude',
        fallbackChain: ['gemini', 'grok'],
        fallbacks: ['gemini', 'grok'],
        outputFormat: 'prose_markdown',
      },
      coding: {
        mode: 'coding',
        defaultService: 'chatgpt',
        primary: 'chatgpt',
        fallbackChain: ['gemini', 'grok'],
        fallbacks: ['gemini', 'grok'],
        outputFormat: 'json_code',
      },
      writing: {
        mode: 'writing',
        defaultService: 'claude',
        primary: 'claude',
        fallbackChain: ['grok', 'gemini'],
        fallbacks: ['grok', 'gemini'],
        outputFormat: 'prose_markdown',
      },
      image: {
        mode: 'image',
        defaultService: 'chatgpt',
        primary: 'chatgpt',
        fallbackChain: ['gemini'],
        fallbacks: ['gemini'],
        outputFormat: 'file_download',
      },
      video: {
        mode: 'video',
        defaultService: 'gemini',
        primary: 'gemini',
        fallbackChain: [],
        fallbacks: [],
        outputFormat: 'file_download',
      },
      audio: {
        mode: 'audio',
        defaultService: 'chatgpt',
        primary: 'chatgpt',
        fallbackChain: ['gemini'],
        fallbacks: ['gemini'],
        outputFormat: 'file_download',
      },
    },
  };

  private static currentRoutes: RouteMatrix = JSON.parse(
    JSON.stringify(DynamicRouter.DEFAULT_ROUTE_MATRIX)
  );

  private static getStoragePath(): string {
    try {
      if (app && typeof app.getPath === 'function') {
        return path.join(app.getPath('userData'), 'mode_routes.json');
      }
    } catch {}
    return path.join(process.cwd(), 'mode_routes.json');
  }

  public static loadPersistedRoutes(): void {
    try {
      const filePath = this.getStoragePath();
      if (fs.existsSync(filePath)) {
        const raw = fs.readFileSync(filePath, 'utf-8');
        const parsed = JSON.parse(raw);
        if (parsed.main && parsed.co) {
          // New format
          this.currentRoutes = {
            main: { ...this.DEFAULT_ROUTE_MATRIX.main, ...parsed.main },
            co: { ...this.DEFAULT_ROUTE_MATRIX.co, ...parsed.co },
          };
          this.normalizeMatrix();
        } else if (parsed.general || parsed.coding) {
          // Legacy format migration
          const migratedMain: any = { ...this.DEFAULT_ROUTE_MATRIX.main };
          for (const mode of Object.keys(this.DEFAULT_ROUTE_MATRIX.main) as TaskMode[]) {
            if (parsed[mode]) {
              const primary = parsed[mode].primary || parsed[mode].defaultService || migratedMain[mode].primary;
              const fallbacks = parsed[mode].fallbacks || parsed[mode].fallbackChain || migratedMain[mode].fallbacks;
              migratedMain[mode] = {
                ...migratedMain[mode],
                ...parsed[mode],
                primary,
                defaultService: primary,
                fallbacks,
                fallbackChain: fallbacks,
                modelRouting: parsed[mode].modelRouting || parsed[mode].providerModels,
                providerModels: parsed[mode].providerModels || parsed[mode].modelRouting,
              };
            }
          }
          this.currentRoutes = {
            main: migratedMain,
            co: JSON.parse(JSON.stringify(this.DEFAULT_ROUTE_MATRIX.co)),
          };
          this.normalizeMatrix();
          this.savePersistedRoutes();
        } else {
          this.currentRoutes = JSON.parse(JSON.stringify(this.DEFAULT_ROUTE_MATRIX));
        }
      } else {
        this.currentRoutes = JSON.parse(JSON.stringify(this.DEFAULT_ROUTE_MATRIX));
      }
    } catch {
      this.currentRoutes = JSON.parse(JSON.stringify(this.DEFAULT_ROUTE_MATRIX));
    }
  }

  public static enforceMutualExclusion(mode: TaskMode): void {
    const mainPrimary = this.currentRoutes.main[mode].defaultService !== undefined
      ? this.currentRoutes.main[mode].defaultService
      : this.currentRoutes.main[mode].primary;
    const coPrimary = this.currentRoutes.co[mode].defaultService !== undefined
      ? this.currentRoutes.co[mode].defaultService
      : this.currentRoutes.co[mode].primary;

    if (mainPrimary && mainPrimary === coPrimary) {
      // Find alternative for Co
      const coFallbacks = this.currentRoutes.co[mode].fallbackChain || this.currentRoutes.co[mode].fallbacks || [];
      const alternative = coFallbacks.find((p) => p !== mainPrimary) ||
        (['chatgpt', 'claude', 'gemini', 'grok'] as ProviderId[]).find((p) => p !== mainPrimary && this.providerSupportsMode(p, mode)) ||
        (mode === 'audio' ? 'chatgpt' : 'claude');

      this.currentRoutes.co[mode].defaultService = alternative;
      this.currentRoutes.co[mode].primary = alternative as ProviderId;
      this.currentRoutes.co[mode].fallbackChain = coFallbacks.filter((p) => p !== alternative && p !== mainPrimary);
      this.currentRoutes.co[mode].fallbacks = this.currentRoutes.co[mode].fallbackChain.map((p) => p as ProviderId);
    }
  }

  public static normalizeMatrix(): void {
    const modes: TaskMode[] = ['general', 'coding', 'writing', 'image', 'video', 'audio'];
    for (const mode of modes) {
      // Normalize Main
      const m = this.currentRoutes.main[mode];
      const mPrimary = (m.defaultService !== undefined ? m.defaultService : (m.primary !== undefined ? m.primary : 'chatgpt')) as ProviderId;
      const mFallbacks = (m.fallbackChain || m.fallbacks || []).map((p) => p as ProviderId);
      m.mode = mode;
      m.defaultService = mPrimary;
      m.primary = mPrimary;
      m.fallbackChain = mFallbacks;
      m.fallbacks = mFallbacks;
      m.modelRouting = m.modelRouting || m.providerModels || {};
      m.providerModels = m.providerModels || m.modelRouting || {};

      // Normalize Co
      const c = this.currentRoutes.co[mode];
      const cPrimary = (c.defaultService !== undefined ? c.defaultService : (c.primary !== undefined ? c.primary : 'claude')) as ProviderId;
      const cFallbacks = (c.fallbackChain || c.fallbacks || []).map((p) => p as ProviderId);
      c.mode = mode;
      c.defaultService = cPrimary;
      c.primary = cPrimary;
      c.fallbackChain = cFallbacks;
      c.fallbacks = cFallbacks;
      c.modelRouting = c.modelRouting || c.providerModels || {};
      c.providerModels = c.providerModels || c.modelRouting || {};

      this.enforceMutualExclusion(mode);
    }
  }

  public static savePersistedRoutes(): void {
    try {
      const filePath = this.getStoragePath();
      const dir = path.dirname(filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(filePath, JSON.stringify(this.currentRoutes, null, 2), 'utf-8');
    } catch {}
  }

  public static getRouteMatrix(): RouteMatrix {
    return JSON.parse(JSON.stringify(this.currentRoutes));
  }

  public static getAllRouteConfigs(): Record<TaskMode, ModeRouteConfig> {
    return JSON.parse(JSON.stringify(this.currentRoutes.main));
  }

  public static getRule(mode: TaskMode, pipeline: 'main' | 'co' = 'main'): ModePipelineConfig {
    const matrix = this.currentRoutes[pipeline] || this.currentRoutes.main;
    return matrix[mode] || matrix.general || this.DEFAULT_ROUTE_MATRIX[pipeline].general;
  }

  public static updateRouteConfig(
    mode: TaskMode,
    config: Partial<ModePipelineConfig> | Partial<ModeRouteConfig>,
    pipeline: 'main' | 'co' = 'main'
  ): ModePipelineConfig {
    const existing = this.getRule(mode, pipeline);
    let primary = (config.defaultService !== undefined
      ? config.defaultService
      : config.primary !== undefined
      ? config.primary
      : (existing.defaultService !== undefined ? existing.defaultService : existing.primary)) as ProviderId;
    if (primary === 'localllm' && (mode === 'image' || mode === 'video' || mode === 'audio')) {
      primary = (existing.defaultService !== 'localllm' ? existing.defaultService : (mode === 'audio' ? 'gemini' : 'grok')) as ProviderId;
    }
    let fallbacks = (config.fallbackChain !== undefined
      ? config.fallbackChain
      : config.fallbacks !== undefined
      ? config.fallbacks
      : existing.fallbackChain || existing.fallbacks || []).map((p) => p as ProviderId);
    if (mode === 'image' || mode === 'video' || mode === 'audio') {
      fallbacks = fallbacks.filter((p) => p !== 'localllm');
    }
    const providerModels = {
      ...(existing.providerModels || {}),
      ...(config.providerModels || {}),
      ...(config.modelRouting || {}),
    };

    const updated: ModePipelineConfig = {
      ...existing,
      ...config,
      mode,
      defaultService: primary,
      primary,
      fallbackChain: fallbacks,
      fallbacks,
      modelRouting: providerModels,
      providerModels,
    };

    this.currentRoutes[pipeline][mode] = updated;

    if (primary) {
      if (pipeline === 'main') {
        this.enforceMutualExclusion(mode);
      } else {
        const mainPrimary = this.currentRoutes.main[mode].defaultService || this.currentRoutes.main[mode].primary;
        if (updated.defaultService === mainPrimary) {
          this.enforceMutualExclusion(mode);
        }
      }
    }

    this.savePersistedRoutes();
    return this.currentRoutes[pipeline][mode];
  }

  /**
   * Purges a deleted provider from all route primary and fallback chains,
   * restoring safe built-in defaults if necessary.
   */
  public static removeProviderFromAllRoutes(providerId: string): void {
    if (!this.currentRoutes) return;
    const cleanSection = (section: Record<TaskMode, ModePipelineConfig>) => {
      for (const mode of Object.keys(section) as TaskMode[]) {
        const config = section[mode];
        if (config.primary === providerId || config.defaultService === providerId) {
          const fallback = config.fallbacks?.find((f) => f !== providerId) ||
                           (mode === 'coding' ? 'claude' : (mode === 'audio' || mode === 'video' ? 'gemini' : 'chatgpt'));
          config.primary = fallback as ProviderId;
          config.defaultService = fallback as ProviderId;
        }
        if (config.fallbackChain) {
          config.fallbackChain = config.fallbackChain.filter((p) => p !== providerId);
        }
        if (config.fallbacks) {
          config.fallbacks = config.fallbacks.filter((p) => p !== providerId);
        }
        if (config.modelRouting && (config.modelRouting as any)[providerId]) {
          delete (config.modelRouting as any)[providerId];
        }
        if (config.providerModels && (config.providerModels as any)[providerId]) {
          delete (config.providerModels as any)[providerId];
        }
      }
    };
    if (this.currentRoutes.main) cleanSection(this.currentRoutes.main);
    if (this.currentRoutes.co) cleanSection(this.currentRoutes.co);
    this.normalizeMatrix();
    this.savePersistedRoutes();
  }

  /**
   * Resolves the target model for a provider within a specific task mode.
   * If the provider supports model routing (e.g. multi-model webview adapter), it checks:
   * 1. Explicit model request (if valid and enabled)
   * 2. Per-mode route configuration (providerModels[providerId].defaultModelId)
   * 3. Fallback models configured for that provider in this mode
   * 4. Mode-filtered models from manifest matching the task mode
   * 5. Provider-wide default model as final fallback
   */
  public static resolveTargetModel(
    providerId: ProviderId,
    mode: TaskMode,
    explicitModel?: string,
    pipeline: 'main' | 'co' = 'main'
  ): string | null {
    const supportsModelRouting = ServiceManifestManager.supportsModelRouting(providerId);

    // 1. If explicit model requested by caller and enabled
    if (explicitModel) {
      if (ServiceManifestManager.isModelEnabled(providerId, explicitModel)) {
        return explicitModel;
      }
    }

    if (!supportsModelRouting) {
      return null;
    }

    const rule = this.getRule(mode, pipeline);
    const modeConfig = rule.providerModels?.[providerId];

    // 2. Check per-mode configured default model
    if (modeConfig?.defaultModelId) {
      if (ServiceManifestManager.isModelEnabled(providerId, modeConfig.defaultModelId)) {
        return modeConfig.defaultModelId;
      }
    }

    // 3. Check per-mode configured fallback models
    if (Array.isArray(modeConfig?.fallbackModelIds)) {
      for (const fallbackModel of modeConfig.fallbackModelIds) {
        if (ServiceManifestManager.isModelEnabled(providerId, fallbackModel)) {
          return fallbackModel;
        }
      }
    }

    // 4. Check manifest for any enabled model matching this mode
    const modeModels = ServiceManifestManager.getModelsForMode(providerId, mode);
    const availableModeModel = modeModels.find((m) => m.enabled !== false);
    if (availableModeModel) {
      return availableModeModel.id;
    }

    // 5. Fall back to provider default
    const manifest = ServiceManifestManager.getManifest();
    return manifest.services[providerId]?.defaultModelId || null;
  }

  public static resetRoutes(): Record<TaskMode, ModeRouteConfig> {
    this.currentRoutes = JSON.parse(JSON.stringify(this.DEFAULT_ROUTE_MATRIX));
    this.savePersistedRoutes();
    return JSON.parse(JSON.stringify(this.currentRoutes.main));
  }

  public static getPrimaryProvider(mode: TaskMode, pipeline: 'main' | 'co' = 'main'): ProviderId {
    const rule = this.getRule(mode, pipeline);
    return (rule.defaultService || rule.primary) as ProviderId;
  }

  private static localLlmConfig: LocalLLMConfig | null = null;

  public static setLocalLlmConfig(cfg: LocalLLMConfig | null): void {
    this.localLlmConfig = cfg;
  }

  public static getLocalLlmConfig(): LocalLLMConfig | null {
    return this.localLlmConfig;
  }

  public static isLocalLlmSupportedForMode(mode: TaskMode): boolean {
    return mode === 'general' || mode === 'coding' || mode === 'writing';
  }

  public static isProviderEnabled(p: ProviderId, mode?: TaskMode): boolean {
    if (isCliProvider(p)) return ServiceManifestManager.isServiceEnabled(p) && (!mode || cliSupportsMode(mode)) && globalCliRuntime.available(p);
    if (p === 'localllm') {
      if (mode && !this.isLocalLlmSupportedForMode(mode)) {
        return false;
      }
      return this.localLlmConfig?.enabled ?? false;
    }
    return ServiceManifestManager.isServiceEnabled(p);
  }

  public static providerSupportsMode(p: ProviderId, mode: TaskMode): boolean {
    if (isCliProvider(p)) return cliSupportsMode(mode);
    if (p === 'localllm') {
      return this.isLocalLlmSupportedForMode(mode);
    }
    return ServiceManifestManager.providerSupportsMode(p, mode);
  }

  /**
   * Returns an ordered list of providers to try for a given mode,
   * taking into account developer service manifest toggles, configured fallbacks,
   * circuit breaker states, and rolling rate limits.
   */
  public static getCandidateChain(
    mode: TaskMode,
    explicitProvider?: ProviderId,
    checkRateLimits: boolean = true,
    pipeline: 'main' | 'co' = 'main',
    includeLocalLlmInDoubleAgent: boolean = true
  ): ProviderId[] {
    if (explicitProvider) {
      if (this.isProviderEnabled(explicitProvider, mode)) {
        return [explicitProvider];
      }
      console.warn(
        `[DynamicRouter] Explicitly requested provider ${explicitProvider} is disabled. Falling back to enabled candidates.`
      );
    }

    const rule = this.getRule(mode, pipeline);
    const primary = (rule.defaultService !== undefined ? rule.defaultService : rule.primary) as ProviderId;
    const fallbacks = (rule.fallbackChain || rule.fallbacks || []).map((p) => p as ProviderId);

    // If primary is explicitly deselected (''), candidate list should not arbitrarily fallback to random services!
    const isExplicitlyDeselected = primary === '' || primary === 'none';
    if (isExplicitlyDeselected) {
      return [];
    }

    const rawCandidates: ProviderId[] = primary ? [primary] : [];

    if (Array.isArray(fallbacks)) {
      for (const fallback of fallbacks) {
        if (fallback && !rawCandidates.includes(fallback)) {
          rawCandidates.push(fallback);
        }
      }
    }

    // Filter by developer-level service manifest / local LLM enablement and task mode capability
    let candidates = rawCandidates.filter((p) => {
      if (p === 'localllm' && !includeLocalLlmInDoubleAgent && pipeline === 'co') {
        return false;
      }
      return (
        DynamicRouter.isProviderEnabled(p, mode) &&
        DynamicRouter.providerSupportsMode(p, mode)
      );
    });

    if (
      includeLocalLlmInDoubleAgent &&
      pipeline === 'co' &&
      DynamicRouter.isProviderEnabled('localllm', mode) &&
      !candidates.includes('localllm')
    ) {
      candidates.push('localllm');
    }

    // Fallback to any enabled provider supporting this mode if all configured candidates are unavailable
    if (candidates.length === 0) {
      const enabledProviders = ServiceManifestManager.getEnabledProviders();
      const modeSupportedProviders = enabledProviders.filter((p) =>
        DynamicRouter.providerSupportsMode(p, mode)
      );
      if (modeSupportedProviders.length > 0) {
        candidates = [...modeSupportedProviders];
      }
      // If local LLM is enabled and mode is supported, add as emergency fallback
      if (
        (includeLocalLlmInDoubleAgent || pipeline === 'main') &&
        DynamicRouter.isProviderEnabled('localllm', mode) &&
        !candidates.includes('localllm')
      ) {
        candidates.push('localllm');
      }
    }

    if (!checkRateLimits) {
      return candidates;
    }

    // Filter and sort based on circuit breaker & rate limits
    const available: ProviderId[] = [];
    const coolingDown: ProviderId[] = [];

    for (const p of candidates) {
      if (p === 'localllm') {
        available.push(p);
        continue;
      }
      const isLimited = globalRateLimiter.isRateLimited(p);
      const canAttempt = globalCircuitBreaker.canAttempt(p);

      if (!isLimited && canAttempt) {
        available.push(p);
      } else {
        coolingDown.push(p);
      }
    }

    // Return non-rate-limited first, followed by cooling-down as fallback
    return [...available, ...coolingDown];
  }

  /**
   * Intelligently classifies the task mode based on prompt content
   * when mode is 'general' or unspecified by external MCP clients (e.g. Codex/Antigravity).
   */
  public static classifyMode(
    prompt: string,
    explicitMode?: TaskMode | 'auto',
    isStrictExplicit: boolean = false
  ): { mode: TaskMode; isAutoDetected: boolean } {
    const normalizedExplicit = explicitMode === ('music' as any) ? 'audio' : explicitMode;
    if (normalizedExplicit && normalizedExplicit !== 'auto') {
      if (isStrictExplicit || normalizedExplicit !== 'general') {
        return { mode: normalizedExplicit as TaskMode, isAutoDetected: false };
      }
    }

    const p = prompt.toLowerCase();

    // 1. Coding intent detection (markdown codeblocks, code syntax, git diffs, dev keywords, file extensions, Thai dev terms)
    const hasCodeBlock = /```[\s\S]*?```/.test(prompt);
    const hasCodeKeywords = /\b(function|class|const|let|var|import|export|def|return|async|await|interface|type|struct|impl|enum|fn|public|private|void|nullptr|null|undefined|console\.log|try\s*{|catch\s*\(|throw\s+new)\b/.test(prompt);
    const hasDevTerms = /\b(refactor|debug|fix\s+bug|syntax\s+error|stack\s+trace|compile|build\s+error|pull\s+request|git\s+diff|ast|typescript|javascript|python|rust|golang|c\+\+|flutter|dart|react|vitest|jest|pytest|dockerfile|package\.json|cargo\.toml|tsconfig)\b/.test(p);
    const hasFileExtensions = /\b[\w-]+\.(ts|tsx|js|jsx|py|rs|go|dart|cpp|h|c|json|yaml|yml|html|css|sql|sh|toml)\b/.test(prompt);
    const hasThaiCoding = /(เขียนโค้ด|แก้บั๊ก|แก้โค้ด|เขียนโปรแกรม|ช่วยเขียนโค้ด|เขียนสคริปต์|ช่วยดีบั๊ก)/.test(prompt);

    if (hasCodeBlock || (hasCodeKeywords && hasDevTerms) || hasDevTerms || hasFileExtensions || hasThaiCoding) {
      return { mode: 'coding', isAutoDetected: true };
    }

    // 2. Image generation intent (storyboard scenes, visual art keywords, DALL-E/Midjourney prompts, Thai image keywords)
    const hasImageAction = /\b(generate|create|draw|render|illustrate|design|make)\s+(an?\s+)?(image|photo|picture|illustration|wallpaper|logo|drawing|icon|avatar)\b/.test(p);
    const hasImageStyling = /\b(photorealistic|hyperrealistic|cinematic|4k\s+render|8k\s+render|midjourney\s+prompt|dall-?e|concept\s+art|digital\s+art|matte\s+painting|character\s+design|character\s+sheet|anime\s+style|comic\s+panel|manga\s+panel|oil\s+painting|watercolor\s+painting|vector\s+art|3d\s+render|octane\s+render|unreal\s+engine\s+5?|wide\s+shot|close-up\s+shot|establishing\s+shot|cinematic\s+lighting|volumetric\s+lighting|aspect\s+ratio|--ar\s+\d+:\d+|--v\s+\d+)\b/.test(p);
    const hasStoryboardTerms = /\b(storyboard|storyboards?|scene\s+\d+|panel\s+\d+|shot\s+\d+|frame\s+\d+)\b/.test(p);
    const hasThaiImage = /(สร้างภาพ|วาดภาพ|วาดรูป|เจนภาพ|เจนรูป|รูปภาพ|ภาพวาด|ภาพถ่าย|สตอรี่บอร์ด|ออกแบบตัวละคร|ภาพประกอบ)/.test(prompt);

    if (hasImageAction || hasImageStyling || hasStoryboardTerms || hasThaiImage) {
      return { mode: 'image', isAutoDetected: true };
    }

    // 3. Video generation intent (animation, short films, text-to-video, Thai video keywords)
    const hasVideoAction = /\b(generate|create|render|make)\s+(an?\s+)?(video|animation|clip|short\s+film|motion\s+graphic|movie)\b/.test(p);
    const hasVideoKeywords = /\b(text-to-video|img2video|image-to-video|sora|runway|kling|hailuo|luma\s+dream\s+machine|animate\s+this|cinematic\s+video|motion\s+video|video\s+clip|animated\s+scene)\b/.test(p);
    const hasThaiVideo = /(สร้างวิดีโอ|เจนวิดีโอ|คลิปวิดีโอ|ภาพเคลื่อนไหว|ทำวิดีโอ|ตัดต่อวิดีโอ)/.test(prompt);

    if (hasVideoAction || hasVideoKeywords || hasThaiVideo) {
      return { mode: 'video', isAutoDetected: true };
    }

    // 4. Audio/Music generation intent (BGM, sound effects, voiceovers, Thai audio keywords)
    const hasAudioAction = /\b(generate|create|compose|produce|make|synthesize)\s+(an?\s+)?(audio|music|song|track|soundtrack|beat|melody|tune|jingle|voice|speech|tts|podcast|sound\s+effect|sfx)\b/.test(p);
    const hasAudioKeywords = /\b(background\s+music|bgm|instrumental|ambient\s+soundtrack|suno|udio|text-to-speech|voiceover|voice\s+narration)\b/.test(p);
    const hasThaiAudio = /(สร้างเพลง|แต่งเพลง|ทำเพลง|สร้างเสียง|ดนตรี|เสียงดนตรี|เพลงบรรเลง|เสียงพากย์|เสียงเอฟเฟกต์)/.test(prompt);

    if (hasAudioAction || hasAudioKeywords || hasThaiAudio) {
      return { mode: 'audio', isAutoDetected: true };
    }

    // 5. Writing intent
    const hasWritingAction = /\b(write|draft|summarize|rewrite|proofread|translate|compose)\s+(an?\s+)?(essay|article|blog\s+post|story|email|cover\s+letter|poem|script)\b/.test(p);
    const hasThaiWriting = /(เขียนบทความ|เขียนเรียงความ|แปลภาษา|ตรวจคำผิด|สรุปบทความ|เขียนอีเมล)/.test(prompt);

    if (hasWritingAction || hasThaiWriting) {
      return { mode: 'writing', isAutoDetected: true };
    }

    return { mode: (normalizedExplicit as TaskMode) || 'general', isAutoDetected: false };
  }
}

// Initial load
DynamicRouter.loadPersistedRoutes();
