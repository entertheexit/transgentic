import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { TransgenticMcpServer } from '../src/main/mcp/server.js';
import { LocalLlmClient } from '../src/main/localllm/localLlmClient.js';
import { DynamicRouter } from '../src/main/mcp/router.js';
import { AccountRegistryManager } from '../src/main/registry/accountRegistry.js';
import { globalThreadManager } from '../src/main/registry/threadManager.js';
import { BaseMcpHandler } from '../src/main/mcp/handlers/baseHandler.js';

vi.mock('../src/main/storage/logStorage.js', () => ({ globalLogStorage: { insert: vi.fn(), update: vi.fn() } }));
vi.mock('../src/main/security/clientAuth.js', () => ({ ClientAuthManager: { verifyToken: () => true } }));

let server: TransgenticMcpServer;
let port: number;
let completion: ReturnType<typeof vi.spyOn>;
const code = 'function add(a,b) { return a+b; }';
const headers = { 'Content-Type': 'application/json', Authorization: 'Bearer transport-test' };

async function post(body: any, session = '', accept = 'application/json') {
  return fetch(`http://127.0.0.1:${port}/mcp`, {
    method: 'POST', headers: { ...headers, 'mcp-session-id': session, Accept: accept }, body: JSON.stringify(body),
  });
}
async function initialize(name: string) {
  const res = await post({ jsonrpc: '2.0', id: 'init', method: 'initialize', params: {
    protocolVersion: '2025-11-25', clientInfo: { name, version: '1' }, capabilities: {},
  } });
  expect(res.status).toBe(200);
  const session = res.headers.get('mcp-session-id')!;
  const initialized = await post({ jsonrpc: '2.0', method: 'notifications/initialized' }, session);
  expect(initialized.status).toBe(202);
  expect(await initialized.text()).toBe('');
  return session;
}
function call(id: string | number = 1, extra: any = {}, progressToken?: string | number) {
  return { jsonrpc: '2.0', id, method: 'tools/call', params: {
    name: 'prompt_model', arguments: { prompt: 'Return add(a,b).', mode: 'coding', ...extra },
    ...(progressToken === undefined ? {} : { _meta: { progressToken } }),
  } };
}

beforeEach(async () => {
  vi.spyOn(DynamicRouter, 'getCandidateChain').mockReturnValue(['localllm']);
  vi.spyOn(AccountRegistryManager, 'getActiveAccount').mockReturnValue(undefined as any);
  completion = vi.spyOn(LocalLlmClient, 'generateCompletion').mockResolvedValue({ text: code });
  server = new TransgenticMcpServer(0);
  server.updateConfig({ balancedMode: true, localLLM: { enabled: true, preset: 'custom', selectedModel: 'test' }, doubleAgent: { enabled: false } } as any);
  port = await server.start();
});
afterEach(async () => {
  await server.stop();
  globalThreadManager.clearAll();
  vi.restoreAllMocks();
});

describe('MCP session profiles, progress, and cancellation', () => {
  it('detects IDEs, defaults ordinary initialized clients to plain, and supports explicit overrides', async () => {
    for (const [name, expectedProfile] of [['Codex', 'agentic'], ['Cursor', 'agentic'], ['Reporting dashboard', 'plain']]) {
      const session = await initialize(name);
      const { result } = await (await post(call(), session)).json();
      expect(result.structuredContent.responseProfile).toBe(expectedProfile);
      expect(result.content).toHaveLength(expectedProfile === 'plain' ? 1 : 2);
      const { result: override } = await (await post(call(2, { response_profile: 'plain' }), session)).json();
      expect(override.content).toHaveLength(1);
      expect(completion.mock.lastCall![0].at(-1)).toEqual({ role: 'user', content: 'Return add(a,b).' });
      expect(completion.mock.lastCall![0]).toHaveLength(expectedProfile === 'plain' ? 3 : 1);
    }
  });

  it('keeps session headers stable, separates conversations, and ignores the UI mode', async () => {
    server.setMode('video');
    const a = await initialize('Codex');
    const b = await initialize('Codex');
    expect(a).not.toBe(b);
    for (const session of [a, b]) {
      const request = call(1, { prompt: 'Hello there' });
      delete (request.params.arguments as any).mode;
      const res = await post(request, session);
      expect(res.headers.get('mcp-session-id')).toBe(session);
      expect((await res.json()).result.structuredContent.mode).toBe('general');
      expect(completion.mock.lastCall![0]).toHaveLength(1);
    }
    await post(call(2, { prompt: 'Hello again', mode: 'general' }), a);
    expect(completion.mock.lastCall![0]).toHaveLength(3);
  });

  it('emits monotonic progress and a final result only when a streaming client requests progress', async () => {
    const session = await initialize('Codex');
    const res = await post(call(1, {}, 0), session, 'application/json, text/event-stream');
    expect(res.headers.get('content-type')).toContain('text/event-stream');
    const frames = (await res.text()).split('\n').filter((line) => line.startsWith('data: ')).map((line) => JSON.parse(line.slice(6)));
    const progress = frames.filter((frame) => frame.method === 'notifications/progress');
    expect(progress.length).toBeGreaterThanOrEqual(3);
    expect(progress.every((frame) => frame.params.progressToken === 0)).toBe(true);
    expect(progress.map((frame) => frame.params.progress)).toEqual(progress.map((_frame, i) => i + 1));
    expect(frames.at(-1).result.structuredContent.status).toBe('completed');
    for (const [request, accept] of [[call(2), 'application/json, text/event-stream'], [call(3, {}, 'token'), 'application/json']] as const) {
      const plain = await post(request, session, accept);
      expect(plain.headers.get('content-type')).toContain('application/json');
      expect((await plain.json()).result.content[0].text).toBe(code);
    }
  });

  it('cancels only the owning session, including request ID zero, and sends no cancelled result', async () => {
    const a = await initialize('Codex');
    const b = await initialize('Cursor');
    let started!: () => void;
    const bothStarted = new Promise<void>((resolve) => { started = resolve; });
    const pending: Array<{ resolve: (value: any) => void; signal: AbortSignal }> = [];
    completion.mockImplementation((_messages: any, _cfg: any, options: any) => new Promise((resolve, reject) => {
      pending.push({ resolve, signal: options.abortSignal });
      options.abortSignal.addEventListener('abort', () => reject(new Error('cancelled')), { once: true });
      if (pending.length === 2) started();
    }));
    const resultA = post(call(0), a);
    const resultB = post(call(0), b);
    await bothStarted;
    await post({ jsonrpc: '2.0', method: 'notifications/cancelled', params: { requestId: 0 } }, a);
    expect(pending.filter((p) => p.signal.aborted)).toHaveLength(1);
    for (const p of pending) if (!p.signal.aborted) p.resolve({ text: code });
    expect((await resultA).status).toBe(202);
    expect(await (await resultA).text()).toBe('');
    expect((await (await resultB).json()).result.structuredContent.status).toBe('completed');
  });

  it('keeps string and numeric request IDs distinct and removes completed contexts', () => {
    const numeric = BaseMcpHandler.createContext({} as any, 'session', 1);
    const string = BaseMcpHandler.createContext({} as any, 'session', '1');
    expect(BaseMcpHandler.getContext(1, 'session')).toBe(numeric);
    expect(BaseMcpHandler.getContext('1', 'session')).toBe(string);
    BaseMcpHandler.cleanupContext(1, 'session');
    BaseMcpHandler.cleanupContext('1', 'session');
    expect(BaseMcpHandler.getContext(1, 'session')).toBeUndefined();
  });

  it('preserves legacy SSE delivery, plain endpoint profiles, and optional progress', async () => {
    const controller = new AbortController();
    const stream = await fetch(`http://127.0.0.1:${port}/sse?response_profile=plain`, {
      headers, signal: controller.signal,
    });
    const reader = stream.body!.getReader();
    try {
      const discovery = new TextDecoder().decode((await reader.read()).value);
      const endpoint = discovery.match(/data: ([^\n]+)/)![1];
      const acknowledgement = await fetch(`http://127.0.0.1:${port}${endpoint}`, {
        method: 'POST', headers, body: JSON.stringify(call(9, {}, 'legacy-progress')),
      });
      expect(acknowledgement.status).toBe(202);
      let output = '';
      while (!output.includes('"structuredContent"')) {
        const chunk = await reader.read();
        if (chunk.done) break;
        output += new TextDecoder().decode(chunk.value);
      }
      const frames = output.split('\n').filter((line) => line.startsWith('data: ')).map((line) => JSON.parse(line.slice(6)));
      expect(frames.some((frame) => frame.params?.progressToken === 'legacy-progress')).toBe(true);
      expect(frames.at(-1).result.content).toEqual([{ type: 'text', text: code }]);
      expect(frames.at(-1).result.structuredContent.responseProfile).toBe('plain');
    } finally {
      controller.abort();
      await reader.cancel().catch(() => {});
    }
  });
});
