import { describe, it, expect, beforeEach } from 'vitest';
import { DuplicateActionGuard } from '../src/main/security/duplicateActionGuard.js';
import { GeminiAdapter } from '../src/main/webviews/geminiAdapter.js';

describe('DuplicateActionGuard & DOM Concurrency Lock', () => {
  beforeEach(() => {
    DuplicateActionGuard.clear();
  });

  it('preserves case and whitespace because they can change code or data', () => {
    const key1 = DuplicateActionGuard.generateKey('gemini', 'image', 'imagen-3', 'A cute fluffy cat');
    const key2 = DuplicateActionGuard.generateKey('gemini', 'image', 'imagen-3', '  a cute   fluffy cat  ');
    expect(key1).not.toBe(key2);
    expect(key1).toBe(DuplicateActionGuard.generateKey('gemini', 'image', 'imagen-3', 'A cute fluffy cat'));
    expect(key1).not.toBe(DuplicateActionGuard.generateKey('gemini', 'image', 'imagen-3', 'A cute fluffy cat', 'another-conversation'));
  });

  it('should differentiate different providers, modes, models, or prompts', () => {
    const keyA = DuplicateActionGuard.generateKey('gemini', 'image', 'imagen-3', 'A cute cat');
    const keyB = DuplicateActionGuard.generateKey('chatgpt', 'image', 'dall-e-3', 'A cute cat');
    const keyC = DuplicateActionGuard.generateKey('gemini', 'general', 'gemini-1.5', 'A cute cat');
    const keyD = DuplicateActionGuard.generateKey('gemini', 'image', 'imagen-3', 'A cute dog');

    expect(keyA).not.toBe(keyB);
    expect(keyA).not.toBe(keyC);
    expect(keyA).not.toBe(keyD);
  });

  it('should register, detect, and unregister in-flight requests', async () => {
    let resolveTask!: (val: any) => void;
    const taskPromise = new Promise((res) => {
      resolveTask = res;
    });

    DuplicateActionGuard.register(
      'req_1',
      'gemini',
      'image',
      'imagen-3',
      'Generate a mountain landscape',
      taskPromise
    );

    expect(DuplicateActionGuard.getActiveCount()).toBe(1);

    // Matching in-flight lookup
    const inFlight = DuplicateActionGuard.getInFlight(
      'gemini',
      'image',
      'imagen-3',
      'Generate a mountain landscape'
    );
    expect(inFlight).toBeDefined();
    expect(inFlight?.reqId).toBe('req_1');

    // Unrelated prompt should not match
    const nonMatch = DuplicateActionGuard.getInFlight(
      'gemini',
      'image',
      'imagen-3',
      'Generate an ocean sunset'
    );
    expect(nonMatch).toBeUndefined();

    // Resolving task and unregistering
    resolveTask({ success: true });
    await inFlight?.promise;

    DuplicateActionGuard.unregister(
      'gemini',
      'image',
      'imagen-3',
      'Generate a mountain landscape'
    );
    expect(DuplicateActionGuard.getActiveCount()).toBe(0);
    expect(DuplicateActionGuard.getInFlight('gemini', 'image', 'imagen-3', 'Generate a mountain landscape')).toBeUndefined();
  });

  it('should enforce concurrency = 1 on adapter DOM lock', async () => {
    const adapter = new GeminiAdapter();
    const executionOrder: string[] = [];

    const action1 = async () => {
      const release = await adapter.acquireDomLock();
      executionOrder.push('action1:start');
      await new Promise((r) => setTimeout(r, 40));
      executionOrder.push('action1:end');
      release();
    };

    const action2 = async () => {
      const release = await adapter.acquireDomLock();
      executionOrder.push('action2:start');
      await new Promise((r) => setTimeout(r, 10));
      executionOrder.push('action2:end');
      release();
    };

    await Promise.all([action1(), action2()]);

    expect(executionOrder).toEqual([
      'action1:start',
      'action1:end',
      'action2:start',
      'action2:end',
    ]);
  });
});
