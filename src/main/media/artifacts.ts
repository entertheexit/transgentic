import fs from 'node:fs/promises';
import { BrowserWindow, nativeImage } from 'electron';
import { pathToFileURL } from 'node:url';
import crypto from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import type { MediaMode } from '../../shared/media.js';

/** Validate container structure and nonempty tracks before reporting generation success. */
export async function validateMediaArtifact(file: string, mode: MediaMode): Promise<{ bytes: number; mimeType: string }> {
  const handle = await fs.open(file, 'r');
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size < 12) throw new Error('The generated asset is empty.');
    const head = Buffer.alloc(Math.min(stat.size, 65536));
    await handle.read(head, 0, head.length, 0);
    let mimeType = '';
    if (mode === 'image') {
      if (head.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) && head.length >= 24 && head.readUInt32BE(16) > 0 && head.readUInt32BE(20) > 0) mimeType = 'image/png';
      else if (head[0] === 255 && head[1] === 216 && head[2] === 255) mimeType = 'image/jpeg';
      else if (head.toString('ascii', 0, 4) === 'RIFF' && head.toString('ascii', 8, 12) === 'WEBP') mimeType = 'image/webp';
      else if (/^GIF8[79]a/.test(head.toString('ascii', 0, 6)) && head.readUInt16LE(6) && head.readUInt16LE(8)) mimeType = 'image/gif';
      if (mimeType) {
        const decoded = nativeImage.createFromPath(file);
        const size = decoded.getSize();
        if (decoded.isEmpty() || !size.width || !size.height) throw new Error('The generated image could not be decoded.');
      }
    } else if (head.toString('ascii', 4, 8) === 'ftyp') {
      let offset = 0, moov: Buffer | undefined, payload = false, fragmented = false;
      const header = Buffer.alloc(16);
      while (offset + 8 <= stat.size) {
        await handle.read(header, 0, 16, offset);
        let size = header.readUInt32BE(0), headerSize = 8;
        if (size === 1) { const wide = header.readBigUInt64BE(8); if (wide > BigInt(Number.MAX_SAFE_INTEGER)) break; size = Number(wide); headerSize = 16; }
        if (size === 0) size = stat.size - offset;
        if (size < headerSize || offset + size > stat.size) throw new Error('Truncated MP4 container.');
        const type = header.toString('ascii', 4, 8);
        if (type === 'mdat' && size > headerSize) payload = true;
        if (type === 'moof') fragmented = true;
        if (type === 'moov' && size <= 32 * 1024 * 1024) { moov = Buffer.alloc(size - headerSize); await handle.read(moov, 0, moov.length, offset + headerSize); }
        offset += size;
      }
      const boxes = (data: Buffer): Array<{ type: string; data: Buffer }> => {
        const result = []; let i = 0;
        while (i + 8 <= data.length) { const n = data.readUInt32BE(i); if (n < 8 || i + n > data.length) break; result.push({ type: data.toString('ascii', i + 4, i + 8), data: data.subarray(i + 8, i + n) }); i += n; }
        return result;
      };
      let track = false;
      for (const box of moov ? boxes(moov) : []) {
        if (box.type !== 'trak') continue;
        const mdia = boxes(box.data).find(b => b.type === 'mdia'); if (!mdia) continue;
        const children = boxes(mdia.data), handler = children.find(b => b.type === 'hdlr')?.data;
        if (!handler || handler.length < 12 || handler.toString('ascii', 8, 12) !== (mode === 'music' ? 'soun' : 'vide')) continue;
        const minf = children.find(b => b.type === 'minf');
        const stbl = minf && boxes(minf.data).find(b => b.type === 'stbl');
        const stsz = stbl && boxes(stbl.data).find(b => b.type === 'stsz')?.data;
        if (fragmented || (stsz && stsz.length >= 12 && stsz.readUInt32BE(8) > 0)) track = true;
      }
      if (payload && track) mimeType = 'video/mp4';
    } else if (mode === 'music') {
      if (head.toString('ascii', 0, 4) === 'RIFF' && head.toString('ascii', 8, 12) === 'WAVE') {
        let offset = 12, format = false, samples = false;
        while (offset + 8 <= head.length) {
          const kind = head.toString('ascii', offset, offset + 4), size = head.readUInt32LE(offset + 4);
          if (offset + 8 + size > stat.size) throw new Error('Truncated WAV container.');
          if (kind === 'fmt ' && size >= 16 && offset + 24 <= head.length) format = [1, 3].includes(head.readUInt16LE(offset + 8)) && head.readUInt16LE(offset + 10) > 0 && head.readUInt32LE(offset + 12) > 0;
          if (kind === 'data' && size > 0) samples = true;
          offset += 8 + size + (size % 2);
        }
        if (format && samples) mimeType = 'audio/wav';
      }
      else if (head.toString('ascii', 0, 4) === 'OggS' && (head.includes(Buffer.from('OpusHead')) || head.includes(Buffer.from('vorbis')))) mimeType = 'audio/ogg';
      else {
        const id3 = head.toString('ascii', 0, 3) === 'ID3' ? 10 + ((head[6] & 127) << 21 | (head[7] & 127) << 14 | (head[8] & 127) << 7 | head[9] & 127) : 0;
        for (let i = id3; i + 4 < head.length; i++) if (head[i] === 255 && (head[i + 1] & 0xe0) === 0xe0 && (head[i + 1] & 6) !== 0 && (head[i + 2] & 0xf0) !== 0xf0 && (head[i + 2] & 0x0c) !== 0x0c) { mimeType = 'audio/mpeg'; break; }
      }
    }
    if (!mimeType) throw new Error(mode === 'music' ? 'The music artifact has no verified audio track.' : 'The generated asset is not a supported usable media container.');
    if (mode !== 'image') await verifyPlayback(file);
    return { bytes: stat.size, mimeType };
  } finally { await handle.close(); }
}

/** Use the shipped Chromium codecs, with networking/Node disabled and audio muted. */
async function verifyPlayback(file: string): Promise<void> {
  const player = new BrowserWindow({ show: false, webPreferences: { partition: `media-validation-${crypto.randomUUID()}`, nodeIntegration: false, contextIsolation: true, sandbox: true } });
  player.webContents.setAudioMuted(true);
  let directory: string | undefined;
  let loadTimeout: ReturnType<typeof setTimeout> | undefined;
  try {
    directory = await fs.mkdtemp(path.join(os.tmpdir(), 'transgentic-playback-'));
    const page = path.join(directory, 'player.html'), mediaUrl = pathToFileURL(file).href;
    const escapedUrl = mediaUrl.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
    await fs.writeFile(page, `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; media-src file:"><video muted preload="auto" src="${escapedUrl}"></video>`, { mode: 0o600 });
    const pageUrl = pathToFileURL(page).href;
    player.webContents.session.webRequest.onBeforeRequest((details, callback) => callback({ cancel: details.url !== pageUrl && details.url !== mediaUrl }));
    await Promise.race([player.loadURL(pageUrl), new Promise<never>((_resolve, reject) => { loadTimeout = setTimeout(() => reject(new Error('Saved media playback loading timed out.')), 12000); })]);
    clearTimeout(loadTimeout);
    const usable = await player.webContents.executeJavaScript(`new Promise(resolve => {
      const media = document.querySelector('video,audio');
      if (!media) { resolve(false); return; }
      media.muted = true;
      const ready = () => media.readyState >= 2 && Number.isFinite(media.duration) && media.duration > 0;
      if (ready()) { resolve(true); return; }
      const timeout = setTimeout(() => resolve(false), 8000);
      media.addEventListener('loadeddata', () => { clearTimeout(timeout); resolve(ready()); }, { once: true });
      media.addEventListener('error', () => { clearTimeout(timeout); resolve(false); }, { once: true });
    })`);
    if (!usable) throw new Error('The saved media could not be decoded for playback.');
  } finally { clearTimeout(loadTimeout); if (!player.isDestroyed()) player.destroy(); if (directory) await fs.rm(directory, { recursive: true, force: true }); }
}
