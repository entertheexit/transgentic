export type ResponseProfile = 'agentic' | 'plain';

export interface CallerContext {
  cliRequest?: import('../../shared/cli.js').CliRequestOptions;
  profile: ResponseProfile;
  sessionId: string;
  reportProgress?: (message: string) => void;
}

export function parseResponseProfile(value: unknown): ResponseProfile | undefined {
  return value === 'agentic' || value === 'plain' ? value : undefined;
}

/** A presentation preference, never an authentication or authorization decision. */
export function inferResponseProfile(clientName: unknown): ResponseProfile {
  return typeof clientName === 'string' && /codex|cursor|antigravity|cline|roo[- ]?code|windsurf|claude[- ]?code/i.test(clientName)
    ? 'agentic' : 'plain';
}

export function throwIfCancelled(signal?: AbortSignal): void {
  if (signal?.aborted) {
    const error = new Error('Request cancelled.');
    error.name = 'AbortError';
    throw error;
  }
}
