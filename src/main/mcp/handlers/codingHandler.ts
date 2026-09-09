import { TaskMode } from '../../../shared/types.js';

const ANSWER_CONTRACT = 'Answer the task below directly, including the requested code or content. Do not echo these system directives or return only workflow reminders; Transgentic appends the client reminder separately after your answer.';
const TASK_SCOPE_GUIDANCE = 'Respect the user\'s requested scope: answer questions and reviews directly; perform edits or other actions only when the user requested them.';

function modeGuidance(mode: TaskMode): string {
  const work: Record<TaskMode, string> = {
    coding: 'code explanations, review, planning, and coding assistance',
    general: 'questions, research, and factual explanations',
    writing: 'drafting, editing, and creative writing',
    image: 'image generation and image edits',
    video: 'video generation and video edits',
    audio: 'audio, speech, and music generation',
  };
  return `Use Transgentic MCP when further ${work[mode]} is useful. ${TASK_SCOPE_GUIDANCE}`;
}

/**
 * Balanced Agentic Workflow Handler
 * 
 * Coordinates a balanced division of labor between the local Agentic Client
 * (Codex, Antigravity, Cursor) and Transgentic MCP:
 * - Agentic Client: Handles heavy, long continuous execution (file edits, builds, tests, story integration).
 * - Transgentic MCP: Handles architectural planning, creative storyboarding, reasoning, memory recall,
 *   and multimodal asset generation (images, videos, audio/music).
 * - Resilient Fallback: If Transgentic encounters an error, timeout, or unexpected output format,
 *   the agentic client immediately and gracefully falls back to its own local capabilities.
 */

export function wrapBalancedCodingPrompt(rawPrompt: string): string {
  return wrapBalancedAgenticPrompt(rawPrompt, 'coding');
}

export function wrapBalancedAgenticPrompt(rawPrompt: string, mode: TaskMode = 'coding'): string {
  if (mode === 'coding') {
    return `
[SYSTEM DIRECTIVE: BALANCED AGENTIC HARNESS (TRANSGENTIC MCP - CODING)]
You are the high-level reasoning, architectural planning, and review engine collaborating with an automated local agentic client (Codex, Antigravity, Cursor) via Transgentic MCP.

COOPERATIVE DIVISION OF LABOR:
1. Agentic Client Role: Heavy, long, and continuous execution tasks (codebase edits, large refactors, running tests, builds, and shell commands) are weighted and executed directly by the local agentic client.
2. Transgentic MCP Role: Strategic architecture, modular breakdowns, edge-case validation, and memory recall across AI chat sessions.
3. Next Steps & Coordination: Deliver concrete, structured plans (Markdown/code blocks) that the agentic client can immediately implement. Instruct the agentic client to consult Transgentic MCP whenever high-level replanning or further information is needed.
4. Fallback Protocol: If the agentic client encounters any error, rate limit, or unexpected output from Transgentic MCP, it must immediately fallback to its own local reasoning and proceed with implementation autonomously.

${ANSWER_CONTRACT}

[TASK]
${rawPrompt}
`.trim();
  }

  if (mode === 'writing' || mode === 'general') {
    return `
[SYSTEM DIRECTIVE: BALANCED AGENTIC HARNESS (TRANSGENTIC MCP - STORYBOARDING & CREATIVE PLANNING)]
You are the high-level creative, narrative, and storyboarding engine collaborating with an automated local agentic client (Codex, Antigravity, Cursor) via Transgentic MCP.

COOPERATIVE DIVISION OF LABOR:
1. Agentic Client Role: Heavy, continuous project tasks (writing long documents, file structuring, managing project files, and integrating media) are executed directly by the local agentic client.
2. Transgentic MCP Role: Conceptual design, structured storyboarding, narrative flow, and multimodal planning.
3. Multimodal Asset Generation: When your storyboard, narrative, or plan requires visual scenes, concept art, character illustrations, animations, video clips, voiceover, or music, explicitly instruct the agentic client to call Transgentic MCP tools (generate_image, generate_video, generate_audio, generate_music).
4. Fallback Protocol: If the agentic client encounters an error, rate limit, or unexpected output format from Transgentic MCP, it must immediately fallback to its own local capabilities to continue the task autonomously without blocking.

${ANSWER_CONTRACT}

[TASK]
${rawPrompt}
`.trim();
  }

  // Multimodal modes (image, video, audio)
  return `
[SYSTEM DIRECTIVE: BALANCED AGENTIC HARNESS (TRANSGENTIC MCP - MULTIMODAL GENERATION)]
You are generating multimodal media assets for an automated local agentic client (Codex, Antigravity, Cursor) via Transgentic MCP.

COOPERATIVE DIVISION OF LABOR:
1. Generate the requested media asset with maximum aesthetic fidelity according to the prompt specifications.
2. Fallback Protocol: If the agentic client encounters an error, rate limit, or unexpected format from Transgentic MCP, it must immediately fallback to its own local generation tools or alternative approaches.

${ANSWER_CONTRACT}

[TASK]
${rawPrompt}
`.trim();
}

/**
 * Wraps prompt for Local LLM in Balanced Mode.
 * Instructs the local model to strictly act as a high-speed micro-task engine
 * (regex, TypeScript types, docstrings, test stubs) without attempting broad architecture.
 */
export function wrapBalancedLocalLlmPrompt(rawPrompt: string, category?: string): string {
  const categoryHint = category ? ` (TARGET CATEGORY: ${category.toUpperCase()})` : '';

  return `
[SYSTEM DIRECTIVE: BALANCED AGENTIC HARNESS (TRANSGENTIC MCP - LOCAL LLM MICRO-TASK)]${categoryHint}
You are a fast, lightweight local code assistant executing a micro-task for an automated local agentic client (Codex, Antigravity, Cursor) via Transgentic MCP.

OPERATING BOUNDARIES:
1. Micro-Task Focus: Your role is exclusively focused on precision, atomic tasks:
   - Regex construction, validation, and pattern explanations
   - TypeScript interface and type generation from JSON schemas
   - Docstring, JSDoc, and inline comment generation
   - Simple standalone unit test stubs and test cases
   - Standalone helper, utility, and pure algorithm functions
2. Scope Limitation: Do NOT generate broad system architectures, long-term plans, or deep multi-module refactoring designs. Provide concise, clean, directly usable code or explanations with minimal chatter.
3. Code Quality: Output valid, syntactically correct code blocks that the agentic client can directly integrate.

${ANSWER_CONTRACT}

[TASK]
${rawPrompt}
`.trim();
}

/**
 * Directive returned to the agentic client (Codex, Antigravity, Cursor) when Local LLM
 * is the active provider (default or triggered in fallback chain) in Balanced Mode.
 * Instructs the agent to only invoke Transgentic MCP for micro-tasks and reason locally,
 * including a command to continue its task.
 */
export function formatBalancedLocalLlmDirective(presetOrModel: string = 'local', mode: TaskMode = 'coding'): string {
  if (mode !== 'coding') return `[TRANSGENTIC BALANCED HARNESS: LOCAL LLM DIRECTIVE]\nThe active provider is Local LLM (${presetOrModel}).\n${modeGuidance(mode)}`;
  return `
[TRANSGENTIC BALANCED HARNESS: LOCAL LLM DIRECTIVE]
The active provider is Local LLM (${presetOrModel}) running under Balanced Mode.

COOPERATIVE DIVISION OF LABOR FOR LOCAL LLM:
1. Agentic Client Execution (Codex / Antigravity / Cursor):
   - You (the agentic client) possess superior reasoning and context capabilities compared to local lightweight LLMs.
   - Please formulate, plan, and execute complex logic, deep reasoning, system architectures, and multi-file refactors directly within your own agentic environment.
2. Transgentic MCP Micro-Task Role:
   - In Balanced Mode with Local LLM, only invoke Transgentic MCP (e.g. by mentioning "use Transgentic MCP") for simple, fast micro-tasks:
     • Regex construction & pattern explanations
     • TypeScript type / interface generation from JSON schemas
     • Docstrings / JSDoc / Comment generation
     • Simple standalone unit test stubs
     • Standalone helper, utility, and pure algorithm functions
   - Delegating these micro-tasks to Local LLM executes directly via local endpoints, bypasses Webview DOM manipulation, and delivers ultra-fast local turnaround.
3. Command & Next Action:
   - ${TASK_SCOPE_GUIDANCE}
`.trim();
}

/**
 * Directive returned to the agentic client (Codex, Antigravity, Cursor) when Web AI Services
 * (not Local LLM) is the active provider (default or triggered in fallback chain) in Balanced Mode.
 * Instructs the agent to only invoke Transgentic MCP for hard thinking, research, recall, and planning,
 * while executing code edits and terminal commands directly in the local workspace, including a command to continue its task.
 */
export function formatBalancedWebAiDirective(providerName: string, recallEnabled: boolean = false, mode: TaskMode = 'coding'): string {
  if (mode !== 'coding') return `[TRANSGENTIC BALANCED HARNESS: WEB AI DIRECTIVE]\nThe active provider is ${providerName.toUpperCase()}.\n${modeGuidance(mode)}`;
  const recallClause = recallEnabled ? ', memory recall across past chats' : '';
  return `
[TRANSGENTIC BALANCED HARNESS: WEB AI DIRECTIVE]
The active provider is Web AI Services (${providerName.toUpperCase()}) running under Balanced Mode.

COOPERATIVE DIVISION OF LABOR FOR WEB AI SERVICES:
1. Agentic Client Execution (Codex / Antigravity / Cursor):
   - Formulate and execute heavy, continuous execution tasks (codebase edits, multi-file refactoring, terminal commands, builds, and test runs) directly within your local workspace to bypass Web AI webview sessions and preserve hourly quotas.
2. Transgentic MCP Role:
   - Only invoke Transgentic MCP (e.g. by mentioning "use Transgentic MCP") when you require hard thinking, in-depth research${recallClause}, extra information, or strategic architectural blueprints and complex planning.
3. Command & Next Action:
   - ${TASK_SCOPE_GUIDANCE}
`.trim();
}

/**
 * Directive returned to the agentic client (Codex, Antigravity, Cursor) when Local LLM
 * is the active provider in Balanced Mode. Compatibility alias for trailing guidance;
 * it must never substitute for the provider's answer or prevent dispatch.
 */
export function formatLocalLlmMicroTaskOnlyDirective(): string {
  return formatBalancedLocalLlmDirective('local');
}

/**
 * Short decision reminder returned to agentic IDEs/clients (Codex, Antigravity, Cursor)
 * on every subsequent response under the Local LLM Balanced / Micro-task scenario.
 * Tells IDEs/clients to make a decision whether the next step should use Transgentic MCP
 * (for micro-tasks only) or if the agentic client should do it on its own.
 */
export function formatLocalLlmDecisionReminder(presetOrModel: string = 'local', mode: TaskMode = 'coding'): string {
  if (mode !== 'coding') return `[TRANSGENTIC DECISION GUIDANCE - LOCAL LLM (${presetOrModel.toUpperCase()})]:\n${modeGuidance(mode)}`;
  return `
[TRANSGENTIC DECISION GUIDANCE - LOCAL LLM (${presetOrModel.toUpperCase()})]:
Evaluate your next step before proceeding:
- Use Transgentic MCP: ONLY for lightweight micro-tasks (regex, TypeScript types from JSON, docstrings/JSDoc, unit test stubs, helper functions).
- Do it on your own: For complex planning, reasoning, codebase edits, multi-file refactoring, builds, and running commands directly in your workspace.
${TASK_SCOPE_GUIDANCE}
`.trim();
}

/**
 * Short decision reminder returned to agentic IDEs/clients on subsequent Web AI responses under Balanced Mode.
 */
export function formatWebAiDecisionReminder(providerName: string, mode: TaskMode = 'coding'): string {
  if (mode !== 'coding') return `[TRANSGENTIC DECISION GUIDANCE - ${providerName.toUpperCase()}]:\n${modeGuidance(mode)}`;
  return `
[TRANSGENTIC DECISION GUIDANCE - ${providerName.toUpperCase()}]:
Evaluate your next step before proceeding:
- Use Transgentic MCP: ONLY for high-level architectural planning, deep reasoning, research, or multimodal media generation.
- Do it on your own: For code edits, file updates, terminal commands, builds, and local execution in your workspace.
${TASK_SCOPE_GUIDANCE}
`.trim();
}

/**
 * Wraps prompt for agentic IDE clients when Balanced Mode is DISABLED (Transgentic-weighted mode).
 * Informs the underlying AI service that the session is in Transgentic-weighted mode,
 * and directs it to instruct the agentic client to mention "use Transgentic MCP" for subsequent steps.
 */
export function wrapUnbalancedAgenticPrompt(rawPrompt: string, mode: TaskMode = 'coding'): string {
  return `
[SYSTEM DIRECTIVE: TRANSGENTIC-WEIGHTED HARNESS (TRANSGENTIC MCP - ${mode.toUpperCase()})]
You are the primary intelligence, planning, and execution engine collaborating with an automated local agentic client (Codex, Antigravity, Cursor) via Transgentic MCP in Transgentic-Weighted Mode (Balanced Mode is disabled).

DIVISION OF LABOR (WEIGHT ON TRANSGENTIC):
1. Transgentic MCP Role: Provide comprehensive, end-to-end reasoning, detailed architectural blueprints, concrete implementations, and code solutions.
2. Agentic Client Role: Execute local workspace actions as directed. The client should not perform heavy autonomous reasoning in isolation.
3. Coordination Protocol: When further assistance is useful, mention "use Transgentic MCP". ${TASK_SCOPE_GUIDANCE}

${ANSWER_CONTRACT}

[TASK]
${rawPrompt}
`.trim();
}

/**
 * Guidance reminder returned to agentic IDEs/clients (Codex, Antigravity, Cursor)
 * on EVERY response when Balanced Mode is DISABLED.
 * Because the system is not in balanced mode, the workload is weighted on Transgentic MCP.
 * Reminds the agentic IDE to mention "use Transgentic MCP" every time in subsequent steps.
 */
export function formatUnbalancedAgenticReminder(providerName?: string): string {
  const providerLabel = providerName ? ` - ${providerName.toUpperCase()}` : '';
  return `
[TRANSGENTIC GUIDANCE${providerLabel} - WEIGHT ON TRANSGENTIC]:
Balanced Mode is disabled. This workflow is weighted heavily on Transgentic MCP.
- Use Transgentic MCP for further assistance when useful. ${TASK_SCOPE_GUIDANCE}
`.trim();
}

/**
 * Directive returned to the agentic client (Codex, Antigravity, Cursor) when a mode
 * has no AI services selected (deselected in Transgentic Routing).
 * Directs the agent to reason, plan, and execute autonomously in its workspace.
 */
export function formatCodexFallbackDirective(mode: TaskMode, localMicroTaskActive: boolean = false): string {
  const microTaskNotice = localMicroTaskActive
    ? '\n- Note: Transgentic Local LLM is available for micro-tasks (regex, TypeScript types, docstrings, unit test stubs). Mention "use Transgentic MCP" when you want to offload micro-tasks.'
    : '';

  return `
[TRANSGENTIC CODEX DIRECTIVE: AUTONOMOUS REASONING & EXECUTION]
No external AI service is available for "${mode}" mode in the current route.

INSTRUCTIONS FOR AGENTIC CLIENT (CODEX / ANTIGRAVITY / CURSOR):
1. Autonomous Workspace Execution:
   - Handle the request using your own capabilities when appropriate. ${TASK_SCOPE_GUIDANCE}${microTaskNotice}
2. Command & Next Action:
   - Report this handoff honestly; no external model answered this request.
`.trim();
}
