import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { AssetManager } from '../src/main/storage/assetManager.js';
import { RecipeManager } from '../src/main/registry/recipeManager.js';
import { bumpSemanticVersion } from '../src/shared/types/recipe.js';
import { globalSessionManager } from '../src/main/webviews/sessionManager.js';
import { AccountRegistryManager } from '../src/main/registry/accountRegistry.js';
import { ServiceManifestManager } from '../src/main/registry/serviceManifest.js';

describe('Recipe Versioning, Storage & Self-Healing Tests', () => {
  let tempBaseDir: string;
  let assetManager: AssetManager;
  let recipeManager: RecipeManager;

  beforeEach(() => {
    tempBaseDir = fs.mkdtempSync(path.join(process.cwd(), 'test_storage_'));
    assetManager = new AssetManager(tempBaseDir);
    recipeManager = RecipeManager.getInstance();
    recipeManager.setStorageDirectory(tempBaseDir);
    AccountRegistryManager.initialize();
    ServiceManifestManager.loadManifest();
  });

  afterEach(() => {
    try {
      if (fs.existsSync(tempBaseDir)) {
        fs.rmSync(tempBaseDir, { recursive: true, force: true });
      }
    } catch {}
  });

  describe('Storage Hierarchy Structure', () => {
    it('should create capitalized Library/ and Recipes/ directory trees', () => {
      // Check Library subdirectories
      expect(fs.existsSync(path.join(tempBaseDir, 'Library', 'Images'))).toBe(true);
      expect(fs.existsSync(path.join(tempBaseDir, 'Library', 'Videos'))).toBe(true);
      expect(fs.existsSync(path.join(tempBaseDir, 'Library', 'Audios'))).toBe(true);

      // Check Recipes subdirectories
      expect(fs.existsSync(path.join(tempBaseDir, 'Recipes', 'Custom'))).toBe(true);
      expect(fs.existsSync(path.join(tempBaseDir, 'Recipes', 'Healed'))).toBe(true);
      expect(fs.existsSync(path.join(tempBaseDir, 'Recipes', 'History'))).toBe(true);
    });

    it('should save media assets into Library/ subfolders with relative paths', async () => {
      const dummyBuffer = Buffer.from('fake image content');
      const saved = await assetManager.saveMediaAsset(dummyBuffer, 'Images', 'test_diagram.png');

      expect(saved.relativePath.startsWith('./Library/Images/')).toBe(true);
      expect(fs.existsSync(saved.filePath)).toBe(true);
      expect(fs.readFileSync(saved.filePath).toString()).toBe('fake image content');
    });
  });

  describe('Semantic Versioning Helper', () => {
    it('should correctly increment semantic patch versions', () => {
      expect(bumpSemanticVersion('1.0.0')).toBe('1.0.1');
      expect(bumpSemanticVersion('1.0.9')).toBe('1.0.10');
      expect(bumpSemanticVersion('2.1.3')).toBe('2.1.4');
    });

    it('should normalize legacy versions to semantic format', () => {
      expect(bumpSemanticVersion('1.0')).toBe('1.0.1');
      expect(bumpSemanticVersion('2')).toBe('2.0.1');
      expect(bumpSemanticVersion(undefined)).toBe('1.0.1');
    });
  });

  describe('Custom Recipe File-Per-Recipe Storage & Migration', () => {
    const sampleRecipe = {
      version: '1.0.0',
      id: 'mock_custom_provider',
      title: 'Mock Custom Provider',
      domainMatch: 'mock-ai.local',
      url: 'https://mock-ai.local/chat',
      partition: 'persist:transgentic_mock_custom',
      authStrategy: 'cookie_sync' as const,
      selectors: {
        inputPrompt: '#input',
        submitButton: '#submit',
      },
    };

    it('should save custom recipes as individual json files in Recipes/Custom/', async () => {
      await recipeManager.installRecipe(sampleRecipe);

      const customFile = path.join(tempBaseDir, 'Recipes', 'Custom', `${sampleRecipe.id}.json`);
      expect(fs.existsSync(customFile)).toBe(true);

      const loadedJson = JSON.parse(fs.readFileSync(customFile, 'utf-8'));
      expect(loadedJson.id).toBe(sampleRecipe.id);
      expect(loadedJson.version).toBe('1.0.0');

      // Cleanup
      recipeManager.deleteRecipe(sampleRecipe.id);
      expect(fs.existsSync(customFile)).toBe(false);
    });

    it('should store custom recipe synced from chrome extension locally as first version 1.0.0 with history snapshot', async () => {
      // Simulate payload from Chrome extension where version might be missing or 1.0
      const extensionRecipePayload = {
        id: 'extension_synced_portal',
        title: 'Extension Synced Portal',
        domainMatch: 'synced-ai.local',
        url: 'https://synced-ai.local',
        authStrategy: 'cookie_sync' as const,
        selectors: {
          inputPrompt: '#chat-input',
          submitButton: '#send-btn',
        },
      };

      const result = await recipeManager.installRecipe(extensionRecipePayload);
      expect(result.success).toBe(true);
      expect(result.recipe.version).toBe('1.0.0');

      // Verify stored locally in Recipes/Custom/<id>.json
      const localCustomFile = path.join(tempBaseDir, 'Recipes', 'Custom', 'extension_synced_portal.json');
      expect(fs.existsSync(localCustomFile)).toBe(true);
      const onDisk = JSON.parse(fs.readFileSync(localCustomFile, 'utf-8'));
      expect(onDisk.version).toBe('1.0.0');
      expect(onDisk.title).toBe('Extension Synced Portal');

      // Verify initial snapshot archived in Recipes/History/
      const history = recipeManager.getRecipeHistory('extension_synced_portal');
      expect(history.length).toBe(1);
      expect(history[0].version).toBe('1.0.0');
      expect(fs.existsSync(history[0].path)).toBe(true);

      // Cleanup
      recipeManager.deleteRecipe('extension_synced_portal');
    });

    it('should automatically migrate legacy recipes from single index file to Recipes/Custom/', () => {
      // Simulate old legacy index file in userData
      const legacyStorageFile = recipeManager.getStoragePath();
      const legacyRecipe = {
        ...sampleRecipe,
        id: 'legacy_migrated_provider',
      };
      fs.writeFileSync(legacyStorageFile, JSON.stringify([legacyRecipe]), 'utf-8');

      // Reload custom recipes into memory
      recipeManager.initializeAllCustomRecipes();

      const individualFile = path.join(tempBaseDir, 'Recipes', 'Custom', 'legacy_migrated_provider.json');
      expect(fs.existsSync(individualFile)).toBe(true);
      const migrated = JSON.parse(fs.readFileSync(individualFile, 'utf-8'));
      expect(migrated.id).toBe('legacy_migrated_provider');

      // Cleanup
      recipeManager.deleteRecipe('legacy_migrated_provider');
    });
  });

  describe('Self-Healing Recipe Versioning, History & Rollback', () => {
    it('should heal selectors, bump version, create history snapshot, and persist to Recipes/Healed/', async () => {
      // 1. Initial built-in recipe chatgpt starts at 1.0
      const initialRecipe = recipeManager.getRecipe('chatgpt');
      expect(initialRecipe).toBeDefined();
      const originalInputSelector = initialRecipe!.selectors.inputPrompt;
      const originalVersion = initialRecipe!.version || '1.0.0';

      // 2. Perform DOM healing on chatgpt
      const newSelectors = {
        inputPrompt: 'div[contenteditable="true"].repaired-chat-input',
        submitButton: 'button[data-testid="repaired-send-button"]',
      };

      const healResult = await recipeManager.healRecipeSelectors('chatgpt', newSelectors, 'localllm');

      // Check version increment and audit metadata
      expect(healResult.success).toBe(true);
      expect(healResult.version).toBe('1.0.1');
      expect(healResult.recipe.healedAt).toBeDefined();
      expect(healResult.recipe.healer).toBe('localllm');
      expect(healResult.recipe.changelog).toBeDefined();
      expect(healResult.recipe.changelog!.length).toBeGreaterThan(0);
      
      const inputSelector = healResult.recipe.selectors.inputPrompt;
      const primaryInput = Array.isArray(inputSelector) ? inputSelector[0] : inputSelector;
      expect(primaryInput).toBe(newSelectors.inputPrompt);

      // Verify file saved in Recipes/Healed/chatgpt.json
      const healedFilePath = path.join(tempBaseDir, 'Recipes', 'Healed', 'chatgpt.json');
      expect(fs.existsSync(healedFilePath)).toBe(true);

      // Verify history snapshot was saved in Recipes/History/
      const history = recipeManager.getRecipeHistory('chatgpt');
      expect(history.length).toBe(1);
      expect(history[0].version).toBe(originalVersion);
      expect(fs.existsSync(history[0].path)).toBe(true);

      // Verify active adapter selectors updated in session manager
      const adapter = globalSessionManager.getAdapter('chatgpt');
      expect(adapter).toBeDefined();
      const adapterInput = (adapter as any).recipe?.selectors?.inputPrompt;
      const primaryAdapterInput = Array.isArray(adapterInput) ? adapterInput[0] : adapterInput;
      expect(primaryAdapterInput).toBe(newSelectors.inputPrompt);

      // 3. Rollback back to original version
      const rolledBack = recipeManager.rollbackRecipe('chatgpt', originalVersion);
      expect(rolledBack.success).toBe(true);
      expect(rolledBack.recipe.version).toBe(originalVersion);
      expect(rolledBack.recipe.selectors.inputPrompt).toEqual(originalInputSelector);

      // Check active adapter after rollback
      expect((adapter as any).recipe?.selectors?.inputPrompt).toEqual(originalInputSelector);
    });

    it('should support Reset to Default for built-in recipes, deleting healed override', async () => {
      // 1. Heal claude
      const newSelectors = {
        inputPrompt: '#claude-repaired-input',
        submitButton: '#claude-repaired-submit',
      };
      await recipeManager.healRecipeSelectors('claude', newSelectors, 'localllm');

      const healedFile = path.join(tempBaseDir, 'Recipes', 'Healed', 'claude.json');
      expect(fs.existsSync(healedFile)).toBe(true);

      // 2. Reset to Default
      const resetResult = recipeManager.resetToDefault('claude');
      expect(resetResult.success).toBe(true);

      // Healed override file should be deleted
      expect(fs.existsSync(healedFile)).toBe(false);

      // Pristine default built-in recipe should be active
      const activeRecipe = recipeManager.getRecipe('claude');
      expect(activeRecipe?.healedAt).toBeUndefined();
      expect(activeRecipe?.selectors?.inputPrompt).not.toBe('#claude-repaired-input');

      // History should still retain the healed version for audit/recovery
      const history = recipeManager.getRecipeHistory('claude');
      expect(history.length).toBeGreaterThanOrEqual(1);
    });
  });
});

vi.mock('../src/main/registry/recipeConsent.js', () => ({ confirmRecipeInstallation: vi.fn(async () => {}) }));
