import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { DynamicRouter } from '../src/main/mcp/router.js';
import { ServiceManifestManager } from '../src/main/registry/serviceManifest.js';

describe('DynamicRouter', () => {
  beforeEach(() => {
    ServiceManifestManager.loadManifest();
    DynamicRouter.resetRoutes();
  });

  afterAll(() => {
    DynamicRouter.resetRoutes();
  });

  it('should return correct default candidate chains for built-in providers', () => {
    // General mode: ChatGPT -> Claude -> Gemini -> Grok
    const generalChain = DynamicRouter.getCandidateChain('general', undefined, false);
    expect(generalChain).toEqual(['chatgpt', 'claude', 'gemini', 'grok']);

    // Coding mode: Claude -> ChatGPT -> Gemini -> Grok
    const codingChain = DynamicRouter.getCandidateChain('coding', undefined, false);
    expect(codingChain).toEqual(['claude', 'chatgpt', 'gemini', 'grok']);

    // Writing mode: ChatGPT -> Claude -> Grok -> Gemini
    const writingChain = DynamicRouter.getCandidateChain('writing', undefined, false);
    expect(writingChain).toEqual(['chatgpt', 'claude', 'grok', 'gemini']);

    // Image mode: Grok -> ChatGPT -> Gemini
    const imageChain = DynamicRouter.getCandidateChain('image', undefined, false);
    expect(imageChain).toEqual(['grok', 'chatgpt', 'gemini']);

    // Video mode: Grok -> Gemini
    const videoChain = DynamicRouter.getCandidateChain('video', undefined, false);
    expect(videoChain).toEqual(['grok', 'gemini']);

    // Audio mode: Gemini
    const audioChain = DynamicRouter.getCandidateChain('audio', undefined, false);
    expect(audioChain).toEqual(['gemini']);
  });

  it('should support dynamic route updating and custom fallback reordering', () => {
    // Custom configure Coding mode: Primary ChatGPT, Fallbacks: [Grok, Claude]
    DynamicRouter.updateRouteConfig('coding', {
      primary: 'chatgpt',
      fallbacks: ['grok', 'claude'],
    });

    const updatedCodingChain = DynamicRouter.getCandidateChain('coding', undefined, false);
    expect(updatedCodingChain).toEqual(['chatgpt', 'grok', 'claude']);

    // Custom configure General mode: Primary Gemini, Fallbacks: [Claude, Grok, ChatGPT]
    DynamicRouter.updateRouteConfig('general', {
      primary: 'gemini',
      fallbacks: ['claude', 'grok', 'chatgpt'],
    });

    const updatedGeneralChain = DynamicRouter.getCandidateChain('general', undefined, false);
    expect(updatedGeneralChain).toEqual(['gemini', 'claude', 'grok', 'chatgpt']);
  });

  it('should reset routes to defaults cleanly', () => {
    DynamicRouter.updateRouteConfig('coding', { primary: 'grok', fallbacks: [] });
    expect(DynamicRouter.getCandidateChain('coding', undefined, false)).toEqual(['grok']);

    DynamicRouter.resetRoutes();
    expect(DynamicRouter.getCandidateChain('coding', undefined, false)).toEqual(['claude', 'chatgpt', 'gemini', 'grok']);
  });

  it('should remove deleted provider from all routes cleanly', () => {
    DynamicRouter.updateRouteConfig('coding', {
      primary: 'chatgpt',
      fallbacks: ['claude', 'gemini', 'grok'],
    });
    DynamicRouter.removeProviderFromAllRoutes('chatgpt');
    const chain = DynamicRouter.getCandidateChain('coding', undefined, false);
    expect(chain).not.toContain('chatgpt');
    expect(chain).toContain('claude');
  });

  it('should respect explicit provider overrides', () => {
    const customChain = DynamicRouter.getCandidateChain('coding', 'grok', false);
    expect(customChain).toEqual(['grok']);
  });

  it('should intelligently classify task mode from prompt intent when mode is general or unspecified', () => {
    // Coding intent
    const resCode1 = DynamicRouter.classifyMode('Please refactor this TypeScript function:\n```ts\nexport function test() {}\n```');
    expect(resCode1.mode).toBe('coding');
    expect(resCode1.isAutoDetected).toBe(true);

    const resCode2 = DynamicRouter.classifyMode('Fix bug in auth middleware async handler');
    expect(resCode2.mode).toBe('coding');

    // Image intent
    const resImage = DynamicRouter.classifyMode('Generate an image of a futuristic neon city');
    expect(resImage.mode).toBe('image');
    expect(resImage.isAutoDetected).toBe(true);

    // Audio intent
    const resAudio = DynamicRouter.classifyMode('Generate audio sound effect of futuristic engine startup');
    expect(resAudio.mode).toBe('audio');
    expect(resAudio.isAutoDetected).toBe(true);

    // Explicit mode override should be preserved
    const resExplicit = DynamicRouter.classifyMode('Write a story about space', 'writing');
    expect(resExplicit.mode).toBe('writing');
    expect(resExplicit.isAutoDetected).toBe(false);
  });
});
