import express from 'express';
import crypto from 'node:crypto';
import type { MediaCapability, MediaMode, MediaPreferences } from '../../shared/media.js';
import { normalizeMediaPreferences } from '../../shared/media.js';
import { ATTACHMENT_LIMITS } from '../../shared/attachments.js';
import type { StagedAttachment } from '../../shared/attachments.js';
import { ClientAuthManager } from '../security/clientAuth.js';
import { AttachmentManager } from '../attachments/attachmentManager.js';
import type { MediaJobStore, JobProgress } from './jobs.js';

export interface MediaRequest extends MediaPreferences {
  mode: MediaMode; prompt: string; provider?: string; model?: string;
  files?: unknown; thread_id?: string; new_thread?: boolean; temporary_chat?: boolean; project_name?: string;
}
export function parseMediaRequest(body: unknown): MediaRequest {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('A media request object is required.');
  const b = body as Record<string, unknown>;
  const allowed = new Set(['mode', 'prompt', 'provider', 'model', 'settings', 'provider_settings', 'files', 'thread_id', 'new_thread', 'temporary_chat', 'project_name']);
  if (Object.keys(b).some(k => !allowed.has(k))) throw new Error('Unknown media request field.');
  if (!['image', 'video', 'music'].includes(String(b.mode)) || typeof b.prompt !== 'string' || !b.prompt.trim() || b.prompt.length > 200000) throw new Error('Valid mode and nonempty prompt (at most 200000 characters) are required.');
  for (const k of ['provider', 'model', 'thread_id', 'project_name']) if (b[k] !== undefined && (typeof b[k] !== 'string' || !b[k] || (b[k] as string).length > 256)) throw new Error(`Invalid ${k}.`);
  for (const k of ['new_thread', 'temporary_chat']) if (b[k] !== undefined && typeof b[k] !== 'boolean') throw new Error(`Invalid ${k}.`);
  return { ...b, ...normalizeMediaPreferences(b) } as MediaRequest;
}
export function canonicalMediaIdentity(request: Omit<MediaRequest, 'files'>, attachments: string) {
  const ordered = (v: any): any => Array.isArray(v) ? v.map(ordered) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().filter(k => v[k] !== undefined).map(k => [k, ordered(v[k])])) : v;
  return crypto.createHash('sha256').update(JSON.stringify(ordered({ ...request, files: undefined, attachment_identity: attachments }))).digest('hex');
}
export function createMediaRouter(options: {
  store: () => MediaJobStore;
  capabilities: () => MediaCapability[];
  validate: (request: MediaRequest, files?: readonly StagedAttachment[]) => void;
  execute: (request: MediaRequest, signal: AbortSignal, progress: JobProgress, session: string) => Promise<any>;
}) {
  const router = express.Router();
  router.use((req, res, next) => {
    const token = req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7).trim() : undefined;
    if (!ClientAuthManager.verifyToken(token)) { res.status(401).json({ error: { code: 'unauthorized', message: 'Media endpoints require a Bearer token.' } }); return; }
    res.locals.mediaOwner = crypto.createHash('sha256').update(token!).digest('hex'); next();
  });
  router.get('/capabilities', (_req, res) => res.json({ capabilities: options.capabilities(), attachment_limits: ATTACHMENT_LIMITS }));
  router.post('/jobs', async (req, res) => {
    let cleanup: (() => Promise<void>) | undefined;
    try {
      const request = parseMediaRequest(req.body);
      const remote = req.socket.remoteAddress || '';
      const staged = await AttachmentManager.stage(request.files, { loopback: ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(remote), mode: request.mode });
      cleanup = staged.cleanup;
      if (request.mode === 'music' && staged.envelope.files.length || staged.envelope.files.some(file => request.mode === 'image' ? file.kind !== 'image' : file.kind !== 'image' && file.kind !== 'video')) throw new Error('Only supported reference images/video files may be supplied to media jobs.');
      const identity = canonicalMediaIdentity(request, staged.envelope.identity);
      const store = options.store();
      const existing = store.findIdempotent(res.locals.mediaOwner, identity, req.get('Idempotency-Key'));
      if (existing) { await cleanup(); cleanup = undefined; res.status(202).json(store.publicView(existing)); return; }
      options.validate(request, staged.envelope.files);
      const execution = { ...request, files: staged.envelope.files.map(f => ({ path: f.path, name: f.name, mimeType: f.mimeType })) };
      const job = store.create(res.locals.mediaOwner, identity, request.mode, req.get('Idempotency-Key'), (signal, progress) => options.execute(execution, signal, progress, `media_${res.locals.mediaOwner}_${request.thread_id || identity}`), staged.cleanup);
      cleanup = undefined;
      res.status(202).json(store.publicView(job));
    } catch (error: any) { await cleanup?.(); res.status(/IDEMPOTENCY_CONFLICT/.test(error.message) ? 409 : 400).json({ error: { code: 'invalid_media_request', message: error.message } }); }
  });
  router.get('/jobs/:id', (req, res) => { const store = options.store(), job = store.get(req.params.id, res.locals.mediaOwner); if (!job) { res.sendStatus(404); return; } res.json(store.publicView(job)); });
  router.post('/jobs/:id/cancel', (req, res) => { const store = options.store(), job = store.cancel(req.params.id, res.locals.mediaOwner); if (!job) { res.sendStatus(404); return; } res.json(store.publicView(job)); });
  router.get('/jobs/:id/artifacts/:artifactId', (req, res) => {
    try {
      const artifact = options.store().artifact(req.params.id, req.params.artifactId, res.locals.mediaOwner);
      if (!artifact) { res.sendStatus(404); return; }
      res.setHeader('X-Content-Type-Options', 'nosniff'); res.type(artifact.mime_type); res.download(artifact.file, artifact.name);
    } catch { res.sendStatus(404); }
  });
  return router;
}
