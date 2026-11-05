import { describe, expect, it } from 'vitest';
import http, { type Server } from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { AssetManager } from '../src/main/storage/assetManager.js';

async function listen(server: Server): Promise<string> {
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  return `http://127.0.0.1:${(server.address() as any).port}`;
}
const close = (server: Server) => new Promise<void>(resolve => server.close(() => resolve()));

describe('Media download cookie boundaries', () => {
  it('does not forward the original cookie header to a different redirect origin', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'transgentic-download-'));
    let received: string | undefined;
    const destination = http.createServer((req, res) => { received = req.headers.cookie; res.end(Buffer.from('RIFF0000WEBP')); });
    const target = await listen(destination);
    const source = http.createServer((_req, res) => { res.writeHead(302, { Location: `${target}/asset` }); res.end(); });
    const origin = await listen(source);
    try {
      const saved = await new AssetManager(directory).saveMediaAsset(`${origin}/start`, 'image', undefined, 'session=test-only');
      expect(saved.filePath).toMatch(/\.webp$/);
      expect(received).toBeUndefined();
    } finally { await close(source); await close(destination); fs.rmSync(directory, { recursive: true, force: true }); }
  });

  it('resolves a relative redirect while retaining cookies on the same origin', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'transgentic-download-'));
    const received: Array<string | undefined> = [];
    const source = http.createServer((req, res) => {
      received.push(req.headers.cookie);
      if (req.url === '/start') { res.writeHead(302, { Location: '/asset' }); res.end(); }
      else res.end(Buffer.from('GIF89a00000000'));
    });
    const origin = await listen(source);
    try {
      const saved = await new AssetManager(directory).saveMediaAsset(`${origin}/start`, 'image', undefined, 'session=test-only');
      expect(saved.filePath).toMatch(/\.gif$/);
      expect(received).toEqual(['session=test-only', 'session=test-only']);
    } finally { await close(source); fs.rmSync(directory, { recursive: true, force: true }); }
  });
});
