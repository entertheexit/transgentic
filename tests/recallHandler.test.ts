import { describe, it, expect } from 'vitest';
import { applyRecallPipeline } from '../src/main/mcp/handlers/recallHandler.js';
import { RecallConfig } from '../src/main/config/appConfig.js';

describe('Recall & Context Memory Engine Handler', () => {
  const samplePrompt = 'Refactor the authentication flow to support Passkeys.';

  it('returns raw prompt unchanged when recall is undefined or disabled', () => {
    expect(applyRecallPipeline(samplePrompt, undefined)).toBe(samplePrompt);

    const disabledConfig: RecallConfig = {
      enabled: false,
      strategy: 'single-pass',
      autoTriggerKeywords: true,
    };
    expect(applyRecallPipeline(samplePrompt, disabledConfig)).toBe(samplePrompt);
  });

  it('injects single-pass system directive by default', () => {
    const config: RecallConfig = {
      enabled: true,
      strategy: 'single-pass',
      autoTriggerKeywords: true,
    };

    const output = applyRecallPipeline(samplePrompt, config);
    expect(output).toContain('[SYSTEM DIRECTIVE: RECALL & HISTORICAL CONTEXT]');
    expect(output).toContain('Search and consult your long-term memory');
    expect(output).toContain('prioritize the user\'s previously established context');
    expect(output).toContain(samplePrompt);
  });

  it('injects two-stage system directive when strategy is two-stage', () => {
    const config: RecallConfig = {
      enabled: true,
      strategy: 'two-stage',
      autoTriggerKeywords: true,
    };

    const output = applyRecallPipeline(samplePrompt, config);
    expect(output).toContain('[SYSTEM DIRECTIVE: RECALL & HISTORICAL CONTEXT (TWO-STAGE DEEP RETRIEVAL)]');
    expect(output).toContain('PHASE 1: MEMORY AUDIT');
    expect(output).toContain('PHASE 2: EXECUTION WITH RETRIEVED CONTEXT');
    expect(output).toContain(samplePrompt);
  });

  it('respects per-mode recall configuration across the five canonical modes', () => {
    const config: RecallConfig = {
      enabled: true,
      strategy: 'single-pass',
      autoTriggerKeywords: true,
      modes: {
        general: true,
        coding: true,
        image: false,
        video: true,
        music: false,
      },
    };

    // Enabled modes get the recall directive
    const generalOutput = applyRecallPipeline(samplePrompt, config, 'general');
    expect(generalOutput).toContain('[SYSTEM DIRECTIVE: RECALL & HISTORICAL CONTEXT]');
    expect(generalOutput).toContain(samplePrompt);
    expect(applyRecallPipeline(samplePrompt, config, 'writing')).toBe(generalOutput);

    const codingOutput = applyRecallPipeline(samplePrompt, config, 'coding');
    expect(codingOutput).toContain('[SYSTEM DIRECTIVE: RECALL & HISTORICAL CONTEXT]');

    const videoOutput = applyRecallPipeline(samplePrompt, config, 'video');
    expect(videoOutput).toContain('[SYSTEM DIRECTIVE: RECALL & HISTORICAL CONTEXT]');

    // Disabled modes return rawPrompt unchanged
    const imageOutput = applyRecallPipeline(samplePrompt, config, 'image');
    expect(imageOutput).toBe(samplePrompt);

    const audioOutput = applyRecallPipeline(samplePrompt, config, 'music');
    expect(audioOutput).toBe(samplePrompt);
  });

  it('returns rawPrompt unchanged when master toggle is disabled regardless of per-mode settings', () => {
    const config: RecallConfig = {
      enabled: false,
      strategy: 'single-pass',
      autoTriggerKeywords: true,
      modes: {
        general: true,
        coding: true,
        image: true,
        video: true,
        music: true,
      },
    };

    expect(applyRecallPipeline(samplePrompt, config, 'general')).toBe(samplePrompt);
    expect(applyRecallPipeline(samplePrompt, config, 'coding')).toBe(samplePrompt);
    expect(applyRecallPipeline(samplePrompt, config, 'image')).toBe(samplePrompt);
  });
});
