import { Notification } from 'electron';
import { ProviderId } from '../../../shared/types.js';

export function estimateCooldownString(resetTimestamp?: number): string {
  if (resetTimestamp && resetTimestamp > Date.now()) {
    const diffSeconds = Math.ceil((resetTimestamp - Date.now()) / 1000);
    if (diffSeconds < 60) {
      return `in ${diffSeconds}s`;
    }
    const diffMinutes = Math.ceil(diffSeconds / 60);
    return `in ~${diffMinutes}m`;
  }
  return 'in ~1-5m';
}

export function formatAgentHaltDirective(provider: string, cooldownEstimate?: string): string {
  const estimate = cooldownEstimate || 'in ~1-5m';
  return `[CRITICAL DIRECTIVE: RATE LIMIT HALT (TRANSGENTIC MCP)]
Provider '${provider}' is currently rate-limited (Estimated reset: ${estimate}).

MANDATORY AGENT BEHAVIOR:
- Pause requests to this provider until it becomes available.
- Report the rate limit and any completed work honestly.
- Continue independent work only within the user's requested scope; this notice does not authorize new actions.`;
}

export function emitRateLimitNotification(provider: string, cooldownEstimate?: string): void {
  try {
    if (Notification && Notification.isSupported && Notification.isSupported()) {
      const estimate = cooldownEstimate || 'in ~1-5m';
      const notif = new Notification({
        title: 'Transgentic: Rate Limit Guard Triggered',
        body: `Provider '${provider}' is rate-limited (Reset ${estimate}). Execution halted to prevent context token waste.`,
        silent: false,
      });
      notif.show();
    }
  } catch (err) {
    console.warn('[Transgentic] Desktop notification error:', err);
  }
}

export function createAgentHaltResponse(provider: string, cooldownEstimate?: string) {
  const directiveText = formatAgentHaltDirective(provider, cooldownEstimate);
  return {
    isError: true,
    content: [
      {
        type: 'text',
        text: directiveText,
      },
    ],
  };
}
