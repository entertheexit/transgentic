import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { LocalLlmClient } from '../src/main/localllm/localLlmClient.js';
import { LocalLLMConfig } from '../src/shared/types.js';

describe('LocalLlmClient Unit Tests', () => {
  describe('normalizeBaseUrl', () => {
    it('should prepend http:// if protocol is omitted', () => {
      expect(LocalLlmClient.normalizeBaseUrl('127.0.0.1:11434')).toBe('http://127.0.0.1:11434');
      expect(LocalLlmClient.normalizeBaseUrl('localhost:1234')).toBe('http://localhost:1234');
    });

    it('should strip trailing slashes', () => {
      expect(LocalLlmClient.normalizeBaseUrl('http://127.0.0.1:11434/')).toBe('http://127.0.0.1:11434');
      expect(LocalLlmClient.normalizeBaseUrl('http://127.0.0.1:11434///')).toBe('http://127.0.0.1:11434');
    });

    it('should preserve https:// protocols and custom paths', () => {
      expect(LocalLlmClient.normalizeBaseUrl('https://my-vllm-host.internal:8000/v1')).toBe(
        'https://my-vllm-host.internal:8000/v1'
      );
    });
  });

  describe('fetchModels', () => {
    const originalFetch = global.fetch;

    afterEach(() => {
      global.fetch = originalFetch;
    });

    it('should fetch model tags from Ollama runtime via GET /api/tags', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          models: [
            { name: 'qwen2.5-coder:7b' },
            { name: 'deepseek-coder:6.7b' },
            { name: 'llama3:8b' },
          ],
        }),
      } as any);

      const models = await LocalLlmClient.fetchModels('http://127.0.0.1:11434', 'ollama');
      expect(models).toEqual(['qwen2.5-coder:7b', 'deepseek-coder:6.7b', 'llama3:8b']);
      expect(global.fetch).toHaveBeenCalledWith(
        'http://127.0.0.1:11434/api/tags',
        expect.objectContaining({ signal: expect.anything() })
      );
    });

    it('should fetch models from LM Studio / OpenAI-compatible runtime via GET /v1/models', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          data: [
            { id: 'meta-llama-3-8b-instruct' },
            { id: 'mistral-7b-instruct-v0.3' },
          ],
        }),
      } as any);

      const models = await LocalLlmClient.fetchModels('http://127.0.0.1:1234', 'lmstudio');
      expect(models).toEqual(['meta-llama-3-8b-instruct', 'mistral-7b-instruct-v0.3']);
      expect(global.fetch).toHaveBeenCalledWith(
        'http://127.0.0.1:1234/v1/models',
        expect.objectContaining({ signal: expect.anything() })
      );
    });
  });

  describe('testConnection', () => {
    const originalFetch = global.fetch;

    afterEach(() => {
      global.fetch = originalFetch;
    });

    it('should report successful connection and latency badge calculation', async () => {
      global.fetch = vi.fn().mockImplementation(async () => {
        // simulate small network latency
        await new Promise((resolve) => setTimeout(resolve, 20));
        return {
          ok: true,
          json: async () => ({
            choices: [{ message: { content: 'OK' } }],
          }),
        } as any;
      });

      const config: LocalLLMConfig = {
        enabled: true,
        preset: 'ollama',
        baseUrl: 'http://127.0.0.1:11434',
        selectedModel: 'qwen2.5-coder:7b',
        temperature: 0.2,
        contextLength: 8192,
      };

      const result = await LocalLlmClient.testConnection(config);
      expect(result.success).toBe(true);
      expect(result.latencyMs).toBeGreaterThanOrEqual(10);
      expect(result.message).toContain('Connected successfully');
    });

    it('should report failure when endpoint is unreachable', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('Connection refused'));

      const config: LocalLLMConfig = {
        enabled: true,
        preset: 'custom',
        baseUrl: 'http://127.0.0.1:9999',
        selectedModel: 'custom-model',
        temperature: 0.2,
        contextLength: 8192,
      };

      const result = await LocalLlmClient.testConnection(config);
      expect(result.success).toBe(false);
      expect(result.message).toContain('Connection refused');
    });
  });

  describe('generateCompletion', () => {
    const originalFetch = global.fetch;

    afterEach(() => {
      global.fetch = originalFetch;
    });

    it('should execute completion via OpenAI chat format successfully', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: 'def solve(): return 42',
              },
            },
          ],
        }),
      } as any);

      const config: LocalLLMConfig = {
        enabled: true,
        preset: 'ollama',
        baseUrl: 'http://127.0.0.1:11434',
        selectedModel: 'qwen2.5-coder:7b',
        temperature: 0.2,
        contextLength: 8192,
      };

      const res = await LocalLlmClient.generateCompletion('Write code', config);
      expect(res.text).toBe('def solve(): return 42');
    });

    it('should capture exact error message from LM Studio when request fails', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        text: async () => JSON.stringify({ error: { message: 'No model loaded in LM Studio.' } }),
      } as any);

      const config: LocalLLMConfig = {
        enabled: true,
        preset: 'lmstudio',
        baseUrl: 'http://127.0.0.1:1234',
        selectedModel: 'test-model',
      };

      await expect(LocalLlmClient.generateCompletion('Hi', config)).rejects.toThrow(
        'LM Studio error: No model loaded in LM Studio.'
      );
    });

    it('should auto-discover active model if selectedModel is empty', async () => {
      global.fetch = vi.fn().mockImplementation(async (url: string) => {
        if (url.endsWith('/v1/models')) {
          return {
            ok: true,
            json: async () => ({ data: [{ id: 'auto-loaded-llama3' }] }),
          };
        }
        return {
          ok: true,
          json: async () => ({
            choices: [{ message: { content: 'Auto discovered response' } }],
          }),
        };
      });

      const config: LocalLLMConfig = {
        enabled: true,
        preset: 'lmstudio',
        baseUrl: 'http://127.0.0.1:1234',
        selectedModel: '',
      };

      const res = await LocalLlmClient.generateCompletion('Hello', config);
      expect(res.text).toBe('Auto discovered response');
    });
  });
});
