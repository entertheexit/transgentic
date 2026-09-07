import { describe, it, expect, beforeEach } from 'vitest';
import { DynamicRouter } from '../src/main/mcp/router.js';
import { LocalLLMConfig, TaskMode } from '../src/shared/types.js';

describe('Route Matrix Local LLM Integration Tests', () => {
  const baseLocalLlmConfig: LocalLLMConfig = {
    enabled: true,
    preset: 'ollama',
    baseUrl: 'http://127.0.0.1:11434',
    selectedModel: 'qwen2.5-coder:7b',
    temperature: 0.2,
    contextLength: 8192,
  };

  beforeEach(() => {
    DynamicRouter.resetRoutes();
    DynamicRouter.setLocalLlmConfig(baseLocalLlmConfig);
  });

  describe('Mode Capability Restrictions', () => {
    it('should support general, coding, and writing modes for Local LLM', () => {
      expect(DynamicRouter.isLocalLlmSupportedForMode('general')).toBe(true);
      expect(DynamicRouter.isLocalLlmSupportedForMode('coding')).toBe(true);
      expect(DynamicRouter.isLocalLlmSupportedForMode('writing')).toBe(true);
    });

    it('should strictly prohibit image, video, and audio modes for Local LLM', () => {
      expect(DynamicRouter.isLocalLlmSupportedForMode('image')).toBe(false);
      expect(DynamicRouter.isLocalLlmSupportedForMode('video')).toBe(false);
      expect(DynamicRouter.isLocalLlmSupportedForMode('audio')).toBe(false);
    });
  });

  describe('getCandidateChain with Local LLM', () => {
    it('should include localllm in coding fallbacks when configured and enabled', () => {
      DynamicRouter.updateRouteConfig('coding', {
        primary: 'claude',
        fallbacks: ['chatgpt', 'localllm'],
      });

      const chain = DynamicRouter.getCandidateChain('coding', undefined, false);
      expect(chain).toContain('claude');
      expect(chain).toContain('chatgpt');
      expect(chain).toContain('localllm');
    });

    it('should filter out localllm when localLLM is disabled', () => {
      DynamicRouter.setLocalLlmConfig({
        ...baseLocalLlmConfig,
        enabled: false,
      });

      DynamicRouter.updateRouteConfig('coding', {
        primary: 'claude',
        fallbacks: ['chatgpt', 'localllm'],
      });

      const chain = DynamicRouter.getCandidateChain('coding', undefined, false);
      expect(chain).not.toContain('localllm');
      expect(chain).toContain('claude');
      expect(chain).toContain('chatgpt');
    });

    it('should strictly reject localllm even if explicitly configured in image, video, or audio', () => {
      // Even if user or malformed route includes localllm in image mode:
      DynamicRouter.updateRouteConfig('image', {
        primary: 'grok',
        fallbacks: ['chatgpt', 'localllm'],
      });

      const chain = DynamicRouter.getCandidateChain('image', undefined, false);
      expect(chain).not.toContain('localllm');
    });
  });
});
