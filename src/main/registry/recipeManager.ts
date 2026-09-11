import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';
import {
  CustomRecipe,
  validateCustomRecipe,
  BUILTIN_RECIPES,
  bumpSemanticVersion,
  normalizeSelectorList,
  normalizeSelectorCandidate,
} from '../../shared/types/recipe.js';
import { ProviderId, LocalLLMConfig } from '../../shared/types.js';
import { ServiceManifestManager } from './serviceManifest.js';
import { ModelRegistryManager } from './modelRegistry.js';
import { DynamicRouter } from '../mcp/router.js';
import { globalSessionManager } from '../webviews/sessionManager.js';
import { CustomRecipeAdapter } from '../webviews/customRecipeAdapter.js';
import { PartitionLifecycleManager } from '../auth/partitionLifecycle.js';
import { AccountRegistryManager } from './accountRegistry.js';
import { LocalLlmClient } from '../localllm/localLlmClient.js';
import { getDefaultAssetsDirectory } from '../storage/assetManager.js';
import { confirmRecipeInstallation } from './recipeConsent.js';

export class RecipeManager {
  private static instance: RecipeManager | null = null;

  public static getInstance(): RecipeManager {
    if (!this.instance) {
      this.instance = new RecipeManager();
    }
    return this.instance;
  }

  private recipesMap: Map<string, CustomRecipe> = new Map();
  private healedMap: Map<string, CustomRecipe> = new Map();
  private storageDirectory: string = '';
  private isLoaded: boolean = false;

  constructor() {
    this.loadPersistedRecipes();
  }

  public setStorageDirectory(newDir: string): void {
    if (newDir && typeof newDir === 'string') {
      this.storageDirectory = newDir;
      this.ensureDirectoriesExist();
      this.loadPersistedRecipes();
    }
  }

  public getStorageDirectory(): string {
    if (this.storageDirectory) return this.storageDirectory;
    if (process.env.NODE_ENV === 'test' || process.env.VITEST) {
      const workerId = process.env.VITEST_WORKER_ID || process.pid;
      return path.join(process.cwd(), `.test_transgentic_data_${workerId}`);
    }
    return getDefaultAssetsDirectory();
  }

  public getRecipesDirectory(): string {
    return path.join(this.getStorageDirectory(), 'Recipes');
  }

  public getCustomDirectory(): string {
    return path.join(this.getRecipesDirectory(), 'Custom');
  }

  public getHealedDirectory(): string {
    return path.join(this.getRecipesDirectory(), 'Healed');
  }

  public getHistoryDirectory(): string {
    return path.join(this.getRecipesDirectory(), 'History');
  }

  private ensureDirectoriesExist(): void {
    try {
      const dirs = [
        this.getRecipesDirectory(),
        this.getCustomDirectory(),
        this.getHealedDirectory(),
        this.getHistoryDirectory(),
      ];
      for (const d of dirs) {
        if (!fs.existsSync(d)) {
          fs.mkdirSync(d, { recursive: true });
        }
      }
    } catch {}
  }

  public getStoragePath(): string {
    try {
      if (app && typeof app.getPath === 'function') {
        return path.join(app.getPath('userData'), 'recipes', 'custom_recipes.json');
      }
    } catch {}
    if (process.env.NODE_ENV === 'test' || process.env.VITEST) {
      const workerId = process.env.VITEST_WORKER_ID || process.pid;
      return path.join(process.cwd(), `.test_custom_recipes_${workerId}.json`);
    }
    return path.join(process.cwd(), 'custom_recipes.json');
  }

  public loadPersistedRecipes(): CustomRecipe[] {
    this.isLoaded = true;
    this.recipesMap.clear();
    this.healedMap.clear();
    this.ensureDirectoriesExist();

    const customDir = this.getCustomDirectory();
    const healedDir = this.getHealedDirectory();

    // 1. Load standalone recipe JSON files from Recipes/Custom/
    if (fs.existsSync(customDir)) {
      try {
        const files = fs.readdirSync(customDir);
        for (const file of files) {
          if (file.endsWith('.json')) {
            try {
              const raw = fs.readFileSync(path.join(customDir, file), 'utf-8');
              const parsed = JSON.parse(raw);
              const val = validateCustomRecipe(parsed);
              if (val.valid && val.recipe) {
                this.recipesMap.set(val.recipe.id, val.recipe);
              }
            } catch {}
          }
        }
      } catch {}
    }

    // 2. Load healed overrides from Recipes/Healed/
    if (fs.existsSync(healedDir)) {
      try {
        const files = fs.readdirSync(healedDir);
        for (const file of files) {
          if (file.endsWith('.json')) {
            try {
              const raw = fs.readFileSync(path.join(healedDir, file), 'utf-8');
              const parsed = JSON.parse(raw);
              const val = validateCustomRecipe(parsed);
              if (val.valid && val.recipe) {
                this.healedMap.set(val.recipe.id, val.recipe);
                const clean = val.recipe.id.replace(/^custom_|^recipe_/, '');
                this.healedMap.set(clean, val.recipe);
              }
            } catch {}
          }
        }
      } catch {}
    }

    // 3. Legacy file check & migration from userData/recipes/custom_recipes.json
    const legacyPath = this.getStoragePath();
    try {
      if (fs.existsSync(legacyPath)) {
        const raw = fs.readFileSync(legacyPath, 'utf-8');
        if (raw && raw.trim().length > 0) {
          const parsed = JSON.parse(raw);
          const list: CustomRecipe[] = Array.isArray(parsed) ? parsed : parsed.recipes || [];
          for (const item of list) {
            const val = validateCustomRecipe(item);
            if (val.valid && val.recipe) {
              if (!this.recipesMap.has(val.recipe.id)) {
                this.recipesMap.set(val.recipe.id, val.recipe);
                // Migrate to standalone file
                try {
                  const targetFile = path.join(customDir, `${val.recipe.id.replace(/^custom_|^recipe_/, '')}.json`);
                  fs.writeFileSync(targetFile, JSON.stringify(val.recipe, null, 2), 'utf-8');
                } catch {}
              }
            }
          }
        }
      }
    } catch (err: any) {
      console.warn('[RecipeManager] Notice reading legacy custom recipes:', err?.message || err);
    }

    return Array.from(this.recipesMap.values());
  }

  public savePersistedRecipes(): void {
    this.ensureDirectoriesExist();
    const customDir = this.getCustomDirectory();

    // 1. Save standalone files in Recipes/Custom/
    for (const recipe of this.recipesMap.values()) {
      try {
        const cleanId = recipe.id.replace(/^custom_|^recipe_/, '');
        const targetFile = path.join(customDir, `${cleanId}.json`);
        fs.writeFileSync(targetFile, JSON.stringify(recipe, null, 2), 'utf-8');
      } catch {}
    }

    // 2. Also keep legacy index file updated for backward compatibility
    const filePath = this.getStoragePath();
    try {
      const dir = path.dirname(filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const list = Array.from(this.recipesMap.values());
      fs.writeFileSync(filePath, JSON.stringify(list, null, 2), 'utf-8');
    } catch (err: any) {
      console.error('[RecipeManager] Failed to persist custom recipes index:', err?.message || err);
    }
  }

  public getCustomRecipes(): CustomRecipe[] {
    if (!this.isLoaded) {
      this.loadPersistedRecipes();
    }
    return Array.from(this.recipesMap.values());
  }

  public getRecipe(id: string): CustomRecipe | undefined {
    if (!this.isLoaded) {
      this.loadPersistedRecipes();
    }
    const cleanId = id.replace(/^custom_|^recipe_/, '');

    // 1. Local healed override takes top priority
    if (this.healedMap.has(id)) return this.healedMap.get(id);
    if (this.healedMap.has(cleanId)) return this.healedMap.get(cleanId);

    // 2. Custom recipe
    if (this.recipesMap.has(id)) return this.recipesMap.get(id);
    if (this.recipesMap.has(cleanId)) return this.recipesMap.get(cleanId);

    // 3. Bundled built-in default
    if ((BUILTIN_RECIPES as any)[cleanId]) {
      return (BUILTIN_RECIPES as any)[cleanId];
    }
    return undefined;
  }

  /** Enabling an existing custom recipe asks again and saves the accepted notice locally. */
  public async confirmEnable(providerId: ProviderId): Promise<void> {
    if (!/^(custom_|webview_|recipe_)/.test(providerId)) return;
    const recipe = this.getRecipe(providerId);
    if (!recipe) throw new Error('Custom recipe is unavailable. Install it before enabling.');
    await confirmRecipeInstallation(recipe);
    const cleanId = recipe.id.replace(/^custom_|^recipe_/, '');
    const original = this.recipesMap.get(recipe.id) || this.recipesMap.get(cleanId);
    if (original) original.disclaimerAcceptance = recipe.disclaimerAcceptance;
    if (this.healedMap.has(recipe.id) || this.healedMap.has(cleanId)) {
      this.ensureDirectoriesExist();
      fs.writeFileSync(path.join(this.getHealedDirectory(), `${cleanId}.json`), JSON.stringify(recipe, null, 2), 'utf8');
    }
    this.savePersistedRecipes();
  }

  /**
   * Installs and registers a custom recipe dynamically into Transgentic's Manifest,
   * Model Registry, Route Matrix, and Session Manager.
   */
  public async installRecipe(
    rawRecipe: any,
    cookies?: any[]
  ): Promise<{ success: boolean; recipe: CustomRecipe; providerId: ProviderId; cookiesCount?: number }> {
    const validation = validateCustomRecipe(rawRecipe);
    if (!validation.valid || !validation.recipe) {
      throw new Error(`Invalid Recipe JSON: ${validation.errors.join(', ')}`);
    }

    const recipe = validation.recipe;
    // Imported acceptance records never replace a confirmation on this device.
    delete recipe.disclaimerAcceptance;
    await confirmRecipeInstallation(recipe);
    const providerId = (recipe.id.startsWith('custom_') || recipe.id.startsWith('webview_') ? recipe.id : `custom_${recipe.id}`) as ProviderId;
    const cleanId = recipe.id.replace(/^custom_|^recipe_/, '');
    const partitionKey = recipe.partition || PartitionLifecycleManager.getPartitionKey(providerId);
    recipe.partition = partitionKey;

    // Ensure it has a semantic version (e.g. 1.0.0) as initial first version
    if (!recipe.version || recipe.version === '1.0') {
      recipe.version = '1.0.0';
    }

    // 1. Save in recipe store and persist locally as standalone file in Recipes/Custom/<cleanId>.json
    this.recipesMap.set(recipe.id, recipe);
    this.recipesMap.set(cleanId, recipe);
    this.savePersistedRecipes();

    // 2. Archive initial first version in Recipes/History/ if no historical snapshot exists yet
    this.ensureDirectoriesExist();
    const historyDir = this.getHistoryDirectory();
    try {
      const existingHistory = fs.existsSync(historyDir)
        ? fs.readdirSync(historyDir).filter((f) => f.startsWith(`${cleanId}.v`) && f.endsWith('.json'))
        : [];
      if (existingHistory.length === 0) {
        const historyFile = path.join(
          historyDir,
          `${cleanId}.v${recipe.version}_${Date.now()}.json`
        );
        fs.writeFileSync(historyFile, JSON.stringify(recipe, null, 2), 'utf-8');
      }
    } catch (hErr: any) {
      console.warn('[RecipeManager] Notice archiving initial recipe snapshot:', hErr?.message || hErr);
    }

    // 2. Register or update Service Manifest entry
    this.syncRecipeToManifest(recipe, providerId, partitionKey);

    // 3. Register provider config in Model Registry
    const modelsDef = (recipe.models && recipe.models.length > 0)
      ? recipe.models.map(m => ({
          id: m.id,
          displayName: m.displayName || m.id,
          enabled: true,
          discoveredAvailable: true,
          userEnabled: true,
          requiresTier: m.requiresTier || 'Free',
          mode: (m.mode || 'general') as any,
          modes: (m.modes && m.modes.length > 0 ? m.modes : ['general', 'coding']) as any,
        }))
      : [
          {
            id: 'default',
            displayName: `${recipe.title} Default Model`,
            enabled: true,
            discoveredAvailable: true,
            userEnabled: true,
            requiresTier: 'Free',
            mode: 'general' as any,
            modes: ['general', 'coding'] as any,
          },
        ];

    try {
      ModelRegistryManager.updateProviderConfig(providerId, {
        serviceEnabled: true,
        defaultModelId: modelsDef[0]?.id || 'default',
        models: modelsDef,
      });
    } catch {}

    // 4. Update Account Registry partition mapping
    try {
      AccountRegistryManager.setProviderPartition(providerId, partitionKey);
    } catch {}

    // 5. Pre-configure session anti-detection & headers
    try {
      globalSessionManager.configureSession(partitionKey);
    } catch {}

    // 6. Instantiate and register CustomRecipeAdapter into globalSessionManager
    const adapter = new CustomRecipeAdapter(recipe);
    globalSessionManager.registerAdapter(adapter);

    // 7. Ingest and bind cookies into partition if provided
    let injectedCount = 0;
    if (cookies && Array.isArray(cookies) && cookies.length > 0) {
      try {
        const domain = recipe.domainMatch.startsWith('.') ? recipe.domainMatch : `.${recipe.domainMatch}`;
        const entryUrl = recipe.url || `https://${recipe.domainMatch}`;
        injectedCount = await PartitionLifecycleManager.syncCookiesToPartition(
          partitionKey,
          cookies,
          domain,
          entryUrl
        );
      } catch (cErr) {
        console.warn('[RecipeManager] Cookie sync warning for recipe:', cErr);
      }
    }

    return {
      success: true,
      recipe,
      providerId,
      cookiesCount: injectedCount,
    };
  }

  /**
   * Synchronizes a recipe definition into ServiceManifestManager.
   */
  public syncRecipeToManifest(recipe: CustomRecipe, providerId: ProviderId, partitionKey: string): void {
    const entryUrl = recipe.url || `https://${recipe.domainMatch}`;
    const modelsDef = (recipe.models && recipe.models.length > 0)
      ? recipe.models.map(m => ({
          id: m.id,
          displayName: m.displayName || m.id,
          enabled: true,
          discoveredAvailable: true,
          userEnabled: true,
          requiresTier: m.requiresTier || 'Free',
          mode: (m.mode || 'general') as any,
          modes: (m.modes && m.modes.length > 0 ? m.modes : ['general', 'coding']) as any,
        }))
      : [
          {
            id: 'default',
            displayName: `${recipe.title} Default Model`,
            enabled: true,
            discoveredAvailable: true,
            userEnabled: true,
            requiresTier: 'Free',
            mode: 'general' as any,
            modes: ['general', 'coding'] as any,
          },
        ];

    const manifest = ServiceManifestManager.getManifest();
    const existing = manifest.services[providerId];
    const cleanTitle = (recipe.title && !recipe.title.toLowerCase().includes('experimental') ? recipe.title : '') || recipe.domainMatch || 'Custom Webview';

    manifest.services[providerId] = {
      id: providerId,
      name: cleanTitle,
      company: cleanTitle,
      enabled: existing ? existing.enabled : true,
      hidden: existing ? existing.hidden : false,
      providerType: 'webview',
      disclaimer: recipe.disclaimer,
      supportsModelRouting: true,
      url: entryUrl,
      partition: partitionKey,
      defaultModelId: existing?.defaultModelId || modelsDef[0]?.id || 'default',
      accentColor: existing?.accentColor || 'teal',
      iconName: existing?.iconName || 'Globe',
      theme: existing?.theme || {
        iconName: 'Globe',
        accentColor: 'teal',
        textClass: 'text-teal-400',
        bgClass: 'bg-teal-500/10',
        borderClass: 'border-teal-500/30',
        badgeClass: 'bg-teal-500/15 text-teal-300 border-teal-500/30',
        glowClass: 'shadow-[0_0_15px_rgba(20,184,166,0.15)]',
      },
      models: modelsDef,
    };
    ServiceManifestManager.saveManifest(manifest);
  }

  /**
   * Unregisters and deletes a custom recipe.
   */
  public deleteRecipe(recipeId: string): boolean {
    const cleanId = recipeId.replace(/^custom_|^recipe_/, '');
    const providerId = (recipeId.startsWith('custom_') || recipeId.startsWith('webview_') ? recipeId : `custom_${cleanId}`) as ProviderId;

    if (!this.recipesMap.has(cleanId) && !this.recipesMap.has(recipeId)) {
      return false;
    }

    this.recipesMap.delete(cleanId);
    this.recipesMap.delete(recipeId);
    const targetFile = path.join(this.getCustomDirectory(), `${cleanId}.json`);
    if (fs.existsSync(targetFile)) {
      try { fs.unlinkSync(targetFile); } catch {}
    }
    this.savePersistedRecipes();

    // Remove from Manifest
    const manifest = ServiceManifestManager.getManifest();
    if (manifest.services[providerId]) {
      delete manifest.services[providerId];
      ServiceManifestManager.saveManifest(manifest);
    }

    // Unregister from Session Manager
    globalSessionManager.unregisterAdapter(providerId);

    return true;
  }

  /**
   * Initializes all saved recipes at app startup.
   */
  public initializeAllCustomRecipes(): void {
    const recipes = this.loadPersistedRecipes();
    for (const r of recipes) {
      try {
        const providerId = (r.id.startsWith('custom_') || r.id.startsWith('webview_') ? r.id : `custom_${r.id}`) as ProviderId;
        const partitionKey = r.partition || PartitionLifecycleManager.getPartitionKey(providerId);
        r.partition = partitionKey;

        // Ensure Manifest registration
        this.syncRecipeToManifest(r, providerId, partitionKey);

        // Ensure Account Registry partition mapping
        try {
          AccountRegistryManager.setProviderPartition(providerId, partitionKey);
        } catch {}

        // Pre-configure Chromium session anti-detection & headers
        try {
          globalSessionManager.configureSession(partitionKey);
        } catch {}

        // Instantiate and register CustomRecipeAdapter into globalSessionManager
        const adapter = new CustomRecipeAdapter(r);
        globalSessionManager.registerAdapter(adapter);
      } catch (err: any) {
        console.warn(`[RecipeManager] Failed to init adapter for recipe ${r.id}:`, err?.message || err);
      }
    }
  }

  /**
   * Patches an existing recipe with repaired selectors, increments semantic version,
   * archives a snapshot into Recipes/History/, and updates the active runtime adapter.
   */
  public healRecipeSelectors(
    providerId: ProviderId,
    verifiedSelectors: Record<string, string>,
    healer: 'localllm' | 'visual_inspector' | 'user' = 'localllm'
  ): { success: boolean; recipe: CustomRecipe; version: string; changelog: string[] } {
    const current = this.getRecipe(providerId);
    if (!current) {
      throw new Error(`Cannot heal unknown provider ${providerId}`);
    }

    const cleanId = providerId.replace(/^custom_|^recipe_/, '');
    const isBuiltin = ['chatgpt', 'claude', 'gemini', 'grok'].includes(cleanId);

    // 1. Archive current version to History
    this.ensureDirectoriesExist();
    const historyFile = path.join(
      this.getHistoryDirectory(),
      `${cleanId}.v${current.version || '1.0.0'}_${Date.now()}.json`
    );
    try {
      fs.writeFileSync(historyFile, JSON.stringify(current, null, 2), 'utf-8');
    } catch (e: any) {
      console.warn('[RecipeManager] Failed to archive recipe history snapshot:', e?.message || e);
    }

    // 2. Compute new version and changelog
    const nextVersion = bumpSemanticVersion(current.version);
    const changelog: string[] = [];
    const updatedSelectors = { ...current.selectors };
    const updatedResponse = structuredClone(current.response);

    for (const [key, val] of Object.entries(verifiedSelectors)) {
      if (typeof val === 'string' && val.trim().length > 0) {
        if (key.startsWith('attachment.')) {
          const parts = key.split('.');
          const mode = parts[1] as keyof typeof updatedResponse.modes;
          const upload = updatedResponse.modes[mode]?.inputAttachments;
          if (!upload) continue;
          if (parts[2] === 'revealSteps' && /^\d+$/.test(parts[3] || '') && parts[4] === 'selectors') {
            const index = Number(parts[3]);
            const step = upload.revealSteps?.[index];
            if (!step) continue;
            const oldVal = step.target.selectors;
            const oldList = normalizeSelectorList(oldVal);
            step.target.selectors = normalizeSelectorCandidate([val.trim(), ...oldList.filter(selector => selector !== val.trim())]);
            changelog.push(`${key}: "${oldList.join(', ') || 'none'}" -> "${val.trim()}"`);
            continue;
          }
          if (['fileInput', 'ready', 'cleanup'].includes(parts[2])) {
            const field = parts[2] as 'fileInput' | 'ready' | 'cleanup';
            const oldVal = upload[field];
            const oldList = normalizeSelectorList(oldVal);
            (upload as any)[field] = normalizeSelectorCandidate([val.trim(), ...oldList.filter(selector => selector !== val.trim())]);
            changelog.push(`${key}: "${oldList.join(', ') || 'none'}" -> "${val.trim()}"`);
          }
          continue;
        }
        const oldVal = (current.selectors as any)[key];
        const oldList = normalizeSelectorList(oldVal);
        const updatedList = [val.trim(), ...oldList.filter((s) => s !== val.trim())];
        (updatedSelectors as any)[key] = normalizeSelectorCandidate(updatedList);
        changelog.push(`${key}: "${oldVal ? (Array.isArray(oldVal) ? oldVal.join(', ') : oldVal) : 'none'}" -> "${val.trim()}"`);
      }
    }

    const updatedRecipe: CustomRecipe = {
      ...current,
      version: nextVersion,
      selectors: updatedSelectors,
      response: updatedResponse,
      healedAt: new Date().toISOString(),
      healer,
      changelog,
      previousVersions: [...(current.previousVersions || []), current.version || '1.0.0'],
      updatedAt: new Date().toISOString(),
    };

    // 3. Save to disk
    if (isBuiltin) {
      const healedFile = path.join(this.getHealedDirectory(), `${cleanId}.json`);
      fs.writeFileSync(healedFile, JSON.stringify(updatedRecipe, null, 2), 'utf-8');
      this.healedMap.set(cleanId, updatedRecipe);
      this.healedMap.set(providerId, updatedRecipe);
    } else {
      const customFile = path.join(this.getCustomDirectory(), `${cleanId}.json`);
      fs.writeFileSync(customFile, JSON.stringify(updatedRecipe, null, 2), 'utf-8');
      this.recipesMap.set(current.id, updatedRecipe);
      this.recipesMap.set(cleanId, updatedRecipe);
      this.savePersistedRecipes();
    }

    // 4. Update manifest and session adapter
    this.syncRecipeToManifest(updatedRecipe, providerId, updatedRecipe.partition || PartitionLifecycleManager.getPartitionKey(providerId));
    const existing = globalSessionManager.getAdapter(providerId);
    if (existing && (existing as any).recipe) {
      (existing as any).recipe = updatedRecipe;
    }
    const adapter = new CustomRecipeAdapter(updatedRecipe);
    globalSessionManager.registerAdapter(adapter);

    return {
      success: true,
      recipe: updatedRecipe,
      version: nextVersion,
      changelog,
    };
  }

  /**
   * Reverts a built-in provider to its bundled default recipe, removing the local healed override.
   */
  public resetToDefault(providerId: ProviderId): { success: boolean; recipe: CustomRecipe; message: string } {
    const cleanId = providerId.replace(/^custom_|^recipe_/, '');
    if (!['chatgpt', 'claude', 'gemini', 'grok'].includes(cleanId)) {
      throw new Error(`Reset to default is only applicable to built-in providers (${cleanId} is custom).`);
    }

    const healedFile = path.join(this.getHealedDirectory(), `${cleanId}.json`);
    if (fs.existsSync(healedFile)) {
      // Archive before deleting
      try {
        const currentHealed = JSON.parse(fs.readFileSync(healedFile, 'utf-8'));
        const historyFile = path.join(
          this.getHistoryDirectory(),
          `${cleanId}.v${currentHealed.version || 'healed'}_before_reset_${Date.now()}.json`
        );
        fs.writeFileSync(historyFile, JSON.stringify(currentHealed, null, 2), 'utf-8');
        fs.unlinkSync(healedFile);
      } catch (e: any) {
        console.warn('[RecipeManager] Notice removing healed override:', e?.message || e);
      }
    }

    this.healedMap.delete(cleanId);
    this.healedMap.delete(providerId);

    const defaultRecipe = (BUILTIN_RECIPES as any)[cleanId];
    this.syncRecipeToManifest(defaultRecipe, cleanId as ProviderId, defaultRecipe.partition || `persist:transgentic_${cleanId}`);
    const existingReset = globalSessionManager.getAdapter(cleanId as ProviderId) || globalSessionManager.getAdapter(providerId);
    if (existingReset && (existingReset as any).recipe) {
      (existingReset as any).recipe = defaultRecipe;
    }
    const adapter = new CustomRecipeAdapter(defaultRecipe);
    globalSessionManager.registerAdapter(adapter);

    return {
      success: true,
      recipe: defaultRecipe,
      message: `Successfully reset ${cleanId} to bundled default recipe.`,
    };
  }

  /**
   * Rolls back a provider to a historical version snapshot from Recipes/History/.
   */
  public rollbackRecipe(
    providerId: ProviderId,
    targetVersion?: string
  ): { success: boolean; recipe: CustomRecipe; message: string } {
    const cleanId = providerId.replace(/^custom_|^recipe_/, '');
    const historyDir = this.getHistoryDirectory();
    if (!fs.existsSync(historyDir)) {
      throw new Error(`No history directory found for ${providerId}`);
    }

    const files = fs.readdirSync(historyDir).filter((f) => f.startsWith(`${cleanId}.v`) && f.endsWith('.json'));
    if (files.length === 0) {
      throw new Error(`No historical snapshots found for ${providerId}`);
    }

    // Sort newest first
    files.sort((a, b) => b.localeCompare(a));

    let chosenFile = files[0];
    if (targetVersion) {
      const match = files.find((f) => f.includes(`.v${targetVersion}_`));
      if (match) chosenFile = match;
    }

    const raw = fs.readFileSync(path.join(historyDir, chosenFile), 'utf-8');
    const validated = validateCustomRecipe(JSON.parse(raw));
    if (!validated.valid || !validated.recipe) {
      throw new Error(`Invalid snapshot file ${chosenFile}: ${validated.errors.join(', ')}`);
    }

    const restoredRecipe = validated.recipe;
    const isBuiltin = ['chatgpt', 'claude', 'gemini', 'grok'].includes(cleanId);

    if (isBuiltin) {
      const healedFile = path.join(this.getHealedDirectory(), `${cleanId}.json`);
      fs.writeFileSync(healedFile, JSON.stringify(restoredRecipe, null, 2), 'utf-8');
      this.healedMap.set(cleanId, restoredRecipe);
      this.healedMap.set(providerId, restoredRecipe);
    } else {
      const customFile = path.join(this.getCustomDirectory(), `${cleanId}.json`);
      fs.writeFileSync(customFile, JSON.stringify(restoredRecipe, null, 2), 'utf-8');
      this.recipesMap.set(restoredRecipe.id, restoredRecipe);
      this.recipesMap.set(cleanId, restoredRecipe);
      this.savePersistedRecipes();
    }

    this.syncRecipeToManifest(restoredRecipe, providerId, restoredRecipe.partition || PartitionLifecycleManager.getPartitionKey(providerId));
    const existingRollback = globalSessionManager.getAdapter(providerId) || globalSessionManager.getAdapter(cleanId as ProviderId);
    if (existingRollback && (existingRollback as any).recipe) {
      (existingRollback as any).recipe = restoredRecipe;
    }
    const adapter = new CustomRecipeAdapter(restoredRecipe);
    globalSessionManager.registerAdapter(adapter);

    return {
      success: true,
      recipe: restoredRecipe,
      message: `Successfully rolled back ${cleanId} to version ${restoredRecipe.version}.`,
    };
  }

  /**
   * Retrieves available historical snapshots for a provider.
   */
  public getRecipeHistory(
    providerId: ProviderId
  ): Array<{ version: string; healedAt?: string; healer?: string; changelog?: string[]; timestamp: number; filename: string; path: string }> {
    const cleanId = providerId.replace(/^custom_|^recipe_/, '');
    const historyDir = this.getHistoryDirectory();
    if (!fs.existsSync(historyDir)) {
      return [];
    }

    const files = fs.readdirSync(historyDir).filter((f) => f.startsWith(`${cleanId}.v`) && f.endsWith('.json'));
    const results: Array<{ version: string; healedAt?: string; healer?: string; changelog?: string[]; timestamp: number; filename: string; path: string }> = [];

    for (const f of files) {
      try {
        const fullPath = path.join(historyDir, f);
        const raw = fs.readFileSync(fullPath, 'utf-8');
        const parsed = JSON.parse(raw);
        const matchTime = f.match(/_(\d+)\.json$/);
        const timestamp = matchTime ? parseInt(matchTime[1], 10) : 0;
        results.push({
          version: parsed.version || '1.0',
          healedAt: parsed.healedAt,
          healer: parsed.healer,
          changelog: parsed.changelog,
          timestamp,
          filename: f,
          path: fullPath,
        });
      } catch {}
    }

    results.sort((a, b) => b.timestamp - a.timestamp);
    return results;
  }

  /**
   * Deduces a CustomRecipe from a pruned DOM payload using the Local LLM.
   */
  public async detectSelectorsWithLocalLlm(
    domSnippet: string,
    url: string,
    title?: string,
    config?: LocalLLMConfig
  ): Promise<CustomRecipe> {
    const activeConfig = config || {
      enabled: true,
      preset: 'ollama',
      baseUrl: 'http://127.0.0.1:11434',
      selectedModel: '',
      temperature: 0.1,
      contextLength: 8192,
      localMicroTask: false,
      localZeroLeak: false,
      localCompact: false,
      compactThresholdChars: 4000,
    };

    let domain = '';
    try {
      domain = new URL(url).hostname;
    } catch {
      domain = url;
    }

    const recipeId = domain.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
    const recipeTitle = title || `${domain} AI Service`;

    const prompt = `
[SYSTEM DIRECTIVE: WEB RECIPE SELECTOR GENERATOR]
You are an expert browser automation engineer.
Analyze the interactive HTML DOM snippet below for the AI service at "${url}" and deduce CSS selectors to automate prompt submission and response extraction.

Produce a valid JSON object strictly matching the following schema:
{
  "modeSchemaVersion": 2,
  "version": "1.0",
  "id": "${recipeId}",
  "title": "${recipeTitle}",
  "domainMatch": "${domain}",
  "url": "${url}",
  "authStrategy": "cookie_sync",
  "selectors": {
    "inputPrompt": "CSS selector for the main prompt textarea, contenteditable, or input",
    "submitButton": "CSS selector for send or submit button",
    "stopButton": "Optional selector for stop/abort button",
    "modelDropdownTrigger": "Optional selector for model dropdown switcher"
  },
  "response": {
    "container": "CSS selector for assistant or bot response turn elements",
    "textSelector": "CSS selector for markdown or prose text inside response container",
    "actionButtons": "Optional selector for action buttons (e.g. copy button)",
    "generatingIndicator": "Optional selector for spinner or shimmer loading placeholder",
    "modes": {
      "text": {
        "enabled": true,
        "contentSelector": "CSS selector for text markdown response",
        "mediaKind": "text",
        "inputAttachments": {
          "fileInput": "Optional observed native input[type=file] selector",
          "revealSteps": [{ "action": "click", "target": { "selectors": "Stable CSS fallback", "role": "button", "name": ["Exact accessible label"] } }],
          "acceptedKinds": ["image", "document"],
          "multiple": true
        }
      },
      "image": {
        "enabled": true,
        "contentSelector": "CSS selector for generated img element if supported",
        "mediaKind": "image"
      },
      "video": {
        "enabled": false,
        "mediaKind": "video"
      },
      "music": {
        "enabled": false,
        "mediaKind": "audio"
      }
    }
  }
}

HTML DOM SNIPPET:
\`\`\`html
${domSnippet.slice(0, 4000)}
\`\`\`

REQUIREMENTS:
- Return ONLY the JSON object. Do not include markdown formatting or commentary.
- Include inputAttachments only when a native file input or attachment controls are present in the supplied DOM. Never invent upload support.
- Use revealSteps only for the minimum UI clicks required to make the native file input available; prefer roles and exact accessible names over generated IDs.
`.trim();

    const completion = await LocalLlmClient.generateCompletion(prompt, activeConfig, {
      temperature: 0.1,
      maxTokens: 1000,
    });

    const raw = completion.text;
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Local LLM did not return a valid JSON object.');
    }

    const parsed = JSON.parse(jsonMatch[0]);
    if (!parsed.id) parsed.id = recipeId;
    if (!parsed.title) parsed.title = recipeTitle;
    if (!parsed.domainMatch) parsed.domainMatch = domain;
    if (!parsed.version) parsed.version = '1.0';
    if (!parsed.authStrategy) parsed.authStrategy = 'cookie_sync';

    const val = validateCustomRecipe(parsed);
    if (!val.valid || !val.recipe) {
      throw new Error(`Local LLM generated invalid recipe: ${val.errors.join(', ')}`);
    }

    return val.recipe;
  }
}

export const globalRecipeManager = RecipeManager.getInstance();
