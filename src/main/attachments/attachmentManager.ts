import crypto from 'node:crypto';
import dns from 'node:dns/promises';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { app } from 'electron';
import {
  ATTACHMENT_LIMITS,
  attachmentIdentity,
  attachmentKindForMime,
  type AttachmentInput,
  type RequestAttachmentEnvelope,
  type StagedAttachment,
} from '../../shared/attachments.js';
import type { TaskMode } from '../../shared/types.js';

const TEXT_EXTENSIONS = new Set([
  '.txt', '.md', '.markdown', '.csv', '.tsv', '.json', '.jsonl', '.xml', '.yaml', '.yml', '.toml', '.ini', '.log',
  '.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx', '.css', '.scss', '.html', '.htm', '.py', '.rb', '.php', '.java',
  '.kt', '.kts', '.swift', '.go', '.rs', '.c', '.h', '.cpp', '.hpp', '.cs', '.sh', '.zsh', '.fish', '.sql', '.graphql',
]);

function safeName(value: string | undefined, fallback: string): string {
  const base = path.basename((value || fallback).replace(/[\u0000-\u001f\u007f]/g, '')).trim();
  const cleaned = base.replace(/[^\p{L}\p{N}._ -]+/gu, '_').slice(0, 160);
  return cleaned && cleaned !== '.' && cleaned !== '..' ? cleaned : fallback;
}

function normalizeMime(value: string | undefined): string | undefined {
  const mime = value?.toLowerCase().split(';', 1)[0].trim();
  return mime && /^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/.test(mime) ? mime : undefined;
}

function sniffMime(bytes: Buffer, name: string, declared?: string): string | undefined {
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.length >= 6 && ['GIF87a', 'GIF89a'].includes(bytes.subarray(0, 6).toString('ascii'))) return 'image/gif';
  if (bytes.length >= 12 && bytes.subarray(0, 4).toString('ascii') === 'RIFF' && bytes.subarray(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
  if (bytes.length >= 5 && bytes.subarray(0, 5).toString('ascii') === '%PDF-') return 'application/pdf';
  if (bytes.length >= 4 && bytes.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))) return 'video/webm';
  if (bytes.length >= 12 && bytes.subarray(4, 8).toString('ascii') === 'ftyp') {
    const brand = bytes.subarray(8, 12).toString('ascii').toLowerCase();
    return ['qt  '].includes(brand) ? 'video/quicktime' : 'video/mp4';
  }
  const ext = path.extname(name).toLowerCase();
  const textual = attachmentKindForMime(declared || '') === 'document' && declared !== 'application/pdf' || (!declared && TEXT_EXTENSIONS.has(ext));
  if (textual) {
    try {
      new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      return declared || 'text/plain';
    } catch {
      throw new Error(`Attachment "${name}" is not valid UTF-8 text.`);
    }
  }
  return undefined;
}

function decodeBase64(value: string, name: string): Buffer {
  const compact = value.replace(/\s+/g, '');
  if (!compact || compact.length % 4 === 1 || !/^[A-Za-z0-9+/]*={0,2}$/.test(compact)) throw new Error(`Attachment "${name}" contains malformed base64 data.`);
  const bytes = Buffer.from(compact, 'base64');
  const canonical = bytes.toString('base64').replace(/=+$/, '');
  if (canonical !== compact.replace(/=+$/, '')) throw new Error(`Attachment "${name}" contains malformed base64 data.`);
  return bytes;
}

function isPrivateIp(address: string): boolean {
  const normalized = address.toLowerCase().replace(/^::ffff:/, '');
  if (normalized === '::' || normalized === '::1' || normalized.startsWith('fe80:') || normalized.startsWith('fc') || normalized.startsWith('fd')) return true;
  if (net.isIP(normalized) !== 4) return false;
  const [a, b] = normalized.split('.').map(Number);
  return a === 0 || a === 10 || a === 127 || a >= 224 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
}

async function assertPublicHttps(url: URL): Promise<void> {
  if (url.protocol !== 'https:') throw new Error('Attachment URLs must use public HTTPS or a data: URL.');
  if (url.username || url.password) throw new Error('Credentialed attachment URLs are not allowed.');
  if (!url.hostname) throw new Error('Attachment URL is missing a hostname.');
  const addresses = await dns.lookup(url.hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some(item => isPrivateIp(item.address))) throw new Error('Attachment URL resolves to a private, loopback, or link-local address.');
}

async function fetchPublicFile(initialUrl: string, signal?: AbortSignal): Promise<{ bytes: Buffer; mimeType?: string; name: string }> {
  let current = new URL(initialUrl);
  const fetchSignal = signal ? AbortSignal.any([signal, AbortSignal.timeout(30_000)]) : AbortSignal.timeout(30_000);
  for (let redirects = 0; redirects <= 3; redirects++) {
    await assertPublicHttps(current);
    const response = await fetch(current, { redirect: 'manual', signal: fetchSignal, headers: { Accept: '*/*' } });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location');
      if (!location || redirects === 3) throw new Error('Attachment URL exceeded the redirect limit.');
      current = new URL(location, current);
      continue;
    }
    if (!response.ok) throw new Error(`Attachment URL returned HTTP ${response.status}.`);
    const declaredLength = Number(response.headers.get('content-length') || 0);
    if (declaredLength > ATTACHMENT_LIMITS.maxFileBytes) throw new Error('Attachment URL exceeds the 50 MB per-file limit.');
    if (!response.body) throw new Error('Attachment URL returned no body.');
    const chunks: Buffer[] = [];
    let size = 0;
    const reader = response.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > ATTACHMENT_LIMITS.maxFileBytes) { await reader.cancel(); throw new Error('Attachment URL exceeds the 50 MB per-file limit.'); }
      chunks.push(Buffer.from(value));
    }
    return {
      bytes: Buffer.concat(chunks, size),
      mimeType: normalizeMime(response.headers.get('content-type') || undefined),
      name: safeName(path.basename(current.pathname), 'attachment'),
    };
  }
  throw new Error('Attachment URL could not be fetched.');
}

function parseDataUrl(value: string): { bytes: Buffer; mimeType: string } {
  const match = /^data:([^;,]+);base64,([\s\S]*)$/i.exec(value);
  if (!match) throw new Error('Only base64-encoded data: attachment URLs are supported.');
  const mimeType = normalizeMime(match[1]);
  if (!mimeType) throw new Error('Data URL has an invalid MIME type.');
  return { bytes: decodeBase64(match[2], 'data URL'), mimeType };
}

function ensureModeAllows(kind: string, mode: TaskMode, name: string): void {
  if (kind === 'video' && mode !== 'video') throw new Error(`Video attachment "${name}" is accepted only in Video mode.`);
  if (mode === 'music') throw new Error('Music mode does not accept file attachments.');
}

export class AttachmentManager {
  static async stage(inputs: unknown, options: { loopback: boolean; mode: TaskMode; signal?: AbortSignal }): Promise<{ envelope: RequestAttachmentEnvelope; cleanup: () => Promise<void> }> {
    if (inputs === undefined || inputs === null) return { envelope: { files: [], identity: '', totalBytes: 0 }, cleanup: async () => {} };
    if (!Array.isArray(inputs)) throw new Error('files must be an array.');
    if (inputs.length > ATTACHMENT_LIMITS.maxFiles) throw new Error(`A request may include at most ${ATTACHMENT_LIMITS.maxFiles} files.`);
    if (inputs.length === 0) return { envelope: { files: [], identity: '', totalBytes: 0 }, cleanup: async () => {} };
    const base = app?.getPath ? path.join(app.getPath('userData'), 'attachment-runs') : path.join(os.tmpdir(), 'transgentic-attachment-runs');
    fs.mkdirSync(base, { recursive: true, mode: 0o700 });
    const root = fs.realpathSync(fs.mkdtempSync(path.join(base, 'request-')));
    const staged: StagedAttachment[] = [];
    let totalBytes = 0;
    const cleanup = async () => { await fs.promises.rm(root, { recursive: true, force: true }); };
    try {
      for (let index = 0; index < inputs.length; index++) {
        if (options.signal?.aborted) { const error = new Error('Request cancelled.'); error.name = 'AbortError'; throw error; }
        const raw = inputs[index] as AttachmentInput;
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error(`files[${index}] must be an object.`);
        const sourceKeys = ['path', 'data', 'url'].filter(key => typeof (raw as any)[key] === 'string');
        if (sourceKeys.length !== 1) throw new Error(`files[${index}] must specify exactly one of path, data, or url.`);

        let bytes: Buffer;
        let sourceName = (raw as any).name as string | undefined;
        let sourceMime = normalizeMime((raw as any).mimeType);
        if (sourceKeys[0] === 'path') {
          if (!options.loopback) throw new Error('Host file paths are allowed only for authenticated loopback clients.');
          const requested = (raw as any).path as string;
          if (!path.isAbsolute(requested)) throw new Error('Attachment paths must be absolute.');
          const real = await fs.promises.realpath(requested);
          const stat = await fs.promises.stat(real);
          if (!stat.isFile()) throw new Error('Attachment path must resolve to a readable regular file.');
          if (stat.size > ATTACHMENT_LIMITS.maxFileBytes) throw new Error('Attachment exceeds the 50 MB per-file limit.');
          await fs.promises.access(real, fs.constants.R_OK);
          sourceName ||= path.basename(real);
          bytes = await fs.promises.readFile(real);
        } else if (sourceKeys[0] === 'data') {
          if (!sourceName || !sourceMime) throw new Error(`files[${index}] with data requires name and mimeType.`);
          bytes = decodeBase64((raw as any).data, sourceName);
        } else {
          const value = (raw as any).url as string;
          if (value.startsWith('data:')) {
            const parsed = parseDataUrl(value);
            bytes = parsed.bytes;
            sourceMime ||= parsed.mimeType;
            sourceName ||= 'attachment';
          } else {
            const fetched = await fetchPublicFile(value, options.signal);
            bytes = fetched.bytes;
            sourceMime ||= fetched.mimeType;
            sourceName ||= fetched.name;
          }
        }
        const name = safeName(sourceName, `attachment-${index + 1}`);
        if (bytes.byteLength > ATTACHMENT_LIMITS.maxFileBytes) throw new Error(`Attachment "${name}" exceeds the 50 MB per-file limit.`);
        totalBytes += bytes.byteLength;
        if (totalBytes > ATTACHMENT_LIMITS.maxTotalBytes) throw new Error('Decoded attachments exceed the 100 MB request limit.');
        const detectedMime = sniffMime(bytes, name, sourceMime);
        if (!detectedMime) throw new Error(`Attachment "${name}" has an unsupported or unrecognized format.`);
        if (sourceMime && sourceMime !== detectedMime) throw new Error(`Attachment "${name}" MIME type does not match its contents.`);
        const mimeType = detectedMime;
        const kind = attachmentKindForMime(mimeType);
        if (!kind) throw new Error(`Attachment "${name}" has unsupported MIME type ${mimeType}.`);
        ensureModeAllows(kind, options.mode, name);
        const sha256 = crypto.createHash('sha256').update(bytes).digest('hex');
        const stagedPath = path.join(root, `${String(index + 1).padStart(2, '0')}-${sha256.slice(0, 12)}-${name}`);
        await fs.promises.writeFile(stagedPath, bytes, { mode: 0o600, flag: 'wx' });
        staged.push({ path: stagedPath, name, mimeType, kind, size: bytes.byteLength, sha256 });
      }
      return { envelope: { files: staged, identity: attachmentIdentity(staged), totalBytes }, cleanup };
    } catch (error) {
      await cleanup();
      throw error;
    }
  }
}

export function attachmentLogSummary(files: readonly StagedAttachment[]) {
  return {
    attachmentCount: files.length,
    attachmentBytes: files.reduce((total, file) => total + file.size, 0),
    attachments: files.map(({ name, mimeType, size, sha256 }) => ({ name, mimeType, size, sha256 })),
  };
}
