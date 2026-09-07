import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LocalCompactManager, globalLocalCompactManager } from '../src/main/localllm/localCompact.js';
import { LocalLlmClient } from '../src/main/localllm/localLlmClient.js';
import { LocalLLMConfig } from '../src/shared/types.js';

describe('Local Compact Unit Tests', () => {
  let manager: LocalCompactManager;
  const baseConfig: LocalLLMConfig = {
    enabled: true,
    preset: 'ollama',
    baseUrl: 'http://127.0.0.1:11434',
    selectedModel: 'qwen2.5-coder:7b',
    temperature: 0.2,
    contextLength: 8192,
    localCompact: true,
    compactThresholdChars: 4000,
  };

  beforeEach(() => {
    manager = new LocalCompactManager();
    vi.restoreAllMocks();
  });

  describe('Compaction Qualification Check (shouldCompact)', () => {
    it('should return false if Local LLM is disabled', () => {
      const config = { ...baseConfig, enabled: false };
      const longPrompt = 'a'.repeat(5000);
      expect(manager.shouldCompact(longPrompt, config)).toBe(false);
    });

    it('should return false if localCompact is disabled', () => {
      const config = { ...baseConfig, localCompact: false };
      const longPrompt = 'a'.repeat(5000);
      expect(manager.shouldCompact(longPrompt, config)).toBe(false);
    });

    it('should return false if prompt is under the 4000 character threshold', () => {
      const shortPrompt = 'a'.repeat(2500);
      expect(manager.shouldCompact(shortPrompt, baseConfig)).toBe(false);
    });

    it('should return true if prompt exceeds character threshold and localCompact is enabled', () => {
      const longPrompt = 'a'.repeat(4500);
      expect(manager.shouldCompact(longPrompt, baseConfig)).toBe(true);
    });

    it('should respect custom compactThresholdChars if specified', () => {
      const customConfig = { ...baseConfig, compactThresholdChars: 2000 };
      expect(manager.shouldCompact('a'.repeat(1500), customConfig)).toBe(false);
      expect(manager.shouldCompact('a'.repeat(2500), customConfig)).toBe(true);
    });
  });

  describe('Context Distillation of Markdown Code Fences', () => {
    it('should invoke LocalLlmClient with distillation directive and replace bloated code fence', async () => {
      const bloatedCode = `
// 1000 lines of boilerplate comments and unused imports
import React from 'react';
import { useEffect, useState } from 'react';
// lots of filler comments
${'// comment filler line\n'.repeat(200)}
export interface UserProfile {
  id: string;
  name: string;
  role: string;
}

export function getUserRole(user: UserProfile): string {
  return user.role;
}
`;
      const prompt = `Please review this user service logic:\n\`\`\`typescript\n${bloatedCode}\n\`\`\`\nPlease optimize the role check.`;
      expect(prompt.length).toBeGreaterThan(4000);

      const distilledSnippet = `export interface UserProfile { id: string; role: string; }\nexport function getUserRole(user: UserProfile): string { return user.role; }`;

      let capturedPrompt = '';
      vi.spyOn(LocalLlmClient, 'generateCompletion').mockImplementation(async (promptArg: any) => {
        capturedPrompt = typeof promptArg === 'string' ? promptArg : promptArg[0]?.content;
        return { text: distilledSnippet };
      });

      const result = await manager.compactPrompt(prompt, baseConfig);

      expect(result.wasCompacted).toBe(true);
      expect(result.distilledChars).toBeLessThan(result.originalChars);
      expect(result.compactedText).toContain(distilledSnippet);
      expect(result.compactedText).not.toContain('// comment filler line');

      // Verify directive content in prompt sent to Local LLM
      expect(capturedPrompt).toContain('[TASK: CONTEXT DISTILLATION]');
      expect(capturedPrompt).toContain('Extract ONLY essential type definitions, interface signatures, function headers, and core logic blocks');
      expect(capturedPrompt).toContain('[OBJECTIVE]');
      expect(capturedPrompt).toContain('[RAW CODE CONTEXT]');
    });
  });

  describe('Context Distillation of Unfenced Code / Diffs', () => {
    it('should distill unfenced diff/code when exceeding threshold', async () => {
      const diffHeader = 'Fix database timeout in backend pool';
      const rawDiff = `
diff --git a/src/db/pool.ts b/src/db/pool.ts
--- a/src/db/pool.ts
+++ b/src/db/pool.ts
${'// diff lines filler\n'.repeat(220)}
+ timeoutMs: 5000
`;
      const prompt = `${diffHeader}\n\n${rawDiff}`;
      expect(prompt.length).toBeGreaterThan(4000);

      const distilledDiff = `// Distilled diff:\n+ timeoutMs: 5000`;
      vi.spyOn(LocalLlmClient, 'generateCompletion').mockResolvedValue({
        text: distilledDiff,
      });

      const result = await manager.compactPrompt(prompt, baseConfig);

      expect(result.wasCompacted).toBe(true);
      expect(result.compactedText).toContain(diffHeader);
      expect(result.compactedText).toContain(distilledDiff);
      expect(result.compactedText).not.toContain('// diff lines filler');
    });
  });

  describe('Resilience and Graceful Fallback', () => {
    it('should fallback to original prompt without throwing if Local LLM throws error', async () => {
      const longPrompt = '```ts\n' + '// filler\n'.repeat(400) + '```';
      vi.spyOn(LocalLlmClient, 'generateCompletion').mockRejectedValue(new Error('Local LLM offline or connection refused'));

      const result = await manager.compactPrompt(longPrompt, baseConfig);

      expect(result.wasCompacted).toBe(false);
      expect(result.compactedText).toBe(longPrompt);
      expect(result.distilledChars).toBe(longPrompt.length);
    });

    it('should fallback to original prompt if distillation returns empty string or longer text', async () => {
      const longPrompt = '```ts\n' + '// filler\n'.repeat(400) + '```';
      vi.spyOn(LocalLlmClient, 'generateCompletion').mockResolvedValue({ text: '' });

      const result = await manager.compactPrompt(longPrompt, baseConfig);

      expect(result.wasCompacted).toBe(false);
      expect(result.compactedText).toBe(longPrompt);
    });
  });
});
