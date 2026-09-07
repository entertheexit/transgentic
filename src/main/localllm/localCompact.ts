/**
 * Local Compact Engine
 *
 * Context distillation for large prompts before dispatching to Cloud AI Webviews.
 * Condition:
 *   - Local LLM is enabled (config.enabled === true)
 *   - Local Compact is enabled (config.localCompact === true)
 *   - Target service is Cloud AI Webview (not Local LLM itself)
 *   - Incoming prompt exceeds threshold (default: 4,000 characters of code or multi-file diffs)
 *
 * Compaction Directive:
 *   [TASK: CONTEXT DISTILLATION]
 *   Extract ONLY essential type definitions, interface signatures, function headers,
 *   and core logic blocks needed to fulfill the following programming objective.
 *   Strip dead comments, verbose boilerplate, and unrelated imports.
 *   Return the distilled context concisely.
 */

import { LocalLLMConfig } from '../../shared/types.js';
import { LocalLlmClient } from './localLlmClient.js';

export interface LocalCompactResult {
  compactedText: string;
  wasCompacted: boolean;
  originalChars: number;
  distilledChars: number;
}

export class LocalCompactManager {
  public static readonly DEFAULT_THRESHOLD_CHARS = 4000;
  private static readonly COMPACTION_TIMEOUT_MS = 25000; // 25s safety budget

  private static readonly DISTILLATION_DIRECTIVE =
    `[TASK: CONTEXT DISTILLATION]\n` +
    `Extract ONLY essential type definitions, interface signatures, function headers, and core logic blocks needed to fulfill the following programming objective. Strip dead comments, verbose boilerplate, and unrelated imports. Return the distilled context concisely.`;

  /**
   * Evaluates if a prompt qualifies for context distillation.
   */
  public shouldCompact(promptText: string, config?: LocalLLMConfig): boolean {
    if (!config?.enabled || !config?.localCompact) {
      return false;
    }
    const threshold = config.compactThresholdChars && config.compactThresholdChars > 0
      ? config.compactThresholdChars
      : LocalCompactManager.DEFAULT_THRESHOLD_CHARS;

    if (!promptText || promptText.length < threshold) {
      return false;
    }

    return true;
  }

  /**
   * Distills bloated code blocks or diff contexts within the prompt using the local LLM.
   * Returns compacted prompt if successful and smaller; otherwise falls back gracefully.
   */
  public async compactPrompt(
    promptText: string,
    config: LocalLLMConfig,
    abortSignal?: AbortSignal
  ): Promise<LocalCompactResult> {
    const originalChars = promptText?.length || 0;
    const fallbackResult: LocalCompactResult = {
      compactedText: promptText,
      wasCompacted: false,
      originalChars,
      distilledChars: originalChars,
    };

    if (!this.shouldCompact(promptText, config)) {
      return fallbackResult;
    }

    try {
      // 1. Scan for fenced code blocks (```lang ... ```)
      const codeFenceRegex = /```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g;
      const matches: Array<{ fullMatch: string; lang: string; code: string; index: number }> = [];
      let match: RegExpExecArray | null;

      while ((match = codeFenceRegex.exec(promptText)) !== null) {
        if (match[2] && match[2].length >= 500) {
          matches.push({
            fullMatch: match[0],
            lang: match[1] || '',
            code: match[2],
            index: match.index,
          });
        }
      }

      // Prepare an abort controller with timeout and user abort linkage
      const controller = new AbortController();
      let timeoutId: NodeJS.Timeout | undefined;
      const onUserAbort = () => controller.abort();

      if (abortSignal) {
        if (abortSignal.aborted) {
          return fallbackResult;
        }
        abortSignal.addEventListener('abort', onUserAbort);
      }

      timeoutId = setTimeout(() => controller.abort(), LocalCompactManager.COMPACTION_TIMEOUT_MS);

      try {
        // Scenario A: Markdown fenced code blocks found
        if (matches.length > 0) {
          // Identify the largest code block(s) to distill
          // Sort descending by length
          matches.sort((a, b) => b.code.length - a.code.length);
          const targetBlock = matches[0];

          // Extract objective from the rest of the prompt (outside the target code block)
          const promptWithoutCode = (
            promptText.slice(0, targetBlock.index) +
            '\n' +
            promptText.slice(targetBlock.index + targetBlock.fullMatch.length)
          ).trim();

          const objectiveText = promptWithoutCode.slice(0, 1200) || 'Implement programming objective concisely';

          const distillationPrompt =
            `${LocalCompactManager.DISTILLATION_DIRECTIVE}\n\n` +
            `[OBJECTIVE]\n${objectiveText}\n\n` +
            `[RAW CODE CONTEXT]\n${targetBlock.code}`;

          const completion = await LocalLlmClient.generateCompletion(
            distillationPrompt,
            config,
            {
              temperature: 0.1,
              maxTokens: 2048,
              abortSignal: controller.signal,
            }
          );

          let distilled = (completion.text || '').trim();
          // Strip duplicate outer fences if returned by local LLM
          if (distilled.startsWith('```')) {
            distilled = distilled.replace(/^```[a-zA-Z0-9_-]*\n?/, '').replace(/\n?```$/, '').trim();
          }

          // Only apply if distillation produced meaningful output and actually reduced size
          if (distilled.length > 0 && distilled.length < targetBlock.code.length * 0.9) {
            const replacementCodeBlock = `\`\`\`${targetBlock.lang}\n${distilled}\n\`\`\``;
            const compactedText = promptText.replace(targetBlock.fullMatch, replacementCodeBlock);
            const distilledChars = compactedText.length;

            return {
              compactedText,
              wasCompacted: true,
              originalChars,
              distilledChars,
            };
          }
        } else {
          // Scenario B: Large raw code, diff, or log without markdown fences
          // Check for diff markers or code keywords
          const isDiffOrCode =
            /(?:diff --git|--- a\/|\+\+\+ b\/|@@ -\d+,\d+|function |class |import |export |const |let |var |interface |type )/m.test(
              promptText
            );

          if (isDiffOrCode) {
            // Split prompt into first paragraph (objective) and remaining body (raw code/diff)
            const firstParaEnd = promptText.indexOf('\n\n');
            let objectiveText = 'Analyze and implement the objective';
            let rawCode = promptText;

            if (firstParaEnd > 0 && firstParaEnd < 800) {
              objectiveText = promptText.slice(0, firstParaEnd).trim();
              rawCode = promptText.slice(firstParaEnd).trim();
            }

            if (rawCode.length >= 2000) {
              const distillationPrompt =
                `${LocalCompactManager.DISTILLATION_DIRECTIVE}\n\n` +
                `[OBJECTIVE]\n${objectiveText}\n\n` +
                `[RAW CODE CONTEXT]\n${rawCode}`;

              const completion = await LocalLlmClient.generateCompletion(
                distillationPrompt,
                config,
                {
                  temperature: 0.1,
                  maxTokens: 2048,
                  abortSignal: controller.signal,
                }
              );

              let distilled = (completion.text || '').trim();
              if (distilled.startsWith('```')) {
                distilled = distilled.replace(/^```[a-zA-Z0-9_-]*\n?/, '').replace(/\n?```$/, '').trim();
              }

              if (distilled.length > 0 && distilled.length < rawCode.length * 0.9) {
                const compactedText = `${objectiveText}\n\n[Distilled Code Context]\n\`\`\`\n${distilled}\n\`\`\``;
                return {
                  compactedText,
                  wasCompacted: true,
                  originalChars,
                  distilledChars: compactedText.length,
                };
              }
            }
          }
        }
      } finally {
        if (timeoutId) clearTimeout(timeoutId);
        if (abortSignal) {
          abortSignal.removeEventListener('abort', onUserAbort);
        }
      }
    } catch (err: any) {
      console.warn(`[LocalCompact] Distillation bypassed due to error: ${err?.message || err}`);
    }

    return fallbackResult;
  }
}

export const globalLocalCompactManager = new LocalCompactManager();
