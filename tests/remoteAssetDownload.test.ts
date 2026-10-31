import { afterEach, expect, it, vi } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { AssetManager } from '../src/main/storage/assetManager.js';

// The exported singleton must not inspect or migrate the operator's library.
// These tests exercise only the network downloader, with no filesystem I/O.
vi.mock('fs', () => ({ default: { existsSync: () => false, mkdirSync: vi.fn() } }));

let server: http.Server | undefined;
afterEach(async () => {
  if (!server) return;
  server.closeAllConnections();
  await new Promise<void>(resolve => server!.close(() => resolve()));
  server = undefined;
});

it.each([
  { headerBytes: 32 * 1024, accepted: true },
  { headerBytes: 80 * 1024, accepted: false },
])('handles a media response with $headerBytes header bytes within a finite limit', async ({ headerBytes, accepted }) => {
  const media = Buffer.from('synthetic media bytes');
  server = http.createServer((_request, response) => {
    response.writeHead(200, {
      'Content-Type': 'image/png',
      'X-Media-Metadata': 'x'.repeat(headerBytes),
    });
    response.end(media);
  });
  await new Promise<void>(resolve => server!.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as AddressInfo).port;
  const assets = Object.create(AssetManager.prototype) as any;
  const download = assets.downloadRemoteBuffer(`http://127.0.0.1:${port}/image`);
  if (accepted) await expect(download).resolves.toEqual(media);
  else await expect(download).rejects.toMatchObject({ code: 'HPE_HEADER_OVERFLOW' });
});
