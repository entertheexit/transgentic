import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import type { Server } from 'node:http';
import { MediaJobStore } from '../src/main/media/jobs.js';
import { validateMediaArtifact } from '../src/main/media/artifacts.js';
import { canonicalMediaIdentity, createMediaRouter, parseMediaRequest } from '../src/main/media/router.js';
import { ClientAuthManager } from '../src/main/security/clientAuth.js';

const playback = vi.hoisted(() => vi.fn(async () => true));
vi.mock('electron', () => ({ app: undefined,
  BrowserWindow: class {
    webContents = { setAudioMuted() {}, session: { webRequest: { onBeforeRequest() {} } }, executeJavaScript: playback };
    async loadURL() {} isDestroyed() { return false; } destroy() {}
  },
  nativeImage: { createFromPath: (file: string) => ({ isEmpty: () => file.includes('corrupt'), getSize: () => ({ width: 1, height: 1 }) }) } }));
let dir: string;
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'transgentic-media-tests-')); });
afterEach(() => { vi.restoreAllMocks(); fs.rmSync(dir, { recursive: true, force: true }); });
function box(type: string, data: Buffer) { const header = Buffer.alloc(8); header.writeUInt32BE(data.length + 8); header.write(type, 4); return Buffer.concat([header, data]); }
function mp4(handler: string) {
  const hdlr = Buffer.alloc(12); hdlr.write(handler, 8);
  const stsz = Buffer.alloc(12); stsz.writeUInt32BE(1, 8);
  return Buffer.concat([box('ftyp', Buffer.from('isom0000')), box('moov', box('trak', box('mdia', Buffer.concat([box('hdlr', hdlr), box('minf', box('stbl', box('stsz', stsz)))])))), box('mdat', Buffer.from('sample'))]);
}
function wav() { const b = Buffer.alloc(48); b.write('RIFF'); b.writeUInt32LE(40, 4); b.write('WAVE', 8); b.write('fmt ', 12); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(8000, 24); b.writeUInt32LE(16000, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(4, 40); return b; }
function asset(name = 'track.mp4', bytes = mp4('soun')) { const file = path.join(dir, name); fs.writeFileSync(file, bytes); return file; }
function result(file?: string) { return { structuredContent: { status: 'completed', artifacts: file ? [file] : [] }, content: [{ type: 'text', text: 'Done' }], metadata: { providerUsed: 'gemini' } }; }
const cleanup = async () => {};
const deferred = () => { let resolve!: (v?: any) => void; const promise = new Promise<any>(r => resolve = r); return { promise, resolve }; };

describe('Usable artifact verification', () => {
  it('keeps music MP4 in music and requires an audio track', async () => {
    await expect(validateMediaArtifact(asset(), 'music')).resolves.toMatchObject({ mimeType: 'video/mp4' });
    await expect(validateMediaArtifact(asset('silent.mp4', mp4('vide')), 'music')).rejects.toThrow('audio track');
    await expect(validateMediaArtifact(asset('video.mp4', mp4('vide')), 'video')).resolves.toMatchObject({ mimeType: 'video/mp4' });
  });
  it('rejects truncated containers, text files and empty WAV data', async () => {
    await expect(validateMediaArtifact(asset('truncated.mp4', mp4('soun').subarray(0, 40)), 'music')).rejects.toThrow();
    await expect(validateMediaArtifact(asset('reply.txt', Buffer.from('I generated a song for you')), 'music')).rejects.toThrow();
    const empty = wav(); empty.writeUInt32LE(0, 40); await expect(validateMediaArtifact(asset('empty.wav', empty), 'music')).rejects.toThrow();
    await expect(validateMediaArtifact(asset('track.wav', wav()), 'music')).resolves.toMatchObject({ mimeType: 'audio/wav' });
  });
  it('rejects images that the native decoder cannot open', async () => {
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jPZkAAAAASUVORK5CYII=', 'base64');
    await expect(validateMediaArtifact(asset('image.png', png), 'image')).resolves.toMatchObject({ mimeType: 'image/png' });
    await expect(validateMediaArtifact(asset('corrupt.png', png), 'image')).rejects.toThrow('decoded');
  });
  it('rejects a structurally valid container when the shipped player cannot decode it', async () => {
    playback.mockResolvedValueOnce(false);
    await expect(validateMediaArtifact(asset(), 'music')).rejects.toThrow('decoded for playback');
  });
});

describe('Persistent media jobs', () => {
  it('persists before dispatch and deduplicates by owner/key with identity conflicts', async () => {
    const metadata = path.join(dir, 'jobs.json'), store = new MediaJobStore(metadata, () => dir), execute = vi.fn(async (_signal, progress) => { progress({ provider: 'gemini', settings: { length: 'standard' }, submitted: true }); return result(asset()); });
    const job = store.create('a', 'request1', 'music', 'key', execute, cleanup);
    expect(JSON.parse(fs.readFileSync(metadata, 'utf8'))[0].status).toBe('queued');
    expect(store.create('a', 'request1', 'music', 'key', execute, cleanup).id).toBe(job.id);
    expect(() => store.create('a', 'request2', 'music', 'key', execute, cleanup)).toThrow('IDEMPOTENCY_CONFLICT');
    await store.settled(); expect(execute).toHaveBeenCalledTimes(1);
    expect(store.get(job.id, 'a')).toMatchObject({ status: 'completed', submitted: true, effective_settings: { length: 'standard' } });
    expect(store.get(job.id, 'b')).toBeUndefined();
    const publicJob = store.publicView(store.get(job.id, 'a')!); expect(publicJob).not.toHaveProperty('owner'); expect(publicJob.artifacts[0]).not.toHaveProperty('file');
    expect(store.artifact(job.id, publicJob.artifacts[0].id, 'a')?.file).toBe(fs.realpathSync(path.join(dir, 'track.mp4')));
    expect(store.artifact(job.id, publicJob.artifacts[0].id, 'b')).toBeUndefined();
    expect(store.artifact(job.id, '../../track.mp4', 'a')).toBeUndefined();
  });
  it('cancels queued work without dispatch and stops waiting after submission', async () => {
    const store = new MediaJobStore(path.join(dir, 'jobs.json'), () => dir), gate = deferred(), later = vi.fn(async () => result(asset()));
    const first = store.create('a', 'first', 'music', undefined, async (_s, progress) => { progress({ submitted: true }); await gate.promise; return result(asset()); }, cleanup);
    const second = store.create('a', 'second', 'music', undefined, later, cleanup);
    await Promise.resolve();
    expect(store.cancel(first.id, 'a')?.progress).toMatch(/may continue/);
    expect(store.cancel(second.id, 'a')?.progress).toMatch(/before submission/);
    gate.resolve(); await store.settled(); expect(later).not.toHaveBeenCalled(); expect(store.get(first.id, 'a')?.artifacts).toEqual([]);
  });
  it('recovers interrupted submissions as uncertain and never replays them', () => {
    const metadata = path.join(dir, 'jobs.json');
    fs.writeFileSync(metadata, JSON.stringify([{ id: 'submitted', owner: 'a', identity: 'i', idempotencyKey: 'k', mode: 'music', status: 'submitted', submitted: true, artifacts: [] }, { id: 'queued', owner: 'a', identity: 'q', mode: 'music', status: 'queued', submitted: false, artifacts: [] }]));
    const store = new MediaJobStore(metadata, () => dir), execute = vi.fn();
    expect(store.get('submitted', 'a')?.status).toBe('uncertain'); expect(store.get('queued', 'a')?.status).toBe('cancelled');
    expect(store.create('a', 'i', 'music', 'k', execute, cleanup).status).toBe('uncertain'); expect(execute).not.toHaveBeenCalled();
  });
  it.each([['text only', result()], ['partial', { structuredContent: { status: 'partial', artifacts: [] } }], ['uncertain', { isError: true, content: [{ text: '[WEBVIEW_SUBMISSION_UNCERTAIN] lost response' }] }]])('reports %s replies as failure or uncertainty', async (kind, response) => {
    const store = new MediaJobStore(path.join(dir, 'jobs.json'), () => dir);
    const job = store.create('a', kind, 'music', undefined, async () => response, cleanup); await store.settled();
    expect(store.get(job.id, 'a')?.status).toBe(kind === 'uncertain' ? 'uncertain' : 'failed');
    if (kind === 'text only') expect(store.get(job.id, 'a')?.error?.code).toBe('media_not_generated');
  });
  it('rejects artifact paths and symlinks outside the registered library', async () => {
    const library = path.join(dir, 'library'); fs.mkdirSync(library);
    const outside = asset(); fs.symlinkSync(outside, path.join(library, 'linked.mp4'));
    const store = new MediaJobStore(path.join(dir, 'jobs.json'), () => library);
    const job = store.create('a', 'i', 'music', undefined, async () => result(path.join(library, 'linked.mp4')), cleanup); await store.settled(); expect(store.get(job.id, 'a')?.status).toBe('failed');
  });
  it('does not expose a partly validated artifact batch after a later artifact fails', async () => {
    const store = new MediaJobStore(path.join(dir, 'jobs.json'), () => dir);
    const response = result(asset());
    response.structuredContent.artifacts.push(asset('not-media.txt', Buffer.from('No media')));
    const job = store.create('a', 'partial batch', 'music', undefined, async () => response, cleanup);
    await store.settled();
    expect(store.get(job.id, 'a')).toMatchObject({ status: 'failed', artifacts: [] });
  });
});

describe('HTTP media API', () => {
  let server: Server | undefined;
  afterEach(async () => { if (server) await new Promise<void>(resolve => server!.close(() => resolve())); server = undefined; });
  it('authenticates jobs and registered downloads independently of MCP sessions', async () => {
    vi.spyOn(ClientAuthManager, 'verifyToken').mockImplementation(token => token === 'owner-a' || token === 'owner-b');
    const store = new MediaJobStore(path.join(dir, 'jobs.json'), () => dir), execute = vi.fn(async () => result(asset())), validate = vi.fn();
    const app = express(); app.use(express.json()); app.use('/v1/media', createMediaRouter({ store: () => store, capabilities: () => [], validate, execute }));
    server = app.listen(0, '127.0.0.1'); await new Promise<void>((resolve, reject) => { server!.once('listening', resolve); server!.once('error', reject); });
    const base = `http://127.0.0.1:${(server.address() as any).port}/v1/media`;
    const request = (route: string, method = 'GET', body?: object, token = 'owner-a', key?: string) => fetch(base + route, { method, headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json', 'mcp-session-id': 'irrelevant', ...(key ? { 'Idempotency-Key': key } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    expect((await request('/capabilities', 'GET', undefined, 'invalid')).status).toBe(401);
    expect((await request('/capabilities')).status).toBe(200);
    const response = await request('/jobs', 'POST', { mode: 'music', prompt: 'Test track' }, 'owner-a', 'same'); expect(response.status).toBe(202); const job = await response.json();
    const duplicate = await request('/jobs', 'POST', { mode: 'music', prompt: 'Test track' }, 'owner-a', 'same'); expect((await duplicate.json()).id).toBe(job.id);
    expect((await request('/jobs', 'POST', { mode: 'music', prompt: 'Different track' }, 'owner-a', 'same')).status).toBe(409);
    await store.settled(); expect(execute).toHaveBeenCalledTimes(1);
    const status = await (await request('/jobs/' + job.id)).json(); expect(status.status).toBe('completed');
    expect((await request('/jobs/' + job.id, 'GET', undefined, 'owner-b')).status).toBe(404);
    expect((await request('/jobs/' + job.id + '/cancel', 'POST', undefined, 'owner-b')).status).toBe(404);
    const url = status.artifacts[0].download_url.replace('/v1/media', '');
    const download = await request(url); expect(download.status).toBe(200); expect(Buffer.from(await download.arrayBuffer())).toEqual(mp4('soun'));
    expect((await request(url, 'GET', undefined, 'owner-b')).status).toBe(404);
    expect((await request('/jobs/' + job.id + '/artifacts/arbitrary-file')).status).toBe(404);
    validate.mockImplementation(() => { throw new Error('Provider is now unavailable'); });
    const recovered = await request('/jobs', 'POST', { mode: 'music', prompt: 'Test track' }, 'owner-a', 'same');
    expect(recovered.status).toBe(202); expect((await recovered.json()).id).toBe(job.id);
    expect((await request('/jobs', 'POST', { mode: 'music', prompt: 'New track' })).status).toBe(400);
    expect(execute).toHaveBeenCalledTimes(1);
  });
  it('canonicalizes key order while preserving settings and attachment identities', () => {
    const a = { mode: 'video' as const, prompt: 'scene', settings: { sound: true, duration_seconds: 6 } };
    expect(canonicalMediaIdentity(a, 'image-a')).toBe(canonicalMediaIdentity({ prompt: 'scene', mode: 'video', settings: { duration_seconds: 6, sound: true } }, 'image-a'));
    expect(canonicalMediaIdentity(a, 'image-a')).not.toBe(canonicalMediaIdentity({ ...a, settings: { sound: false, duration_seconds: 6 } }, 'image-a'));
    expect(canonicalMediaIdentity(a, 'image-a')).not.toBe(canonicalMediaIdentity(a, 'image-b'));
  });
  it('stages real reference bytes, validates their kinds, and cleans them after the job', async () => {
    vi.spyOn(ClientAuthManager, 'verifyToken').mockReturnValue(true);
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jPZkAAAAASUVORK5CYII=', 'base64');
    const store = new MediaJobStore(path.join(dir, 'jobs.json'), () => dir);
    let stagedPath = '';
    const validate = vi.fn((_request, files) => { if (files) expect(files[0]).toMatchObject({ kind: 'image', mimeType: 'image/png', size: png.length }); });
    const execute = vi.fn(async request => {
      stagedPath = request.files[0].path;
      expect(fs.readFileSync(stagedPath)).toEqual(png);
      expect(request.settings).toEqual({ aspect_ratio: '16:9' });
      return result(asset('scene.mp4', mp4('vide')));
    });
    const app = express(); app.use(express.json()); app.use('/v1/media', createMediaRouter({ store: () => store, capabilities: () => [], validate, execute }));
    server = app.listen(0, '127.0.0.1'); await new Promise<void>((resolve, reject) => { server!.once('listening', resolve); server!.once('error', reject); });
    const url = `http://127.0.0.1:${(server.address() as any).port}/v1/media/jobs`;
    const submit = (body: object) => fetch(url, { method: 'POST', headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const files = [{ name: 'reference.png', mimeType: 'image/png', data: png.toString('base64') }];
    expect((await submit({ mode: 'video', prompt: 'Animate this reference', settings: { aspect_ratio: '16:9' }, files })).status).toBe(202);
    await store.settled(); expect(execute).toHaveBeenCalledOnce(); expect(validate).toHaveBeenCalledTimes(1); expect(fs.existsSync(stagedPath)).toBe(false);
    expect((await submit({ mode: 'music', prompt: 'Track', files })).status).toBe(400);
    expect((await submit({ mode: 'image', prompt: 'Reference', files: [{ name: 'reference.png', mimeType: 'image/png', data: 'bm90IGFuIGltYWdl' }] })).status).toBe(400);
    expect(execute).toHaveBeenCalledOnce();
  });
  it.each([{ mode: 'general', prompt: 'x' }, { mode: 'music', prompt: '' }, { mode: 'image', prompt: 'x', arbitrary_path: '/tmp' }, { mode: 'video', prompt: 'x', temporary_chat: 'yes' }])('rejects malformed jobs %j', body => expect(() => parseMediaRequest(body)).toThrow());
});
