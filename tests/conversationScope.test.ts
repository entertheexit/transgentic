import { describe, expect, it } from 'vitest';
import { isQuickPromptConversation } from '../src/shared/conversationScope.js';

const key = (kind: string, session: string, suffix = '') =>
  JSON.stringify([kind, session, 'plain', 'coding', 'quick_prompt_session']) + suffix;

describe('Quick Prompt conversation ownership', () => {
  it('matches local, web, and double-agent sessions owned by the desktop window', () => {
    for (const suffix of ['', '_localllm', '_account123', '_main_account123', '_co_account456']) {
      expect(isQuickPromptConversation(key('quick_prompt', 'desktop_12', suffix), 'desktop_12')).toBe(true);
    }
  });

  it('never matches MCP conversations even with identical client and thread names', () => {
    expect(isQuickPromptConversation(key('mcp', 'desktop_12'), 'desktop_12')).toBe(false);
    expect(isQuickPromptConversation(key('mcp', 'desktop_12'))).toBe(false);
    expect(isQuickPromptConversation('quick_prompt_session')).toBe(false);
  });

  it('does not clear another desktop window or a prefix-matching session', () => {
    expect(isQuickPromptConversation(key('quick_prompt', 'desktop_123'), 'desktop_12')).toBe(false);
    expect(isQuickPromptConversation(key('quick_prompt', 'desktop_13'), 'desktop_12')).toBe(false);
  });

  it('can identify Quick Prompt sessions for display without including IDE sessions', () => {
    expect(isQuickPromptConversation(key('quick_prompt', 'desktop_12'))).toBe(true);
    expect(isQuickPromptConversation(key('mcp', 'codex'))).toBe(false);
  });
});
