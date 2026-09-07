import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { globalThreadManager } from '../src/main/registry/threadManager.js';
import { LocalLlmClient } from '../src/main/localllm/localLlmClient.js';
import { LocalLLMConfig } from '../src/shared/types.js';

describe('ThreadManager Multi-Turn & Auto Rollover Tests', () => {
  beforeEach(() => {
    globalThreadManager.clearAll();
  });

  it('should maintain multi-turn history across consecutive turns', () => {
    const threadId = 'test_quick_prompt_session';
    const provider = 'localllm';

    // Turn 1
    globalThreadManager.recordTurn(threadId, provider, 'What is 2+2?', 'It is 4.');
    let history = globalThreadManager.getHistory(threadId, provider);
    expect(history).toHaveLength(2);
    expect(history[0]).toEqual(expect.objectContaining({ role: 'user', content: 'What is 2+2?' }));
    expect(history[1]).toEqual(expect.objectContaining({ role: 'assistant', content: 'It is 4.' }));

    // Turn 2 (staying on same session)
    globalThreadManager.recordTurn(threadId, provider, 'Multiply that by 10', '4 * 10 is 40.');
    history = globalThreadManager.getHistory(threadId, provider);
    expect(history).toHaveLength(4);
    expect(history[2]).toEqual(expect.objectContaining({ role: 'user', content: 'Multiply that by 10' }));
    expect(history[3]).toEqual(expect.objectContaining({ role: 'assistant', content: '4 * 10 is 40.' }));

    const session = globalThreadManager.getSession(threadId, provider);
    expect(session?.messageCount).toBe(2);
    expect(session?.charCount).toBeGreaterThan(30);
  });

  it('should trigger shouldRollover when turn limit is reached', () => {
    const threadId = 'long_agentic_session';
    const provider = 'chatgpt';

    for (let i = 0; i < 9; i++) {
      globalThreadManager.recordTurn(threadId, provider, `Step ${i}`, `Done step ${i}`);
    }
    expect(globalThreadManager.shouldRollover(threadId, provider, 10, 50000)).toBe(false);

    // 10th turn reaches limit
    globalThreadManager.recordTurn(threadId, provider, 'Step 10', 'Done step 10');
    expect(globalThreadManager.shouldRollover(threadId, provider, 10, 50000)).toBe(true);
  });

  it('should trigger shouldRollover when character limit is reached', () => {
    const threadId = 'heavy_context_session';
    const provider = 'claude';

    const largeText = 'A'.repeat(16000);
    globalThreadManager.recordTurn(threadId, provider, largeText, largeText);
    expect(globalThreadManager.shouldRollover(threadId, provider, 20, 30000)).toBe(true);
  });

  it('should clear session history when removeSession is called (simulating New Chat click)', () => {
    const threadId = 'session_to_clear';
    const provider = 'localllm';

    globalThreadManager.recordTurn(threadId, provider, 'Hello', 'Hi there!');
    expect(globalThreadManager.getHistory(threadId, provider)).toHaveLength(2);

    globalThreadManager.removeSession(threadId, provider);
    expect(globalThreadManager.getSession(threadId, provider)).toBeNull();
    expect(globalThreadManager.getHistory(threadId, provider)).toHaveLength(0);
  });

  it('should track presetPromptsSent lifecycle (attached on new chat, preserved on same chat, reset on new chat)', () => {
    const threadId = 'preset_prompt_test_thread';
    const provider = 'chatgpt';

    // 1. Initial State: No session yet -> preset prompts have NOT been sent
    expect(globalThreadManager.hasPresetPromptsBeenSent(threadId, provider)).toBe(false);

    // 2. Turn 1 begins on new chat: session is created, prompt with preset is sent, turn recorded
    globalThreadManager.setSession(threadId, provider, 'https://chatgpt.com/c/test-uuid');
    globalThreadManager.recordTurn(threadId, provider, 'User query with preset', 'Model response 1');
    globalThreadManager.markPresetPromptsSent(threadId, provider);

    // 3. Turn 1 completed: preset prompts are marked as sent
    expect(globalThreadManager.hasPresetPromptsBeenSent(threadId, provider)).toBe(true);

    // 4. Turn 2 arrives on same chat: hasPresetPromptsBeenSent is true -> Transgentic knows NOT to repeat presets
    expect(globalThreadManager.hasPresetPromptsBeenSent(threadId, provider)).toBe(true);
    globalThreadManager.recordTurn(threadId, provider, 'Follow-up query without preset', 'Model response 2');

    const session = globalThreadManager.getSession(threadId, provider);
    expect(session?.messageCount).toBe(2);
    expect(session?.presetPromptsSent).toBe(true);

    // 5. User clicks "New Chat" or client sends new_thread: true -> removeSession is called
    globalThreadManager.removeSession(threadId, provider);

    // 6. Next prompt starts fresh: hasPresetPromptsBeenSent is false again -> presets attached for fresh chat
    expect(globalThreadManager.hasPresetPromptsBeenSent(threadId, provider)).toBe(false);
  });
});

describe('LocalLlmClient Multi-Turn & Robust Content Extraction Tests', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  const mockConfig: LocalLLMConfig = {
    enabled: true,
    preset: 'lmstudio',
    baseUrl: 'http://127.0.0.1:1234',
    selectedModel: 'test-local-model',
  };

  it('should pass multi-turn messages array in request body', async () => {
    let sentBody: any = null;
    global.fetch = vi.fn().mockImplementation(async (url, opts) => {
      sentBody = JSON.parse(opts.body);
      return {
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'I remember 42.' } }],
        }),
      } as any;
    });

    const messages = [
      { role: 'user', content: 'The secret number is 42.' },
      { role: 'assistant', content: 'Got it!' },
      { role: 'user', content: 'What is the secret number?' },
    ];

    const res = await LocalLlmClient.generateCompletion(messages, mockConfig);
    expect(res.text).toBe('I remember 42.');
    expect(sentBody.messages).toEqual(messages);
  });

  it('should extract reasoning_content if content is empty (e.g. DeepSeek-R1 in LM Studio)', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: '',
              reasoning_content: 'Thought process concludes 42.',
            },
          },
        ],
      }),
    } as any);

    const res = await LocalLlmClient.generateCompletion('Solve problem', mockConfig);
    expect(res.text).toBe('Thought process concludes 42.');
  });

  it('should return fallback message instead of throwing error when content is empty ""', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: '',
            },
          },
        ],
      }),
    } as any);

    const res = await LocalLlmClient.generateCompletion('Silent prompt', mockConfig);
    expect(res.text).toBe('(Empty response returned by local model)');
  });

  it('should NOT throw Terminated by user when request times out or is closed unless aborted', async () => {
    global.fetch = vi.fn().mockRejectedValue(new (class extends Error {
      name = 'AbortError';
      message = 'The operation was aborted';
    })());

    await expect(
      LocalLlmClient.generateCompletion('Long prompt', mockConfig)
    ).rejects.toThrow(/timed out or was closed by host/);
  });

  it('should throw Terminated by user ONLY when abortSignal is explicitly aborted', async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(
      LocalLlmClient.generateCompletion('Aborted prompt', mockConfig, { abortSignal: controller.signal })
    ).rejects.toThrow('Terminated by user');
  });
});
