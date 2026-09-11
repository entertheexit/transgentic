import { afterEach, describe, expect, it, vi } from 'vitest';
import { TransgenticMcpServer } from '../src/main/mcp/server.js';
import { ServiceManifestManager } from '../src/main/registry/serviceManifest.js';

vi.mock('electron', () => ({ app: undefined }));

const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const manifest = (attachmentKinds: string[]) => ({ version: '1', services: {
  api_vision: { id: 'api_vision', name: 'Vision API', company: 'Test', enabled: true, providerType: 'api', baseUrl: 'https://vision.example/v1', url: 'https://vision.example', partition: '', defaultModelId: 'vision-model', attachmentKinds, models: [] },
} } as any);

afterEach(() => vi.restoreAllMocks());

describe('MCP custom API attachment execution', () => {
  it('uses the shared OpenAI-compatible runtime instead of a webview adapter', async () => {
    vi.spyOn(ServiceManifestManager, 'getManifest').mockReturnValue(manifest(['image']));
    vi.spyOn(ServiceManifestManager, 'isServiceEnabled').mockReturnValue(true);
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ model: 'vision-model', choices: [{ message: { role: 'assistant', content: 'API saw the image' }, finish_reason: 'stop' }] }), { status: 200 }));
    const server = new TransgenticMcpServer();
    const result = await server.orchestratePrompt('Describe the reference', 'general', 'api_vision', undefined, undefined, undefined, 'vision-thread', true, false, true, { profile: 'plain', sessionId: 'test', isLoopback: false }, [{ data: png.toString('base64'), name: 'reference.png', mimeType: 'image/png' }]);
    expect(result.isError).not.toBe(true);
    expect(result.content[0].text).toBe('API saw the image');
    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(body.messages[0].content[1].image_url.url).toMatch(/^data:image\/png;base64,/);
  });

  it('fails a forced provider clearly when its declared input kinds are insufficient', async () => {
    vi.spyOn(ServiceManifestManager, 'getManifest').mockReturnValue(manifest([]));
    vi.spyOn(ServiceManifestManager, 'isServiceEnabled').mockReturnValue(true);
    const server = new TransgenticMcpServer();
    const result = await server.orchestratePrompt('Describe the reference', 'general', 'api_vision', undefined, undefined, undefined, 'vision-thread', true, false, true, { profile: 'plain', sessionId: 'test', isLoopback: false }, [{ data: png.toString('base64'), name: 'reference.png', mimeType: 'image/png' }]);
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('does not declare support');
  });
});
