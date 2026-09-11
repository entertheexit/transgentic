import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ServiceManifestManager } from '../src/main/registry/serviceManifest.js';
import { globalMcpServer } from '../src/main/mcp/server.js';
import { globalLogStorage, migratePersistedLog } from '../src/main/storage/logStorage.js';
import { LocalLlmClient } from '../src/main/localllm/localLlmClient.js';
import { RouteMode, ModeRouteConfig, McpRequestLog } from '../src/shared/types.js';

describe('Service Manifest & Local LLM Conflict Validation', () => {
  it('should recognize localllm as an enabled first-class service', () => {
    expect(ServiceManifestManager.isServiceEnabled('localllm')).toBe(true);
    expect(ServiceManifestManager.getServiceName('localllm')).toBe('Local LLM');
  });

  it('should not produce route conflicts when localllm is configured in General or Coding', () => {
    const mockRoutes: Record<RouteMode, ModeRouteConfig> = {
      general: { primary: 'localllm', fallbacks: ['chatgpt'] },
      coding: { primary: 'localllm', fallbacks: ['claude'] },
      image: { primary: 'chatgpt', fallbacks: [] },
      video: { primary: 'chatgpt', fallbacks: [] },
      music: { primary: 'gemini', fallbacks: [] },
    };

    const conflicts = ServiceManifestManager.checkRouteConflicts(mockRoutes);
    const localllmConflicts = conflicts.filter((c) => c.provider === 'localllm');
    expect(localllmConflicts).toHaveLength(0);
  });
});

describe('Log Termination Engine Unit Tests', () => {
  beforeEach(() => {
    globalLogStorage.clear();
  });

  it('normalizes legacy Audio log records to Music once', () => {
    const legacy = migratePersistedLog({
      id: 'legacy-audio-log', timestamp: 1, mode: 'audio', targetProvider: 'gemini', status: 'success', maskedSecretsCount: 0, promptSnippet: 'music',
    });
    expect(legacy).toMatchObject({ modeSchemaVersion: 2, mode: 'music' });
    expect(migratePersistedLog(legacy)).toEqual(legacy);
  });

  it('should terminate a single pending request and set status to failed', () => {
    const testId = `req_test_term_${Date.now()}`;
    const pendingLog: McpRequestLog = {
      id: testId,
      timestamp: Date.now() - 5000,
      mode: 'general',
      targetProvider: 'localllm',
      status: 'pending',
      promptText: 'Hello local model',
      promptSnippet: 'Hello local model',
    };

    (globalMcpServer as any).addLog(pendingLog);

    const terminated = globalMcpServer.terminateRequest(testId, 'Aborted by user: Model took too long');
    expect(terminated).toBe(true);

    const retrieved = globalLogStorage.getById(testId);
    expect(retrieved).toBeDefined();
    expect(retrieved?.status).toBe('failed');
    expect(retrieved?.error).toBe('Aborted by user: Model took too long');
    expect(retrieved?.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('should terminate all pending requests when terminateAllPendingRequests is called', () => {
    const id1 = `req_multi_1_${Date.now()}`;
    const id2 = `req_multi_2_${Date.now()}`;
    const id3 = `req_multi_3_${Date.now()}`;

    const log1: McpRequestLog = {
      id: id1,
      timestamp: Date.now() - 3000,
      mode: 'coding',
      targetProvider: 'localllm',
      status: 'pending',
      promptText: 'Generate code',
    };

    const log2: McpRequestLog = {
      id: id2,
      timestamp: Date.now() - 2000,
      mode: 'writing',
      targetProvider: 'claude',
      status: 'pending',
      promptText: 'Write docs',
    };

    const log3: McpRequestLog = {
      id: id3,
      timestamp: Date.now() - 10000,
      mode: 'general',
      targetProvider: 'chatgpt',
      status: 'success',
      promptText: 'Already finished',
    };

    (globalMcpServer as any).addLog(log1);
    (globalMcpServer as any).addLog(log2);
    (globalMcpServer as any).addLog(log3);

    const count = globalMcpServer.terminateAllPendingRequests('Terminated all pending');
    expect(count).toBeGreaterThanOrEqual(2);

    const check1 = globalLogStorage.getById(id1);
    const check2 = globalLogStorage.getById(id2);
    const check3 = globalLogStorage.getById(id3);

    expect(check1?.status).toBe('failed');
    expect(check1?.error).toBe('Terminated all pending');

    expect(check2?.status).toBe('failed');
    expect(check2?.error).toBe('Terminated all pending');

    expect(check3?.status).toBe('success');
  });

  it('should immediately abort LocalLlmClient.generateCompletion if signal is already aborted', async () => {
    const abortController = new AbortController();
    abortController.abort();

    await expect(
      LocalLlmClient.generateCompletion(
        'Ping',
        {
          enabled: true,
          preset: 'lmstudio',
          baseUrl: 'http://127.0.0.1:1234',
          selectedModel: 'local-model',
        },
        { abortSignal: abortController.signal }
      )
    ).rejects.toThrow('Terminated by user');
  });
});
