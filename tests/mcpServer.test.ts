import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TransgenticMcpServer } from '../src/main/mcp/server.js';
import { ClientAuthManager } from '../src/main/security/clientAuth.js';

describe('TransgenticMcpServer Integration', () => {
  let server: TransgenticMcpServer;
  let testPort: number;
  let token: string;

  beforeAll(async () => {
    token = ClientAuthManager.getMasterToken();
    server = new TransgenticMcpServer(58498);
    testPort = await server.start();
  });

  afterAll(async () => {
    await server.stop();
  });

  it('should respond to /health endpoint without authentication', async () => {
    const res = await fetch(`http://127.0.0.1:${testPort}/health`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.status).toBe('online');
    expect(data.name).toBe('transgentic-mcp-server');
    expect(data.port).toBe(testPort);
  });

  it('should reject unauthenticated requests on /mcp, /sse, and direct provider endpoints', async () => {
    const sseRes = await fetch(`http://127.0.0.1:${testPort}/sse`);
    expect(sseRes.status).toBe(401);

    const mcpRes = await fetch(`http://127.0.0.1:${testPort}/mcp`);
    expect(mcpRes.status).toBe(401);

    const provRes = await fetch(`http://127.0.0.1:${testPort}/claude/sse`);
    expect(provRes.status).toBe(401);
  });

  it('should provide standard MCP tools in tools/list on authenticated unified /sse', async () => {
    const sseRes = await fetch(`http://127.0.0.1:${testPort}/sse?token=${token}`);
    expect(sseRes.status).toBe(200);
    expect(sseRes.headers.get('content-type')).toContain('text/event-stream');

    const reader = sseRes.body?.getReader();
    const { value } = await reader!.read();
    const sseChunk = new TextDecoder().decode(value);
    
    expect(sseChunk).toContain('event: endpoint');
    const sessionIdMatch = sseChunk.match(/sessionId=([a-f0-9-]+)/);
    expect(sessionIdMatch).toBeTruthy();
    const sessionId = sessionIdMatch![1];

    const msgRes = await fetch(`http://127.0.0.1:${testPort}/messages?sessionId=${sessionId}&token=${token}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/list',
        params: {},
      }),
    });

    expect(msgRes.status).toBe(202);

    const { value: toolValue } = await reader!.read();
    const toolChunk = new TextDecoder().decode(toolValue);
    const jsonStr = toolChunk.replace(/^event: message\ndata: /, '').trim();
    const parsed = JSON.parse(jsonStr);

    expect(parsed.result).toBeDefined();
    expect(parsed.result.tools).toBeDefined();
    const toolNames = parsed.result.tools.map((t: any) => t.name);
    expect(toolNames).toContain('prompt_model');
    expect(toolNames).toContain('generate_image');
    expect(toolNames).toContain('generate_video');
    expect(toolNames).toContain('generate_audio');
    expect(toolNames).toContain('generate_music');
    expect(toolNames).toContain('get_status');

    reader?.cancel();
  });

  it('should support MCP Prompts (prompts/list and prompts/get)', async () => {
    const sseRes = await fetch(`http://127.0.0.1:${testPort}/sse?token=${token}`);
    const reader = sseRes.body?.getReader();
    const { value } = await reader!.read();
    const sseChunk = new TextDecoder().decode(value);
    const sessionId = sseChunk.match(/sessionId=([a-f0-9-]+)/)![1];

    // List Prompts
    await fetch(`http://127.0.0.1:${testPort}/messages?sessionId=${sessionId}&token=${token}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 2,
        method: 'prompts/list',
        params: {},
      }),
    });

    const { value: promptVal } = await reader!.read();
    const promptJson = new TextDecoder().decode(promptVal).replace(/^event: message\ndata: /, '').trim();
    const parsed = JSON.parse(promptJson);

    expect(parsed.result?.prompts).toBeDefined();
    const promptNames = parsed.result.prompts.map((p: any) => p.name);
    expect(promptNames).toContain('code_review');
    expect(promptNames).toContain('refactor_clean_code');

    reader?.cancel();
  });

  it('should support MCP Resources (resources/list and resources/read)', async () => {
    const sseRes = await fetch(`http://127.0.0.1:${testPort}/sse?token=${token}`);
    const reader = sseRes.body?.getReader();
    const { value } = await reader!.read();
    const sseChunk = new TextDecoder().decode(value);
    const sessionId = sseChunk.match(/sessionId=([a-f0-9-]+)/)![1];

    // List Resources
    await fetch(`http://127.0.0.1:${testPort}/messages?sessionId=${sessionId}&token=${token}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 3,
        method: 'resources/list',
        params: {},
      }),
    });

    const { value: resVal } = await reader!.read();
    const resJson = new TextDecoder().decode(resVal).replace(/^event: message\ndata: /, '').trim();
    const parsed = JSON.parse(resJson);

    expect(parsed.result?.resources).toBeDefined();
    const uris = parsed.result.resources.map((r: any) => r.uri);
    expect(uris).toContain('transgentic://logs');
    expect(uris).toContain('transgentic://vault');
    expect(uris).toContain('transgentic://status');

    reader?.cancel();
  });

  it('should support direct provider SSE endpoints with token', async () => {
    const directProviders = ['chatgpt', 'claude', 'gemini', 'grok'];
    for (const provider of directProviders) {
      const res = await fetch(`http://127.0.0.1:${testPort}/${provider}/sse?token=${token}`);
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain('text/event-stream');

      const reader = res.body?.getReader();
      const { value } = await reader!.read();
      const chunk = new TextDecoder().decode(value);

      expect(chunk).toContain(`/${provider}/messages?sessionId=`);
      reader?.cancel();
    }
  });

  it('should support /mcp endpoint and handle notifications/initialized silently', async () => {
    const mcpRes = await fetch(`http://127.0.0.1:${testPort}/mcp?token=${token}`);
    expect(mcpRes.status).toBe(200);
    expect(mcpRes.headers.get('content-type')).toContain('text/event-stream');

    const reader = mcpRes.body?.getReader();
    const { value } = await reader!.read();
    const chunk = new TextDecoder().decode(value);
    expect(chunk).toContain('/mcp?sessionId=');
    const sessionId = chunk.match(/sessionId=([a-f0-9-]+)/)![1];

    // Send notifications/initialized (standard notification from Codex)
    const notifRes = await fetch(`http://127.0.0.1:${testPort}/mcp?sessionId=${sessionId}&token=${token}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'notifications/initialized',
      }),
    });
    expect(notifRes.status).toBe(202);

    // Direct HTTP POST for tools/list (Streamable HTTP)
    const directHttpRes = await fetch(`http://127.0.0.1:${testPort}/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 99,
        method: 'tools/list',
      }),
    });
    expect(directHttpRes.status).toBe(200);
    const directData = await directHttpRes.json();
    expect(directData.result.tools).toBeDefined();

    reader?.cancel();
  });

  it('should complete the direct Streamable HTTP initialization handshake', async () => {
    const headers = {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      Authorization: `Bearer ${token}`,
    };

    const initializeRes = await fetch(`http://127.0.0.1:${testPort}/mcp`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 100,
        method: 'initialize',
        params: {
          protocolVersion: '2025-03-26',
          capabilities: {},
          clientInfo: { name: 'codex-test-client', version: '1.0.0' },
        },
      }),
    });

    expect(initializeRes.status).toBe(200);
    const sessionId = initializeRes.headers.get('mcp-session-id');
    expect(sessionId).toBeTruthy();

    const initializedRes = await fetch(`http://127.0.0.1:${testPort}/mcp`, {
      method: 'POST',
      headers: { ...headers, 'mcp-session-id': sessionId! },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'notifications/initialized',
      }),
    });

    expect(initializedRes.status).toBe(202);
    expect(await initializedRes.text()).toBe('');

    const toolsRes = await fetch(`http://127.0.0.1:${testPort}/mcp`, {
      method: 'POST',
      headers: { ...headers, 'mcp-session-id': sessionId! },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 101,
        method: 'tools/list',
      }),
    });

    expect(toolsRes.status).toBe(200);
    const toolsData = await toolsRes.json();
    expect(toolsData.result.tools).toBeDefined();
  });
});
