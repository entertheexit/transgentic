import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { RecipeManager } from '../src/main/registry/recipeManager.js';
import { ServiceManifestManager } from '../src/main/registry/serviceManifest.js';
import { AccountRegistryManager } from '../src/main/registry/accountRegistry.js';
import { globalSessionManager } from '../src/main/webviews/sessionManager.js';
import { CustomRecipeAdapter } from '../src/main/webviews/customRecipeAdapter.js';
import { BUILTIN_RECIPES, validateCustomRecipe } from '../src/shared/types/recipe.js';

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

  it('preserves declared upload controls and attaches every file before typing and submitting once', async () => {
    const validated = validateCustomRecipe(structuredClone(BUILTIN_RECIPES.chatgpt));
    expect(validated.recipe?.response.modes.text.inputAttachments).toMatchObject({ acceptedKinds: ['image', 'document'], multiple: true });
    const adapter = new CustomRecipeAdapter(validated.recipe!);
    const debuggerApi = {
      isAttached: vi.fn().mockReturnValue(false),
      attach: vi.fn(),
      detach: vi.fn(),
      on: vi.fn(),
      removeListener: vi.fn(),
      sendCommand: vi.fn(async (method: string) => {
        if (method === 'DOM.getDocument') return { root: { nodeId: 1 } };
        if (method === 'DOM.querySelectorAll') return { nodeIds: [2] };
        if (method === 'DOM.describeNode') return { node: { nodeName: 'INPUT', attributes: ['type', 'file'] } };
        return {};
      }),
    };
    (adapter as any).webContents = { isDestroyed: () => false, getURL: () => 'https://chatgpt.com', loadURL: vi.fn(), debugger: debuggerApi };
    vi.spyOn(adapter, 'checkAuthStatus').mockResolvedValue(true);
    vi.spyOn(adapter, 'checkRateLimit').mockResolvedValue({ isRateLimited: false });
    const ready = vi.spyOn(adapter as any, 'executeScript').mockResolvedValue(true);
    const input = vi.spyOn(adapter as any, 'dispatchRealisticInput').mockResolvedValue({ success: true });
    const submit = vi.spyOn(adapter as any, 'dispatchRealisticSubmit').mockResolvedValue({ success: true });
    vi.spyOn(adapter as any, 'pollGeneration').mockResolvedValue({ text: 'done' });
    const files: any[] = [
      { path: '/private/staged/a.png', name: 'a.png', mimeType: 'image/png', kind: 'image', size: 1, sha256: 'a' },
      { path: '/private/staged/b.pdf', name: 'b.pdf', mimeType: 'application/pdf', kind: 'document', size: 1, sha256: 'b' },
    ];
    await adapter.executePrompt('inspect', 'general', undefined, undefined, undefined, files);
    expect(debuggerApi.sendCommand).toHaveBeenCalledWith('DOM.setFileInputFiles', { nodeId: 2, files: files.map(file => file.path) });
    const setFilesCall = debuggerApi.sendCommand.mock.calls.findIndex(([method]) => method === 'DOM.setFileInputFiles');
    expect(debuggerApi.sendCommand.mock.invocationCallOrder[setFilesCall]).toBeLessThan(input.mock.invocationCallOrder[0]);
    expect(input.mock.invocationCallOrder[0]).toBeLessThan(submit.mock.invocationCallOrder[0]);
    expect(submit).toHaveBeenCalledTimes(1);
    expect(ready).toHaveBeenCalled();
  });

  it('clears attachment state after a pre-submit upload failure', async () => {
    const adapter = new CustomRecipeAdapter(BUILTIN_RECIPES.chatgpt);
    const debuggerApi = {
      isAttached: vi.fn().mockReturnValue(false), attach: vi.fn(), detach: vi.fn(),
      on: vi.fn(), removeListener: vi.fn(),
      sendCommand: vi.fn(async (method: string) => method === 'DOM.getDocument' ? { root: { nodeId: 1 } } : method === 'DOM.querySelectorAll' ? { nodeIds: [] } : {}),
    };
    (adapter as any).webContents = { isDestroyed: () => false, getURL: () => 'https://chatgpt.com', debugger: debuggerApi };
    vi.spyOn(adapter, 'checkAuthStatus').mockResolvedValue(true);
    vi.spyOn(adapter, 'checkRateLimit').mockResolvedValue({ isRateLimited: false });
    const cleanup = vi.spyOn(adapter as any, 'executeScript').mockResolvedValue(undefined);
    const input = vi.spyOn(adapter as any, 'dispatchRealisticInput');
    await expect(adapter.executePrompt('inspect', 'general', undefined, undefined, undefined, [{ path: '/staged/a.png', name: 'a.png', mimeType: 'image/png', kind: 'image', size: 1, sha256: 'a' }])).rejects.toThrow('file input was not found');
    expect(cleanup).toHaveBeenCalledWith(expect.stringContaining("input.value=''"));
    expect(input).not.toHaveBeenCalled();
  });

  it('reveals a dynamic native input with semantic clicks before attaching', async () => {
    const recipe = structuredClone(BUILTIN_RECIPES.chatgpt);
    recipe.response.modes.text.inputAttachments = {
      fileInput: 'input[type="file"]',
      revealSteps: [
        { action: 'click', target: { selectors: 'button.attach', role: 'button', name: ['Add attachment'] } },
        { action: 'click', target: { selectors: '[role="menuitem"]', role: 'menuitem', name: ['อัปโหลดไฟล์หรือรูป'] } },
      ],
      acceptedKinds: ['image'],
      multiple: true,
    };
    const adapter = new CustomRecipeAdapter(recipe);
    let chooserListener: ((event: unknown, method: string, params: any) => void) | undefined;
    const debuggerApi = {
      isAttached: vi.fn().mockReturnValue(false), attach: vi.fn(), detach: vi.fn(),
      on: vi.fn((_event: string, listener: typeof chooserListener) => { chooserListener = listener; }),
      removeListener: vi.fn(),
      sendCommand: vi.fn(async (method: string) => {
        if (method === 'DOM.getDocument') return { root: { nodeId: 1 } };
        if (method === 'DOM.querySelectorAll') return { nodeIds: [] };
        if (method === 'DOM.resolveNode') return { object: { objectId: 'chooser-input' } };
        if (method === 'Runtime.callFunctionOn') return { result: { value: true } };
        return {};
      }),
    };
    (adapter as any).webContents = { isDestroyed: () => false, getURL: () => 'https://chatgpt.com', debugger: debuggerApi };
    vi.spyOn(adapter, 'checkAuthStatus').mockResolvedValue(true);
    vi.spyOn(adapter, 'checkRateLimit').mockResolvedValue({ isRateLimited: false });
    let revealCount = 0;
    const scripts = vi.spyOn(adapter as any, 'executeScript').mockImplementation(async (script: string) => {
      if (script.includes('const locator')) {
        revealCount += 1;
        if (revealCount === 2) chooserListener?.({}, 'Page.fileChooserOpened', { backendNodeId: 7 });
        return { success: true };
      }
      return true;
    });
    const input = vi.spyOn(adapter as any, 'dispatchRealisticInput').mockResolvedValue({ success: true });
    vi.spyOn(adapter as any, 'dispatchRealisticSubmit').mockResolvedValue({ success: true });
    vi.spyOn(adapter as any, 'pollGeneration').mockResolvedValue({ text: 'done' });

    await adapter.executePrompt('edit this', 'general', undefined, undefined, undefined, [{ path: '/staged/a.png', name: 'a.png', mimeType: 'image/png', kind: 'image', size: 1, sha256: 'a' } as any]);

    expect(scripts.mock.calls.filter(([script]) => String(script).includes('const locator'))).toHaveLength(2);
    expect(debuggerApi.sendCommand).toHaveBeenCalledWith('Page.setInterceptFileChooserDialog', { enabled: true });
    expect(debuggerApi.sendCommand).toHaveBeenCalledWith('DOM.setFileInputFiles', { backendNodeId: 7, files: ['/staged/a.png'] });
    expect(input).toHaveBeenCalledTimes(1);
  });

  it('fails before prompt entry when a reveal target is ambiguous', async () => {
    const recipe = structuredClone(BUILTIN_RECIPES.chatgpt);
    recipe.response.modes.text.inputAttachments = {
      fileInput: 'input[type="file"]',
      revealSteps: [{ action: 'click', target: { role: 'button', name: 'Add attachment' } }],
      acceptedKinds: ['image'],
    };
    const adapter = new CustomRecipeAdapter(recipe);
    const debuggerApi = {
      isAttached: vi.fn().mockReturnValue(false), attach: vi.fn(), detach: vi.fn(), on: vi.fn(), removeListener: vi.fn(),
      sendCommand: vi.fn(async (method: string) => method === 'DOM.getDocument' ? { root: { nodeId: 1 } } : method === 'DOM.querySelectorAll' ? { nodeIds: [] } : {}),
    };
    (adapter as any).webContents = { isDestroyed: () => false, getURL: () => 'https://chatgpt.com', debugger: debuggerApi };
    vi.spyOn(adapter, 'checkAuthStatus').mockResolvedValue(true);
    vi.spyOn(adapter, 'checkRateLimit').mockResolvedValue({ isRateLimited: false });
    vi.spyOn(adapter as any, 'executeScript').mockResolvedValue({ success: false, ambiguous: true });
    const input = vi.spyOn(adapter as any, 'dispatchRealisticInput');

    await expect(adapter.executePrompt('do not submit', 'general', undefined, undefined, undefined, [{ path: '/staged/a.png', name: 'a.png', mimeType: 'image/png', kind: 'image', size: 1, sha256: 'a' } as any])).rejects.toThrow('ambiguous');
    expect(input).not.toHaveBeenCalled();
  });
});
