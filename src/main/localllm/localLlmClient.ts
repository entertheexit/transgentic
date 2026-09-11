import { LocalLLMConfig } from '../../shared/types.js';
import fs from 'node:fs';
import type { StagedAttachment } from '../../shared/attachments.js';

export class LocalLlmClient {
  public static normalizeBaseUrl(baseUrl: string): string {
    let url = (baseUrl || '').trim();
    if (!url) return 'http://127.0.0.1:11434';
    if (!/^https?:\/\//i.test(url)) {
      url = `http://${url}`;
    }
    return url.replace(/\/+$/, '');
  }

  /**
   * Dynamically queries the local runtime endpoint and discovers installed model weights.
   */
  public static async fetchModels(
    baseUrl: string,
    preset: 'ollama' | 'lmstudio' | 'custom' = 'ollama'
  ): Promise<string[]> {
    const normUrl = this.normalizeBaseUrl(baseUrl);
    const models: string[] = [];

    if (preset === 'ollama') {
      // 1. Try Ollama native GET /api/tags
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 4000);
        const res = await fetch(`${normUrl}/api/tags`, {
          signal: controller.signal,
          headers: { Accept: 'application/json' },
        });
        clearTimeout(timeout);

        if (res.ok) {
          const data: any = await res.json();
          if (Array.isArray(data.models)) {
            for (const m of data.models) {
              if (m?.name) models.push(m.name);
            }
          }
          if (models.length > 0) {
            return models;
          }
        }
      } catch {}
    }

    // 2. Try standard OpenAI-compatible GET /v1/models (LM Studio, vLLM, Ollama v1, Llama.cpp)
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 4000);
      const res = await fetch(`${normUrl}/v1/models`, {
        signal: controller.signal,
        headers: { Accept: 'application/json' },
      });
      clearTimeout(timeout);

      if (res.ok) {
        const data: any = await res.json();
        if (Array.isArray(data.data)) {
          for (const m of data.data) {
            if (m?.id) models.push(m.id);
          }
        } else if (Array.isArray(data.models)) {
          for (const m of data.models) {
            const name = m.name || m.id;
            if (name) models.push(name);
          }
        }
      }
    } catch (err: any) {
      if (models.length === 0) {
        throw new Error(
          `Failed to discover models from ${normUrl}: ${err?.message || 'Connection refused or timed out'}`
        );
      }
    }

    return models;
  }

  /**
   * Lightweight connection test running a 1-token generation test with live latency badge (ms).
   */
  public static async testConnection(
    config: LocalLLMConfig
  ): Promise<{ success: boolean; latencyMs: number; message?: string }> {
    const normUrl = this.normalizeBaseUrl(config.baseUrl);
    const startTime = Date.now();

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);

      // Attempt /v1/chat/completions (supported by Ollama, LM Studio, vLLM, llama.cpp)
      const chatBody: any = {
        model: config.selectedModel || 'default',
        messages: [{ role: 'user', content: 'Ping' }],
        max_tokens: 1,
        temperature: 0.1,
      };

      const res = await fetch(`${normUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(chatBody),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      const latencyMs = Date.now() - startTime;

      if (res.ok) {
        return {
          success: true,
          latencyMs,
          message: `Connected successfully (${latencyMs}ms)`,
        };
      }

      // If Ollama returned an error or 404, attempt native /api/generate
      if (config.preset === 'ollama') {
        const nativeController = new AbortController();
        const nativeTimeout = setTimeout(() => nativeController.abort(), 8000);
        const nativeRes = await fetch(`${normUrl}/api/generate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: config.selectedModel || 'default',
            prompt: 'Ping',
            stream: false,
            options: { num_predict: 1 },
          }),
          signal: nativeController.signal,
        });
        clearTimeout(nativeTimeout);

        const nativeLatency = Date.now() - startTime;
        if (nativeRes.ok) {
          return {
            success: true,
            latencyMs: nativeLatency,
            message: `Connected via Ollama API (${nativeLatency}ms)`,
          };
        }
      }

      const errorText = await res.text();
      return {
        success: false,
        latencyMs,
        message: `Endpoint returned HTTP ${res.status}: ${errorText.slice(0, 120)}`,
      };
    } catch (err: any) {
      const latencyMs = Date.now() - startTime;
      return {
        success: false,
        latencyMs,
        message: err?.message || 'Connection error or timed out',
      };
    }
  }

  /**
   * Generates a completion using the configured Local LLM runtime.
   */
  public static async generateCompletion(
    promptOrMessages: string | Array<{ role: string; content: string }>,
    config: LocalLLMConfig,
    options?: { temperature?: number; maxTokens?: number; abortSignal?: AbortSignal; attachments?: readonly StagedAttachment[] }
  ): Promise<{ text: string }> {
    const normUrl = this.normalizeBaseUrl(config.baseUrl);

    let messages: Array<{ role: string; content: any }> =
      typeof promptOrMessages === 'string'
        ? [{ role: 'user', content: promptOrMessages }]
        : Array.isArray(promptOrMessages) && promptOrMessages.length > 0
        ? promptOrMessages
        : [{ role: 'user', content: String(promptOrMessages || '') }];

    const encodedAttachments = await Promise.all((options?.attachments || []).map(async file => ({ ...file, base64: (await fs.promises.readFile(file.path)).toString('base64') })));
    if (encodedAttachments.length) {
      const lastUser = [...messages].reverse().find(message => message.role === 'user');
      if (lastUser) lastUser.content = [
        { type: 'text', text: String(lastUser.content || '') },
        ...encodedAttachments.map(file => file.kind === 'image'
          ? { type: 'image_url', image_url: { url: `data:${file.mimeType};base64,${file.base64}` } }
          : { type: 'file', file: { filename: file.name, file_data: `data:${file.mimeType};base64,${file.base64}` } }),
      ];
    }

    let targetModel = config.selectedModel;
    if (!targetModel || targetModel === 'default') {
      try {
        const discovered = await this.fetchModels(normUrl, config.preset);
        if (discovered.length > 0) {
          targetModel = discovered[0];
        }
      } catch {}
    }

    // 1. Try standard OpenAI-compatible /v1/chat/completions
    const controller = new AbortController();
    const onAbort = () => controller.abort();
    if (options?.abortSignal) {
      if (options.abortSignal.aborted) {
        throw new Error('Terminated by user');
      }
      options.abortSignal.addEventListener('abort', onAbort);
    }
    const timeout = setTimeout(() => controller.abort(), 120000); // 2-minute budget for local models

    try {
      const body: any = {
        model: targetModel || 'default',
        messages,
        temperature: options?.temperature ?? config.temperature ?? 0.2,
      };
      if (options?.maxTokens) {
        body.max_tokens = options.maxTokens;
      }

      const res = await fetch(`${normUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (res.ok) {
        const data: any = await res.json();
        const choice = data.choices?.[0];
        const content =
          choice?.message?.content ||
          choice?.message?.reasoning_content ||
          choice?.message?.thought ||
          choice?.message?.reasoning ||
          choice?.text ||
          data.content ||
          data.response ||
          '';
        const finalText = content.trim();
        return { text: finalText || '(Empty response returned by local model)' };
      } else {
        const errText = await res.text();
        let errMsg = `HTTP ${res.status}`;
        try {
          const parsed = JSON.parse(errText);
          if (parsed?.error?.message) {
            errMsg = parsed.error.message;
          }
        } catch {
          if (errText) errMsg = errText.slice(0, 180);
        }
        throw new Error(`${config.preset === 'lmstudio' ? 'LM Studio' : 'Local LLM'} error: ${errMsg}`);
      }
    } catch (err: any) {
      if (options?.abortSignal?.aborted) {
        throw new Error('Terminated by user');
      }
      if (err.name === 'AbortError') {
        throw new Error(`Local LLM request timed out or was closed by host on ${normUrl}`);
      }
      if (config.preset !== 'ollama') {
        const runtimeName = config.preset === 'lmstudio' ? 'LM Studio' : 'Custom Local LLM';
        throw new Error(`${runtimeName} execution failed on ${normUrl}: ${err?.message || err}`);
      }
      if (encodedAttachments.some(file => file.kind !== 'image')) throw new Error('Ollama native fallback supports image attachments only; the OpenAI-compatible endpoint rejected the document input.');
    } finally {
      clearTimeout(timeout);
      if (options?.abortSignal) {
        options.abortSignal.removeEventListener('abort', onAbort);
      }
    }

    // 2. Ollama native fallback (/api/chat and /api/generate)
    if (config.preset === 'ollama') {
      const ollamaController = new AbortController();
      const onOllamaAbort = () => ollamaController.abort();
      if (options?.abortSignal) {
        if (options.abortSignal.aborted) {
          throw new Error('Terminated by user');
        }
        options.abortSignal.addEventListener('abort', onOllamaAbort);
      }
      const ollamaTimeout = setTimeout(() => ollamaController.abort(), 120000);

      try {
        // Try /api/chat with full multi-turn messages
        const ollamaMessages = messages.map(message => Array.isArray(message.content)
          ? { role: message.role, content: String(message.content.find((part: any) => part?.type === 'text')?.text || ''), ...(message.role === 'user' && encodedAttachments.length ? { images: encodedAttachments.map(file => file.base64) } : {}) }
          : message);
        const chatRes = await fetch(`${normUrl}/api/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: config.selectedModel,
            messages: ollamaMessages,
            stream: false,
            options: {
              temperature: options?.temperature ?? config.temperature ?? 0.2,
              num_predict: options?.maxTokens ?? -1,
            },
          }),
          signal: ollamaController.signal,
        });

        if (chatRes.ok) {
          const data: any = await chatRes.json();
          const content = data.message?.content || data.response || '';
          return { text: content.trim() || '(Empty response returned by local model)' };
        }

        // If /api/chat fails (e.g. older Ollama), fallback to /api/generate
        const lastUserPrompt = ollamaMessages.filter((m) => m.role === 'user').pop()?.content || '';
        const genRes = await fetch(`${normUrl}/api/generate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: config.selectedModel,
            prompt: lastUserPrompt,
            ...(encodedAttachments.length ? { images: encodedAttachments.map(file => file.base64) } : {}),
            stream: false,
            options: {
              temperature: options?.temperature ?? config.temperature ?? 0.2,
              num_predict: options?.maxTokens ?? -1,
            },
          }),
          signal: ollamaController.signal,
        });

        if (genRes.ok) {
          const data: any = await genRes.json();
          return { text: (data.response || '').trim() || '(Empty response returned by local model)' };
        }
        const errText = await genRes.text();
        throw new Error(`Ollama returned HTTP ${genRes.status}: ${errText}`);
      } catch (err: any) {
        if (options?.abortSignal?.aborted) {
          throw new Error('Terminated by user');
        }
        if (err.name === 'AbortError') {
          throw new Error(`Local LLM (Ollama) request timed out on ${normUrl}`);
        }
        throw new Error(`Local LLM (Ollama) execution failed: ${err?.message || err}`);
      } finally {
        clearTimeout(ollamaTimeout);
        if (options?.abortSignal) {
          options.abortSignal.removeEventListener('abort', onOllamaAbort);
        }
      }
    }

    throw new Error(`Local LLM failed to respond on ${normUrl}`);
  }
}
