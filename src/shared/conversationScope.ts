/** Quick Prompt controls must never match another caller's conversation. */
export function isQuickPromptConversation(threadId: string, desktopSessionId?: string): boolean {
  const prefix = desktopSessionId
    ? `${JSON.stringify(['quick_prompt', desktopSessionId]).slice(0, -1)},`
    : '["quick_prompt",';
  return typeof threadId === 'string' && threadId.startsWith(prefix);
}
