import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  determineDispatchScenario,
  formatBalancedDoubleAgentDirective,
  formatDualDispatchDoubleAgentDirective,
  formatDualPerspectiveResponse,
  executeConcurrentDualDispatch,
  getProviderDisplayName,
} from '../src/main/mcp/dispatchPipeline.js';
import { DynamicRouter } from '../src/main/mcp/router.js';
import { TransgenticConfig, RouteMatrix, ProviderId } from '../src/shared/types.js';

// Routing assertions must not rewrite the developer's persisted route file.
beforeEach(() => { vi.spyOn(DynamicRouter, 'savePersistedRoutes').mockImplementation(() => {}); });
afterEach(() => { vi.restoreAllMocks(); });

describe('Double Agent Dispatch & Dual Pipeline Routing', () => {
  describe('Dispatch Scenario Determination', () => {
    it('should determine Scenario 1 when doubleAgent is enabled and balancedMode is active', () => {
      const config: TransgenticConfig = {
        port: 58420,
        defaultMode: 'coding',
        interMessageCooldownMs: 6000,
        textJitterMinMs: 3000,
        textJitterMaxMs: 8000,
        mediaJitterMinMs: 12000,
        mediaJitterMaxMs: 25000,
        autoFallbackEnabled: true,
        dataBlindingEnabled: true,
        assetsDir: '',
        balancedMode: true,
        doubleAgent: {
          enabled: true,
          includeLocalLlm: false,
        },
      };

      const scenario = determineDispatchScenario(config);
      expect(scenario).toBe('scenario_1_balanced_double');
    });

    it('should fallback to coding.balancedMode if top-level balancedMode is not set', () => {
      const config: TransgenticConfig = {
        port: 58420,
        defaultMode: 'coding',
        interMessageCooldownMs: 6000,
        textJitterMinMs: 3000,
        textJitterMaxMs: 8000,
        mediaJitterMinMs: 12000,
        mediaJitterMaxMs: 25000,
        autoFallbackEnabled: true,
        dataBlindingEnabled: true,
        assetsDir: '',
        coding: {
          balancedMode: true,
          primaryProvider: 'claude',
          fallbackProviders: ['chatgpt'],
        },
        doubleAgent: {
          enabled: true,
          includeLocalLlm: false,
        },
      };

      const scenario = determineDispatchScenario(config);
      expect(scenario).toBe('scenario_1_balanced_double');
    });

    it('should determine Scenario 2 when doubleAgent is enabled and balancedMode is false', () => {
      const config: TransgenticConfig = {
        port: 58420,
        defaultMode: 'coding',
        interMessageCooldownMs: 6000,
        textJitterMinMs: 3000,
        textJitterMaxMs: 8000,
        mediaJitterMinMs: 12000,
        mediaJitterMaxMs: 25000,
        autoFallbackEnabled: true,
        dataBlindingEnabled: true,
        assetsDir: '',
        balancedMode: false,
        doubleAgent: {
          enabled: true,
          includeLocalLlm: false,
        },
      };

      const scenario = determineDispatchScenario(config);
      expect(scenario).toBe('scenario_2_dual_dispatch');
    });

    it('should return standard_balanced when doubleAgent is disabled but balancedMode is true', () => {
      const config: TransgenticConfig = {
        port: 58420,
        defaultMode: 'coding',
        interMessageCooldownMs: 6000,
        textJitterMinMs: 3000,
        textJitterMaxMs: 8000,
        mediaJitterMinMs: 12000,
        mediaJitterMaxMs: 25000,
        autoFallbackEnabled: true,
        dataBlindingEnabled: true,
        assetsDir: '',
        balancedMode: true,
        doubleAgent: {
          enabled: false,
          includeLocalLlm: false,
        },
      };

      const scenario = determineDispatchScenario(config);
      expect(scenario).toBe('standard_balanced');
    });

    it('should return standard_single when doubleAgent is disabled and balancedMode is false', () => {
      const config: TransgenticConfig = {
        port: 58420,
        defaultMode: 'coding',
        interMessageCooldownMs: 6000,
        textJitterMinMs: 3000,
        textJitterMaxMs: 8000,
        mediaJitterMinMs: 12000,
        mediaJitterMaxMs: 25000,
        autoFallbackEnabled: true,
        dataBlindingEnabled: true,
        assetsDir: '',
        balancedMode: false,
        doubleAgent: {
          enabled: false,
          includeLocalLlm: false,
        },
      };

      const scenario = determineDispatchScenario(config);
      expect(scenario).toBe('standard_single');
    });

    it('should bypass Double Agent when mode is disabled in doubleAgent.modes', () => {
      const config: TransgenticConfig = {
        port: 58420,
        defaultMode: 'coding',
        interMessageCooldownMs: 6000,
        textJitterMinMs: 3000,
        textJitterMaxMs: 8000,
        mediaJitterMinMs: 12000,
        mediaJitterMaxMs: 25000,
        autoFallbackEnabled: true,
        dataBlindingEnabled: true,
        assetsDir: '',
        balancedMode: false,
        doubleAgent: {
          enabled: true,
          includeLocalLlm: false,
          modes: {
            general: true,
            coding: false,
            image: true,
            video: true,
            music: true,
          },
        },
      };

      // In coding mode, Double Agent is disabled -> standard_single
      const codingScenario = determineDispatchScenario(config, undefined, 'coding');
      expect(codingScenario).toBe('standard_single');

      // Writing retains its backend mode but uses General's Double Agent setting.
      const generalScenario = determineDispatchScenario(config, undefined, 'general');
      expect(generalScenario).toBe('scenario_2_dual_dispatch');
      expect(determineDispatchScenario(config, undefined, 'writing')).toBe(generalScenario);

      // In balanced mode with coding disabled -> standard_balanced
      config.balancedMode = true;
      const balancedCodingScenario = determineDispatchScenario(config, undefined, 'coding');
      expect(balancedCodingScenario).toBe('standard_balanced');

      const balancedGeneralScenario = determineDispatchScenario(config, undefined, 'general');
      expect(balancedGeneralScenario).toBe('scenario_1_balanced_double');
      expect(determineDispatchScenario(config, undefined, 'writing')).toBe(balancedGeneralScenario);
    });
  });

  describe('Scenario 1: Balanced Double-Agent Directive Injection', () => {
    it('should format strict cross-examination directive aligned with Transgentic MCP strategy', () => {
      const directive = formatBalancedDoubleAgentDirective();
      expect(directive).toContain('[TRANSGENTIC BALANCED Double-Agent DIRECTIVE]');
      expect(directive).toContain('cross-examine the above output from Transgentic');
      expect(directive).toContain('blind spots');
      expect(directive).toContain('use Transgentic MCP');
    });
  });

  describe('Scenario 2: Concurrent Dual Dispatch & Merged Perspective Format', () => {
    it('should format Scenario 2 dual-agent directive reminding client to mention "use Transgentic MCP" every time', () => {
      const directive = formatDualDispatchDoubleAgentDirective();
      expect(directive).toContain('[TRANSGENTIC DOUBLE-AGENT DIRECTIVE - WEIGHT ON TRANSGENTIC]');
      expect(directive).toContain('Balanced Mode is disabled: This workflow is weighted heavily on Transgentic MCP');
      expect(directive).toContain('Use Transgentic MCP for further assistance when useful.');
    });

    it('should format both successful perspectives side-by-side in Markdown', () => {
      const formatted = formatDualPerspectiveResponse(
        { text: 'Main reasoning here', provider: 'claude', model: 'claude-3-5-sonnet' },
        { text: 'Co-agent review here', provider: 'chatgpt', model: 'gpt-4o' }
      );

      expect(formatted).toContain('### [Main Provider: Claude (claude-3-5-sonnet)]');
      expect(formatted).toContain('Main reasoning here');
      expect(formatted).toContain('### [Co-Reviewer: ChatGPT (gpt-4o)]');
      expect(formatted).toContain('Co-agent review here');
    });

    it('should handle partial failure gracefully when Co provider fails', () => {
      const formatted = formatDualPerspectiveResponse(
        { text: 'Primary analysis succeeded.', provider: 'claude', model: 'claude-3-5-sonnet' },
        null,
        undefined,
        'Co-Reviewer provider rate-limited or timed out.'
      );

      expect(formatted).toContain('### [Main Provider: Claude (claude-3-5-sonnet)]');
      expect(formatted).toContain('Primary analysis succeeded.');
      expect(formatted).toContain('### [Co-Reviewer]');
      expect(formatted).toContain('Co-Reviewer provider rate-limited or timed out.');
    });

    it('should handle partial failure gracefully when Main provider fails', () => {
      const formatted = formatDualPerspectiveResponse(
        null,
        { text: 'Co-reviewer completed evaluation.', provider: 'chatgpt', model: 'gpt-4o' },
        'Main Provider failed.',
        undefined
      );

      expect(formatted).toContain('### [Main Provider]');
      expect(formatted).toContain('Main Provider failed.');
      expect(formatted).toContain('### [Co-Reviewer: ChatGPT (gpt-4o)]');
      expect(formatted).toContain('Co-reviewer completed evaluation.');
    });

    it('should throw an error when both Main and Co fail', () => {
      expect(() => {
        formatDualPerspectiveResponse(
          null,
          null,
          'Main provider disconnected',
          'Co provider unreachable'
        );
      }).toThrow('Both Main and Co-Agent pipelines failed');
    });

    it('should execute concurrent dual dispatch via Promise.allSettled with resiliency', async () => {
      const mainExecutor = async () => {
        return { text: 'Main pipeline output', provider: 'claude' as ProviderId, model: 'claude-3-5-sonnet' };
      };

      const coExecutor = async () => {
        return { text: 'Co pipeline critique', provider: 'chatgpt' as ProviderId, model: 'gpt-4o' };
      };

      const result = await executeConcurrentDualDispatch(mainExecutor, coExecutor, 'claude', 'chatgpt');
      expect(result.text).toContain('### [Main Provider: Claude (claude-3-5-sonnet)]');
      expect(result.text).toContain('Main pipeline output');
      expect(result.text).toContain('### [Co-Reviewer: ChatGPT (gpt-4o)]');
      expect(result.text).toContain('Co pipeline critique');
      expect(result.mainResult?.provider).toBe('claude');
      expect(result.coResult?.provider).toBe('chatgpt');
    });

    it('should execute concurrent dual dispatch with partial failure resiliency when one executor rejects', async () => {
      const mainExecutor = async () => {
        return { text: 'Main pipeline output', provider: 'claude' as ProviderId, model: 'claude-3-5-sonnet' };
      };

      const coExecutor = async () => {
        throw new Error('Connection refused on Co provider');
      };

      const result = await executeConcurrentDualDispatch(mainExecutor, coExecutor, 'claude', 'chatgpt');
      expect(result.text).toContain('### [Main Provider: Claude (claude-3-5-sonnet)]');
      expect(result.text).toContain('Main pipeline output');
      expect(result.text).toContain('### [Co-Reviewer]');
      expect(result.text).toContain('Connection refused on Co provider');
      expect(result.mainResult?.text).toBe('Main pipeline output');
      expect(result.coResult).toBeNull();
    });
  });

  describe('DynamicRouter Dual Pipeline Matrix & Mutual Exclusion', () => {
    beforeEach(() => {
      DynamicRouter.resetRoutes();
    });

    it('should provide separate Main and Co route matrices', () => {
      const matrix = DynamicRouter.getRouteMatrix();
      expect(matrix).toHaveProperty('main');
      expect(matrix).toHaveProperty('co');
      expect(matrix.main.coding.defaultService).toBe('claude');
      expect(matrix.co.coding.defaultService).not.toBe(matrix.main.coding.defaultService);
    });

    it('should enforce mutual exclusion between Main and Co primaries', () => {
      const matrix = DynamicRouter.getRouteMatrix();
      const modes = ['general', 'coding', 'image', 'video', 'music'] as const;
      for (const mode of modes) {
        const mainService = matrix.main[mode].defaultService;
        const coService = matrix.co[mode].defaultService;
        expect(mainService).not.toBe(coService);
      }
    });

    it('should automatically resolve conflict when updating Main primary to Co primary', () => {
      // Current coding: main is claude, co is chatgpt
      const initialMatrix = DynamicRouter.getRouteMatrix();
      expect(initialMatrix.main.coding.defaultService).toBe('claude');
      expect(initialMatrix.co.coding.defaultService).toBe('chatgpt');

      // Update Main coding primary to chatgpt
      DynamicRouter.updateRouteConfig('coding', { primary: 'chatgpt' }, 'main');

      const updatedMatrix = DynamicRouter.getRouteMatrix();
      expect(updatedMatrix.main.coding.defaultService).toBe('chatgpt');
      // Co primary must NOT be chatgpt now
      expect(updatedMatrix.co.coding.defaultService).not.toBe('chatgpt');
    });

    it('should prevent Co primary from matching Main primary when updating Co', () => {
      // Main coding is claude
      const matrix = DynamicRouter.getRouteMatrix();
      const mainPrimary = matrix.main.coding.defaultService; // claude

      // Attempt to set Co coding primary to claude
      DynamicRouter.updateRouteConfig('coding', { primary: mainPrimary as ProviderId }, 'co');

      const updatedMatrix = DynamicRouter.getRouteMatrix();
      expect(updatedMatrix.co.coding.defaultService).not.toBe(mainPrimary);
    });

    it('should disallow Local LLM in media modes (image, video, music)', () => {
      DynamicRouter.setLocalLlmConfig({
        enabled: true,
        preset: 'ollama',
        baseUrl: 'http://127.0.0.1:11434',
        selectedModel: 'llama3:latest',
        temperature: 0.2,
        contextLength: 8192,
      });

      // Try setting image primary to localllm in main
      DynamicRouter.updateRouteConfig('image', { primary: 'localllm' as ProviderId }, 'main');
      const matrix = DynamicRouter.getRouteMatrix();
      expect(matrix.main.image.defaultService).not.toBe('localllm');

      // Check candidate chain for image
      const chain = DynamicRouter.getCandidateChain('image', undefined, false, 'main');
      expect(chain).not.toContain('localllm');
    });

    it('should include Local LLM in candidate chain for text/coding only when enabled and includeLocalLlm is true', () => {
      DynamicRouter.setLocalLlmConfig({
        enabled: true,
        preset: 'ollama',
        baseUrl: 'http://127.0.0.1:11434',
        selectedModel: 'llama3:latest',
        temperature: 0.2,
        contextLength: 8192,
      });

      // When includeLocalLlm is false
      const chainWithoutLocal = DynamicRouter.getCandidateChain('coding', undefined, false, 'co', false);
      expect(chainWithoutLocal).not.toContain('localllm');

      // When includeLocalLlm is true
      const chainWithLocal = DynamicRouter.getCandidateChain('coding', undefined, false, 'co', true);
      expect(chainWithLocal).toContain('localllm');
    });
  });
});
