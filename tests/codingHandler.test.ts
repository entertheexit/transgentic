import { describe, it, expect } from 'vitest';
import {
  wrapBalancedCodingPrompt,
  wrapBalancedAgenticPrompt,
  wrapBalancedLocalLlmPrompt,
  formatLocalLlmMicroTaskOnlyDirective,
  formatBalancedLocalLlmDirective,
  formatBalancedWebAiDirective,
  formatLocalLlmDecisionReminder,
  formatWebAiDecisionReminder,
  wrapUnbalancedAgenticPrompt,
  formatUnbalancedAgenticReminder,
} from '../src/main/mcp/handlers/codingHandler.js';

describe('Balanced Agentic Mode Handler', () => {
  it('should wrap raw prompt with the system directive for balanced agentic coding', () => {
    const raw = 'Refactor user authentication route to support OAuth2';
    const wrapped = wrapBalancedCodingPrompt(raw);

    expect(wrapped).toContain('[SYSTEM DIRECTIVE: BALANCED AGENTIC HARNESS (TRANSGENTIC MCP - CODING)]');
    expect(wrapped).toContain('Transgentic MCP');
    expect(wrapped).toContain('Agentic Client Role');
    expect(wrapped).toContain('Transgentic MCP Role');
    expect(wrapped).toContain('Fallback Protocol');
    expect(wrapped).toContain('[TASK]');
    expect(wrapped).toContain(raw);
  });

  it('should wrap storyboard and writing prompt with multimodal delegation and fallback protocol', () => {
    const raw = 'Create a storyboard for a cyberpunk mystery episode';
    const wrapped = wrapBalancedAgenticPrompt(raw, 'writing');

    expect(wrapped).toContain('STORYBOARDING & CREATIVE PLANNING');
    expect(wrapped).toContain('Multimodal Asset Generation');
    expect(wrapped).toContain('generate_image, generate_video, generate_audio, generate_music');
    expect(wrapped).toContain('Fallback Protocol');
    expect(wrapped).toContain('[TASK]');
    expect(wrapped).toContain(raw);
  });

  it('should wrap multimodal media generation prompt with fallback protocol', () => {
    const raw = 'Cyberpunk futuristic neon detective';
    const wrapped = wrapBalancedAgenticPrompt(raw, 'image');

    expect(wrapped).toContain('MULTIMODAL GENERATION');
    expect(wrapped).toContain('Fallback Protocol');
    expect(wrapped).toContain('[TASK]');
    expect(wrapped).toContain(raw);
  });

  it('should wrap local LLM micro-task prompt with boundaries and category hint', () => {
    const raw = 'Write a regex to validate UUIDv4 strings';
    const wrapped = wrapBalancedLocalLlmPrompt(raw, 'regex');

    expect(wrapped).toContain('[SYSTEM DIRECTIVE: BALANCED AGENTIC HARNESS (TRANSGENTIC MCP - LOCAL LLM MICRO-TASK)] (TARGET CATEGORY: REGEX)');
    expect(wrapped).toContain('Micro-Task Focus');
    expect(wrapped).toContain('Regex construction, validation, and pattern explanations');
    expect(wrapped).toContain('Do NOT generate broad system architectures');
    expect(wrapped).toContain('[TASK]');
    expect(wrapped).toContain(raw);
  });

  it('should format directive informing agentic client to only use Transgentic MCP for micro-tasks when running Local LLM', () => {
    const directive = formatLocalLlmMicroTaskOnlyDirective();

    expect(directive).toContain('[TRANSGENTIC BALANCED HARNESS: LOCAL LLM DIRECTIVE]');
    expect(directive).toContain('The active provider is Local LLM');
    expect(directive).toContain('Agentic Client Execution (Codex / Antigravity / Cursor)');
    expect(directive).toContain('Transgentic MCP Micro-Task Role');
    expect(directive).toContain('only invoke Transgentic MCP (e.g. by mentioning "use Transgentic MCP") for simple, fast micro-tasks');
    expect(directive).toContain('bypasses Webview DOM manipulation');
    expect(directive).toContain('Continue with your current task implementation autonomously now');
  });

  it('should format directive informing agentic client to only use Transgentic MCP for hard thinking/research/planning when running Web AI Services', () => {
    const directive = formatBalancedWebAiDirective('claude', true);

    expect(directive).toContain('[TRANSGENTIC BALANCED HARNESS: WEB AI DIRECTIVE]');
    expect(directive).toContain('The active provider is Web AI Services (CLAUDE) running under Balanced Mode');
    expect(directive).toContain('Agentic Client Execution (Codex / Antigravity / Cursor)');
    expect(directive).toContain('bypass Web AI webview sessions and preserve hourly quotas');
    expect(directive).toContain('Transgentic MCP Role');
    expect(directive).toContain('Only invoke Transgentic MCP (e.g. by mentioning "use Transgentic MCP") when you require hard thinking, in-depth research, memory recall across past chats, extra information, or strategic architectural blueprints and complex planning');
    expect(directive).toContain('Continue with implementing your task in your workspace now');
  });

  it('should format decision reminder for Local LLM prompting agentic client to make decision on every response', () => {
    const reminder = formatLocalLlmDecisionReminder('qwen2.5-coder:7b');

    expect(reminder).toContain('[TRANSGENTIC DECISION GUIDANCE - LOCAL LLM (QWEN2.5-CODER:7B)]');
    expect(reminder).toContain('Evaluate your next step before proceeding');
    expect(reminder).toContain('Use Transgentic MCP: ONLY for lightweight micro-tasks (regex, TypeScript types from JSON, docstrings/JSDoc, unit test stubs)');
    expect(reminder).toContain('Do it on your own: For complex planning, reasoning, codebase edits, multi-file refactoring, builds, and running commands');
  });

  it('should format decision reminder for Web AI prompting agentic client to make decision on every response', () => {
    const reminder = formatWebAiDecisionReminder('claude');

    expect(reminder).toContain('[TRANSGENTIC DECISION GUIDANCE - CLAUDE]');
    expect(reminder).toContain('Evaluate your next step before proceeding');
    expect(reminder).toContain('Use Transgentic MCP: ONLY for high-level architectural planning, deep reasoning, research, or multimodal media generation');
    expect(reminder).toContain('Do it on your own: For code edits, file updates, terminal commands, builds, and local execution in your workspace');
  });

  it('should wrap prompt with system directive for unbalanced / Transgentic-weighted mode', () => {
    const raw = 'Build full authentication flow and database migrations';
    const wrapped = wrapUnbalancedAgenticPrompt(raw, 'coding');

    expect(wrapped).toContain('[SYSTEM DIRECTIVE: TRANSGENTIC-WEIGHTED HARNESS (TRANSGENTIC MCP - CODING)]');
    expect(wrapped).toContain('Transgentic-Weighted Mode (Balanced Mode is disabled)');
    expect(wrapped).toContain('DIVISION OF LABOR (WEIGHT ON TRANSGENTIC)');
    expect(wrapped).toContain('mention "use Transgentic MCP"');
    expect(wrapped).toContain(raw);
  });

  it('should format guidance reminder when Balanced Mode is disabled, reminding client to mention "use Transgentic MCP" every time', () => {
    const reminder = formatUnbalancedAgenticReminder('claude');

    expect(reminder).toContain('[TRANSGENTIC GUIDANCE - CLAUDE - WEIGHT ON TRANSGENTIC]');
    expect(reminder).toContain('Balanced Mode is disabled');
    expect(reminder).toContain('This workflow is weighted heavily on Transgentic MCP');
    expect(reminder).toContain('Mention "use Transgentic MCP" in every subsequent turn/step');
  });
});


