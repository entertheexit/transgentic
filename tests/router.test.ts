import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { DynamicRouter } from '../src/main/mcp/router.js';
import { ServiceManifestManager } from '../src/main/registry/serviceManifest.js';
import { normalizeModeFlags, normalizeRouteMode, normalizeTaskMode } from '../src/shared/types.js';

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
    expect(DynamicRouter.getCandidateChain('writing', undefined, false)).toEqual(generalChain);

    // Coding mode: Claude -> ChatGPT -> Gemini -> Grok
    const codingChain = DynamicRouter.getCandidateChain('coding', undefined, false);
    expect(codingChain).toEqual(['claude', 'chatgpt', 'gemini', 'grok']);

    // Image mode: Grok -> ChatGPT -> Gemini
    const imageChain = DynamicRouter.getCandidateChain('image', undefined, false);
    expect(imageChain).toEqual(['grok', 'chatgpt', 'gemini']);

    // Video mode: Grok -> Gemini
    const videoChain = DynamicRouter.getCandidateChain('video', undefined, false);
    expect(videoChain).toEqual(['grok', 'gemini']);

    // Music mode: Gemini
    const musicChain = DynamicRouter.getCandidateChain('music', undefined, false);
    expect(musicChain).toEqual(['gemini']);
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

    // Music intent reaches the implemented Gemini music route.
    for (const prompt of [
      'Compose background music for a fantasy scene',
      'Create a song for the end credits',
      'Make a synthwave track',
      'Generate a cinematic soundtrack',
      'Create a drum beat',
      'Compose a melody and jingle',
      'Make instrumental BGM',
    ]) {
      expect(DynamicRouter.classifyMode(prompt), prompt).toMatchObject({ mode: 'music', isAutoDetected: true });
    }

    // Speech and sound intent is reserved for a future Audio provider.
    for (const prompt of [
      'Generate a speech recording',
      'Create narration for the documentary',
      'Generate a voiceover for the trailer',
      'Make TTS for this paragraph',
      'Create a podcast introduction',
      'Generate audio sound effect of futuristic engine startup',
      'Make SFX for a spaceship door',
    ]) {
      expect(DynamicRouter.classifyMode(prompt), prompt).toMatchObject({ mode: 'audio', intent: 'audio', isAutoDetected: true });
    }

    // Explicit mode override should be preserved
    const resExplicit = DynamicRouter.classifyMode('Write a story about space', 'writing');
    expect(resExplicit.mode).toBe('writing');
    expect(resExplicit.intent).toBe('writing');
    expect(resExplicit.isAutoDetected).toBe(false);

    const autoWriting = DynamicRouter.classifyMode('Draft chapter three of my novel');
    expect(autoWriting).toMatchObject({ mode: 'writing', intent: 'writing', isAutoDetected: true });

    const markdownNovel = DynamicRouter.classifyMode('Continue the prose in novel.md with a quiet final scene');
    expect(markdownNovel).toMatchObject({ mode: 'writing', intent: 'writing' });

    const structuredNovel = DynamicRouter.classifyMode('Update novel.json with the next chapter and character arc');
    expect(structuredNovel).toMatchObject({ mode: 'writing', intent: 'writing' });
  });

  it('migrates Writing routes into General only when General is absent', () => {
    const general = { mode: 'general', primary: 'gemini', fallbacks: ['claude'] };
    const writing = { mode: 'writing', primary: 'grok', fallbacks: ['chatgpt'] };
    const generalWins = DynamicRouter.migrateRouteMatrix({ main: { general, writing }, co: {} });
    expect(generalWins.main.general.primary).toBe('gemini');
    expect(generalWins.main).not.toHaveProperty('writing');

    const writingMigrates = DynamicRouter.migrateRouteMatrix({ main: { writing }, co: { writing } });
    expect(writingMigrates.main.general.primary).toBe('grok');
    expect(writingMigrates.co.general.primary).toBe('grok');
    expect(DynamicRouter.migrateRouteMatrix(writingMigrates)).toEqual(writingMigrates);
  });

  it('migrates the legacy Audio route into Music without merging an explicit Music route', () => {
    const legacyAudio = { mode: 'audio', primary: 'gemini', fallbacks: ['chatgpt'] };
    const migrated = DynamicRouter.migrateRouteMatrix({ main: { audio: legacyAudio }, co: { audio: legacyAudio } });
    expect(migrated.main.music).toMatchObject({ mode: 'music', primary: 'gemini', fallbacks: ['chatgpt'] });
    expect(migrated.main).not.toHaveProperty('audio');

    const explicitMusic = { mode: 'music', primary: 'grok', fallbacks: [] };
    const musicWins = DynamicRouter.migrateRouteMatrix({ main: { audio: legacyAudio, music: explicitMusic }, co: {} });
    expect(musicWins.main.music).toMatchObject({ primary: 'grok', fallbacks: [] });
    expect(DynamicRouter.migrateRouteMatrix(migrated)).toEqual(migrated);
  });

  it('preserves Writing as a backend mode while sharing General settings', () => {
    expect(normalizeTaskMode('writing')).toBe('writing');
    expect(normalizeRouteMode('writing')).toBe('general');
    expect(normalizeModeFlags({ writing: false, coding: false } as any)).toEqual({
      general: false, coding: false, image: true, video: true, music: true,
    });
    expect(() => normalizeRouteMode('audio')).toThrow('Audio providers are not available yet');
    expect(normalizeModeFlags({ general: true, writing: false } as any).general).toBe(true);
    const normalized = normalizeModeFlags({ writing: false } as any);
    expect(normalizeModeFlags(normalized)).toEqual(normalized);
  });
});
