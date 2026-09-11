import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HealingManager } from '../src/main/healing/healingManager.js';
import { TransgenticConfig, ProviderId } from '../src/shared/types.js';

describe('Coding-Pipeline Aligned Self-Healing Engine Tests', () => {
  let healingManager: HealingManager;

  const mockConfig: TransgenticConfig = {
    port: 58420,
    defaultMode: 'general',
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
      fallbackProviders: ['chatgpt', 'gemini', 'grok'],
    },
    localLLM: {
      enabled: true,
      preset: 'ollama',
      baseUrl: 'http://127.0.0.1:11434',
      selectedModel: 'qwen2.5-coder:7b',
      temperature: 0.2,
      contextLength: 8192,
    },
    healing: {
      autoHealingEnabled: true,
      checkIntervalMinutes: 60,
      checkOnPageLoad: true,
      checkModelSelector: true,
    },
  };

  beforeEach(() => {
    healingManager = new HealingManager();
    healingManager.setTransgenticConfig(mockConfig);
  });

  describe('deriveHealingSequence', () => {
    it('should route DOM healing EXCLUSIVELY to Local LLM (offline safe)', () => {
      const sequence = healingManager.deriveHealingSequence('gemini');

      // Only Local LLM is allowed for DOM healing (to prevent cloud AI policy refusals)
      expect(sequence).toEqual(['localllm']);
      expect(sequence).not.toContain('claude');
      expect(sequence).not.toContain('chatgpt');
      expect(sequence).not.toContain('grok');
      expect(sequence).not.toContain('gemini');
    });

    it('should return empty sequence if localLLM is disabled', () => {
      const disabledConfig: TransgenticConfig = {
        ...mockConfig,
        localLLM: {
          ...mockConfig.localLLM!,
          enabled: false,
        },
      };

      healingManager.setTransgenticConfig(disabledConfig);
      const sequence = healingManager.deriveHealingSequence('chatgpt');

      expect(sequence).toEqual([]);
    });

    it('should reject healProvider if localLLM is disabled', async () => {
      const disabledConfig: TransgenticConfig = {
        ...mockConfig,
        localLLM: {
          ...mockConfig.localLLM!,
          enabled: false,
        },
      };

      healingManager.setTransgenticConfig(disabledConfig);
      const result = await healingManager.healProvider('chatgpt');

      expect(result.success).toBe(false);
      expect(result.error).toContain('DOM Self-Healing requires Local LLM');
    });
  });

  describe('customSelectors management', () => {
    it('should store and retrieve verified selectors', () => {
      healingManager.saveRepairedSelector('chatgpt', 'inputPrompt', 'textarea#custom-prompt-input');

      const custom = healingManager.getCustomSelectors('chatgpt');
      expect(custom).toBeDefined();
      expect(custom?.inputPrompt).toBe('textarea#custom-prompt-input');
    });
  });
});
