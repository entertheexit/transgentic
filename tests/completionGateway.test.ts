import { describe, expect, it, vi } from 'vitest';
import { CompletionGateway, parseProviderToolAwareResponse, parseProviderToolEnvelope, serializeCompletionForProvider } from '../src/main/completion/completionGateway.js';
import { ServiceManifestManager } from '../src/main/registry/serviceManifest.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

vi.mock('electron', () => ({ app: undefined }));

const tools = [{ type: 'function' as const, function: { name: 'read_file', description: 'Read a file', parameters: { type: 'object', properties: { path: { type: 'string' } } } } }];
function toolResponse(args: unknown, name = 'read_file'): string {
  return 'TRANSGENTIC_TOOL_CALLS_V2\n' + JSON.stringify([{ name, arguments: args }]);
}

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

  it('asks Webview providers for a required tool call with object arguments', () => {
    const prompt = serializeCompletionForProvider([{ role: 'user', content: 'Read the fixture' }], tools, true, 'required');
    expect(prompt).toContain('You must call at least one available tool.');
    expect(prompt).toContain('Put tool arguments directly in the arguments object');
    expect(prompt).not.toContain('valid JSON object encoded as a string');
    expect(serializeCompletionForProvider([{ role: 'user', content: 'Read the fixture' }], tools, false,
      { type: 'function', function: { name: 'read_file' } })).toContain('You must call the available tool named "read_file".');
    const parsed = parseProviderToolEnvelope('{"type":"assistant","content":null,"tool_calls":[{"id":"call_1","type":"function","function":{"name":"read_file","arguments":{"path":"src/a.ts"}}}]}', tools);
    expect(JSON.parse(parsed.tool_calls![0].function.arguments)).toEqual({ path: 'src/a.ts' });
  });

  it('keeps long ordinary answers outside JSON when tools are optional', () => {
    const prompt = serializeCompletionForProvider([{ role: 'user', content: 'Report the findings' }], tools, false, 'auto');
    expect(prompt).toContain('answer in ordinary plain text');
    expect(prompt).toContain('TRANSGENTIC_TOOL_CALLS_V1');
    const report = 'Finding: a path such as C:\\app\\src\\index.ts can contain backslashes and "quotes".\n\n```ts\nconst x = 1;\n```';
    expect(parseProviderToolAwareResponse(report, tools, 'auto')).toEqual({ content: report });
    const malformedLegacy = '{"type":"assistant","content":"C:\\app\\src","tool_calls":[]}';
    expect(parseProviderToolAwareResponse(malformedLegacy, tools, 'auto')).toEqual({ content: malformedLegacy });
    const unmarkedToolExample = JSON.stringify({ type: 'assistant', tool_calls: [{ function: { name: 'read_file', arguments: { path: 'src/a.ts' } } }] });
    expect(parseProviderToolAwareResponse(unmarkedToolExample, tools, 'auto')).toEqual({ content: unmarkedToolExample });
    expect(parseProviderToolAwareResponse(unmarkedToolExample, tools, 'auto', true).tool_calls).toHaveLength(1);
  });

  it('accepts marked tool calls and rejects invalid marked requests', () => {
    const marked = 'TRANSGENTIC_TOOL_CALLS_V1\n' + JSON.stringify({ type: 'assistant', content: null, tool_calls: [
      { id: 'call_1', type: 'function', function: { name: 'read_file', arguments: { path: 'src/a.ts' } } },
    ] });
    const parsed = parseProviderToolAwareResponse(marked, tools, 'auto');
    expect(JSON.parse(parsed.tool_calls![0].function.arguments)).toEqual({ path: 'src/a.ts' });
    expect(parseProviderToolAwareResponse(marked.replace('\n', '\r\n'), tools, 'required').tool_calls).toHaveLength(1);
    expect(() => parseProviderToolAwareResponse('TRANSGENTIC_TOOL_CALLS_V1\n{"type":"assistant","tool_calls":[', tools, 'auto')).toThrow();
    expect(() => parseProviderToolAwareResponse('TRANSGENTIC_TOOL_CALLS_V1\n' + JSON.stringify({ type: 'assistant', tool_calls: [
      { function: { name: 'run_shell', arguments: {} } },
    ] }), tools, 'auto')).toThrow('unknown tool');
    expect(() => parseProviderToolAwareResponse('Just the answer', tools, 'required')).toThrow('required tool call');
  });

  it('rejects unknown tools and malformed arguments instead of repairing with another model call', () => {
    expect(() => parseProviderToolEnvelope('{"type":"assistant","content":null,"tool_calls":[{"function":{"name":"run_shell","arguments":"{}"}}]}', tools)).toThrow('unknown tool');
    expect(() => parseProviderToolEnvelope('{"type":"assistant","content":null,"tool_calls":[{"function":{"name":"read_file","arguments":"[]"}}]}', tools)).toThrow('JSON object');
  });

  it('preserves long JSON tool strings with paths, regexes, quotes, code, and newlines', () => {
    const content = 'C:\\repo\\src\\parser.ts\n\\d+\\s+\\w+\n"hello world"\n```ts\nconst regex = /\\d+/;\n```\nสวัสดี\n'.repeat(80);
    const args = { path: 'docs/report.md', nested: [{ text: content, empty: '' }], enabled: true, count: 2, other: null };
    expect(JSON.parse(parseProviderToolAwareResponse(toolResponse(args), tools, 'required').tool_calls![0].function.arguments)).toEqual(args);
    const prompt = serializeCompletionForProvider([{ role: 'user', content: 'Write a report' }], tools, false, 'auto', true);
    expect(prompt).toContain('Keep the entire tool request inside the code block');
    expect(prompt).toContain('Properly JSON-escape every string');
    expect(prompt).toContain('answer in ordinary plain text');
  });

  it('accepts rendering artifacts while rejecting malformed JSON and unknown tools', () => {
    const valid = toolResponse({ path: 'src/a.ts' });
    for (const raw of [valid, valid.replace('\n', ''), valid + '\n```', valid.replace('\n', '\r\n')]) {
      expect(JSON.parse(parseProviderToolAwareResponse(raw, tools, 'auto').tool_calls![0].function.arguments)).toEqual({ path: 'src/a.ts' });
    }
    for (const raw of [toolResponse([], 'read_file'), toolResponse({}, 'run_shell'), valid + '\nUnrequested prose', 'TRANSGENTIC_TOOL_CALLS_V2\n[{"name":"read_file","arguments":{"path":"C:\\repo\\src"}}]']) {
      expect(() => parseProviderToolAwareResponse(raw, tools, 'auto')).toThrow();
    }
    expect(parseProviderToolAwareResponse('Example:\n' + valid, tools, 'auto')).toEqual({ content: 'Example:\n' + valid });
  });
  it('keeps independent multiple calls and assigns distinct native call IDs', () => {
    const raw = `TRANSGENTIC_TOOL_CALLS_V2\n` + JSON.stringify([
      { name: 'read_file', arguments: { path: 'src/a.ts' } },
      { name: 'read_file', arguments: { path: 'src/b.ts' } },
    ]);
    const calls = parseProviderToolAwareResponse(raw, tools, 'auto').tool_calls!;
    expect(calls.map(call => JSON.parse(call.function.arguments))).toEqual([{ path: 'src/a.ts' }, { path: 'src/b.ts' }]);
    expect(new Set(calls.map(call => call.id)).size).toBe(2);
    expect(calls.every(call => call.type === 'function' && call.function.name === 'read_file')).toBe(true);
  });

  it('rejects an omitted required file body before returning a write call', () => {
    const writeTools = [{ type: 'function' as const, function: { name: 'write_to_file', parameters: {
      type: 'object', required: ['path', 'content'], properties: { path: { type: 'string' }, content: { type: 'string' } },
    } } }];
    expect(() => parseProviderToolAwareResponse(toolResponse({ path: 'report.md' }, 'write_to_file'), writeTools, 'auto')).toThrow('Missing required argument "content"');
    expect(() => parseProviderToolAwareResponse(toolResponse({ path: 'report.md', content: {} }, 'write_to_file'), writeTools, 'auto')).toThrow('must be a string');
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
