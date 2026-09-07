import fs from 'fs';
import path from 'path';
import { app } from 'electron';
import { ModelEntry, ProviderConfig, ProviderId, RegistryStore } from '../../shared/types.js';
import { globalRateLimiter } from '../mcp/rateLimiter.js';
import { ServiceManifestManager } from './serviceManifest.js';

export class ModelRegistryManager {
  private static readonly DEFAULT_REGISTRY: RegistryStore = {
    chatgpt: {
      serviceEnabled: true,
      activeSelectionMode: 'hybrid',
      allowMcpOverride: true,
      defaultModelId: 'gpt-4o',
      hourlyLimit: 30,
      cooldownSeconds: 6,
      models: [
        { id: 'gpt-4o', displayName: 'GPT-4o (Omni & Multimodal)', discoveredAvailable: true, userEnabled: true, requiresTier: 'Free/Plus', mode: 'general', modes: ['general', 'coding', 'writing', 'image'] },
        { id: 'o1', displayName: 'o1 (Deep Reasoning)', discoveredAvailable: true, userEnabled: true, requiresTier: 'Plus/Pro', mode: 'general', modes: ['general', 'coding', 'writing'] },
        { id: 'o3-mini', displayName: 'o3-mini (High Speed Reasoning)', discoveredAvailable: true, userEnabled: true, requiresTier: 'Free/Plus', mode: 'coding', modes: ['coding', 'general', 'writing'] },
        { id: 'gpt-4o-mini', displayName: 'GPT-4o mini (Lightweight)', discoveredAvailable: true, userEnabled: true, requiresTier: 'Free', mode: 'general', modes: ['general', 'coding', 'writing'] },
      ],
    },
    claude: {
      serviceEnabled: true,
      activeSelectionMode: 'hybrid',
      allowMcpOverride: true,
      defaultModelId: 'claude-3-5-sonnet',
      hourlyLimit: 35,
      cooldownSeconds: 6,
      models: [
        { id: 'claude-3-5-sonnet', displayName: 'Claude 3.5 Sonnet (Coding & Reasoning)', discoveredAvailable: true, userEnabled: true, requiresTier: 'Free/Pro', mode: 'coding', modes: ['general', 'coding', 'writing'] },
        { id: 'claude-3-opus', displayName: 'Claude 3 Opus (High Intelligence)', discoveredAvailable: true, userEnabled: true, requiresTier: 'Pro', mode: 'writing', modes: ['general', 'coding', 'writing'] },
        { id: 'claude-3-5-haiku', displayName: 'Claude 3.5 Haiku (Lightning Fast)', discoveredAvailable: true, userEnabled: true, requiresTier: 'Free/Pro', mode: 'general', modes: ['general', 'coding', 'writing'] },
      ],
    },
    gemini: {
      serviceEnabled: true,
      activeSelectionMode: 'hybrid',
      allowMcpOverride: true,
      defaultModelId: 'gemini-2-0-flash',
      hourlyLimit: 50,
      cooldownSeconds: 5,
      models: [
        { id: 'gemini-2-0-flash', displayName: 'Gemini 2.0 Flash (Next-Gen Multimodal)', discoveredAvailable: true, userEnabled: true, requiresTier: 'Free/Advanced', mode: 'general', modes: ['general', 'coding', 'writing', 'image', 'video', 'audio'] },
        { id: 'gemini-2-0-pro', displayName: 'Gemini 2.0 Pro Experimental', discoveredAvailable: true, userEnabled: true, requiresTier: 'Advanced', mode: 'general', modes: ['general', 'coding', 'writing', 'image', 'video', 'audio'] },
        { id: 'gemini-1-5-flash', displayName: 'Gemini 1.5 Flash (Fast)', discoveredAvailable: true, userEnabled: true, requiresTier: 'Free', mode: 'general', modes: ['general', 'coding', 'writing', 'video', 'audio'] },
        { id: 'gemini-1-5-pro', displayName: 'Gemini 1.5 Pro (2M Context)', discoveredAvailable: true, userEnabled: true, requiresTier: 'Free/Advanced', mode: 'general', modes: ['general', 'coding', 'writing', 'video', 'audio'] },
      ],
    },
    grok: {
      serviceEnabled: true,
      activeSelectionMode: 'hybrid',
      allowMcpOverride: true,
      defaultModelId: 'grok-3',
      hourlyLimit: 40,
      cooldownSeconds: 6,
      models: [
        { id: 'grok-3', displayName: 'Grok 3 (State-of-the-Art)', discoveredAvailable: true, userEnabled: true, requiresTier: 'Premium', mode: 'general', modes: ['general', 'coding', 'writing', 'video'] },
        { id: 'grok-3-think', displayName: 'Grok 3 Think / DeepSearch', discoveredAvailable: true, userEnabled: true, requiresTier: 'Premium+', mode: 'general', modes: ['general', 'coding', 'writing', 'video'] },
        { id: 'grok-2', displayName: 'Grok 2 (Speed & Coding)', discoveredAvailable: true, userEnabled: true, requiresTier: 'Premium', mode: 'coding', modes: ['general', 'coding', 'writing'] },
        { id: 'grok-2-vision', displayName: 'Grok 2 Vision / Imagine', discoveredAvailable: true, userEnabled: true, requiresTier: 'Premium', mode: 'image', modes: ['image', 'video', 'general'] },
      ],
    },
  };

  private static currentRegistry: RegistryStore = JSON.parse(
    JSON.stringify(ModelRegistryManager.DEFAULT_REGISTRY)
  );

  private static listeners: Array<(registry: RegistryStore) => void> = [];

  private static getStoragePath(): string {
    try {
      if (app && typeof app.getPath === 'function') {
        return path.join(app.getPath('userData'), 'models_registry.json');
      }
    } catch {}
    return path.join(process.cwd(), 'models_registry.json');
  }

  public static loadPersistedRegistry(): void {
    let parsed: any = null;
    try {
      const filePath = this.getStoragePath();
      if (fs.existsSync(filePath)) {
        const raw = fs.readFileSync(filePath, 'utf-8');
        parsed = JSON.parse(raw);

        // Merge with defaults to ensure all providers and rate limit fields exist
        this.currentRegistry = {
          ...this.DEFAULT_REGISTRY,
          ...parsed,
          chatgpt: { ...this.DEFAULT_REGISTRY.chatgpt, ...(parsed?.chatgpt || {}) },
          claude: { ...this.DEFAULT_REGISTRY.claude, ...(parsed?.claude || {}) },
          gemini: { ...this.DEFAULT_REGISTRY.gemini, ...(parsed?.gemini || {}) },
          grok: { ...this.DEFAULT_REGISTRY.grok, ...(parsed?.grok || {}) },
        };
      }
    } catch {
      this.currentRegistry = JSON.parse(JSON.stringify(this.DEFAULT_REGISTRY));
    }

    // Ensure serviceEnabled aligns with ServiceManifestManager
    try {
      const manifest = ServiceManifestManager.getManifest();
      for (const [p, srv] of Object.entries(manifest.services)) {
        const providerId = p as ProviderId;
        if (!this.currentRegistry[providerId]) {
          this.currentRegistry[providerId] = {
            serviceEnabled: srv.enabled !== false,
            activeSelectionMode: 'hybrid',
            allowMcpOverride: true,
            defaultModelId: srv.defaultModelId || 'default',
            hourlyLimit: 30,
            cooldownSeconds: 6,
            models: (srv.models || []).map((m) => ({
              id: m.id,
              displayName: m.displayName || m.id,
              discoveredAvailable: true,
              userEnabled: m.enabled !== false,
              requiresTier: m.requiresTier,
              mode: m.mode,
              modes: m.modes,
            })),
          };
        } else if (srv && typeof srv.enabled === 'boolean') {
          // If manifest explicitly enables service (such as preconfig or user sync), align registry
          if (srv.enabled) {
            this.currentRegistry[providerId]!.serviceEnabled = true;
          } else if (parsed?.[p]?.serviceEnabled === undefined) {
            this.currentRegistry[providerId]!.serviceEnabled = srv.enabled;
          }
        }
      }
    } catch {}

    // Synchronize loaded limits with rate limiter
    for (const [p, config] of Object.entries(this.currentRegistry)) {
      if (config && config.hourlyLimit) {
        globalRateLimiter.setHourlyLimit(p as ProviderId, config.hourlyLimit);
      }
    }
  }

  public static savePersistedRegistry(): void {
    try {
      const filePath = this.getStoragePath();
      const dir = path.dirname(filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(filePath, JSON.stringify(this.currentRegistry, null, 2), 'utf-8');
      this.notifyListeners();
    } catch {}
  }

  public static resetToDefaults(): RegistryStore {
    this.currentRegistry = JSON.parse(JSON.stringify(this.DEFAULT_REGISTRY));
    this.savePersistedRegistry();
    return this.getRegistry();
  }

  public static getRegistry(): RegistryStore {
    return JSON.parse(JSON.stringify(this.currentRegistry));
  }

  public static getProviderConfig(id: ProviderId): ProviderConfig {
    const config =
      this.currentRegistry[id] ||
      (this.DEFAULT_REGISTRY as any)[id] || {
        serviceEnabled: true,
        activeSelectionMode: 'auto',
        allowMcpOverride: true,
        models: [],
      };

    if (ServiceManifestManager.isServiceEnabled(id)) {
      config.serviceEnabled = true;
    }
    return config;
  }

  /**
   * Availability Logic:
   * IsUsable = serviceEnabled && userEnabled && discoveredAvailable
   */
  public static isModelUsable(providerId: ProviderId, modelId: string): boolean {
    if (!ServiceManifestManager.isServiceEnabled(providerId)) return false;
    if (!ServiceManifestManager.isModelEnabled(providerId, modelId)) return false;
    const config = this.currentRegistry[providerId];
    if (!config || !config.serviceEnabled) return false;

    const model = config.models.find((m) => m.id === modelId);
    if (!model) return false;

    return model.userEnabled && model.discoveredAvailable;
  }

  public static getUsableModels(providerId: ProviderId): ModelEntry[] {
    if (!ServiceManifestManager.isServiceEnabled(providerId)) return [];
    const config = this.currentRegistry[providerId];
    if (!config || !config.serviceEnabled) return [];

    return config.models.filter(
      (m) =>
        ServiceManifestManager.isModelEnabled(providerId, m.id) &&
        m.userEnabled &&
        m.discoveredAvailable
    );
  }

  /**
   * Evaluates the 3-tier model selection hierarchy:
   * 1. Mode Lock: If 'lock_active_session', bypass DOM model switching and return null.
   * 2. MCP Override: If 'allowMcpOverride' is true and requestedModel is usable, use requestedModel.
   * 3. Settings Default: Otherwise, use configured defaultModelId (if usable).
   * 4. Fallback: First available usable model.
   */
  public static getEffectiveModel(providerId: ProviderId, requestedModel?: string): string | null {
    const config = this.currentRegistry[providerId];
    if (!config || !config.serviceEnabled) {
      return null;
    }

    // Tier 1: Lock Active Session mode overrides all model switching
    if (config.activeSelectionMode === 'lock_active_session') {
      return null;
    }

    // Tier 2: MCP Tool parameter override
    if (config.allowMcpOverride && requestedModel) {
      if (this.isModelUsable(providerId, requestedModel)) {
        return requestedModel;
      }
    }

    // Tier 3: Transgentic default model setting
    if (config.defaultModelId && this.isModelUsable(providerId, config.defaultModelId)) {
      return config.defaultModelId;
    }

    // Tier 4: First available usable model fallback
    const usable = this.getUsableModels(providerId);
    if (usable.length > 0) {
      return usable[0].id;
    }

    return null;
  }

  public static updateProviderConfig(
    providerId: ProviderId,
    updates: Partial<ProviderConfig>
  ): ProviderConfig {
    const config = this.currentRegistry[providerId] || this.getProviderConfig(providerId);

    this.currentRegistry[providerId] = {
      ...config,
      ...updates,
    };

    if (updates.hourlyLimit) {
      globalRateLimiter.setHourlyLimit(providerId, updates.hourlyLimit);
    }

    this.savePersistedRegistry();
    return this.currentRegistry[providerId];
  }

  public static deleteProviderConfig(providerId: ProviderId): void {
    if (this.currentRegistry[providerId]) {
      delete this.currentRegistry[providerId];
      this.savePersistedRegistry();
      this.notifyListeners();
    }
  }

  public static toggleModel(
    providerId: ProviderId,
    modelId: string,
    userEnabled: boolean
  ): RegistryStore {
    const config = this.currentRegistry[providerId];
    if (config) {
      const model = config.models.find((m) => m.id === modelId);
      if (model) {
        model.userEnabled = userEnabled;
        this.savePersistedRegistry();
      }
    }
    return this.getRegistry();
  }

  public static toggleService(
    providerId: ProviderId,
    serviceEnabled: boolean
  ): RegistryStore {
    const config = this.currentRegistry[providerId];
    if (config) {
      config.serviceEnabled = serviceEnabled;
      this.savePersistedRegistry();
    }
    return this.getRegistry();
  }

  /**
   * Non-Destructive Sync:
   * Merges newly scraped models without deleting historical models.
   */
  public static mergeDiscoveredModels(
    providerId: ProviderId,
    discovered: Array<{ id: string; displayName: string; requiresTier?: string }>
  ): RegistryStore {
    if (!this.currentRegistry[providerId]) {
      this.currentRegistry[providerId] = {
        ...this.getProviderConfig(providerId),
        models: [],
      };
    }
    const config = this.currentRegistry[providerId];
    if (!config) return this.getRegistry();

    const discoveredIds = new Set(discovered.map((d) => d.id));
    const nowIso = new Date().toISOString();

    // 1. Update existing models
    for (const existing of config.models) {
      if (discoveredIds.has(existing.id)) {
        existing.discoveredAvailable = true;
        existing.lastSeen = nowIso;
      } else {
        existing.discoveredAvailable = false;
      }
    }

    // 2. Add newly discovered models
    for (const d of discovered) {
      const exists = config.models.some((m) => m.id === d.id);
      if (!exists) {
        config.models.push({
          id: d.id,
          displayName: d.displayName,
          discoveredAvailable: true,
          userEnabled: true,
          requiresTier: d.requiresTier,
          lastSeen: nowIso,
        });
      }
    }

    this.savePersistedRegistry();
    return this.getRegistry();
  }

  public static onRegistryUpdate(callback: (registry: RegistryStore) => void): () => void {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter((cb) => cb !== callback);
    };
  }

  private static notifyListeners(): void {
    const reg = this.getRegistry();
    for (const listener of this.listeners) {
      try {
        listener(reg);
      } catch {}
    }
  }
}
