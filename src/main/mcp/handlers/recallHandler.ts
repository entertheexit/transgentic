import { RecallConfig, isRecallEnabledForMode } from '../../config/appConfig.js';
import { TaskMode } from '../../../shared/types.js';

/**
 * Recall & Context Memory Engine Handler
 * 
 * Automatically instructs Web AI providers (ChatGPT, Claude, Gemini, Grok)
 * to consult their native long-term memory, custom instructions, and prior chat history
 * to retrieve previously established architecture, constraints, worldbuilding, and decisions.
 */

export function applyRecallPipeline(rawPrompt: string, config?: RecallConfig, mode: TaskMode = 'general'): string {
  if (!config || !config.enabled) {
    return rawPrompt;
  }

  if (!isRecallEnabledForMode(config, mode)) {
    return rawPrompt;
  }

  // Two-stage strategy: explicitly directs multi-phase memory retrieval and constraint reconciliation
  if (config.strategy === 'two-stage') {
    const twoStagePrefix = `
[SYSTEM DIRECTIVE: RECALL & HISTORICAL CONTEXT (TWO-STAGE DEEP RETRIEVAL)]
PHASE 1: MEMORY AUDIT
- Actively search and audit your long-term account memory, custom instructions, and prior conversational lore for all entities, system architecture, file structures, constraints, or plot details relevant to the task below.
- Retrieve any user preferences, previously agreed conventions, or architectural decisions that govern this workspace.

PHASE 2: EXECUTION WITH RETRIEVED CONTEXT
- Execute the task strictly adhering to established historical context and patterns.
- If standard assumptions contradict past user decisions, prioritize the user's previously established context.

[TASK]
`.trim();

    return `${twoStagePrefix}\n${rawPrompt}`;
  }

  // Single-pass strategy (default): low-latency direct directive injection
  const recallPrefix = `
[SYSTEM DIRECTIVE: RECALL & HISTORICAL CONTEXT]
1. Search and consult your long-term memory, user preferences, and prior conversation history regarding the entities, architecture, or plot points mentioned below.
2. Incorporate all established constraints, lore, decisions, and patterns seamlessly into your response.
3. If specific historical details conflict with standard assumptions, prioritize the user's previously established context.

[TASK]
`.trim();

  return `${recallPrefix}\n${rawPrompt}`;
}
