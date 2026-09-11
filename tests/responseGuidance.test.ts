import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import { TransgenticMcpServer } from '../src/main/mcp/server.js';
import { DynamicRouter } from '../src/main/mcp/router.js';
import { LocalLlmClient } from '../src/main/localllm/localLlmClient.js';
import { globalThreadManager } from '../src/main/registry/threadManager.js';
import { AccountRegistryManager } from '../src/main/registry/accountRegistry.js';
import { ModelRegistryManager } from '../src/main/registry/modelRegistry.js';
import { ServiceManifestManager } from '../src/main/registry/serviceManifest.js';
import { globalSessionManager } from '../src/main/webviews/sessionManager.js';
import { globalRateLimiter } from '../src/main/mcp/rateLimiter.js';
import { DuplicateActionGuard } from '../src/main/security/duplicateActionGuard.js';
import { globalAssetManager } from '../src/main/storage/assetManager.js';
import type { ProviderId, TaskMode, TransgenticConfig } from '../src/shared/types.js';
import type { CallerContext } from '../src/main/mcp/clientContext.js';

// Keep orchestration and response assembly real; isolate persistent stores and providers.
vi.mock('../src/main/storage/logStorage.js', () => ({
  globalLogStorage: { insert: vi.fn(), update: vi.fn() },
}));

const answer = '```js\nconst add = (a, b) => a + b;\n```';
const adapter = {
  url: 'https://example.test',
  checkRateLimit: vi.fn(async () => ({ isRateLimited: false })),
  navigateToNewChat: vi.fn(async () => {}),
  navigateToConversation: vi.fn(async () => {}),
  acquireDomLock: vi.fn(async () => () => {}),
  executePrompt: vi.fn(async (..._args: any[]) => ({ text: answer } as any)),
  getConversationUrl: vi.fn(async () => 'https://example.test/chat/1'),
};

let server: TransgenticMcpServer;
let config: TransgenticConfig;
let completion: ReturnType<typeof vi.spyOn>;

function configure(balancedMode = true, localMicroTask = false, doubleAgent = false) {
  config = {
    balancedMode,
    doubleAgent: { enabled: doubleAgent, includeLocalLlm: true },
    localLLM: {
      enabled: true, preset: 'custom', baseUrl: 'http://127.0.0.1:1234',
      selectedModel: 'test-coder', localMicroTask, attachmentKinds: ['image', 'document'],
    },
  } as TransgenticConfig;
  server.updateConfig(config);
}

function run(prompt = 'Return add(a, b).', mode: TaskMode = 'coding', provider?: ProviderId, newThread = true, quick = false, caller?: CallerContext, signal?: AbortSignal, files?: unknown) {
  return server.orchestratePrompt(prompt, mode, provider, undefined, undefined, signal,
    'response-guidance-test', newThread, quick, true, caller, files);
}

function expectAnswerAndGuidance(result: any, marker: string, expectedAnswer = answer) {
  expect(result.isError).not.toBe(true);
  expect(result.content[0]).toEqual({ type: 'text', text: expectedAnswer });
  expect(result.content).toHaveLength(2);
  expect(result.content[1].text).toContain(marker);
  expect(result.content[1].text.match(/\[TRANSGENTIC /g)).toHaveLength(1);
}

beforeEach(() => {
  vi.restoreAllMocks();
  globalThreadManager.clearAll();
  DuplicateActionGuard.clear();
  vi.spyOn(DynamicRouter, 'getCandidateChain').mockReturnValue(['localllm']);
  vi.spyOn(DynamicRouter, 'resolveTargetModel').mockReturnValue(undefined);
  vi.spyOn(AccountRegistryManager, 'getActiveAccount').mockImplementation((provider) =>
    provider === 'localllm' || !provider ? undefined as any : {
      id: `${provider}_test`, alias: `${provider} Test`, partitionKey: 'test', status: 'ready',
    } as any);
  for (const method of ['markReady', 'markStatus', 'markRateLimited'] as const) {
    vi.spyOn(AccountRegistryManager, method).mockImplementation(() => undefined as any);
  }
  vi.spyOn(ModelRegistryManager, 'getProviderConfig').mockReturnValue({ serviceEnabled: true } as any);
  vi.spyOn(ModelRegistryManager, 'getEffectiveModel').mockReturnValue(undefined as any);
  vi.spyOn(ServiceManifestManager, 'isServiceEnabled').mockReturnValue(true);
  vi.spyOn(ServiceManifestManager, 'getManifest').mockReturnValue({ services: {} } as any);
  vi.spyOn(globalSessionManager, 'getStatus').mockReturnValue({ isAuthenticated: true } as any);
  vi.spyOn(globalSessionManager, 'getAdapter').mockReturnValue(adapter as any);
  vi.spyOn(globalSessionManager, 'ensureWebContents').mockResolvedValue({ getURL: () => adapter.url } as any);
  vi.spyOn(globalSessionManager, 'updateProviderState').mockImplementation(() => {});
  vi.spyOn(globalRateLimiter, 'applyJitter').mockResolvedValue(undefined);
  vi.spyOn(globalRateLimiter, 'recordRequest').mockImplementation(() => {});
  vi.spyOn(globalRateLimiter, 'markSuccess').mockImplementation(() => {});
  completion = vi.spyOn(LocalLlmClient, 'generateCompletion').mockResolvedValue({ text: answer });
  adapter.executePrompt.mockReset().mockResolvedValue({ text: answer });
  server = new TransgenticMcpServer();
  configure();
});

it('rejects reserved Audio intent before selecting or invoking a provider', async () => {
  const result = await server.orchestratePrompt(
    'Generate a voiceover narration for this trailer',
    'general',
    undefined,
    undefined,
    undefined,
    undefined,
    'reserved-audio-test',
    true,
    false,
    false,
    { profile: 'plain', sessionId: 'reserved-audio-client' },
  );
  expect(result.isError).toBe(true);
  expect(result.content[0].text).toContain('Audio providers are not available yet');
  expect(result.metadata).toMatchObject({ mode: 'audio', intent: 'audio', directive: 'audio_provider_unavailable' });
  expect(DynamicRouter.getCandidateChain).not.toHaveBeenCalled();
  expect(adapter.executePrompt).not.toHaveBeenCalled();
});

afterEach(() => {
  globalThreadManager.clearAll();
  DuplicateActionGuard.clear();
  vi.restoreAllMocks();
});

describe('Actual provider answers with server-side reminders', () => {
  it.each([
    'Return add(a, b).',
    'ช่วยเขียนฟังก์ชันบวกเลขสองตัว',
    'Plan a full refactoring of the entire authentication and database system',
    'Coding micro-task: In JavaScript, write a small function named groupBy that takes an array of objects and a property key.',
    'Coding micro-task only: Generate a concise JSDoc comment for this JavaScript function: function add(a,b) { return a+b; }',
  ])('calls the local model even when classification misses: %s', async (prompt) => {
    const result = await run(prompt);
    expect(completion).toHaveBeenCalledOnce();
    expectAnswerAndGuidance(result, '[TRANSGENTIC BALANCED HARNESS: LOCAL LLM DIRECTIVE]');
    expect(completion.mock.calls[0][0].at(-1).content).toContain(prompt);
  });

  it.each([[true, true], [true, false], [false, true], [false, false]])(
    'returns answers on new and continuing local chats (balanced=%s micro=%s)', async (balanced, micro) => {
      configure(balanced, micro);
      expectAnswerAndGuidance(await run(), balanced ? 'BALANCED HARNESS: LOCAL LLM' : 'WEIGHT ON TRANSGENTIC');
      expectAnswerAndGuidance(await run('Now handle NaN.', 'coding', undefined, false),
        balanced ? 'DECISION GUIDANCE - LOCAL LLM' : 'WEIGHT ON TRANSGENTIC');
      expect(completion).toHaveBeenCalledTimes(2);
      expect(completion.mock.calls[1][0]).toEqual(expect.arrayContaining([{ role: 'assistant', content: answer }]));
    });

  it.each(['general', 'coding'] as TaskMode[])('retains local answers in %s mode', async (mode) => {
    expectAnswerAndGuidance(await run('Help with this task.', mode), 'BALANCED HARNESS: LOCAL LLM');
  });

  it('keeps the first-turn reminder when micro-task routing promotes local dispatch', async () => {
    configure(true, true);
    expectAnswerAndGuidance(await run('Generate JSDoc for function add(a,b) { return a+b; }'),
      'BALANCED HARNESS: LOCAL LLM');
  });

  it.each(['chatgpt', 'claude', 'gemini', 'grok'] as ProviderId[])('keeps %s answers on first and later turns', async (provider) => {
    expectAnswerAndGuidance(await run('Write a helper function.', 'coding', provider), 'BALANCED HARNESS: WEB AI');
    expectAnswerAndGuidance(await run('Now handle NaN.', 'coding', provider, false), 'DECISION GUIDANCE');
    expect(adapter.executePrompt).toHaveBeenCalledTimes(2);
  });

  it.each(['general', 'coding', 'image', 'video', 'music'] as TaskMode[])(
    'keeps Web AI answers and reminders across scenarios in %s mode', async (mode) => {
      for (const [balanced, double] of [[true, false], [false, false], [true, true], [false, true]]) {
        configure(balanced, false, double);
        vi.mocked(DynamicRouter.getCandidateChain).mockImplementation((_m, _p, _f, pipeline) =>
          [pipeline === 'co' ? 'gemini' : 'claude']);
        const result = await run('Fulfill this task.', mode);
        expect(result.content[0].text).toContain(answer);
        expect(result.content[1].text).toContain(double ? 'DIRECTIVE' : balanced ? 'BALANCED HARNESS: WEB AI' : 'WEIGHT ON TRANSGENTIC');
        if (double && !balanced) expect(result.content[0].text.match(/const add/g)).toHaveLength(2);
      }
    });

  it('retains a local fallback answer for a non-micro-task', async () => {
    vi.mocked(DynamicRouter.getCandidateChain).mockReturnValue(['claude', 'localllm']);
    vi.mocked(ServiceManifestManager.isServiceEnabled).mockReturnValue(false);
    expectAnswerAndGuidance(await run(), 'BALANCED HARNESS: LOCAL LLM');
    expect(completion).toHaveBeenCalledOnce();
  });

  it('retains local answers in both Double Agent modes', async () => {
    for (const balanced of [true, false]) {
      configure(balanced, true, true);
      vi.mocked(DynamicRouter.getCandidateChain).mockImplementation((_m, _p, _f, pipeline) =>
        [pipeline === 'co' ? 'claude' : 'localllm']);
      const result = await run();
      expect(result.content[0].text).toContain(answer);
      expect(result.content[1].text).toContain(balanced ? 'BALANCED Double-Agent' : 'DOUBLE-AGENT DIRECTIVE');
      if (!balanced) expect(result.content[0].text.match(/const add/g)).toHaveLength(2);
    }
  });

  it('returns an explicit MCP handoff when no service is selected', async () => {
    vi.mocked(DynamicRouter.getCandidateChain).mockReturnValue([]);
    const result = await run();
    expect(result.content).toHaveLength(1);
    expect(result.content[0].text).toContain('No external AI service is available');
    expect(result.structuredContent.status).toBe('handoff');
    expect(result.metadata.directive).toBe('no_routed_service');
    expect(result.metadata.providerUsed).toBeUndefined();
    expect(completion).not.toHaveBeenCalled();
  });

  it('does not report an empty local completion as success with a reminder', async () => {
    completion.mockResolvedValue({ text: '   ' });
    const result = await run();
    expect(result.isError).toBe(true);
    expect(result.structuredContent.status).toBe('failed');
    expect(result.content[0].text).toMatch(/empty response/i);
  });

  it('passes through provider failures instead of substituting guidance', async () => {
    completion.mockRejectedValue(new Error('Local endpoint unavailable'));
    const result = await run();
    expect(result.isError).toBe(true);
    expect(result.structuredContent.failedProvider).toBe('localllm');
    expect(result.content[0].text).toContain('Local endpoint unavailable');
  });

  it('keeps the answer and continuity notice after a local rollover', async () => {
    await run('Return add(a,b).');
    vi.spyOn(globalThreadManager, 'shouldRollover').mockReturnValue(true);
    const result = await run('Now handle NaN.', 'coding', undefined, false);
    expect(result.content[0].text).toContain(answer);
    expect(result.content[0].text).toContain('[TRANSGENTIC AUTO-NEW-CHAT NOTICE]');
    expect(result.content[1].text).toContain('BALANCED HARNESS: LOCAL LLM');
  });

  it('keeps media paths and rollover notices in both dual-dispatch answers', async () => {
    configure(false, false, true);
    vi.mocked(DynamicRouter.getCandidateChain).mockImplementation((_m, _p, _f, pipeline) =>
      [pipeline === 'co' ? 'gemini' : 'claude']);
    adapter.executePrompt.mockResolvedValue({ text: '', media: { data: 'mock', type: 'image' } });
    vi.spyOn(globalAssetManager, 'saveMediaAsset').mockResolvedValue({ filePath: '/tmp/test-asset.png' } as any);
    await run('Draw a flower.', 'image');
    vi.spyOn(globalThreadManager, 'shouldRollover').mockReturnValue(true);
    const result = await run('Draw another flower.', 'image', undefined, false);
    const sections = result.content[0].text.split('### [Co-Reviewer');
    expect(sections).toHaveLength(2);
    for (const section of sections) {
      expect(section).toContain('Local media asset saved to: /tmp/test-asset.png');
      expect(section).toContain('[TRANSGENTIC AUTO-NEW-CHAT NOTICE]');
    }
    expect(result.content[1].text).toContain('DOUBLE-AGENT DIRECTIVE');
  });

  it('keeps a surviving dual answer when the other provider fails', async () => {
    configure(false, true, true);
    vi.mocked(DynamicRouter.getCandidateChain).mockImplementation((_m, _p, _f, pipeline) =>
      [pipeline === 'co' ? 'claude' : 'localllm']);
    completion.mockRejectedValue(new Error('Local endpoint unavailable'));
    const result = await run();
    expect(result.content[0].text).toContain(answer);
    expect(result.content[0].text).toContain('Local endpoint unavailable');
    expect(result.content[1].text).toContain('DOUBLE-AGENT DIRECTIVE');
  });

  it('uses single-provider guidance when an explicit provider bypasses dual dispatch', async () => {
    configure(false, false, true);
    expectAnswerAndGuidance(await run('Write add(a,b).', 'coding', 'claude'), 'GUIDANCE - CLAUDE - WEIGHT ON TRANSGENTIC');
    expect(adapter.executePrompt).toHaveBeenCalledOnce();
  });

  it('falls back on an empty Web AI response instead of returning only guidance', async () => {
    vi.mocked(DynamicRouter.getCandidateChain).mockReturnValue(['claude', 'localllm']);
    adapter.executePrompt.mockResolvedValue({ text: '  ' });
    expectAnswerAndGuidance(await run(), 'BALANCED HARNESS: LOCAL LLM');
    expect(completion).toHaveBeenCalledOnce();
  });

  it('finalizes coalesced Web AI responses before adding guidance', async () => {
    let release!: (value: any) => void;
    let entered!: () => void;
    const started = new Promise<void>((resolve) => { entered = resolve; });
    adapter.executePrompt.mockImplementationOnce(() => {
      entered();
      return new Promise((resolve) => { release = resolve; });
    });
    const first = run('Write add(a,b).', 'coding', 'claude');
    await started;
    const duplicate = run('Write add(a,b).', 'coding', 'claude');
    release({ text: answer });
    for (const result of await Promise.all([first, duplicate])) {
      expectAnswerAndGuidance(result, 'TRANSGENTIC');
    }
    expect(adapter.executePrompt).toHaveBeenCalledOnce();
  });

  it('keeps answers in Quick Prompt without adding agentic reminders', async () => {
    const result = await run('Return add(a,b).', 'coding', undefined, true, true);
    expect(result.content).toEqual([{ type: 'text', text: answer }]);
    expect(completion.mock.calls[0][0]).toEqual([{ role: 'user', content: 'Return add(a,b).' }]);
  });

  it('stages Quick Prompt files through the desktop request and cleans them after the answer', async () => {
    const bytes = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from('quick-prompt')]);
    const result = await run(
      'Describe the attached image.',
      'general',
      undefined,
      true,
      true,
      { profile: 'plain', sessionId: 'desktop-test', isLoopback: true },
      undefined,
      [{ data: bytes.toString('base64'), name: 'reference.png', mimeType: 'image/png' }],
    );
    expect(result.content).toEqual([{ type: 'text', text: answer }]);
    const staged = completion.mock.calls[0][2]?.attachments?.[0];
    expect(staged).toMatchObject({ name: 'reference.png', kind: 'image', size: bytes.length });
    expect(fs.existsSync(staged.path)).toBe(false);
  });
});

describe('Caller profiles and truthful outcomes across providers', () => {
  it.each(['localllm', 'chatgpt', 'claude', 'gemini', 'grok', 'custom-service'] as ProviderId[])(
    'keeps neutral input/output for plain MCP and Quick Prompt on %s', async (provider) => {
      const modes: TaskMode[] = provider === 'localllm' ? ['general', 'coding'] : ['general', 'coding', 'image', 'video', 'music'];
      for (const mode of modes) for (const quick of [true, false]) for (const balanced of [true, false]) {
        configure(balanced, true);
        const result = await run('A neutral user request.', mode, provider, true, quick,
          { profile: 'plain', sessionId: 'plain-client' });
        const sent = provider === 'localllm' ? completion.mock.lastCall![0].at(-1).content : adapter.executePrompt.mock.lastCall![0];
        expect(sent).toBe('A neutral user request.');
        expect(result.content).toEqual([{ type: 'text', text: answer }]);
        expect(result.structuredContent).toMatchObject({
          status: ['image', 'video', 'music'].includes(mode) ? 'partial' : 'completed', responseProfile: 'plain', guidance: '',
        });
      }
    });

  it('keeps both plain Double Agent prompts free of IDE instructions', async () => {
    configure(false, true, true);
    vi.mocked(DynamicRouter.getCandidateChain).mockImplementation((_m, _p, _f, pipeline) => [pipeline === 'co' ? 'claude' : 'localllm']);
    const result = await run('Give two perspectives.', 'coding', undefined, true, false, { profile: 'plain', sessionId: 'plain' });
    expect(completion.mock.lastCall![0].at(-1).content).toBe('Give two perspectives.');
    expect(adapter.executePrompt.mock.lastCall![0]).toBe('Give two perspectives.');
    expect(result.content).toHaveLength(1);
    expect(result.structuredContent.providers).toHaveLength(2);
  });

  it('isolates same-named conversations by connection and profile', async () => {
    for (const caller of [
      { profile: 'agentic', sessionId: 'ide-a' },
      { profile: 'agentic', sessionId: 'ide-b' },
      { profile: 'plain', sessionId: 'ide-a' },
    ] as CallerContext[]) {
      await run('First turn.', 'coding', undefined, false, false, caller);
      expect(completion.mock.lastCall![0]).toHaveLength(1);
    }
    await run('Follow-up.', 'coding', undefined, false, false, { profile: 'agentic', sessionId: 'ide-a' });
    expect(completion.mock.lastCall![0]).toHaveLength(3);
  });

  it('starts a separate Web AI chat for each new caller even without new_thread', async () => {
    adapter.navigateToNewChat.mockClear();
    await run('First question.', 'coding', 'claude', false, false, { profile: 'agentic', sessionId: 'ide-a' });
    await run('First question.', 'coding', 'claude', false, false, { profile: 'plain', sessionId: 'dashboard' });
    expect(adapter.navigateToNewChat).toHaveBeenCalledTimes(2);
  });

  it.each([true, false])('reports neutral no-route and rate-limit outcomes (quick=%s)', async (quick) => {
    const caller: CallerContext = { profile: 'plain', sessionId: 'plain' };
    vi.mocked(DynamicRouter.getCandidateChain).mockReturnValue([]);
    const noRoute = await run('A question.', 'general', undefined, true, quick, caller);
    expect(noRoute.isError).toBe(true);
    expect(noRoute.content[0].text).not.toMatch(/CODEX|AGENTIC|autonomously/);
    vi.mocked(DynamicRouter.getCandidateChain).mockReturnValue(['localllm']);
    completion.mockRejectedValue(new Error('HTTP 429 rate limit'));
    const limited = await run('A question.', 'general', undefined, true, quick, caller);
    expect(limited.content).toHaveLength(1);
    expect(limited.structuredContent).toMatchObject({ status: 'failed', failedProvider: 'localllm', guidance: '' });
    expect(limited.content[0].text).not.toContain('MANDATORY AGENT');
  });

  it('reports actual fallback providers and partial results from Double Agent', async () => {
    configure(false, false, true);
    vi.mocked(DynamicRouter.getCandidateChain).mockImplementation((_m, _p, _f, pipeline) =>
      pipeline === 'co' ? ['localllm'] : ['claude', 'gemini']);
    vi.mocked(ServiceManifestManager.isServiceEnabled).mockImplementation((p) => p !== 'claude');
    completion.mockRejectedValue(new Error('Local offline'));
    const result = await run();
    expect(result.structuredContent.status).toBe('partial');
    expect(result.metadata.providerUsed).toBe('gemini');
    expect(result.structuredContent.providers).toEqual([
      expect.objectContaining({ role: 'main', provider: 'gemini', status: 'completed' }),
      expect.objectContaining({ role: 'co', provider: 'localllm', status: 'failed', error: 'Local offline' }),
    ]);
  });

  it('never starts fallback work after cancellation', async () => {
    const controller = new AbortController();
    vi.mocked(DynamicRouter.getCandidateChain).mockReturnValue(['localllm', 'claude']);
    completion.mockImplementation(async () => { controller.abort(); throw new Error('Aborted'); });
    const result = await run('Cancel this.', 'coding', undefined, true, false,
      { profile: 'agentic', sessionId: 'ide' }, controller.signal);
    expect(result.structuredContent.status).toBe('cancelled');
    expect(adapter.executePrompt).not.toHaveBeenCalled();
    expect(result.content).toEqual([{ type: 'text', text: 'Request cancelled.' }]);
  });

  it.each(['image', 'video', 'music', 'general'] as TaskMode[])('uses %s guidance without ordering implementation', async (mode) => {
    const result = await run('Help with this request.', mode, 'claude');
    expect(result.content[1].text).toContain('requested scope');
    expect(result.content[1].text).not.toContain('Continue with implementing');
  });
});
