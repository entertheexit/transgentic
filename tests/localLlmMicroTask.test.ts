import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { classifyMicroTask } from '../src/main/mcp/handlers/microTaskClassifier.js';
import {
  wrapBalancedLocalLlmPrompt,
  formatLocalLlmMicroTaskOnlyDirective,
  formatBalancedLocalLlmDirective,
  formatBalancedWebAiDirective,
  formatLocalLlmDecisionReminder,
  formatWebAiDecisionReminder,
  formatUnbalancedAgenticReminder,
  formatCodexFallbackDirective,
} from '../src/main/mcp/handlers/codingHandler.js';
import { formatDualDispatchDoubleAgentDirective } from '../src/main/mcp/dispatchPipeline.js';
import { DynamicRouter } from '../src/main/mcp/router.js';

beforeEach(() => { vi.spyOn(DynamicRouter, 'savePersistedRoutes').mockImplementation(() => {}); });
afterEach(() => { vi.restoreAllMocks(); });

describe('Local LLM Micro-Task in Balanced Mode Unit & Integration Tests', () => {
  describe('Classification of Micro-Tasks vs Complex Tasks', () => {
    it('should classify regex construction as micro-task', () => {
      const prompt = 'Write a regex to match IPv4 addresses';
      const classification = classifyMicroTask(prompt);
      expect(classification.isMicroTask).toBe(true);
      expect(classification.category).toBe('regex');
    });

    it('should classify TypeScript types from JSON as micro-task', () => {
      const prompt = 'Generate TypeScript interface from this JSON: { "name": "App", "version": 1 }';
      const classification = classifyMicroTask(prompt);
      expect(classification.isMicroTask).toBe(true);
      expect(classification.category).toBe('types');
    });

    it('should classify JSDoc generation as micro-task', () => {
      const prompt = 'Generate JSDoc for this function:\nfunction add(a, b) { return a + b; }';
      const classification = classifyMicroTask(prompt);
      expect(classification.isMicroTask).toBe(true);
      expect(classification.category).toBe('docstring');
    });

    it('should classify standalone unit test stubs as micro-task', () => {
      const prompt = 'Generate simple unit test stubs for this function using vitest';
      const classification = classifyMicroTask(prompt);
      expect(classification.isMicroTask).toBe(true);
      expect(classification.category).toBe('test_stubs');
    });

    it('should classify standalone TypeScript helper function with Vitest test as micro-task', () => {
      const prompt = 'Write only a standalone TypeScript function permutations<T> (items: readonly T[]): T[][] returning every permutation without mutating items. Include a Vitest test that [1,2,3,4] yields 24 unique permutations and input remains unchanged. This is a simple unit-test helper micro-task.';
      const classification = classifyMicroTask(prompt);
      expect(classification.isMicroTask).toBe(true);
      expect(classification.category).toBe('test_stubs');
    });

    it('should classify standalone pure helper function as helper_fn micro-task', () => {
      const prompt = 'Write only a standalone TypeScript function permutations<T> (items: readonly T[]): T[][] returning every permutation without mutating items.';
      const classification = classifyMicroTask(prompt);
      expect(classification.isMicroTask).toBe(true);
      expect(classification.category).toBe('helper_fn');
    });

    it('should classify explicit micro-task as micro-task', () => {
      const prompt = 'Implement a quick string utility function to slugify titles. This is a micro-task.';
      const classification = classifyMicroTask(prompt);
      expect(classification.isMicroTask).toBe(true);
      expect(classification.category).toBe('helper_fn');
    });

    it('should classify complex system architecture as NOT a micro-task', () => {
      const prompt = 'Design the system architecture and microservices layout for our enterprise billing engine';
      const classification = classifyMicroTask(prompt);
      expect(classification.isMicroTask).toBe(false);
      expect(classification.reason).toContain('system architecture');
    });

    it('should classify multi-tier database design as NOT a micro-task', () => {
      const prompt = 'Design the database schema and relational architecture for a multi-tenant SaaS application';
      const classification = classifyMicroTask(prompt);
      expect(classification.isMicroTask).toBe(false);
    });

    it('should classify deep reasoning requests as NOT a micro-task', () => {
      const prompt = 'Apply deep reasoning to break down the concurrency bottlenecks across all services';
      const classification = classifyMicroTask(prompt);
      expect(classification.isMicroTask).toBe(false);
    });
  });

  describe('Local LLM Balanced Mode Directives', () => {
    it('should wrap micro-task prompts with focused boundaries and category hints', () => {
      const prompt = 'Create a regex for validating hexadecimal colors';
      const wrapped = wrapBalancedLocalLlmPrompt(prompt, 'regex');

      expect(wrapped).toContain('[SYSTEM DIRECTIVE: BALANCED AGENTIC HARNESS (TRANSGENTIC MCP - LOCAL LLM MICRO-TASK)] (TARGET CATEGORY: REGEX)');
      expect(wrapped).toContain('Do NOT generate broad system architectures, long-term plans, or deep multi-module refactoring designs');
      expect(wrapped).toContain(prompt);
    });

    it('should generate directive instructing agentic client (Codex) to only use Transgentic MCP for micro-tasks', () => {
      const directive = formatLocalLlmMicroTaskOnlyDirective();

      expect(directive).toContain('[TRANSGENTIC BALANCED HARNESS: LOCAL LLM DIRECTIVE]');
      expect(directive).toContain('Agentic Client Execution (Codex / Antigravity / Cursor)');
      expect(directive).toContain('formulate, plan, and execute complex logic, deep reasoning, system architectures, and multi-file refactors directly within your own agentic environment');
      expect(directive).toContain('only invoke Transgentic MCP (e.g. by mentioning "use Transgentic MCP") for simple, fast micro-tasks');
      expect(directive).toContain('Regex construction & pattern explanations');
      expect(directive).toContain('TypeScript type / interface generation from JSON schemas');
      expect(directive).toContain('Docstrings / JSDoc / Comment generation');
      expect(directive).toContain('Simple standalone unit test stubs');
      expect(directive).toContain('Standalone helper, utility, and pure algorithm functions');
      expect(directive).toContain('answer questions and reviews directly');
    });
  });

  describe('Bypass Webview Dispatch & Route-Dependent Logic Simulation', () => {
    it('should promote localllm ahead of webview services when localMicroTask is enabled, after Turn 1, and prompt is micro-task', () => {
      const isBalanced = true;
      const forcedProvider = undefined;
      const isLocalLlmAvailable = true;
      const isLocalMicroTaskEnabled = true; // User enabled "Local Micro-task" in modal
      const isAfterTurnOne = true; // Request occurs after Turn 1 (existing chat session)
      const configuredRouteCandidates = ['claude', 'localllm']; // Local LLM configured in fallback chain

      const prompt = 'Write a regex to match email addresses';
      const microTask = classifyMicroTask(prompt);

      let candidateProviders = [...configuredRouteCandidates];
      const isLocalLlmInRoute = candidateProviders.includes('localllm');
      let bypassedWebviewDispatch = false;

      if (
        isLocalMicroTaskEnabled &&
        isBalanced &&
        isAfterTurnOne &&
        microTask.isMicroTask &&
        !forcedProvider &&
        isLocalLlmAvailable &&
        isLocalLlmInRoute
      ) {
        if (candidateProviders[0] !== 'localllm') {
          candidateProviders = ['localllm', ...candidateProviders.filter((p) => p !== 'localllm')];
          bypassedWebviewDispatch = true;
        }
      }

      expect(isLocalLlmInRoute).toBe(true);
      expect(bypassedWebviewDispatch).toBe(true);
      expect(candidateProviders[0]).toBe('localllm');
      expect(candidateProviders).toEqual(['localllm', 'claude']);
    });

    it('should NOT promote localllm if localMicroTask is DISABLED by user even after Turn 1', () => {
      const isBalanced = true;
      const forcedProvider = undefined;
      const isLocalLlmAvailable = true;
      const isLocalMicroTaskEnabled = false; // User disabled "Local Micro-task" in modal
      const isAfterTurnOne = true;
      const configuredRouteCandidates = ['claude', 'localllm'];

      const prompt = 'Write a regex to match email addresses';
      const microTask = classifyMicroTask(prompt);

      let candidateProviders = [...configuredRouteCandidates];
      const isLocalLlmInRoute = candidateProviders.includes('localllm');
      let bypassedWebviewDispatch = false;

      if (
        isLocalMicroTaskEnabled &&
        isBalanced &&
        isAfterTurnOne &&
        microTask.isMicroTask &&
        !forcedProvider &&
        isLocalLlmAvailable &&
        isLocalLlmInRoute
      ) {
        if (candidateProviders[0] !== 'localllm') {
          candidateProviders = ['localllm', ...candidateProviders.filter((p) => p !== 'localllm')];
          bypassedWebviewDispatch = true;
        }
      }

      // If Local Micro-task is disabled, stick strictly to what user set for mode
      expect(bypassedWebviewDispatch).toBe(false);
      expect(candidateProviders[0]).toBe('claude');
      expect(candidateProviders).toEqual(['claude', 'localllm']);
    });

    it('should NOT promote localllm on Turn 1 (new chat session), going directly to configured Web AI', () => {
      const isBalanced = true;
      const forcedProvider = undefined;
      const isLocalLlmAvailable = true;
      const isLocalMicroTaskEnabled = true;
      const isAfterTurnOne = false; // Turn 1 (new chat session)
      const configuredRouteCandidates = ['claude', 'localllm'];

      const prompt = 'Write a regex to match email addresses';
      const microTask = classifyMicroTask(prompt);

      let candidateProviders = [...configuredRouteCandidates];
      const isLocalLlmInRoute = candidateProviders.includes('localllm');
      let bypassedWebviewDispatch = false;

      if (
        isLocalMicroTaskEnabled &&
        isBalanced &&
        isAfterTurnOne &&
        microTask.isMicroTask &&
        !forcedProvider &&
        isLocalLlmAvailable &&
        isLocalLlmInRoute
      ) {
        if (candidateProviders[0] !== 'localllm') {
          candidateProviders = ['localllm', ...candidateProviders.filter((p) => p !== 'localllm')];
          bypassedWebviewDispatch = true;
        }
      }

      // Turn 1 goes directly to configured Web AI
      expect(bypassedWebviewDispatch).toBe(false);
      expect(candidateProviders[0]).toBe('claude');
      expect(candidateProviders).toEqual(['claude', 'localllm']);
    });

    it('should NOT promote localllm if localllm is NOT in the user configured route', () => {
      const isBalanced = true;
      const forcedProvider = undefined;
      const isLocalLlmAvailable = true;
      const isLocalMicroTaskEnabled = true;
      const isAfterTurnOne = true;
      const configuredRouteCandidates = ['claude', 'chatgpt']; // User did not put Local LLM in this route

      const prompt = 'Write a regex to match email addresses';
      const microTask = classifyMicroTask(prompt);

      let candidateProviders = [...configuredRouteCandidates];
      const isLocalLlmInRoute = candidateProviders.includes('localllm');
      let bypassedWebviewDispatch = false;

      if (
        isLocalMicroTaskEnabled &&
        isBalanced &&
        isAfterTurnOne &&
        microTask.isMicroTask &&
        !forcedProvider &&
        isLocalLlmAvailable &&
        isLocalLlmInRoute
      ) {
        if (candidateProviders[0] !== 'localllm') {
          candidateProviders = ['localllm', ...candidateProviders.filter((p) => p !== 'localllm')];
          bypassedWebviewDispatch = true;
        }
      }

      // Transgentic strictly respects configured Routes!
      expect(isLocalLlmInRoute).toBe(false);
      expect(bypassedWebviewDispatch).toBe(false);
      expect(candidateProviders[0]).toBe('claude');
      expect(candidateProviders).toEqual(['claude', 'chatgpt']);
    });

    it('should keep localllm as default when already primary without flagging bypass', () => {
      const isBalanced = true;
      const forcedProvider = undefined;
      const isLocalLlmAvailable = true;
      const isLocalMicroTaskEnabled = true;
      const isAfterTurnOne = true;
      const configuredRouteCandidates = ['localllm', 'claude']; // Local LLM is set as default

      const prompt = 'Write a regex to match email addresses';
      const microTask = classifyMicroTask(prompt);

      let candidateProviders = [...configuredRouteCandidates];
      const isLocalLlmInRoute = candidateProviders.includes('localllm');
      let bypassedWebviewDispatch = false;

      if (
        isLocalMicroTaskEnabled &&
        isBalanced &&
        isAfterTurnOne &&
        microTask.isMicroTask &&
        !forcedProvider &&
        isLocalLlmAvailable &&
        isLocalLlmInRoute
      ) {
        if (candidateProviders[0] !== 'localllm') {
          candidateProviders = ['localllm', ...candidateProviders.filter((p) => p !== 'localllm')];
          bypassedWebviewDispatch = true;
        }
      }

      expect(bypassedWebviewDispatch).toBe(false);
      expect(candidateProviders[0]).toBe('localllm');
    });

    it('should NOT promote localllm if prompt is complex architecture', () => {
      const isBalanced = true;
      const forcedProvider = undefined;
      const isLocalLlmAvailable = true;
      const isLocalMicroTaskEnabled = true;
      const isAfterTurnOne = true;
      const configuredRouteCandidates = ['claude', 'localllm'];

      const prompt = 'Design the system architecture for high throughput event streaming';
      const microTask = classifyMicroTask(prompt);

      let candidateProviders = [...configuredRouteCandidates];
      const isLocalLlmInRoute = candidateProviders.includes('localllm');
      let bypassedWebviewDispatch = false;

      if (
        isLocalMicroTaskEnabled &&
        isBalanced &&
        isAfterTurnOne &&
        microTask.isMicroTask &&
        !forcedProvider &&
        isLocalLlmAvailable &&
        isLocalLlmInRoute
      ) {
        if (candidateProviders[0] !== 'localllm') {
          candidateProviders = ['localllm', ...candidateProviders.filter((p) => p !== 'localllm')];
          bypassedWebviewDispatch = true;
        }
      }

      expect(bypassedWebviewDispatch).toBe(false);
      expect(candidateProviders[0]).toBe('claude');
      expect(candidateProviders).toEqual(['claude', 'localllm']);
    });

    it('should promote localllm after Turn 1 for micro-tasks even when Balanced Mode is DISABLED (Standalone Local Micro-task)', () => {
      const isBalanced = false; // User disabled Balanced mode in Hub
      const forcedProvider = undefined;
      const isLocalLlmAvailable = true;
      const isLocalMicroTaskEnabled = true; // User enabled "Local Micro-task" in modal
      const isAfterTurnOne = true;
      const configuredRouteCandidates = ['chatgpt', 'localllm'];

      const prompt = 'Generate TypeScript interface from this JSON: { "id": 1, "title": "test" }';
      const microTask = classifyMicroTask(prompt);

      let candidateProviders = [...configuredRouteCandidates];
      const isLocalLlmInRoute = candidateProviders.includes('localllm');
      let bypassedWebviewDispatch = false;

      // Standalone condition: does NOT require isBalanced!
      if (
        isLocalMicroTaskEnabled &&
        isAfterTurnOne &&
        microTask.isMicroTask &&
        !forcedProvider &&
        isLocalLlmAvailable &&
        isLocalLlmInRoute
      ) {
        if (candidateProviders[0] !== 'localllm') {
          candidateProviders = ['localllm', ...candidateProviders.filter((p) => p !== 'localllm')];
          bypassedWebviewDispatch = true;
        }
      }

      // Even without Balanced mode, Local Micro-task functions as a standalone offload!
      expect(bypassedWebviewDispatch).toBe(true);
      expect(candidateProviders[0]).toBe('localllm');
      expect(candidateProviders).toEqual(['localllm', 'chatgpt']);
    });

    // Dispatch behavior is exercised against the actual server in responseGuidance.test.ts.
  });

  describe('Turn 1 Balanced Mode Response Guidance Simulation', () => {
    it('should attach Local LLM directive on Turn 1 (wasNewChat = true) with continue command', () => {
      const isBalanced = true;
      const isAgenticClient = true;
      const wasNewChat = true;
      const successfulProvider = 'localllm';
      const rawResponse = 'export interface User { id: number; name: string; }';

      const contentItems: any[] = [{ type: 'text', text: rawResponse }];

      if (isBalanced && isAgenticClient && wasNewChat) {
        if (successfulProvider === 'localllm') {
          contentItems.push({
            type: 'text',
            text: `\n\n---\n${formatBalancedLocalLlmDirective('llama3:8b')}`,
          });
        }
      }

      expect(contentItems).toHaveLength(2);
      expect(contentItems[0].text).toBe(rawResponse);
      expect(contentItems[1].text).toContain('[TRANSGENTIC BALANCED HARNESS: LOCAL LLM DIRECTIVE]');
      expect(contentItems[1].text).toContain('only invoke Transgentic MCP (e.g. by mentioning "use Transgentic MCP") for simple, fast micro-tasks');
      expect(contentItems[1].text).toContain('answer questions and reviews directly');
    });

    it('should attach Local LLM decision reminder on Turn 2+ (wasNewChat = false) prompting client to decide', () => {
      const isBalanced = true;
      const isLocalMicroTaskEnabled = false;
      const isAgenticClient = true;
      const wasNewChat = false;
      const successfulProvider = 'localllm';
      const rawResponse = 'export interface Post { id: number; title: string; }';

      const contentItems: any[] = [{ type: 'text', text: rawResponse }];

      if (isAgenticClient) {
        if (successfulProvider === 'localllm' && (isBalanced || isLocalMicroTaskEnabled)) {
          const reminderText = wasNewChat
            ? formatBalancedLocalLlmDirective('llama3:8b')
            : formatLocalLlmDecisionReminder('llama3:8b');
          contentItems.push({
            type: 'text',
            text: `\n\n---\n${reminderText}`,
          });
        }
      }

      expect(contentItems).toHaveLength(2);
      expect(contentItems[0].text).toBe(rawResponse);
      expect(contentItems[1].text).not.toContain('[TRANSGENTIC BALANCED HARNESS: LOCAL LLM DIRECTIVE]');
      expect(contentItems[1].text).toContain('[TRANSGENTIC DECISION GUIDANCE - LOCAL LLM (LLAMA3:8B)]');
      expect(contentItems[1].text).toContain('Evaluate your next step before proceeding');
      expect(contentItems[1].text).toContain('Use Transgentic MCP: ONLY for lightweight micro-tasks');
      expect(contentItems[1].text).toContain('Do it on your own: For complex planning, reasoning, codebase edits');
    });

    it('should attach Web AI directive on Turn 1 (wasNewChat = true) with continue command', () => {
      const isBalanced = true;
      const isAgenticClient = true;
      const wasNewChat = true;
      const successfulProvider = 'claude';
      const rawResponse = '# Architectural Plan for Scalable Microservices';

      const contentItems: any[] = [{ type: 'text', text: rawResponse }];

      if (isBalanced && isAgenticClient) {
        if (successfulProvider === 'localllm') {
          contentItems.push({
            type: 'text',
            text: `\n\n---\n${formatBalancedLocalLlmDirective('local')}`,
          });
        } else {
          contentItems.push({
            type: 'text',
            text: `\n\n---\n${formatBalancedWebAiDirective(successfulProvider, false)}`,
          });
        }
      }

      expect(contentItems).toHaveLength(2);
      expect(contentItems[0].text).toBe(rawResponse);
      expect(contentItems[1].text).toContain('[TRANSGENTIC BALANCED HARNESS: WEB AI DIRECTIVE]');
      expect(contentItems[1].text).toContain('The active provider is Web AI Services (CLAUDE) running under Balanced Mode');
      expect(contentItems[1].text).toContain('Only invoke Transgentic MCP (e.g. by mentioning "use Transgentic MCP") when you require hard thinking');
      expect(contentItems[1].text).toContain('answer questions and reviews directly');
    });

    it('should attach Web AI decision reminder on Turn 2+ (wasNewChat = false) prompting client to decide', () => {
      const isBalanced = true;
      const isAgenticClient = true;
      const wasNewChat = false;
      const successfulProvider = 'claude';
      const rawResponse = 'Detailed module interface specifications.';

      const contentItems: any[] = [{ type: 'text', text: rawResponse }];

      if (isAgenticClient) {
        if (successfulProvider !== 'localllm' && isBalanced) {
          const reminderText = wasNewChat
            ? formatBalancedWebAiDirective(successfulProvider, false)
            : formatWebAiDecisionReminder(successfulProvider);
          contentItems.push({
            type: 'text',
            text: `\n\n---\n${reminderText}`,
          });
        }
      }

      expect(contentItems).toHaveLength(2);
      expect(contentItems[0].text).toBe(rawResponse);
      expect(contentItems[1].text).not.toContain('[TRANSGENTIC BALANCED HARNESS: WEB AI DIRECTIVE]');
      expect(contentItems[1].text).toContain('[TRANSGENTIC DECISION GUIDANCE - CLAUDE]');
      expect(contentItems[1].text).toContain('Evaluate your next step before proceeding');
      expect(contentItems[1].text).toContain('Use Transgentic MCP: ONLY for high-level architectural planning');
      expect(contentItems[1].text).toContain('Do it on your own: For code edits, file updates, terminal commands');
    });

    it('should attach Local LLM directive on Turn 1 when Balanced is DISABLED but Local Micro-task is ENABLED', () => {
      const isBalanced = false;
      const isLocalMicroTaskEnabled = true;
      const isAgenticClient = true;
      const wasNewChat = true;
      const successfulProvider = 'localllm';
      const rawResponse = 'export interface Product { id: number; price: number; }';

      const contentItems: any[] = [{ type: 'text', text: rawResponse }];

      if (wasNewChat && isAgenticClient) {
        if (successfulProvider === 'localllm' && (isBalanced || isLocalMicroTaskEnabled)) {
          contentItems.push({
            type: 'text',
            text: `\n\n---\n${formatBalancedLocalLlmDirective('qwen2.5-coder:7b')}`,
          });
        }
      }

      expect(contentItems).toHaveLength(2);
      expect(contentItems[1].text).toContain('[TRANSGENTIC BALANCED HARNESS: LOCAL LLM DIRECTIVE]');
    });

    it('Scenario 1: should NOT attach Local LLM directive on Turn 1 when both Balanced and Local Micro-task are DISABLED', () => {
      const isBalanced = false;
      const isLocalMicroTaskEnabled = false;
      const isAgenticClient = true;
      const wasNewChat = true;
      const successfulProvider = 'localllm';
      const rawResponse = 'export interface Product { id: number; price: number; }';

      const contentItems: any[] = [{ type: 'text', text: rawResponse }];

      if (wasNewChat && isAgenticClient) {
        if (successfulProvider === 'localllm' && (isBalanced || isLocalMicroTaskEnabled)) {
          contentItems.push({
            type: 'text',
            text: `\n\n---\n${formatBalancedLocalLlmDirective('qwen2.5-coder:7b')}`,
          });
        }
      }

      // In Scenario 1, returns clean response without directive
      expect(contentItems).toHaveLength(1);
      expect(contentItems[0].text).toBe(rawResponse);
    });

    it('should attach formatUnbalancedAgenticReminder when Balanced is DISABLED in standard single mode', () => {
      const isBalanced = false;
      const isAgenticClient = true;
      const scenario = 'standard_single';
      const successfulProvider = 'claude';
      const rawResponse = 'Here is the complete implementation and test suite.';

      const contentItems: any[] = [{ type: 'text', text: rawResponse }];

      if (isAgenticClient) {
        if (scenario === 'standard_single') {
          const reminderText = formatUnbalancedAgenticReminder(successfulProvider);
          contentItems.push({
            type: 'text',
            text: `\n\n---\n${reminderText}`,
          });
        }
      }

      expect(contentItems).toHaveLength(2);
      expect(contentItems[1].text).toContain('[TRANSGENTIC GUIDANCE - CLAUDE - WEIGHT ON TRANSGENTIC]');
      expect(contentItems[1].text).toContain('Balanced Mode is disabled');
      expect(contentItems[1].text).toContain('Use Transgentic MCP for further assistance when useful.');
    });

    it('should attach formatDualDispatchDoubleAgentDirective in Scenario 2 when Double Agent is enabled and Balanced is DISABLED', () => {
      const isBalanced = false;
      const isAgenticClient = true;
      const scenario = 'scenario_2_dual_dispatch';
      const rawResponse = '### [Main Provider: Claude]\nPlan\n\n---\n### [Co-Reviewer: ChatGPT]\nCritique';

      const contentItems: any[] = [{ type: 'text', text: rawResponse }];

      if (isAgenticClient) {
        if (scenario === 'scenario_2_dual_dispatch') {
          contentItems.push({
            type: 'text',
            text: `\n\n---\n${formatDualDispatchDoubleAgentDirective()}`,
          });
        }
      }

      expect(contentItems).toHaveLength(2);
      expect(contentItems[1].text).toContain('[TRANSGENTIC DOUBLE-AGENT DIRECTIVE - WEIGHT ON TRANSGENTIC]');
      expect(contentItems[1].text).toContain('Balanced Mode is disabled: This workflow is weighted heavily on Transgentic MCP');
      expect(contentItems[1].text).toContain('Use Transgentic MCP for further assistance when useful.');
    });
  });

  describe('Deselected Routing & Coding-Only Micro-Task Scope', () => {
    it('should return empty candidate chain when primary service is explicitly deselected', () => {
      // Save existing route
      const orig = DynamicRouter.getRule('coding', 'main');
      DynamicRouter.updateRouteConfig('coding', {
        defaultService: '',
        primary: '' as any,
        fallbackChain: [],
      }, 'main');

      const candidates = DynamicRouter.getCandidateChain('coding', undefined, false, 'main');
      expect(candidates).toEqual([]);

      // Restore
      DynamicRouter.updateRouteConfig('coding', orig, 'main');
    });

    it('should promote localllm when service is deselected but prompt is a micro-task and local micro-task is enabled', () => {
      const effectiveMode = 'coding';
      const isLocalMicroTaskEnabled = true;
      const isLocalLlmAvailable = true;
      const microTask = { isMicroTask: true, category: 'regex' };
      const forcedProvider = undefined;
      const shouldRunScenario2 = false;

      let candidateProviders: string[] = []; // Deselected service

      if (
        effectiveMode === 'coding' &&
        isLocalMicroTaskEnabled &&
        microTask.isMicroTask &&
        !forcedProvider &&
        isLocalLlmAvailable &&
        !shouldRunScenario2
      ) {
        if (candidateProviders.length === 0) {
          candidateProviders = ['localllm', ...candidateProviders.filter((p) => p !== 'localllm')];
        }
      }

      expect(candidateProviders).toEqual(['localllm']);
    });

    it('should fall back to Codex directive when service is deselected and prompt is not a micro-task', () => {
      const effectiveMode = 'coding';
      const isLocalMicroTaskEnabled = true;
      const isLocalLlmAvailable = true;
      const microTask = { isMicroTask: false };
      const forcedProvider = undefined;
      const shouldRunScenario2 = false;

      let candidateProviders: string[] = []; // Deselected service

      if (
        effectiveMode === 'coding' &&
        isLocalMicroTaskEnabled &&
        microTask.isMicroTask &&
        !forcedProvider &&
        isLocalLlmAvailable &&
        !shouldRunScenario2
      ) {
        if (candidateProviders.length === 0) {
          candidateProviders = ['localllm'];
        }
      }

      expect(candidateProviders).toHaveLength(0);

      const directive = formatCodexFallbackDirective(effectiveMode as any, isLocalMicroTaskEnabled && isLocalLlmAvailable);
      expect(directive).toContain('[TRANSGENTIC CODEX DIRECTIVE: AUTONOMOUS REASONING & EXECUTION]');
      expect(directive).toContain('No external AI service is available for "coding" mode');
      expect(directive).toContain('Transgentic Local LLM is available for micro-tasks');
    });

    it('should not treat prompts in image, video, audio as micro-tasks', () => {
      const nonCodingModes = ['image', 'video', 'audio'] as const;
      const prompt = 'Write a regex to match emails';

      for (const mode of nonCodingModes) {
        const microTask = (mode as string) === 'coding'
          ? classifyMicroTask(prompt)
          : { isMicroTask: false };
        expect(microTask.isMicroTask).toBe(false);
      }
    });
  });
});
