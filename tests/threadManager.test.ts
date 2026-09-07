import { describe, it, expect, beforeEach } from 'vitest';
import { ThreadManager } from '../src/main/registry/threadManager.js';

describe('ThreadManager & Session Persistence', () => {
  let threadManager: ThreadManager;

  beforeEach(() => {
    threadManager = new ThreadManager();
  });

  it('stores and retrieves active thread sessions correctly', () => {
    const session = threadManager.setSession(
      'thread_123',
      'chatgpt',
      'https://chatgpt.com/c/6789-abcd-1234',
      'my_project'
    );

    expect(session.threadId).toBe('thread_123');
    expect(session.provider).toBe('chatgpt');
    expect(session.webChatUrl).toBe('https://chatgpt.com/c/6789-abcd-1234');
    expect(session.projectName).toBe('my_project');

    const retrieved = threadManager.getSession('thread_123', 'chatgpt');
    expect(retrieved).not.toBeNull();
    expect(retrieved?.webChatUrl).toBe('https://chatgpt.com/c/6789-abcd-1234');
  });

  it('isolates thread sessions across different providers for the same thread ID', () => {
    threadManager.setSession('shared_thread', 'chatgpt', 'https://chatgpt.com/c/aaa');
    threadManager.setSession('shared_thread', 'claude', 'https://claude.ai/chat/bbb');

    const chatgptSession = threadManager.getSession('shared_thread', 'chatgpt');
    const claudeSession = threadManager.getSession('shared_thread', 'claude');
    const geminiSession = threadManager.getSession('shared_thread', 'gemini');

    expect(chatgptSession?.webChatUrl).toBe('https://chatgpt.com/c/aaa');
    expect(claudeSession?.webChatUrl).toBe('https://claude.ai/chat/bbb');
    expect(geminiSession).toBeNull();
  });

  it('removes and clears thread sessions on demand', () => {
    threadManager.setSession('t1', 'grok', 'https://x.com/i/grok/c1');
    expect(threadManager.getSession('t1', 'grok')).not.toBeNull();

    threadManager.removeSession('t1', 'grok');
    expect(threadManager.getSession('t1', 'grok')).toBeNull();

    threadManager.setSession('t2', 'gemini', 'https://gemini.google.com/app/c2');
    threadManager.setSession('t3', 'claude', 'https://claude.ai/chat/c3');
    expect(threadManager.getAllSessions()).toHaveLength(2);

    threadManager.clearAll();
    expect(threadManager.getAllSessions()).toHaveLength(0);
  });

  it('notifies listeners when sessions are added, removed, or cleared', () => {
    let notifiedSessions: any[] = [];
    const unsubscribe = threadManager.onSessionsUpdate((sessions) => {
      notifiedSessions = sessions;
    });

    threadManager.setSession('t1', 'grok', 'https://grok.com/c/123');
    expect(notifiedSessions).toHaveLength(1);
    expect(notifiedSessions[0].threadId).toBe('t1');

    threadManager.clearAll();
    expect(notifiedSessions).toHaveLength(0);

    unsubscribe();
    threadManager.setSession('t2', 'claude', 'https://claude.ai/chat/456');
    // should not update after unsubscribe
    expect(notifiedSessions).toHaveLength(0);
  });
});
