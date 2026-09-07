import { ProviderId, TaskMode } from '../../shared/types.js';

export interface McpPromptArgs {
  prompt: string;
  mode?: TaskMode;
  provider?: ProviderId;
  projectName?: string;
  topic?: string;
}

export interface McpImageArgs {
  prompt: string;
  projectName?: string;
}

export interface McpVideoArgs {
  prompt: string;
  projectName?: string;
}

export interface McpMusicArgs {
  prompt: string;
  projectName?: string;
}

export interface McpExecutionResult {
  content: Array<{
    type: 'text' | 'image' | 'resource';
    text?: string;
    data?: string;
    mimeType?: string;
  }>;
  isError?: boolean;
  metadata?: {
    providerUsed: ProviderId;
    mode: TaskMode;
    fallbackOccurred: boolean;
    maskedSecretsCount: number;
    threadTitle: string;
    savedAssetPath?: string;
    durationMs: number;
  };
}
