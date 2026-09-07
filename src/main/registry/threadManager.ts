import { ProviderId } from '../../shared/types.js';

export interface ThreadMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp?: number;
}

export interface ThreadSession {
  threadId: string;            // Provided by client or generated from project context
  projectName?: string;
  provider: ProviderId;
  webChatUrl: string;          // e.g. "https://chatgpt.com/c/6789-abcd-..." or "local://session/..."
  lastActiveAt: number;
  messageCount: number;        // Number of prompt/response turns
  charCount: number;           // Accumulated character volume
  history: ThreadMessage[];    // Multi-turn message history for Local LLM & summarization
  lastSummary?: string;        // Compact continuity summary on rollover
  presetPromptsSent?: boolean; // Tracks whether Transgentic app preset prompts (e.g. Recall, Balanced directives) have been sent in this chat session
}

export class ThreadManager {
  private sessions: Map<string, ThreadSession> = new Map();
  private readonly TTL_MS = 24 * 60 * 60 * 1000; // 24 hours TTL
  private cleanupInterval: NodeJS.Timeout | null = null;
  private listeners: Array<(sessions: ThreadSession[]) => void> = [];

  constructor() {
    // Periodic garbage collection for expired thread sessions
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpired();
    }, 60 * 60 * 1000);
    // Don't block node process exit
    if (this.cleanupInterval.unref) {
      this.cleanupInterval.unref();
    }
  }

  public onSessionsUpdate(listener: (sessions: ThreadSession[]) => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  private notify(): void {
    const sessions = this.getAllSessions();
    for (const listener of this.listeners) {
      try {
        listener(sessions);
      } catch {}
    }
  }

  private getCompositeKey(threadId: string, provider: ProviderId): string {
    return `${provider}:${threadId}`;
  }

  /**
   * Retrieves an active thread session if it exists and has not expired.
   */
  public getSession(threadId: string, provider: ProviderId): ThreadSession | null {
    this.cleanupExpired();
    const key = this.getCompositeKey(threadId, provider);
    const session = this.sessions.get(key);
    if (!session) return null;

    if (Date.now() - session.lastActiveAt > this.TTL_MS) {
      this.sessions.delete(key);
      this.notify();
      return null;
    }

    session.lastActiveAt = Date.now();
    return session;
  }

  /**
   * Registers or updates a thread session for a provider conversation URL.
   */
  public setSession(
    threadId: string,
    provider: ProviderId,
    webChatUrl: string,
    projectName?: string
  ): ThreadSession {
    const key = this.getCompositeKey(threadId, provider);
    const existing = this.sessions.get(key);
    const session: ThreadSession = {
      threadId,
      projectName: projectName || existing?.projectName,
      provider,
      webChatUrl,
      lastActiveAt: Date.now(),
      messageCount: existing?.messageCount || 0,
      charCount: existing?.charCount || 0,
      history: existing?.history || [],
      lastSummary: existing?.lastSummary,
      presetPromptsSent: existing?.presetPromptsSent || false,
    };
    this.sessions.set(key, session);
    this.notify();
    return session;
  }

  /**
   * Marks that the Transgentic app preset prompts (e.g. Recall, Balanced mode) have been sent for this session.
   */
  public markPresetPromptsSent(threadId: string, provider: ProviderId): void {
    const session = this.getSession(threadId, provider);
    if (session) {
      session.presetPromptsSent = true;
    }
  }

  /**
   * Checks whether the Transgentic app preset prompts have already been sent in this active chat session.
   */
  public hasPresetPromptsBeenSent(threadId: string, provider: ProviderId): boolean {
    const session = this.getSession(threadId, provider);
    return Boolean(session && session.presetPromptsSent && (session.messageCount || 0) > 0);
  }

  /**
   * Records a user/assistant turn in the active thread session.
   */
  public recordTurn(
    threadId: string,
    provider: ProviderId,
    userPrompt: string,
    assistantResponse: string
  ): ThreadSession {
    let session = this.getSession(threadId, provider);
    if (!session) {
      session = this.setSession(
        threadId,
        provider,
        provider === 'localllm' ? `local://session/${threadId}` : `web://${provider}/${threadId}`
      );
    }

    session.messageCount = (session.messageCount || 0) + 1;
    session.charCount = (session.charCount || 0) + userPrompt.length + assistantResponse.length;
    session.lastActiveAt = Date.now();

    if (!session.history) {
      session.history = [];
    }
    session.history.push({ role: 'user', content: userPrompt, timestamp: Date.now() });
    session.history.push({ role: 'assistant', content: assistantResponse, timestamp: Date.now() });

    // Keep sliding window of 20 messages to prevent unbounded growth
    if (session.history.length > 20) {
      session.history = session.history.slice(-20);
    }

    this.notify();
    return session;
  }

  /**
   * Retrieves message history for a given thread session.
   */
  public getHistory(threadId: string, provider: ProviderId): ThreadMessage[] {
    const session = this.getSession(threadId, provider);
    return session?.history ? [...session.history] : [];
  }

  /**
   * Checks whether a thread session should automatically rollover to a new chat.
   */
  public shouldRollover(
    threadId: string,
    provider: ProviderId,
    maxTurns = 10,
    maxChars = 30000
  ): boolean {
    const session = this.getSession(threadId, provider);
    if (!session) return false;
    return (session.messageCount >= maxTurns) || (session.charCount >= maxChars);
  }

  /**
   * Removes a specific thread session mapping.
   */
  public removeSession(threadId: string, provider: ProviderId): boolean {
    const key = this.getCompositeKey(threadId, provider);
    const deleted = this.sessions.delete(key);
    if (deleted) {
      this.notify();
    }
    return deleted;
  }

  /**
   * Returns all active thread sessions across all providers.
   */
  public getAllSessions(): ThreadSession[] {
    this.cleanupExpired();
    return Array.from(this.sessions.values());
  }

  /**
   * Clears all tracked thread sessions.
   */
  public clearAll(): void {
    if (this.sessions.size > 0) {
      this.sessions.clear();
      this.notify();
    }
  }

  /**
   * Evicts thread sessions older than the TTL limit (24 hours).
   */
  public cleanupExpired(): void {
    const now = Date.now();
    let changed = false;
    for (const [key, session] of this.sessions.entries()) {
      if (now - session.lastActiveAt > this.TTL_MS) {
        this.sessions.delete(key);
        changed = true;
      }
    }
    if (changed) {
      this.notify();
    }
  }
}

export const globalThreadManager = new ThreadManager();
