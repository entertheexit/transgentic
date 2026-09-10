import fs from "fs";
import { builtInCliServices } from '../../shared/cli.js';
import path from "path";
import { fileURLToPath } from "url";
import { app } from "electron";
import { ModeRouteConfig, ProviderId, ServiceManifestEntry, ServiceModelDef, ServiceRouteConflict, ServicesManifest, TaskMode } from "../../shared/types.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class ServiceManifestManager {
  private static readonly DEFAULT_MANIFEST: ServicesManifest = {
    version: "1.0.0",
    services: {
      ...builtInCliServices(),
      chatgpt: {
        id: "chatgpt",
        name: "ChatGPT",
        company: "OpenAI",
        enabled: true,
        hidden: false,
        url: "https://chatgpt.com",
        partition: "persist:chatgpt",
        defaultModelId: "gpt-4o",
        accentColor: "emerald",
        iconName: "Bot",
        theme: {
          iconName: "Bot",
          accentColor: "emerald",
          textClass: "text-emerald-400",
          bgClass: "bg-emerald-500/10",
          borderClass: "border-emerald-500/30",
          badgeClass: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
          glowClass: "shadow-[0_0_15px_rgba(16,185,129,0.15)]",
        },
        models: [
          { id: "gpt-4o", displayName: "GPT-4o (Omni & Multimodal)", enabled: true, discoveredAvailable: true, userEnabled: true, requiresTier: "Free/Plus", mode: "general", modes: ["general", "coding", "writing", "image"] },
          { id: "o1", displayName: "o1 (Deep Reasoning)", enabled: true, discoveredAvailable: true, userEnabled: true, requiresTier: "Plus/Pro", mode: "general", modes: ["general", "coding", "writing"] },
          { id: "o3-mini", displayName: "o3-mini (High Speed Reasoning)", enabled: true, discoveredAvailable: true, userEnabled: true, requiresTier: "Free/Plus", mode: "coding", modes: ["coding", "general", "writing"] },
          { id: "gpt-4o-mini", displayName: "GPT-4o mini (Lightweight)", enabled: true, discoveredAvailable: true, userEnabled: true, requiresTier: "Free", mode: "general", modes: ["general", "coding", "writing"] },
        ],
      },
      claude: {
        id: "claude",
        name: "Claude",
        company: "Anthropic",
        enabled: true,
        hidden: false,
        url: "https://claude.ai",
        partition: "persist:claude",
        defaultModelId: "claude-3-5-sonnet",
        accentColor: "amber",
        iconName: "Brain",
        theme: {
          iconName: "Brain",
          accentColor: "amber",
          textClass: "text-amber-400",
          bgClass: "bg-amber-500/10",
          borderClass: "border-amber-500/30",
          badgeClass: "bg-amber-500/15 text-amber-300 border-amber-500/30",
          glowClass: "shadow-[0_0_15px_rgba(245,158,11,0.15)]",
        },
        models: [
          { id: "claude-3-5-sonnet", displayName: "Claude 3.5 Sonnet (Coding & Reasoning)", enabled: true, discoveredAvailable: true, userEnabled: true, requiresTier: "Free/Pro", mode: "coding", modes: ["general", "coding", "writing"] },
          { id: "claude-3-opus", displayName: "Claude 3 Opus (High Intelligence)", enabled: true, discoveredAvailable: true, userEnabled: true, requiresTier: "Pro", mode: "writing", modes: ["general", "coding", "writing"] },
          { id: "claude-3-5-haiku", displayName: "Claude 3.5 Haiku (Lightning Fast)", enabled: true, discoveredAvailable: true, userEnabled: true, requiresTier: "Free/Pro", mode: "general", modes: ["general", "coding", "writing"] },
        ],
      },
      gemini: {
        id: "gemini",
        name: "Gemini",
        company: "Google",
        enabled: true,
        hidden: false,
        url: "https://gemini.google.com/app",
        partition: "persist:gemini",
        defaultModelId: "gemini-2-0-flash",
        accentColor: "blue",
        iconName: "Sparkles",
        theme: {
          iconName: "Sparkles",
          accentColor: "blue",
          textClass: "text-blue-400",
          bgClass: "bg-blue-500/10",
          borderClass: "border-blue-500/30",
          badgeClass: "bg-blue-500/15 text-blue-300 border-blue-500/30",
          glowClass: "shadow-[0_0_15px_rgba(59,130,246,0.15)]",
        },
        models: [
          { id: "gemini-2-0-flash", displayName: "Gemini 2.0 Flash (Next-Gen Multimodal)", enabled: true, discoveredAvailable: true, userEnabled: true, requiresTier: "Free/Advanced", mode: "general", modes: ["general", "coding", "writing", "image", "video", "audio"] },
          { id: "gemini-2-0-pro", displayName: "Gemini 2.0 Pro Experimental", enabled: true, discoveredAvailable: true, userEnabled: true, requiresTier: "Advanced", mode: "general", modes: ["general", "coding", "writing", "image", "video", "audio"] },
          { id: "gemini-1-5-flash", displayName: "Gemini 1.5 Flash (Fast)", enabled: true, discoveredAvailable: true, userEnabled: true, requiresTier: "Free", mode: "general", modes: ["general", "coding", "writing", "video", "audio"] },
          { id: "gemini-1-5-pro", displayName: "Gemini 1.5 Pro (2M Context)", enabled: true, discoveredAvailable: true, userEnabled: true, requiresTier: "Free/Advanced", mode: "general", modes: ["general", "coding", "writing", "video", "audio"] },
        ],
      },
      grok: {
        id: "grok",
        name: "Grok",
        company: "xAI",
        enabled: true,
        hidden: false,
        url: "https://grok.com",
        partition: "persist:grok",
        defaultModelId: "grok-3",
        accentColor: "purple",
        iconName: "Cpu",
        theme: {
          iconName: "Cpu",
          accentColor: "purple",
          textClass: "text-purple-400",
          bgClass: "bg-purple-500/10",
          borderClass: "border-purple-500/30",
          badgeClass: "bg-purple-500/15 text-purple-300 border-purple-500/30",
          glowClass: "shadow-[0_0_15px_rgba(168,85,247,0.15)]",
        },
        models: [
          { id: "grok-3", displayName: "Grok 3 (State-of-the-Art)", enabled: true, discoveredAvailable: true, userEnabled: true, requiresTier: "Premium", mode: "general", modes: ["general", "coding", "writing", "video"] },
          { id: "grok-3-think", displayName: "Grok 3 Think / DeepSearch", enabled: true, discoveredAvailable: true, userEnabled: true, requiresTier: "Premium+", mode: "general", modes: ["general", "coding", "writing", "video"] },
          { id: "grok-2", displayName: "Grok 2 (Speed & Coding)", enabled: true, discoveredAvailable: true, userEnabled: true, requiresTier: "Premium", mode: "coding", modes: ["general", "coding", "writing"] },
          { id: "grok-2-vision", displayName: "Grok 2 Vision / Imagine", enabled: true, discoveredAvailable: true, userEnabled: true, requiresTier: "Premium", mode: "image", modes: ["image", "video", "general"] },
        ],
      },
      localllm: {
        id: "localllm",
        name: "Local LLM",
        company: "Local Engine",
        enabled: true,
        hidden: true,
        providerType: "api",
        url: "http://127.0.0.1:11434",
        partition: "persist:transgentic_localllm",
        defaultModelId: "default",
        accentColor: "cyan",
        iconName: "Cpu",
        theme: {
          iconName: "Cpu",
          accentColor: "cyan",
          textClass: "text-cyan-400",
          bgClass: "bg-cyan-500/10",
          borderClass: "border-cyan-500/30",
          badgeClass: "bg-cyan-500/15 text-cyan-300 border-cyan-500/30",
          glowClass: "shadow-[0_0_15px_rgba(6,182,212,0.15)]",
        },
        models: [
          { id: "default", displayName: "Local Model (Auto-detected)", enabled: true, discoveredAvailable: true, userEnabled: true, requiresTier: "Local", mode: "general", modes: ["general", "coding", "writing"] },
        ],
      },
    },
  };

  private static currentManifest: ServicesManifest = JSON.parse(
    JSON.stringify(ServiceManifestManager.DEFAULT_MANIFEST)
  );

  private static listeners: Array<(manifest: ServicesManifest) => void> = [];
  private static isLoaded: boolean = false;

  private static getUserDataFilePath(): string {
    try {
      if (app && typeof app.getPath === "function") {
        return path.join(app.getPath("userData"), "ai_services.json");
      }
    } catch {}
    if (process.env.NODE_ENV === "test" || process.env.VITEST) {
      const workerId = process.env.VITEST_WORKER_ID || process.pid;
      return path.join(process.cwd(), `.test_ai_services_${workerId}.json`);
    }
    return path.join(process.cwd(), "ai_services.json");
  }

  public static loadManifest(): ServicesManifest {
    this.isLoaded = true;
    let baseManifest: ServicesManifest = JSON.parse(JSON.stringify(this.DEFAULT_MANIFEST));

    // 1. Read baseline manifest from local project directory if available
    const localPath = path.join(process.cwd(), "ai_services.json");
    try {
      if (fs.existsSync(localPath)) {
        const raw = fs.readFileSync(localPath, "utf-8");
        if (raw && raw.trim().length > 0) {
          const parsed = JSON.parse(raw);
          if (parsed && parsed.services) {
            baseManifest = {
              version: parsed.version || baseManifest.version,
              services: {
                ...baseManifest.services,
                ...parsed.services,
              },
            };
          }
        }
      }
    } catch (err: any) {
      console.warn("[ServiceManifestManager] Local ai_services.json read warning:", err.message);
    }

    // 2. Read persisted user overrides from userData directory
    const userPath = this.getUserDataFilePath();
    try {
      if (userPath !== localPath && fs.existsSync(userPath)) {
        const userRaw = fs.readFileSync(userPath, "utf-8");
        if (userRaw && userRaw.trim().length > 0) {
          const userParsed = JSON.parse(userRaw);
          if (userParsed && userParsed.services) {
            for (const [srvId, srvData] of Object.entries(userParsed.services)) {
              // Always purge obsolete keys or legacy providers not matching base, api_, webview_, custom_, recipe_, or localllm
              if (
                !baseManifest.services[srvId] &&
                !srvId.startsWith('api_') &&
                !srvId.startsWith('webview_') &&
                !srvId.startsWith('custom_') &&
                !srvId.startsWith('recipe_') &&
                srvId !== 'localllm'
              ) {
                continue;
              }

              // Internal Local LLM daemon is strictly hidden from webview provider list
              if (srvId === 'localllm') {
                if (baseManifest.services.localllm) {
                  baseManifest.services.localllm.hidden = true;
                }
                continue;
              }

              const baseService = baseManifest.services[srvId];
              if (baseService) {
                const userService = srvData as any;
                
                // Merge models: ensure all preset models from ai_services.json are preserved
                const baseModels = Array.isArray(baseService.models) ? baseService.models : [];
                const userModels = Array.isArray(userService.models) ? userService.models : [];
                
                const mergedModelsMap = new Map<string, any>();
                // Seed with authoritative baseline models from ai_services.json
                for (const m of baseModels) {
                  mergedModelsMap.set(m.id, { ...m });
                }
                // Overlay user custom preferences (enabled / userEnabled flags)
                for (const um of userModels) {
                  if (mergedModelsMap.has(um.id)) {
                    mergedModelsMap.set(um.id, {
                      ...mergedModelsMap.get(um.id),
                      userEnabled: um.userEnabled !== undefined ? um.userEnabled : mergedModelsMap.get(um.id).userEnabled,
                      discoveredAvailable: um.discoveredAvailable !== undefined ? um.discoveredAvailable : mergedModelsMap.get(um.id).discoveredAvailable,
                      enabled: um.enabled !== undefined ? um.enabled : mergedModelsMap.get(um.id).enabled,
                    });
                  }
                }

                baseManifest.services[srvId] = {
                  ...baseService,
                  enabled: userService.enabled !== undefined ? userService.enabled : baseService.enabled,
                  hidden: userService.hidden !== undefined ? userService.hidden : baseService.hidden,
                  // Legal disclaimer and presets from ai_services.json take precedence over stale cached text
                  disclaimer: baseService.disclaimer || userService.disclaimer,
                  models: Array.from(mergedModelsMap.values()),
                };
              } else if (srvId.startsWith('api_') || srvId.startsWith('webview_') || srvId.startsWith('custom_') || srvId.startsWith('recipe_')) {
                const srv = { ...(srvData as any) };
                if (srv.providerType === 'api' || srvId.startsWith('api_')) {
                  if (srv.iconName === 'Key' || srv.iconName === 'Server' || !srv.iconName) {
                    srv.iconName = 'Braces';
                    if (srv.theme) srv.theme.iconName = 'Braces';
                  }
                }
                baseManifest.services[srvId] = srv;
              }
            }
          }
        }
      }
    } catch (err: any) {
      console.warn("[ServiceManifestManager] User data ai_services.json read warning:", err.message);
    }

    this.currentManifest = baseManifest;
    this.notify();
    return this.currentManifest;
  }

  public static saveManifest(newManifest?: ServicesManifest): void {
    if (newManifest) {
      this.currentManifest = newManifest;
    }
    const savePath = this.getUserDataFilePath();
    try {
      const dir = path.dirname(savePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      // Clone and sanitize before persisting: ensure obsolete keys and unwanted flags are purged
      const toSave: ServicesManifest = JSON.parse(JSON.stringify(this.currentManifest));
      for (const key of Object.keys(toSave.services)) {
        if (
          !this.DEFAULT_MANIFEST.services[key] &&
          !key.startsWith('api_') &&
          !key.startsWith('webview_') &&
          !key.startsWith('custom_') &&
          !key.startsWith('recipe_') &&
          key !== 'localllm'
        ) {
          delete (toSave.services as any)[key];
        }
      }
      if (toSave.services.localllm) {
        toSave.services.localllm.hidden = true;
      }
      fs.writeFileSync(savePath, JSON.stringify(toSave, null, 2), "utf-8");
      this.notify();
    } catch (err: any) {
      console.error("[ServiceManifestManager] Failed to persist ai_services.json:", err.message);
    }
  }

  public static setServiceEnabled(id: ProviderId, enabled: boolean): ServicesManifest {
    if (!this.isLoaded) this.loadManifest();
    if (this.currentManifest.services[id]) {
      this.currentManifest.services[id].enabled = enabled;
      this.saveManifest();
    }
    return this.currentManifest;
  }

  public static updateServiceEntry(id: ProviderId, updates: Partial<ServiceManifestEntry>): ServicesManifest {
    if (!this.isLoaded) this.loadManifest();
    if (this.currentManifest.services[id]) {
      this.currentManifest.services[id] = {
        ...this.currentManifest.services[id],
        ...updates,
      };
      this.saveManifest();
    }
    return this.currentManifest;
  }

  /**
   * Loads a preconfigured service definition from preconfigs folder.
   */
  public static getPreconfig(id: string): ServiceManifestEntry | null {
    const candidates: string[] = [];

    try {
      if (typeof __dirname !== 'undefined') {
        candidates.push(path.join(__dirname, `../preconfigs/${id}.json`));
        candidates.push(path.join(__dirname, `../../preconfigs/${id}.json`));
        candidates.push(path.join(__dirname, `preconfigs/${id}.json`));
      }
    } catch {}

    try {
      candidates.push(path.join(process.cwd(), `src/main/preconfigs/${id}.json`));
      candidates.push(path.join(process.cwd(), `preconfigs/${id}.json`));
      candidates.push(path.join(process.cwd(), `dist-electron/main/preconfigs/${id}.json`));
      candidates.push(path.join(process.cwd(), `dist-electron/preconfigs/${id}.json`));
    } catch {}

    try {
      if (app && typeof app.getAppPath === 'function') {
        const appPath = app.getAppPath();
        candidates.push(path.join(appPath, `preconfigs/${id}.json`));
        candidates.push(path.join(appPath, `dist-electron/main/preconfigs/${id}.json`));
        candidates.push(path.join(appPath, `src/main/preconfigs/${id}.json`));
      }
    } catch {}

    for (const p of candidates) {
      try {
        if (fs.existsSync(p)) {
          const raw = fs.readFileSync(p, "utf-8");
          return JSON.parse(raw) as ServiceManifestEntry;
        }
      } catch {}
    }
    return null;
  }

  /**
   * Dynamically installs and activates a preconfigured service (e.g. from Chrome extension sync).
   */
  public static installPreconfig(id: string): ServiceManifestEntry | null {
    if (!this.isLoaded) this.loadManifest();
    if (this.currentManifest.services[id]) {
      this.currentManifest.services[id].enabled = true;
      this.saveManifest();
      import('./modelRegistry.js').then(({ ModelRegistryManager }) => {
        try { ModelRegistryManager.updateProviderConfig(id as ProviderId, { serviceEnabled: true }); } catch {}
      }).catch(() => {});
      return this.currentManifest.services[id];
    }
    const preconfig = this.getPreconfig(id);
    if (preconfig) {
      this.currentManifest.services[id] = {
        ...preconfig,
        enabled: true,
      };
      this.saveManifest();
      import('./modelRegistry.js').then(({ ModelRegistryManager }) => {
        try { ModelRegistryManager.updateProviderConfig(id as ProviderId, { serviceEnabled: true }); } catch {}
      }).catch(() => {});
      return this.currentManifest.services[id];
    }
    return null;
  }

  /**
   * Scans available preconfigured service definitions from preconfigs directories.
   */
  public static getAvailablePreconfigs(): Array<{ id: string; hash: string; experimental: boolean }> {
    const results: Array<{ id: string; hash: string; experimental: boolean }> = [];
    const dirs = [
      path.join(__dirname, '../preconfigs'),
      path.join(__dirname, '../../preconfigs'),
      path.join(__dirname, 'preconfigs'),
      path.join(process.cwd(), 'src/main/preconfigs'),
      path.join(process.cwd(), 'preconfigs'),
      path.join(process.cwd(), 'dist-electron/main/preconfigs'),
      path.join(process.cwd(), 'dist-electron/preconfigs'),
    ];

    try {
      if (app && typeof app.getAppPath === 'function') {
        const appPath = app.getAppPath();
        dirs.push(path.join(appPath, 'preconfigs'));
        dirs.push(path.join(appPath, 'dist-electron/main/preconfigs'));
        dirs.push(path.join(appPath, 'src/main/preconfigs'));
      }
    } catch {}

    const seen = new Set<string>();
    for (const dir of dirs) {
      if (!fs.existsSync(dir)) continue;
      try {
        const files = fs.readdirSync(dir);
        for (const f of files) {
          if (f.startsWith('webview_') && f.endsWith('.json')) {
            const id = f.replace('.json', '');
            const hash = id.replace('webview_', '');
            if (!seen.has(id)) {
              seen.add(id);
              results.push({
                id,
                hash,
                experimental: true,
              });
            }
          }
        }
      } catch {}
    }
    return results;
  }

  /**
   * Adds a custom API provider.
   */
  public static addCustomApiProvider(data: { name: string; baseUrl: string; apiKey?: string; defaultModelId?: string }): ServicesManifest {
    if (!this.isLoaded) this.loadManifest();
    const id = `api_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
    const modelId = data.defaultModelId?.trim() || "default";
    const entry: ServiceManifestEntry = {
      id,
      name: data.name.trim() || "Custom API",
      company: "Custom API",
      enabled: true,
      hidden: false,
      experimental: false,
      providerType: "api",
      apiKey: data.apiKey?.trim() || "",
      baseUrl: data.baseUrl.trim(),
      url: data.baseUrl.trim(),
      partition: `persist:transgentic_${id}`,
      defaultModelId: modelId,
      accentColor: "cyan",
      iconName: "Braces",
      theme: {
        iconName: "Braces",
        accentColor: "cyan",
        textClass: "text-cyan-400",
        bgClass: "bg-cyan-500/10",
        borderClass: "border-cyan-500/30",
        badgeClass: "bg-cyan-500/15 text-cyan-300 border-cyan-500/30",
        glowClass: "shadow-[0_0_15px_rgba(6,182,212,0.15)]",
      },
      models: [
        {
          id: modelId,
          displayName: modelId,
          enabled: true,
          discoveredAvailable: true,
          userEnabled: true,
          mode: "general",
          modes: ["general", "coding", "writing"],
        },
      ],
    };
    this.currentManifest.services[id] = entry;
    this.saveManifest();
    return this.currentManifest;
  }

  /**
   * Updates an existing custom API provider.
   */
  public static updateCustomApiProvider(id: ProviderId, data: { name?: string; baseUrl?: string; apiKey?: string; defaultModelId?: string }): ServicesManifest {
    if (!this.isLoaded) this.loadManifest();
    const existing = this.currentManifest.services[id];
    if (existing) {
      if (data.name !== undefined) existing.name = data.name.trim();
      if (data.baseUrl !== undefined) {
        existing.baseUrl = data.baseUrl.trim();
        existing.url = data.baseUrl.trim();
      }
      if (data.apiKey !== undefined) existing.apiKey = data.apiKey.trim();
      if (data.defaultModelId !== undefined) {
        const mId = data.defaultModelId.trim();
        existing.defaultModelId = mId;
        if (!existing.models.some((m) => m.id === mId)) {
          existing.models.push({
            id: mId,
            displayName: mId,
            enabled: true,
            discoveredAvailable: true,
            userEnabled: true,
            mode: "general",
            modes: ["general", "coding", "writing"],
          });
        }
      }
      this.saveManifest();
    }
    return this.currentManifest;
  }

  /**
   * Updates display title for any service.
   */
  public static updateServiceTitle(id: ProviderId, title: string): ServicesManifest {
    if (!this.isLoaded) this.loadManifest();
    if (this.currentManifest.services[id] && title.trim()) {
      this.currentManifest.services[id].name = title.trim();
      this.saveManifest();
    }
    return this.currentManifest;
  }

  /**
   * Deletes a provider from manifest.
   */
  public static deleteProvider(id: ProviderId): ServicesManifest {
    if (!this.isLoaded) this.loadManifest();
    if (this.currentManifest.services[id]) {
      delete this.currentManifest.services[id];
      this.saveManifest();
    }

    // Purge any corresponding preconfig files from disk
    const preconfigCandidates = [
      path.join(process.cwd(), `src/main/preconfigs/${id}.json`),
      path.join(process.cwd(), `preconfigs/${id}.json`),
      path.join(process.cwd(), `dist-electron/main/preconfigs/${id}.json`),
      path.join(process.cwd(), `dist-electron/preconfigs/${id}.json`),
    ];
    for (const p of preconfigCandidates) {
      try {
        if (fs.existsSync(p)) fs.unlinkSync(p);
      } catch {}
    }

    return this.currentManifest;
  }

  public static getManifest(): ServicesManifest {
    if (!this.isLoaded) {
      this.loadManifest();
    }
    return this.currentManifest;
  }

  public static getExperimentalServices(): ServiceManifestEntry[] {
    return Object.values(this.currentManifest.services).filter((s) => s.experimental === true);
  }

  public static isServiceEnabled(id: ProviderId): boolean {
    const service = this.currentManifest.services[id];
    if (!service) {
      if (id === 'localllm') return true;
      return false;
    }
    return service.enabled !== false;
  }

  public static isServiceHidden(id: ProviderId): boolean {
    const service = this.currentManifest.services[id];
    if (!service) return true;
    return service.hidden === true;
  }

  public static getServiceName(id: ProviderId): string {
    if (id === 'localllm') {
      return this.currentManifest.services[id]?.name || 'Local LLM';
    }
    return this.currentManifest.services[id]?.name || id;
  }

  public static supportsModelRouting(id: ProviderId): boolean {
    const service = this.currentManifest.services[id];
    return service?.supportsModelRouting === true;
  }

  public static getModelsForMode(id: ProviderId, mode: TaskMode): ServiceModelDef[] {
    const service = this.currentManifest.services[id];
    if (!service) return [];
    const isApi = service.providerType === 'api' || id.startsWith('api_');
    if (!Array.isArray(service.models) || service.models.length === 0) {
      if (isApi && (mode === 'general' || mode === 'coding' || mode === 'writing')) {
        const defaultModel = service.defaultModelId || 'default';
        return [{ id: defaultModel, displayName: defaultModel, enabled: true, discoveredAvailable: true, userEnabled: true, mode: 'general', modes: ['general', 'coding', 'writing'] }];
      }
      return [];
    }
    const matched = service.models.filter((m) => {
      if (m.mode === mode) return true;
      if (Array.isArray(m.modes) && m.modes.includes(mode)) return true;
      // If mode is 'general' and no explicit mode is defined, include it
      if (mode === 'general' && !m.mode && (!m.modes || m.modes.length === 0)) return true;
      if (isApi && (mode === 'general' || mode === 'coding' || mode === 'writing') && (!m.modes || m.modes.length === 0)) return true;
      return false;
    });
    if (matched.length === 0 && isApi && (mode === 'general' || mode === 'coding' || mode === 'writing')) {
      return service.models;
    }
    return matched;
  }

  public static providerSupportsMode(providerId: ProviderId, mode: TaskMode): boolean {
    const models = this.getModelsForMode(providerId, mode);
    return models.length > 0;
  }

  public static isModelEnabled(providerId: ProviderId, modelId: string): boolean {
    if (!this.isServiceEnabled(providerId)) {
      return false;
    }
    const service = this.currentManifest.services[providerId];
    if (!service || !Array.isArray(service.models) || service.models.length === 0) {
      return true;
    }
    const model = service.models.find((m) => m.id === modelId);
    if (!model) {
      return false;
    }
    return model.enabled !== false;
  }

  public static getEnabledProviders(): ProviderId[] {
    const all = Object.keys(this.currentManifest.services) as ProviderId[];
    return all.filter((id) => this.isServiceEnabled(id));
  }

  public static getVisibleProviders(): ProviderId[] {
    const all = Object.keys(this.currentManifest.services) as ProviderId[];
    return all.filter((id) => this.isServiceEnabled(id) && !this.isServiceHidden(id));
  }

  /**
   * Checks for conflicts between user routes and developer-disabled services.
   */
  public static checkRouteConflicts(modeRoutes: Record<TaskMode, ModeRouteConfig>): ServiceRouteConflict[] {
    const conflicts: ServiceRouteConflict[] = [];

    for (const [modeKey, route] of Object.entries(modeRoutes) as Array<[TaskMode, ModeRouteConfig]>) {
      if (!route) continue;

      // Check primary provider
      if (!this.isServiceEnabled(route.primary)) {
        conflicts.push({
          mode: modeKey,
          role: "primary",
          provider: route.primary,
          providerName: this.getServiceName(route.primary),
          reason: "service_disabled",
        });
      }

      // Check fallback providers
      if (Array.isArray(route.fallbacks)) {
        for (const fallback of route.fallbacks) {
          if (fallback && !this.isServiceEnabled(fallback)) {
            // Only add if not duplicate for same mode/provider
            const alreadyLogged = conflicts.some((c) => c.mode === modeKey && c.provider === fallback);
            if (!alreadyLogged) {
              conflicts.push({
                mode: modeKey,
                role: "fallback",
                provider: fallback,
                providerName: this.getServiceName(fallback),
                reason: "service_disabled",
              });
            }
          }
        }
      }
    }

    return conflicts;
  }

  public static onManifestUpdate(listener: (manifest: ServicesManifest) => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  private static notify(): void {
    for (const listener of this.listeners) {
      try {
        listener(this.currentManifest);
      } catch {}
    }
  }
}

// Initial load
ServiceManifestManager.loadManifest();
