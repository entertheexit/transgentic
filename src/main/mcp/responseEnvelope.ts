import type { ProviderId, TaskMode } from '../../shared/types.js';
import type { ResponseProfile } from './clientContext.js';

export type ResponseOutcome = 'completed' | 'partial' | 'failed' | 'cancelled' | 'handoff';
export interface ProviderOutcome {
  role: 'main' | 'co';
  status: 'completed' | 'failed';
  provider?: ProviderId;
  model?: string;
  error?: string;
}

/** Add machine-readable data without replacing existing text/metadata consumers. */
export function withResponseDetails(result: any, details: {
  status: ResponseOutcome;
  mode: TaskMode;
  responseProfile: ResponseProfile;
  providers?: ProviderOutcome[];
  artifacts?: string[];
  failedProvider?: ProviderId;
}) {
  return {
    ...result,
    structuredContent: {
      ...details,
      answer: result.content?.[0]?.text || '',
      guidance: details.responseProfile === 'agentic'
        ? (result.content || []).slice(1).map((item: any) => item.text || '').join('\n') : '',
      providers: details.providers || [],
      artifacts: details.artifacts || [],
    },
  };
}
