import type { ProviderId, TaskMode } from './types.js';

export type CompletionRole = 'system' | 'developer' | 'user' | 'assistant' | 'tool';

export interface CompletionToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

export interface CompletionMessage {
  role: CompletionRole;
  content?: string | Array<Record<string, unknown>> | null;
  name?: string;
  tool_call_id?: string;
  tool_calls?: CompletionToolCall[];
}

export interface CompletionTool {
  type: 'function';
  function: { name: string; description?: string; parameters?: Record<string, unknown> };
}

export interface CompletionRequest {
  model: string;
  messages: CompletionMessage[];
  tools?: CompletionTool[];
  tool_choice?: unknown;
  stream?: boolean;
  temperature?: number;
  max_tokens?: number;
  max_completion_tokens?: number;
  stop?: string | string[];
  user?: string;
}

export interface CompletionChoiceMessage {
  role: 'assistant';
  content: string | null;
  tool_calls?: CompletionToolCall[];
}

export interface CompletionResult {
  message: CompletionChoiceMessage;
  finishReason: 'stop' | 'tool_calls' | 'length';
  provider: ProviderId;
  model: string;
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
}

export interface CompletionModel {
  id: string;
  mode?: TaskMode;
  provider?: ProviderId;
  displayName: string;
}
