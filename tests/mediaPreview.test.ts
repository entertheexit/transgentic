import { describe, it, expect } from 'vitest';
import { extractMediaPath, getMediaTypeFromPath } from '../src/renderer/components/MediaPreview.js';

describe('MediaPreview Helpers', () => {
  describe('extractMediaPath', () => {
    it('should extract direct mediaPath when provided', () => {
      const path = '/Users/example/Documents/Transgentic/gemini_image_123.jpg';
      expect(extractMediaPath(path, undefined)).toBe(path);
    });

    it('should strip surrounding quotes and whitespace', () => {
      const path = '  "/Users/example/Documents/Transgentic/gemini_image_123.jpg"  ';
      expect(extractMediaPath(path, undefined)).toBe('/Users/example/Documents/Transgentic/gemini_image_123.jpg');
    });

    it('should strip file:// prefix from mediaPath', () => {
      const path = 'file:///Users/example/Documents/Transgentic/gemini_image_123.jpg';
      expect(extractMediaPath(path, undefined)).toBe('/Users/example/Documents/Transgentic/gemini_image_123.jpg');
    });

    it('should handle Windows file:///C:/ path', () => {
      const path = 'file:///C:/Users/example/Documents/Transgentic/gemini_image_123.jpg';
      expect(extractMediaPath(path, undefined)).toBe('C:/Users/example/Documents/Transgentic/gemini_image_123.jpg');
    });

    it('should extract local path from text notice "Local media asset saved to:"', () => {
      const text = 'Prompt completed successfully.\nLocal media asset saved to: /Users/example/Documents/Transgentic/gemini_image_1788511553920_f4a87c17.jpg\nEnjoy!';
      expect(extractMediaPath(undefined, text)).toBe('/Users/example/Documents/Transgentic/gemini_image_1788511553920_f4a87c17.jpg');
    });

    it('should extract local path from text notice "Generated image asset saved to:"', () => {
      const text = 'Generated image asset saved to: /Users/example/Documents/Transgentic/output.png';
      expect(extractMediaPath(undefined, text)).toBe('/Users/example/Documents/Transgentic/output.png');
    });

    it('should return undefined when no media path or matching text pattern exists', () => {
      expect(extractMediaPath(undefined, undefined)).toBeUndefined();
      expect(extractMediaPath('', '')).toBeUndefined();
      expect(extractMediaPath(undefined, 'Just a regular text answer without media.')).toBeUndefined();
    });
  });

  describe('getMediaTypeFromPath', () => {
    it('should recognize image extensions', () => {
      expect(getMediaTypeFromPath('/path/to/img.png')).toBe('image');
      expect(getMediaTypeFromPath('/path/to/img.jpg')).toBe('image');
      expect(getMediaTypeFromPath('/path/to/img.jpeg')).toBe('image');
      expect(getMediaTypeFromPath('/path/to/img.webp')).toBe('image');
      expect(getMediaTypeFromPath('/path/to/img.gif')).toBe('image');
      expect(getMediaTypeFromPath('/path/to/img.svg')).toBe('image');
    });

    it('should recognize video extensions', () => {
      expect(getMediaTypeFromPath('/path/to/vid.mp4')).toBe('video');
      expect(getMediaTypeFromPath('/path/to/vid.webm')).toBe('video');
      expect(getMediaTypeFromPath('/path/to/vid.mov')).toBe('video');
    });

    it('should recognize audio extensions', () => {
      expect(getMediaTypeFromPath('/path/to/song.mp3')).toBe('audio');
      expect(getMediaTypeFromPath('/path/to/audio.wav')).toBe('audio');
      expect(getMediaTypeFromPath('/path/to/track.ogg')).toBe('audio');
      expect(getMediaTypeFromPath('/path/to/sound.flac')).toBe('audio');
    });

    it('should fallback to modeHint if extension is missing or unrecognized', () => {
      expect(getMediaTypeFromPath('/path/to/file_without_ext', 'image')).toBe('image');
      expect(getMediaTypeFromPath('/path/to/file_without_ext', 'video')).toBe('video');
      expect(getMediaTypeFromPath('/path/to/file_without_ext', 'audio')).toBe('audio');
      expect(getMediaTypeFromPath('/path/to/file_without_ext', 'music')).toBe('audio');
    });

    it('should return other if unknown and no modeHint', () => {
      expect(getMediaTypeFromPath('/path/to/data.bin')).toBe('other');
      expect(getMediaTypeFromPath('')).toBe('other');
    });
  });
});
