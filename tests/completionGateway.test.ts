import { describe, expect, it, vi } from 'vitest';
import { CompletionGateway, parseProviderToolEnvelope, serializeCompletionForProvider } from '../src/main/completion/completionGateway.js';
import { ServiceManifestManager } from '../src/main/registry/serviceManifest.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

vi.mock('electron', () => ({ app: undefined }));

const tools = [{ type: 'function' as const, function: { name: 'read_file', description: 'Read a file', parameters: { type: 'object', properties: { path: { type: 'string' } } } } }];

describe('OpenAI-compatible completion translation', () => {
  it('serializes caller history once and keeps the caller responsible for tools', () => {
    const prompt = serializeCompletionForProvider([
      { role: 'system', content: 'System marker' },
      { role: 'user', content: 'User marker' },
      { role: 'assistant', content: null, tool_calls: [{ id: 'old', type: 'function', function: { name: 'read_file', arguments: '{"path":"a"}' } }] },
      { role: 'tool', tool_call_id: 'old', content: 'Tool marker' },
    ], tools);
    expect(prompt.match(/System marker/g)).toHaveLength(1);
    expect(prompt.match(/User marker/g)).toHaveLength(1);
    expect(prompt.match(/Tool marker/g)).toHaveLength(1);
    expect(prompt).toContain('will execute tools');
    expect(prompt).toContain('Never execute a tool');
  });

  it('validates and returns native tool calls without executing them', () => {
    const parsed = parseProviderToolEnvelope(JSON.stringify({ type: 'assistant', content: null, tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'read_file', arguments: '{"path":"src/a.ts"}' } }] }), tools);
    expect(parsed).toEqual({ content: null, tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'read_file', arguments: '{"path":"src/a.ts"}' } }] });
  });

  it('rejects unknown tools and malformed arguments instead of repairing with another model call', () => {
    expect(() => parseProviderToolEnvelope('{"type":"assistant","content":null,"tool_calls":[{"function":{"name":"run_shell","arguments":"{}"}}]}', tools)).toThrow('unknown tool');
    expect(() => parseProviderToolEnvelope('{"type":"assistant","content":null,"tool_calls":[{"function":{"name":"read_file","arguments":"[]"}}]}', tools)).toThrow('JSON object');
  });

  it('rejects provider-bound file IDs that cannot survive routing', async () => {
    const gateway = new CompletionGateway(() => null, () => 58420);
    await expect(gateway.complete({ model: 'unknown', messages: [{ role: 'user', content: [{ type: 'file', file: { file_id: 'file-provider-owned' } }] }] })).rejects.toThrow('file_id');
  });

  it('shares OpenAI-compatible structured attachment dispatch with MCP API providers', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'transgentic-completion-'));
    const imagePath = path.join(root, 'reference.png');
    fs.writeFileSync(imagePath, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    vi.spyOn(ServiceManifestManager, 'getManifest').mockReturnValue({ version: '1', services: { api_test: { id: 'api_test', name: 'Vision API', company: 'Test', enabled: true, providerType: 'api', baseUrl: 'https://vision.example/v1', apiKey: 'secret', url: 'https://vision.example', partition: '', defaultModelId: 'vision-model', attachmentKinds: ['image'], models: [] } } } as any);
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ model: 'vision-model', choices: [{ message: { role: 'assistant', content: 'seen' }, finish_reason: 'stop' }] }), { status: 200, headers: { 'content-type': 'application/json' } }));
    try {
      const gateway = new CompletionGateway(() => null, () => 58420);
      const result = await gateway.completeProviderPrompt('api_test', 'general', 'Describe it', [{ path: imagePath, name: 'reference.png', mimeType: 'image/png', kind: 'image', size: 8, sha256: 'a'.repeat(64) }]);
      expect(result.message.content).toBe('seen');
      const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
      expect(body.messages[0].content).toEqual([
        { type: 'text', text: 'Describe it' },
        { type: 'image_url', image_url: { url: expect.stringMatching(/^data:image\/png;base64,/) } },
      ]);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
      vi.restoreAllMocks();
    }
  });
});
