import { describe, it, expect } from 'vitest';
import { DomObserver } from '../src/main/webviews/domObserver.js';
import { ProviderId, TaskMode } from '../src/shared/types.js';

describe('DomObserver Multi-Provider & Media Scraping Tests', () => {
  const providers: ProviderId[] = [
    'gemini',
    'chatgpt',
    'webview_custom_example' as any,
    'grok',
    'claude',
  ];
  const modes: TaskMode[] = ['general', 'coding', 'image', 'video', 'music'];

  it('should generate valid async executable JavaScript for every provider and mode combination', () => {
    for (const provider of providers) {
      for (const mode of modes) {
        const script = DomObserver.getInspectionScript(provider, mode);
        expect(script).toBeDefined();
        expect(typeof script).toBe('string');
        expect(script.length).toBeGreaterThan(100);

        // Verify that the script parses cleanly without syntax errors
        expect(() => {
          new Function(script);
        }).not.toThrow();
      }
    }
  });

  it('should include in-browser blob to data-URI conversion in inspection script', () => {
    const script = DomObserver.getInspectionScript('gemini', 'image');
    expect(script).toContain("mediaUrl.startsWith('blob:')");
    expect(script).toContain('fetch(mediaUrl)');
    expect(script).toContain('FileReader');
    expect(script).toContain('readAsDataURL');
  });

  it('should include Gemini media completion overrides for image, video, and music', () => {
    const script = DomObserver.getInspectionScript('gemini', 'image');
    expect(script).toContain('hasDoneImage');
    expect(script).toContain('hasDoneVideo');
    expect(script).toContain('hasDoneMusic');
    expect(script).toContain('isMediaRendering = false');
    expect(script).toContain('single-image img.loaded');
    expect(script).toContain('generated-video video[src]');
    expect(script).toContain('generated-music video[src]');
    expect(script).toContain('structured-content-container');

    const audioScript = DomObserver.getInspectionScript('gemini', 'music');
    expect(audioScript).toContain('structured-content-container');
    expect(audioScript).toContain('generated-music video');
    expect(audioScript).toContain('output.mp4');
  });

  it('should include ChatGPT media completion overrides and video/audio extraction', () => {
    const script = DomObserver.getInspectionScript('chatgpt', 'image');
    expect(script).toContain('hasDoneImage');
    expect(script).toContain('hasDoneVideo');
    expect(script).toContain('hasDoneAudio');
    expect(script).toContain('backend-api/estuary/content');
    expect(script).toContain('video[src]');
    expect(script).toContain('audio[src]');
  });

  it('should include custom webview media completion overrides for image, video, and audio', () => {
    const script = DomObserver.getInspectionScript(
      'webview_custom_example' as any,
      'image'
    );
    expect(script).toContain('hasDoneImage');
    expect(script).toContain('hasDoneVideo');
    expect(script).toContain('hasDoneAudio');
    expect(script).toContain('storage.googleapis.com');
  });

  it('should include Grok media completion overrides for Aurora/Flux images and Imagine videos', () => {
    const script = DomObserver.getInspectionScript('grok', 'image');
    expect(script).toContain('hasDoneImage');
    expect(script).toContain('hasDoneVideo');
    expect(script).toContain('assets.grok.com');
    expect(script).toContain('video[src]');
  });
});
