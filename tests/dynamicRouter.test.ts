import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { DynamicRouter } from '../src/main/mcp/router.js';
import { ServiceManifestManager } from '../src/main/registry/serviceManifest.js';

const TEST_WEBVIEW_ID = 'webview_test_service' as any;

describe('DynamicRouter Model Routing', () => {
  beforeEach(() => {
    DynamicRouter.resetRoutes();
    const manifest = ServiceManifestManager.getManifest();
    manifest.services[TEST_WEBVIEW_ID] = {
      id: TEST_WEBVIEW_ID,
      name: 'Test Webview',
      company: 'Test Co',
      enabled: true,
      hidden: false,
      providerType: 'webview',
      url: 'https://test.example.com',
      partition: 'persist:test_webview',
      defaultModelId: 'gemini-3-1-flash-lite',
      accentColor: 'teal',
      iconName: 'Globe',
      supportsModelRouting: true,
      models: [
        { id: 'gemini-3-1-flash-lite', displayName: 'Flash Lite', enabled: true, discoveredAvailable: true, userEnabled: true, mode: 'general', modes: ['general'] },
        { id: 'gpt-image-2', displayName: 'GPT Image', enabled: true, discoveredAvailable: true, userEnabled: true, mode: 'image', modes: ['image'] },
        { id: 'sample-image-lite', displayName: 'Sample Image Lite', enabled: true, discoveredAvailable: true, userEnabled: true, mode: 'image', modes: ['image'] },
        { id: 'sample-image-pro', displayName: 'Sample Image 4', enabled: true, discoveredAvailable: true, userEnabled: true, mode: 'image', modes: ['image'] },
        { id: 'nano-banana-pro', displayName: 'Banana Pro', enabled: true, discoveredAvailable: true, userEnabled: true, mode: 'image', modes: ['image'] },
        { id: 'sample-video-fast', displayName: 'Sample Video Fast', enabled: true, discoveredAvailable: true, userEnabled: true, mode: 'video', modes: ['video'] },
        { id: 'lyria-3-pro', displayName: 'Lyria Pro', enabled: true, discoveredAvailable: true, userEnabled: true, mode: 'audio', modes: ['audio'] },
        { id: 'kimi-k2-7-code', displayName: 'Kimi Code', enabled: true, discoveredAvailable: true, userEnabled: true, mode: 'coding', modes: ['coding'] },
      ],
    };
    ServiceManifestManager.saveManifest(manifest);
  });

  afterAll(() => {
    ServiceManifestManager.deleteProvider(TEST_WEBVIEW_ID);
    DynamicRouter.resetRoutes();
  });

  it('should resolve default target models for multi-model services per task mode', () => {
    // Image mode should resolve to gpt-image-2 for custom webview
    const imgModel = DynamicRouter.resolveTargetModel(TEST_WEBVIEW_ID, 'image');
    expect(imgModel).toBe('gpt-image-2');

    // Video mode should resolve to sample-video-fast for custom webview
    const videoModel = DynamicRouter.resolveTargetModel(TEST_WEBVIEW_ID, 'video');
    expect(videoModel).toBe('sample-video-fast');

    // Audio mode should resolve to lyria-3-pro for custom webview
    const audioModel = DynamicRouter.resolveTargetModel(TEST_WEBVIEW_ID, 'audio');
    expect(audioModel).toBe('lyria-3-pro');

    // Coding mode should resolve to kimi-k2-7-code for custom webview
    const codeModel = DynamicRouter.resolveTargetModel(TEST_WEBVIEW_ID, 'coding');
    expect(codeModel).toBe('kimi-k2-7-code');

    // General mode should resolve to gemini-3-1-flash-lite for custom webview
    const genModel = DynamicRouter.resolveTargetModel(TEST_WEBVIEW_ID, 'general');
    expect(genModel).toBe('gemini-3-1-flash-lite');
  });

  it('should prioritize explicit model requests if valid and enabled', () => {
    // Requesting sample-image-lite explicitly for image mode
    const explicit = DynamicRouter.resolveTargetModel(TEST_WEBVIEW_ID, 'image', 'sample-image-lite');
    expect(explicit).toBe('sample-image-lite');
  });

  it('should return null for services without supportsModelRouting to delegate to ModelRegistryManager', () => {
    const chatgptModel = DynamicRouter.resolveTargetModel('chatgpt', 'general');
    expect(chatgptModel).toBeNull();

    const claudeModel = DynamicRouter.resolveTargetModel('claude', 'coding');
    expect(claudeModel).toBeNull();
  });

  it('should respect custom route updates to providerModels per mode', () => {
    // Change image default model to sample-image-lite
    DynamicRouter.updateRouteConfig('image', {
      providerModels: {
        [TEST_WEBVIEW_ID]: {
          defaultModelId: 'sample-image-lite',
          fallbackModelIds: ['gpt-image-2', 'nano-banana-pro'],
        },
      },
    });

    const updatedImg = DynamicRouter.resolveTargetModel(TEST_WEBVIEW_ID, 'image');
    expect(updatedImg).toBe('sample-image-lite');

    // Verify persistence in rule
    const rule = DynamicRouter.getRule('image');
    expect(rule.providerModels?.[TEST_WEBVIEW_ID]?.defaultModelId).toBe('sample-image-lite');
    expect(rule.providerModels?.[TEST_WEBVIEW_ID]?.fallbackModelIds).toEqual(['gpt-image-2', 'nano-banana-pro']);
  });

  it('should fall back to fallbackModelIds if defaultModelId is disabled', () => {
    // Set default to nonexistent/disabled model and provide fallbacks
    DynamicRouter.updateRouteConfig('image', {
      providerModels: {
        [TEST_WEBVIEW_ID]: {
          defaultModelId: 'disabled-fake-model',
          fallbackModelIds: ['sample-image-pro', 'gpt-image-2'],
        },
      },
    });

    const resolved = DynamicRouter.resolveTargetModel(TEST_WEBVIEW_ID, 'image');
    expect(resolved).toBe('sample-image-pro');
  });

  it('should filter out providers from candidate chain that do not support the task mode', () => {
    // 1. In image mode, claude does not support image generation
    DynamicRouter.updateRouteConfig('image', {
      primary: 'grok',
      fallbacks: ['claude', 'chatgpt', 'gemini'],
    });
    const imgCandidates = DynamicRouter.getCandidateChain('image', undefined, false);
    expect(imgCandidates).toContain('grok');
    expect(imgCandidates).toContain('chatgpt');
    expect(imgCandidates).toContain('gemini');
    expect(imgCandidates).not.toContain('claude'); // Claude filtered out

    // 2. In video mode, grok, gemini, and webview support video generation (chatgpt & claude do not)
    DynamicRouter.updateRouteConfig('video', {
      primary: 'grok',
      fallbacks: ['gemini', TEST_WEBVIEW_ID, 'chatgpt', 'claude'],
    });
    const videoCandidates = DynamicRouter.getCandidateChain('video', undefined, false);
    expect(videoCandidates).toContain('grok');
    expect(videoCandidates).toContain('gemini');
    expect(videoCandidates).toContain(TEST_WEBVIEW_ID);
    expect(videoCandidates).not.toContain('chatgpt'); // chatgpt filtered out
    expect(videoCandidates).not.toContain('claude');  // claude filtered out

    // 3. In audio mode, gemini and webview support audio generation (chatgpt, claude, grok do not)
    DynamicRouter.updateRouteConfig('audio', {
      primary: 'gemini',
      fallbacks: [TEST_WEBVIEW_ID, 'chatgpt', 'claude', 'grok'],
    });
    const audioCandidates = DynamicRouter.getCandidateChain('audio', undefined, false);
    expect(audioCandidates).toContain('gemini');
    expect(audioCandidates).toContain(TEST_WEBVIEW_ID);
    expect(audioCandidates).not.toContain('chatgpt'); // chatgpt filtered out
    expect(audioCandidates).not.toContain('claude');  // claude filtered out
    expect(audioCandidates).not.toContain('grok');    // grok filtered out
  });

  it('should support routing custom API providers in both Main and Co pipelines', () => {
    const updatedManifest = ServiceManifestManager.addCustomApiProvider({
      name: 'Test DeepSeek API',
      baseUrl: 'https://api.deepseek.com/v1',
      apiKey: 'sk-test',
      defaultModelId: 'deepseek-chat',
    });
    const apiId = Object.keys(updatedManifest.services).find((id) => id.startsWith('api_')) as any;
    expect(apiId).toBeDefined();

    // 1. Verify provider supports general and coding modes
    expect(DynamicRouter.providerSupportsMode(apiId, 'general')).toBe(true);
    expect(DynamicRouter.providerSupportsMode(apiId, 'coding')).toBe(true);
    expect(DynamicRouter.providerSupportsMode(apiId, 'image')).toBe(false);

    // 2. Set as Primary in Main pipeline for coding
    DynamicRouter.updateRouteConfig('coding', {
      defaultService: apiId,
      fallbackChain: ['claude', 'chatgpt'],
    }, 'main');

    const mainCandidates = DynamicRouter.getCandidateChain('coding', undefined, false, 'main');
    expect(mainCandidates[0]).toBe(apiId);
    expect(mainCandidates).toContain('claude');

    // 3. Set as Fallback in Co pipeline for coding
    DynamicRouter.updateRouteConfig('coding', {
      defaultService: 'chatgpt',
      fallbackChain: [apiId, 'gemini'],
    }, 'co');

    const coCandidates = DynamicRouter.getCandidateChain('coding', undefined, false, 'co');
    expect(coCandidates).toContain(apiId);

    // 4. Set as Primary in Co pipeline for general mode
    DynamicRouter.updateRouteConfig('general', {
      defaultService: apiId,
      fallbackChain: ['grok'],
    }, 'co');

    const coGenCandidates = DynamicRouter.getCandidateChain('general', undefined, false, 'co');
    expect(coGenCandidates[0]).toBe(apiId);

    // Cleanup
    ServiceManifestManager.deleteProvider(apiId);
    DynamicRouter.resetRoutes();
  });

  it('should strictly honor 0 configured fallbacks and NOT auto-inject unconfigured webview services', () => {
    // Configure general mode with primary gemini and 0 fallbacks
    DynamicRouter.updateRouteConfig('general', {
      defaultService: 'gemini',
      fallbackChain: [],
      fallbacks: [],
    }, 'main');

    const candidates = DynamicRouter.getCandidateChain('general', undefined, false, 'main');
    expect(candidates).toEqual(['gemini']);
    expect(candidates).not.toContain(TEST_WEBVIEW_ID);
  });
});
