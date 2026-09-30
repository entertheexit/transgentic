import type { ChatMode, McpRequestLog } from './types.js';

/** Prefer the provider's execution mode; keep the requested policy for unresolved and legacy logs. */
export function requestLogCategory(log: McpRequestLog): ChatMode {
  return log.chatExecution?.actualMode
    ?? (log.chatExecution?.policy ? (log.chatExecution.policy === 'normal' ? 'normal' : 'temporary')
      : log.temporaryChat ? 'temporary' : 'normal');
}
