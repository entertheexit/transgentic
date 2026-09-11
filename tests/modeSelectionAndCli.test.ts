import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { DynamicRouter } from '../src/main/mcp/router.js';
import { TransgenticMcpServer } from '../src/main/mcp/server.js';
import { ClientAuthManager } from '../src/main/security/clientAuth.js';
import { SseTransportManager } from '../src/main/mcp/sseTransport.js';
import { ServiceManifestManager } from '../src/main/registry/serviceManifest.js';

const TEST_WEBVIEW_ID = 'webview_test_service';

describe('Mode Selection & Routing Verification', () => {
  beforeEach(() => {
    DynamicRouter.resetRoutes();
    const manifest = ServiceManifestManager.getManifest();
    manifest.services[TEST_WEBVIEW_ID] = {
      id: TEST_WEBVIEW_ID as any,
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
        { id: 'sample-video-fast', displayName: 'Sample Video Fast', enabled: true, discoveredAvailable: true, userEnabled: true, mode: 'video', modes: ['video'] },
        { id: 'lyria-3-pro', displayName: 'Lyria Pro', enabled: true, discoveredAvailable: true, userEnabled: true, mode: 'audio', modes: ['audio'] },
        { id: 'kimi-k2-7-code', displayName: 'Kimi Code', enabled: true, discoveredAvailable: true, userEnabled: true, mode: 'coding', modes: ['coding'] },
      ],
    };
    ServiceManifestManager.saveManifest(manifest);
  });

  afterAll(() => {
    ServiceManifestManager.deleteProvider(TEST_WEBVIEW_ID as any);
    DynamicRouter.resetRoutes();
  });

  describe('DynamicRouter.classifyMode', () => {
    it('should classify storyboard and scene prompts as image mode', () => {
      const p1 = DynamicRouter.classifyMode('Storyboard scene 1: Character standing on a cliff at dusk, cinematic lighting');
      expect(p1.mode).toBe('image');
      expect(p1.isAutoDetected).toBe(true);

      const p2 = DynamicRouter.classifyMode('Scene 2: Close-up shot of the amulet glowing, volumetric lighting, concept art');
      expect(p2.mode).toBe('image');
      expect(p2.isAutoDetected).toBe(true);

      const p3 = DynamicRouter.classifyMode('Comic panel showing the protagonist jumping across rooftops, manga panel style');
      expect(p3.mode).toBe('image');
      expect(p3.isAutoDetected).toBe(true);
    });

    it('should classify Thai language prompts into correct task modes', () => {
      const img1 = DynamicRouter.classifyMode('วาดรูปแมวน่ารักเล่นลูกบอล');
      expect(img1.mode).toBe('image');
      expect(img1.isAutoDetected).toBe(true);

      const img2 = DynamicRouter.classifyMode('สร้างภาพวิวภูเขาไฟฟูจิตอนพระอาทิตย์ขึ้น');
      expect(img2.mode).toBe('image');
      expect(img2.isAutoDetected).toBe(true);

      const vid = DynamicRouter.classifyMode('สร้างวิดีโออนิเมชั่นความยาว 5 วินาที');
      expect(vid.mode).toBe('video');
      expect(vid.isAutoDetected).toBe(true);

      const aud = DynamicRouter.classifyMode('สร้างเพลงเปียโนบรรเลงฟังสบาย');
      expect(aud.mode).toBe('audio');
      expect(aud.isAutoDetected).toBe(true);

      const code = DynamicRouter.classifyMode('ช่วยเขียนโค้ด typescript สำหรับเชื่อมต่อ sqlite หน่อย');
      expect(code.mode).toBe('coding');
      expect(code.isAutoDetected).toBe(true);
    });

    it('should strictly preserve explicit mode when isStrictExplicit is true', () => {
      const explicitGeneral = DynamicRouter.classifyMode('Fix bug in auth middleware with function login()', 'general', true);
      expect(explicitGeneral.mode).toBe('general');
      expect(explicitGeneral.isAutoDetected).toBe(false);

      const explicitImage = DynamicRouter.classifyMode('Refactor this typescript class', 'image', true);
      expect(explicitImage.mode).toBe('image');
      expect(explicitImage.isAutoDetected).toBe(false);
    });

    it('should preserve explicit mode for non-general without strict flag', () => {
      const explicitCoding = DynamicRouter.classifyMode('Hello world', 'coding');
      expect(explicitCoding.mode).toBe('coding');
      expect(explicitCoding.isAutoDetected).toBe(false);
    });
  });

  describe('DynamicRouter.resolveTargetModel for Multi-Model Routing', () => {
    it('should resolve specialized models according to task mode', () => {
      const imgModel = DynamicRouter.resolveTargetModel(TEST_WEBVIEW_ID as any, 'image');
      expect(imgModel).toBe('gpt-image-2');

      const vidModel = DynamicRouter.resolveTargetModel(TEST_WEBVIEW_ID as any, 'video');
      expect(vidModel).toBe('sample-video-fast');

      const audModel = DynamicRouter.resolveTargetModel(TEST_WEBVIEW_ID as any, 'audio');
      expect(audModel).toBe('lyria-3-pro');

      const codeModel = DynamicRouter.resolveTargetModel(TEST_WEBVIEW_ID as any, 'coding');
      expect(codeModel).toBe('kimi-k2-7-code');

      const genModel = DynamicRouter.resolveTargetModel(TEST_WEBVIEW_ID as any, 'general');
      expect(genModel).toBe('gemini-3-1-flash-lite');
    });

    it('should honor explicit model request if enabled', () => {
      const explicit = DynamicRouter.resolveTargetModel(TEST_WEBVIEW_ID as any, 'image', 'sample-image-lite');
      expect(explicit).toBe('sample-image-lite');
    });
  });

  describe('MCP Server Tool Schemas & Dedicated Mode Endpoints', () => {
    let server: TransgenticMcpServer;
    let testPort: number;
    let token: string;

    beforeAll(async () => {
      token = ClientAuthManager.getMasterToken();
      server = new TransgenticMcpServer(58497);
      testPort = await server.start();
    });

    afterAll(async () => {
      await server.stop();
    });

    it('should provide mode parameter in direct provider tools schema', async () => {
      const sseRes = await fetch(`http://127.0.0.1:${testPort}/sse?token=${token}`);
      const reader = sseRes.body?.getReader();
      const { value } = await reader!.read();
      const sseChunk = new TextDecoder().decode(value);
      const sessionId = sseChunk.match(/sessionId=([a-f0-9-]+)/)![1];

      await fetch(`http://127.0.0.1:${testPort}/messages?sessionId=${sessionId}&token=${token}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 101,
          method: 'tools/list',
          params: {},
        }),
      });

      const { value: toolValue } = await reader!.read();
      const toolChunk = new TextDecoder().decode(toolValue);
      const parsed = JSON.parse(toolChunk.replace(/^event: message\ndata: /, '').trim());
      const tools = parsed.result.tools;

      const askChatgpt = tools.find((t: any) => t.name === 'ask_chatgpt');
      expect(askChatgpt).toBeDefined();
      expect(askChatgpt.inputSchema.properties.mode).toBeDefined();

      const toolNames = tools.map((t: any) => t.name);
      expect(toolNames).toContain('ask_chatgpt');
      expect(toolNames).toContain('ask_claude');
      expect(toolNames).toContain('ask_gemini');
      expect(toolNames).toContain('ask_grok');
      expect(toolNames).toContain('prompt_model');

      const genImage = tools.find((t: any) => t.name === 'generate_image');
      expect(genImage).toBeDefined();
      expect(genImage.inputSchema.properties.provider).toBeDefined();
      expect(genImage.inputSchema.properties.model).toBeDefined();

      reader?.cancel();
    });

    it('should attach targetMode and targetProvider to SSE client from query parameters', async () => {
      const sseRes = await fetch(`http://127.0.0.1:${testPort}/sse?token=${token}&mode=image&provider=grok`);
      expect(sseRes.status).toBe(200);

      const reader = sseRes.body?.getReader();
      const { value } = await reader!.read();
      const sseChunk = new TextDecoder().decode(value);
      const sessionId = sseChunk.match(/sessionId=([a-f0-9-]+)/)![1];

      const client = SseTransportManager.getClient(sessionId);
      expect(client).toBeDefined();
      expect(client?.targetMode).toBe('image');
      expect(client?.targetProvider).toBe('grok');

      reader?.cancel();
    });

    it('should attach targetMode to SSE client from dedicated /image/sse endpoint', async () => {
      const sseRes = await fetch(`http://127.0.0.1:${testPort}/image/sse?token=${token}`);
      expect(sseRes.status).toBe(200);

      const reader = sseRes.body?.getReader();
      const { value } = await reader!.read();
      const sseChunk = new TextDecoder().decode(value);
      const sessionId = sseChunk.match(/sessionId=([a-f0-9-]+)/)![1];

      const client = SseTransportManager.getClient(sessionId);
      expect(client).toBeDefined();
      expect(client?.targetMode).toBe('image');

      reader?.cancel();
    });

    it('keeps /writing/sse as a first-class Writing endpoint backed by General routing', async () => {
      const sseRes = await fetch(`http://127.0.0.1:${testPort}/writing/sse?token=${token}`);
      expect(sseRes.status).toBe(200);
      expect(sseRes.headers.get('deprecation')).toBeNull();
      expect(sseRes.headers.get('link')).toBeNull();
      const reader = sseRes.body?.getReader();
      const { value } = await reader!.read();
      const sseChunk = new TextDecoder().decode(value);
      const sessionId = sseChunk.match(/sessionId=([a-f0-9-]+)/)![1];
      expect(SseTransportManager.getClient(sessionId)?.targetMode).toBe('writing');
      expect(DynamicRouter.classifyMode('Continue the novel', 'writing')).toMatchObject({ mode: 'writing', intent: 'writing' });
      reader?.cancel();
    });

    it('keeps /writing/mcp as a first-class Writing endpoint', async () => {
      const response = await fetch(`http://127.0.0.1:${testPort}/writing/mcp`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
        body: JSON.stringify({
          jsonrpc: '2.0', id: 'writing-init', method: 'initialize',
          params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'writing-test', version: '1' } },
        }),
      });
      expect(response.status).toBe(200);
      expect(response.headers.get('deprecation')).toBeNull();
      expect(response.headers.get('link')).toBeNull();
    });
  });
});
