import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TransgenticMcpServer } from '../src/main/mcp/server.js';
import { globalCliRuntime } from '../src/main/cli/cliRuntimeManager.js';
import { DynamicRouter } from '../src/main/mcp/router.js';
import { ServiceManifestManager } from '../src/main/registry/serviceManifest.js';
import { globalLogStorage } from '../src/main/storage/logStorage.js';

vi.mock('../src/main/storage/logStorage.js', () => ({ globalLogStorage: { insert: vi.fn(), update: vi.fn(), getAll: vi.fn().mockReturnValue([]), wasCleared: vi.fn().mockReturnValue(false) }, logCategory: vi.fn().mockReturnValue('normal') }));
vi.mock('../src/main/security/clientAuth.js', () => ({ ClientAuthManager: { verifyToken: (token?: string) => token === 'transport-token', getMasterToken: () => 'transport-token' } }));

describe('OpenAI-compatible completion transport', () => {
  let server: TransgenticMcpServer;
  let port: number;
  beforeEach(async () => {
    vi.spyOn(globalCliRuntime, 'available').mockReturnValue(true);
    vi.spyOn(globalCliRuntime, 'getServiceConfig').mockReturnValue({ workMode: 'provider', allowCommands: false, allowProjectEditing: false, timeoutSeconds: 300 });
    vi.spyOn(globalCliRuntime, 'execute').mockResolvedValue({ text: 'Direct CLI answer', modelUsed: 'native-model' });
    vi.spyOn(ServiceManifestManager, 'isServiceEnabled').mockReturnValue(true);
    vi.spyOn(DynamicRouter, 'getRule').mockReturnValue({ mode: 'general', defaultService: 'cli_codex', primary: 'cli_codex', fallbackChain: [], fallbacks: [], outputFormat: 'prose_markdown' });
    vi.spyOn(DynamicRouter, 'resolveTargetModel').mockReturnValue(undefined);
    server = new TransgenticMcpServer(0);
    server.updateConfig({ cli: { services: { cli_codex: { workMode: 'provider', allowCommands: false, allowProjectEditing: false, timeoutSeconds: 300 } }, workspaces: [] } } as any);
    port = await server.start();
  });
  afterEach(async () => { await server.stop(); vi.restoreAllMocks(); });

  it('requires the Transgentic token and lists route models', async () => {
    expect((await fetch(`http://127.0.0.1:${port}/v1/models`)).status).toBe(401);
    const response = await fetch(`http://127.0.0.1:${port}/v1/models`, { headers: { Authorization: 'Bearer transport-token' } });
    expect(response.status).toBe(200);
    const data: any = await response.json();
    const modelIds = data.data.map((model: any) => model.id);
    expect(modelIds).toEqual(expect.arrayContaining(['transgentic/general', 'transgentic/writing', 'transgentic/coding', 'transgentic/provider/cli_codex']));
    expect(new Set(modelIds).size).toBe(modelIds.length);
  });

  it('advertises Writing as a backend model that uses the General route configuration', async () => {
    const response = await fetch(`http://127.0.0.1:${port}/v1/chat/completions`, { method: 'POST', headers: { Authorization: 'Bearer transport-token', 'Content-Type': 'application/json' }, body: JSON.stringify({ model: 'transgentic/writing', messages: [{ role: 'user', content: 'Draft a scene' }] }) });
    expect(response.status).toBe(200);
    expect(DynamicRouter.getRule).toHaveBeenCalledWith('writing', 'main');
  });

  it('starts a fresh CLI completion and returns an OpenAI response', async () => {
    const response = await fetch(`http://127.0.0.1:${port}/v1/chat/completions`, { method: 'POST', headers: { Authorization: 'Bearer transport-token', 'Content-Type': 'application/json' }, body: JSON.stringify({ model: 'transgentic/general', messages: [{ role: 'user', content: 'Unique context' }] }) });
    expect(response.status).toBe(200);
    const data: any = await response.json();
    expect(data.choices[0].message).toEqual({ role: 'assistant', content: 'Direct CLI answer' });
    expect(globalCliRuntime.execute).toHaveBeenCalledWith('cli_codex', expect.stringContaining('Unique context'), expect.objectContaining({ newThread: true, request: {} }));
    const options = vi.mocked(globalCliRuntime.execute).mock.calls[0][2];
    expect(options.conversationKey).toBe(options.reqId);
    expect(data.transgentic.chatExecution).toMatchObject({ policy: 'prefer-temporary', actualMode: 'normal', fallbackReason: expect.any(String) });
    expect(globalLogStorage.update).toHaveBeenCalledWith(expect.objectContaining({ transport: 'api', status: 'success', responseText: expect.stringContaining('Direct CLI answer') }));
  });

  it('keeps explicit temporary API requests strict and rejects retained sessions for CLI targets', async () => {
    const post = async (body: any) => fetch(`http://127.0.0.1:${port}/v1/chat/completions`, { method: 'POST',
      headers: { Authorization: 'Bearer transport-token', 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const strict = await post({ model: 'transgentic/general', temporary_chat: true, messages: [{ role: 'user', content: 'sentinel strict' }] });
    expect(strict.status).toBe(400);
    expect((await strict.json() as any).error.message).toContain('TEMPORARY_CHAT_UNSUPPORTED');
    const retained = await post({ model: 'transgentic/provider/cli_codex', conversation_id: 'thread', messages: [{ role: 'user', content: 'sentinel retained' }] });
    expect(retained.status).toBe(400);
    expect((await retained.json() as any).error.message).toContain('CONVERSATION_UNSUPPORTED');
    expect(globalCliRuntime.execute).not.toHaveBeenCalled();
  });

  it('emits valid buffered SSE chunks and a DONE marker', async () => {
    const response = await fetch(`http://127.0.0.1:${port}/v1/chat/completions`, { method: 'POST', headers: { Authorization: 'Bearer transport-token', 'Content-Type': 'application/json' }, body: JSON.stringify({ model: 'transgentic/general', stream: true, messages: [{ role: 'user', content: 'Hello' }] }) });
    expect(response.headers.get('content-type')).toContain('text/event-stream');
    const body = await response.text();
    expect(body).toContain('chat.completion.chunk');
    expect(body).toContain('Direct CLI answer');
    expect(body).toContain('data: [DONE]');
    expect(body).toContain('"chatExecution"');
  });

  it('streams validated tool calls while forcing all optional context extras off', async () => {
    vi.mocked(globalCliRuntime.execute).mockResolvedValueOnce({
      text: JSON.stringify({ type: 'assistant', content: null, tool_calls: [{ id: 'call_read', type: 'function', function: { name: 'read_file', arguments: '{"path":"client.txt"}' } }] }),
      modelUsed: 'native-model',
    });
    server.updateConfig({
      recall: { completionEnabled: true },
      localLLM: { completionCompact: true },
      doubleAgent: { completionReviewEnabled: true },
      cli: { services: { cli_codex: { workMode: 'provider', allowCommands: false, allowProjectEditing: false, timeoutSeconds: 300 } }, workspaces: [] },
    } as any);
    const response = await fetch(`http://127.0.0.1:${port}/v1/chat/completions`, {
      method: 'POST',
      headers: { Authorization: 'Bearer transport-token', 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'transgentic/general', stream: true, messages: [{ role: 'user', content: 'Read client.txt' }], tools: [{ type: 'function', function: { name: 'read_file', parameters: { type: 'object' } } }] }),
    });
    const body = await response.text();
    expect(body).toContain('"tool_calls"');
    expect(body).toContain('"finish_reason":"tool_calls"');
    expect(globalCliRuntime.execute).toHaveBeenCalledTimes(1);
    expect(vi.mocked(globalCliRuntime.execute).mock.calls[0][1]).not.toContain('explicitly enabled Recall');
  });

  it('uses the Co route for an explicitly enabled text-only review pass', async () => {
    vi.mocked(DynamicRouter.getRule).mockImplementation((_mode: any, pipeline: any) => pipeline === 'co'
      ? { mode: 'general', defaultService: 'cli_antigravity', primary: 'cli_antigravity', fallbackChain: [], fallbacks: [], outputFormat: 'prose_markdown' }
      : { mode: 'general', defaultService: 'cli_codex', primary: 'cli_codex', fallbackChain: [], fallbacks: [], outputFormat: 'prose_markdown' });
    vi.mocked(globalCliRuntime.execute).mockImplementation(async (provider: any) => ({ text: provider === 'cli_antigravity' ? 'Reviewed answer' : 'Primary answer', modelUsed: 'native-model' }));
    server.updateConfig({
      doubleAgent: { completionReviewEnabled: true },
      cli: { services: { cli_codex: { workMode: 'provider', allowCommands: false, allowProjectEditing: false, timeoutSeconds: 300 } }, workspaces: [] },
    } as any);
    const response = await fetch(`http://127.0.0.1:${port}/v1/chat/completions`, {
      method: 'POST',
      headers: { Authorization: 'Bearer transport-token', 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'transgentic/general', messages: [{ role: 'user', content: 'Answer carefully' }] }),
    });
    const data: any = await response.json();
    expect(data.choices[0].message.content).toBe('Reviewed answer');
    expect(data.transgentic.provider).toBe('cli_antigravity');
    expect(globalCliRuntime.execute).toHaveBeenCalledTimes(2);
  });
});
