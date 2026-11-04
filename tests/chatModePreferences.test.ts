import { describe, expect, it, vi, afterEach } from 'vitest';
import { normalizeChatModePreferences, resolveChatMode, validateChatMode } from '../src/shared/types.js';
import { boundedTemporaryChatProbe } from '../src/main/webviews/temporaryChatProbe.js';

afterEach(() => vi.useRealTimers());
describe('chat mode preferences and request contracts', () => {
  it('migrates enabled ChatGPT to personalized and disabled modes to normal', () => {
    const migrated = normalizeChatModePreferences(undefined, { general: true, coding: false });
    expect(migrated.general?.chatgpt).toBe('temporary-personalized');
    expect(migrated.coding?.chatgpt).toBe('normal');
    expect(normalizeChatModePreferences(migrated)).toEqual(migrated);
  });
  it('keeps each provider and task mode independent', () => {
    const config = { chatModes: { general: { chatgpt: 'temporary-unpersonalized' as const, gemini: 'normal' as const } } };
    expect(resolveChatMode(config, 'general', 'chatgpt')).toBe('temporary-unpersonalized');
    expect(resolveChatMode(config, 'general', 'gemini')).toBe('normal');
    expect(resolveChatMode(config, 'coding', 'chatgpt')).toBe('temporary-personalized');
    expect(resolveChatMode(config, 'writing', 'chatgpt')).toBe('temporary-unpersonalized');
  });
  it('preserves legacy overrides and rejects contradictory fields', () => {
    expect(resolveChatMode(undefined, 'general', 'chatgpt', undefined, true)).toBe('temporary-personalized');
    expect(resolveChatMode(undefined, 'general', 'gemini', undefined, true)).toBe('temporary');
    expect(resolveChatMode(undefined, 'general', 'chatgpt', undefined, false)).toBe('normal');
    expect(() => validateChatMode('temporary-unpersonalized', false)).toThrow('conflicts');
    expect(() => validateChatMode('normal', true)).toThrow('conflicts');
    expect(() => validateChatMode('anything')).toThrow('Invalid');
  });
  it('bounds an unresolved probe and discards its late result', async () => {
    vi.useFakeTimers();
    let finish!: (value: string) => void;
    const probe = boundedTemporaryChatProbe(() => new Promise<string>(resolve => { finish = resolve; }));
    await vi.advanceTimersByTimeAsync(8_000);
    expect(await probe).toBeUndefined();
    finish('available');
    expect(await probe).toBeUndefined();
    expect(vi.getTimerCount()).toBe(0);
  });
  it('clears the deadline after success and catches provider inspection failure', async () => {
    vi.useFakeTimers();
    expect(await boundedTemporaryChatProbe(async () => 'available')).toBe('available');
    expect(await boundedTemporaryChatProbe(async () => { throw new Error('view ended'); })).toBeUndefined();
    expect(vi.getTimerCount()).toBe(0);
  });
});
