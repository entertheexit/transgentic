import { afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { AttachmentManager } from '../src/main/attachments/attachmentManager.js';
import { ATTACHMENT_LIMITS } from '../src/shared/attachments.js';

vi.mock('electron', () => ({ app: undefined }));

const roots: string[] = [];
const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from('test')]);

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe('request-scoped attachment manager', () => {
  it('validates inline data, hashes it, stages privately, and cleans it up', async () => {
    const result = await AttachmentManager.stage([{ data: png.toString('base64'), name: 'reference.png', mimeType: 'image/png' }], { loopback: false, mode: 'image' });
    const file = result.envelope.files[0];
    expect(file).toMatchObject({ name: 'reference.png', mimeType: 'image/png', kind: 'image', size: png.length });
    expect(file.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(fs.statSync(file.path).mode & 0o777).toBe(0o600);
    const stagedRoot = path.dirname(file.path);
    await result.cleanup();
    expect(fs.existsSync(stagedRoot)).toBe(false);
  });

  it('allows an absolute symlink for an authenticated loopback caller but rejects paths remotely', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'transgentic-attachment-source-'));
    roots.push(root);
    const target = path.join(root, 'note.txt');
    const link = path.join(root, 'note-link.txt');
    fs.writeFileSync(target, 'hello', { mode: 0o600 });
    fs.symlinkSync(target, link);
    await expect(AttachmentManager.stage([{ path: link }], { loopback: false, mode: 'general' })).rejects.toThrow('loopback');
    const result = await AttachmentManager.stage([{ path: link }], { loopback: true, mode: 'general' });
    expect(result.envelope.files[0]).toMatchObject({ name: 'note.txt', kind: 'document' });
    await result.cleanup();
  });

  it('rejects ambiguous descriptors, malformed base64, MIME mismatches, count overflow, and video outside Video mode', async () => {
    await expect(AttachmentManager.stage([{ path: '/tmp/a', url: 'https://example.com/a' }], { loopback: true, mode: 'general' })).rejects.toThrow('exactly one');
    await expect(AttachmentManager.stage([{ data: '%%%', name: 'x.png', mimeType: 'image/png' }], { loopback: false, mode: 'image' })).rejects.toThrow('malformed base64');
    await expect(AttachmentManager.stage([{ data: png.toString('base64'), name: 'x.png', mimeType: 'application/pdf' }], { loopback: false, mode: 'image' })).rejects.toThrow('does not match');
    await expect(AttachmentManager.stage(Array.from({ length: 11 }, () => ({ data: png.toString('base64'), name: 'x.png', mimeType: 'image/png' })), { loopback: false, mode: 'image' })).rejects.toThrow('at most 10');
    const mp4 = Buffer.concat([Buffer.alloc(4), Buffer.from('ftypisom'), Buffer.alloc(8)]);
    await expect(AttachmentManager.stage([{ data: mp4.toString('base64'), name: 'x.mp4', mimeType: 'video/mp4' }], { loopback: false, mode: 'general' })).rejects.toThrow('only in Video mode');
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'transgentic-oversize-'));
    roots.push(root);
    const oversized = path.join(root, 'oversized.txt');
    fs.writeFileSync(oversized, 'x');
    fs.truncateSync(oversized, ATTACHMENT_LIMITS.maxFileBytes + 1);
    await expect(AttachmentManager.stage([{ path: oversized }], { loopback: true, mode: 'general' })).rejects.toThrow('50 MB');
  });

  it('blocks private URL targets before fetching and cleans up cancellation', async () => {
    await expect(AttachmentManager.stage([{ url: 'https://127.0.0.1/private.png' }], { loopback: false, mode: 'image' })).rejects.toThrow('private');
    const controller = new AbortController();
    controller.abort();
    await expect(AttachmentManager.stage([{ data: png.toString('base64'), name: 'x.png', mimeType: 'image/png' }], { loopback: false, mode: 'image', signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' });
  });
});
