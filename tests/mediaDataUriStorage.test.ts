import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { AssetManager } from '../src/main/storage/assetManager.js';

describe('Generated media data URI storage', () => {
  let directory: string;
  let assets: AssetManager;
  const mp4 = Buffer.from([0, 0, 0, 20, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d]);

  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'transgentic-media-'));
    assets = new AssetManager(directory);
  });
  afterEach(() => fs.rmSync(directory, { recursive: true, force: true }));

  it.each(['video/mp4', 'video/mp4;codecs=avc1', 'application/octet-stream', 'application/vnd.test.media'])('decodes %s into media bytes', async mime => {
    const saved = await assets.saveMediaAsset(`data:${mime};base64,${mp4.toString('base64')}`, 'video');
    expect(fs.readFileSync(saved.filePath)).toEqual(mp4);
    expect(saved.sizeBytes).toBe(mp4.length);
    expect(saved.filePath).toMatch(/\.mp4$/);
  });

  it('stores an MP4 music player in the Music library', async () => {
    const saved = await assets.saveMediaAsset(`data:video/mp4;base64,${mp4.toString('base64')}`, 'video', 'gemini_music', undefined, 'music');
    expect(saved.relativePath).toMatch(/^\.\/Library\/Music\/.*\.mp4$/);
    expect(fs.readFileSync(saved.filePath)).toEqual(mp4);
  });

  it('preserves image and audio data URI decoding', async () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const image = await assets.saveMediaAsset(`data:image/png;base64,${png.toString('base64')}`, 'image');
    expect(fs.readFileSync(image.filePath)).toEqual(png);
    const wav = Buffer.from('RIFF0000WAVE');
    const music = await assets.saveMediaAsset(`data:audio/wav;base64,${wav.toString('base64')}`, 'audio', undefined, undefined, 'music');
    expect(fs.readFileSync(music.filePath)).toEqual(wav);
    expect(music.filePath).toMatch(/\.wav$/);
  });

  it('rejects unsupported data URIs instead of writing them as a successful media file', async () => {
    await expect(assets.saveMediaAsset('data:video/mp4,not-base64', 'video')).rejects.toThrow('data URI');
    expect(fs.readdirSync(path.join(directory, 'Library', 'Videos'))).toEqual([]);
  });
});
