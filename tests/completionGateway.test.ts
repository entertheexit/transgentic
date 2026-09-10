import { describe, expect, it, vi } from 'vitest';
import { parseProviderToolEnvelope, serializeCompletionForProvider } from '../src/main/completion/completionGateway.js';

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
});
