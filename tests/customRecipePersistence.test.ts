import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { RecipeManager } from '../src/main/registry/recipeManager.js';
import { ServiceManifestManager } from '../src/main/registry/serviceManifest.js';
import { AccountRegistryManager } from '../src/main/registry/accountRegistry.js';
import { globalSessionManager } from '../src/main/webviews/sessionManager.js';
import { CustomRecipeAdapter } from '../src/main/webviews/customRecipeAdapter.js';

describe('Custom Recipe Session Persistence & Startup Tests', () => {
  let recipeManager: RecipeManager;
  let storageFile: string;

  const testRecipe = {
    version: '1.0',
    id: 'test_persist_portal',
    title: 'Test Persist Portal',
    domainMatch: 'persist-ai.example.com',
    url: 'https://persist-ai.example.com/chat',
    partition: 'persist:transgentic_test_persist_portal',
    authStrategy: 'cookie_sync',
    selectors: {
      inputPrompt: '#prompt-textarea',
      submitButton: 'button[type="submit"]',
    },
    auth: {
      authCookies: ['auth_token', 'session_sid'],
      cookieDomains: ['persist-ai.example.com'],
      loggedInSelector: '#prompt-textarea',
    },
    models: [
      { id: 'persist-model-1', displayName: 'Persist Model 1', mode: 'general' },
    ],
  };

  beforeEach(() => {
    AccountRegistryManager.initialize();
    ServiceManifestManager.loadManifest();
    recipeManager = RecipeManager.getInstance();
    storageFile = recipeManager.getStoragePath();
    if (fs.existsSync(storageFile)) {
      try { fs.unlinkSync(storageFile); } catch {}
    }
  });

  afterEach(() => {
    recipeManager.deleteRecipe('test_persist_portal');
    if (fs.existsSync(storageFile)) {
      try { fs.unlinkSync(storageFile); } catch {}
    }
  });

  it('should initialize all custom recipes from persisted store on cold startup', async () => {
    // 1. Simulate existing recipe persisted to disk prior to startup
    fs.writeFileSync(storageFile, JSON.stringify([testRecipe], null, 2), 'utf-8');

    // 2. Unregister any in-memory adapter first
    globalSessionManager.unregisterAdapter('custom_test_persist_portal');

    // 3. Trigger startup initialization
    recipeManager.initializeAllCustomRecipes();

    // 4. Verify adapter was registered into session manager
    const adapters = globalSessionManager.getAdapters();
    const registered = adapters.find((a) => a.providerId === 'custom_test_persist_portal');
    expect(registered).toBeDefined();
    expect(registered?.name).toBe('Test Persist Portal');
    expect(registered?.url).toBe('https://persist-ai.example.com/chat');

    // 5. Verify AccountRegistryManager partition was set
    const acc = AccountRegistryManager.getActiveAccount('custom_test_persist_portal');
    expect(acc).toBeDefined();
    expect(acc.partitionKey).toBe('persist:transgentic_test_persist_portal');

    // 6. Verify ServiceManifestManager contains the service
    const manifest = ServiceManifestManager.getManifest();
    expect(manifest.services['custom_test_persist_portal']).toBeDefined();
    expect(manifest.services['custom_test_persist_portal'].url).toBe('https://persist-ai.example.com/chat');
  });

  it('should resolve custom recipe provider from URL including domain matching', async () => {
    const adapter = new CustomRecipeAdapter(testRecipe as any);
    globalSessionManager.registerAdapter(adapter);

    // Exact chat URL
    const match1 = globalSessionManager.getProviderFromUrl('https://persist-ai.example.com/chat');
    expect(match1).toBe('custom_test_persist_portal');

    // Deep subpath
    const match2 = globalSessionManager.getProviderFromUrl('https://persist-ai.example.com/c/conversation-123');
    expect(match2).toBe('custom_test_persist_portal');

    // Subdomain matching
    const match3 = globalSessionManager.getProviderFromUrl('https://sub.persist-ai.example.com/api');
    expect(match3).toBe('custom_test_persist_portal');

    // Unrelated URL
    const matchNone = globalSessionManager.getProviderFromUrl('https://random-other-domain.org');
    expect(matchNone).toBeNull();
  });

  it('should restore authenticated status from cookies even if active account had unauthenticated flag', async () => {
    const adapter = new CustomRecipeAdapter(testRecipe as any);
    globalSessionManager.registerAdapter(adapter);

    // Explicitly set account to unauthenticated on disk to simulate previous logout or startup failure
    const activeAcc = AccountRegistryManager.getActiveAccount('custom_test_persist_portal');
    AccountRegistryManager.markStatus('custom_test_persist_portal', activeAcc.id, 'unauthenticated');

    const checkBefore = AccountRegistryManager.getActiveAccount('custom_test_persist_portal');
    expect(checkBefore.status).toBe('unauthenticated');

    // Mock session cookies for this partition
    const fakeSession = {
      cookies: {
        get: vi.fn().mockResolvedValue([
          {
            name: 'auth_token',
            value: 'valid_secure_session_token_1234567890',
            domain: 'persist-ai.example.com',
            expirationDate: (Date.now() / 1000) + 86400,
          },
          {
            name: 'session_sid',
            value: 'sid_xyz987654321',
            domain: 'persist-ai.example.com',
            expirationDate: (Date.now() / 1000) + 86400,
          },
        ]),
      },
      webRequest: {
        onBeforeSendHeaders: vi.fn(),
        onHeadersReceived: vi.fn(),
      },
      getUserAgent: () => 'Chrome',
      setUserAgent: vi.fn(),
    };

    // Spy on configureSession to return fakeSession
    vi.spyOn(globalSessionManager, 'configureSession').mockReturnValue(fakeSession as any);

    // Run status refresh (drawer closed -> isDomAuth is null)
    const status = await globalSessionManager.refreshProviderStatus('custom_test_persist_portal');

    expect(status.isAuthenticated).toBe(true);
    expect(status.state).toBe('ready');

    // Verify AccountRegistry was updated back to ready
    const checkAfter = AccountRegistryManager.getActiveAccount('custom_test_persist_portal');
    expect(checkAfter.status).toBe('ready');
  });

  it('should execute prompt with single-action submit and not trigger redundant duplicate clicks', async () => {
    const adapter = new CustomRecipeAdapter(testRecipe as any);
    (adapter as any).webContents = {
      isDestroyed: () => false,
      getURL: () => 'https://persist-ai.example.com/chat',
      loadURL: vi.fn().mockResolvedValue(undefined),
    };

    // Mock checkAuthStatus and checkRateLimit
    vi.spyOn(adapter, 'checkAuthStatus').mockResolvedValue(true);
    vi.spyOn(adapter, 'checkRateLimit').mockResolvedValue({ isRateLimited: false });
    vi.spyOn(adapter, 'dispatchRealisticInput').mockResolvedValue({ success: true });

    // Spy on dispatchRealisticSubmit
    const submitSpy = vi.spyOn(adapter as any, 'dispatchRealisticSubmit').mockResolvedValue({ success: true, method: 'button_click' });

    // Mock pollGeneration
    const pollSpy = vi.spyOn(adapter as any, 'pollGeneration').mockResolvedValue({
      text: 'Mock response',
      media: undefined,
    });

    // Mock executeScript
    const executeScriptSpy = vi.spyOn(adapter as any, 'executeScript').mockResolvedValue({});

    // Run executePrompt
    const result = await adapter.executePrompt('test prompt', 'general');

    expect(result.text).toBe('Mock response');
    // Verify dispatchRealisticSubmit was invoked exactly once
    expect(submitSpy).toHaveBeenCalledTimes(1);
    expect(submitSpy).toHaveBeenCalledWith('button[type="submit"]', '#prompt-textarea');

    // Verify executeScript was NOT called with raw click cascades
    const executeScriptCalls = executeScriptSpy.mock.calls;
    for (const call of executeScriptCalls) {
      const script = typeof call[0] === 'string' ? call[0] : '';
      expect(script).not.toContain('btn.click()');
    }
  });
});
