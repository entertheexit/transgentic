import fs from 'node:fs';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { TransgenticMcpServer } from '../src/main/mcp/server.js';
import { DynamicRouter } from '../src/main/mcp/router.js';
import { AccountRegistryManager } from '../src/main/registry/accountRegistry.js';
import { globalThreadManager } from '../src/main/registry/threadManager.js';

// Opt-in smoke test: use a real local model through HTTP MCP, with isolated logs/auth/routes.
// TRANSGENTIC_LIVE_LOCAL_CONFIG must point to a Transgentic config with an enabled Local LLM.
vi.mock('../src/main/storage/logStorage.js', () => ({
  globalLogStorage: { insert: vi.fn(), update: vi.fn() },
}));
vi.mock('../src/main/security/clientAuth.js', () => ({
  ClientAuthManager: { verifyToken: (token: string) => token === 'isolated-local-smoke-test' },
}));

const configPath = process.env.TRANSGENTIC_LIVE_LOCAL_CONFIG;
describe.skipIf(!configPath)('Real Local LLM answers through MCP', () => {
  let server: TransgenticMcpServer | undefined;
  afterAll(async () => {
    await server?.stop();
    globalThreadManager.clearAll();
    vi.restoreAllMocks();
  });

  it('returns code with reminders for IDE turns and neutral code for a plain caller', async () => {
    const { localLLM } = JSON.parse(fs.readFileSync(configPath!, 'utf8'));
    expect(localLLM?.enabled).toBe(true);
    vi.spyOn(DynamicRouter, 'getCandidateChain').mockReturnValue(['localllm']);
    vi.spyOn(AccountRegistryManager, 'getActiveAccount').mockReturnValue(undefined as any);
    server = new TransgenticMcpServer(0);
    server.updateConfig({ balancedMode: true, localLLM, doubleAgent: { enabled: false } } as any);
    const port = await server.start();
    const headers = { 'Content-Type': 'application/json', Authorization: 'Bearer isolated-local-smoke-test' };
    const initialized = await fetch(`http://127.0.0.1:${port}/mcp`, {
      method: 'POST', headers,
      body: JSON.stringify({ jsonrpc: '2.0', id: 'init', method: 'initialize', params: {
        protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'Codex smoke test', version: '1' },
      } }),
    });
    const sessionId = initialized.headers.get('mcp-session-id')!;

    const prompts = [
      'Return a JavaScript function add(a, b) that returns a + b. Return only the code block.',
      'Now return a JavaScript function multiply(a, b) that returns a * b. Return only the code block.',
      'Return a JavaScript function subtract(a, b) that returns a - b. Return only the code block.',
    ];
    for (let turn = 0; turn < prompts.length; turn++) {
      const response = await fetch(`http://127.0.0.1:${port}/mcp`, {
        method: 'POST',
        headers: { ...headers, 'mcp-session-id': sessionId },
        body: JSON.stringify({ jsonrpc: '2.0', id: turn + 1, method: 'tools/call', params: {
          name: 'prompt_model', arguments: {
            mode: 'coding', prompt: prompts[turn], thread_id: 'isolated-local-smoke', new_thread: turn === 0,
            ...(turn === 2 ? { response_profile: 'plain' } : {}),
          },
        } }),
        signal: AbortSignal.timeout(150_000),
      });
      expect(response.status).toBe(200);
      const { result, error } = await response.json();
      expect(error).toBeUndefined();
      expect(result.isError).not.toBe(true);
      expect(result.content).toHaveLength(turn === 2 ? 1 : 2);
      expect(result.content[0].text).toMatch(turn === 0 ? /a\s*\+\s*b/ : turn === 1 ? /a\s*\*\s*b/ : /a\s*-\s*b/);
      expect(result.content[0].text).not.toContain('[TRANSGENTIC');
      if (turn < 2) {
        expect(result.content[1].text).toContain(turn === 0 ? 'BALANCED HARNESS: LOCAL LLM' : 'DECISION GUIDANCE - LOCAL LLM');
        expect(result.content[1].text.match(/\[TRANSGENTIC /g)).toHaveLength(1);
      }
      expect(result.structuredContent.responseProfile).toBe(turn === 2 ? 'plain' : 'agentic');
      console.log(JSON.stringify({ turn: turn + 1, provider: result.metadata.providerUsed,
        model: result.metadata.modelUsed, answer: result.content[0].text,
        reminder: result.content[1]?.text.trim().split('\n')[1], durationMs: result.metadata.durationMs }));
    }
  }, 310_000);
});
