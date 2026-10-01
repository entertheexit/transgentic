import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import type { MediaMode, MediaSettings } from '../../shared/media.js';
import { validateMediaArtifact } from './artifacts.js';

export interface MediaJob {
  id: string; owner: string; identity: string; idempotencyKey?: string;
  mode: MediaMode; createdAt: number; updatedAt: number;
  status: 'queued' | 'running' | 'submitted' | 'completed' | 'failed' | 'cancelled' | 'uncertain';
  provider?: string; model?: string; effective_settings?: MediaSettings; submitted: boolean;
  progress?: string; error?: { code: string; message: string };
  artifacts: Array<{ id: string; file: string; name: string; mime_type: string; bytes: number }>;
}
export type JobProgress = (state: { provider?: string; model?: string; settings?: MediaSettings; submitted?: boolean; progress?: string }) => void;
const terminal = new Set(['completed', 'failed', 'cancelled', 'uncertain']);

/** Metadata is durable before dispatch. Restart recovery never replays requests. */
export class MediaJobStore {
  private jobs = new Map<string, MediaJob>();
  private controllers = new Map<string, AbortController>();
  private tail: Promise<void> = Promise.resolve();
  constructor(private metadataFile: string, private libraryRoot: () => string) {
    if (fs.existsSync(metadataFile)) {
      const saved = JSON.parse(fs.readFileSync(metadataFile, 'utf8'));
      if (!Array.isArray(saved)) throw new Error('Invalid media job metadata.');
      for (const job of saved) {
        if (!job?.id || !job.owner || !Array.isArray(job.artifacts)) throw new Error('Invalid persisted media job.');
        if (!terminal.has(job.status)) {
          job.status = job.submitted ? 'uncertain' : 'cancelled';
          job.error = { code: job.submitted ? 'submission_uncertain' : 'interrupted_before_submission', message: 'Application restarted. This job will not be submitted again.' };
          job.updatedAt = Date.now();
        }
        this.jobs.set(job.id, job);
      }
      this.save();
    }
  }
  private save() {
    fs.mkdirSync(path.dirname(this.metadataFile), { recursive: true });
    const temporary = `${this.metadataFile}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify([...this.jobs.values()]), { mode: 0o600 });
    fs.renameSync(temporary, this.metadataFile);
  }
  get(id: string, owner: string): MediaJob | undefined { const job = this.jobs.get(id); return job?.owner === owner ? structuredClone(job) : undefined; }
  publicView(job: MediaJob) {
    const { owner: _owner, identity: _identity, idempotencyKey: _key, artifacts, ...rest } = job;
    return { ...rest, artifacts: artifacts.map(({ file: _file, ...artifact }) => ({ ...artifact, download_url: `/v1/media/jobs/${job.id}/artifacts/${artifact.id}` })) };
  }
  findIdempotent(owner: string, identity: string, key?: string): MediaJob | undefined {
    if (key && (key.length > 200 || !/^[\x21-\x7e]+$/.test(key))) throw new Error('Invalid Idempotency-Key.');
    const existing = key && [...this.jobs.values()].find(j => j.owner === owner && j.idempotencyKey === key);
    if (!existing) return undefined;
    if (existing.identity !== identity) throw new Error('[IDEMPOTENCY_CONFLICT] The key belongs to a different request.');
    return structuredClone(existing);
  }
  create(owner: string, identity: string, mode: MediaMode, key: string | undefined, execute: (signal: AbortSignal, progress: JobProgress) => Promise<any>, cleanup: () => Promise<void>): MediaJob {
    const existing = this.findIdempotent(owner, identity, key);
    if (existing) { void cleanup().catch(error => console.error('[Media jobs] Duplicate cleanup failed:', error)); return existing; }
    const job: MediaJob = { id: crypto.randomUUID(), owner, identity, idempotencyKey: key, mode, createdAt: Date.now(), updatedAt: Date.now(), status: 'queued', submitted: false, artifacts: [] };
    this.jobs.set(job.id, job);
    try { this.save(); } catch (error) { this.jobs.delete(job.id); throw error; }
    const controller = new AbortController(); this.controllers.set(job.id, controller);
    const update: JobProgress = state => {
      if (terminal.has(job.status)) return;
      if (state.submitted) { job.submitted = true; job.status = 'submitted'; }
      if (state.provider) job.provider = state.provider;
      if (state.model) job.model = state.model;
      if (state.settings) job.effective_settings = { ...state.settings };
      if (state.progress) job.progress = state.progress;
      job.updatedAt = Date.now(); this.save();
    };
    this.tail = this.tail.then(async () => {
      try {
        if (controller.signal.aborted) return;
        job.status = 'running'; update({ progress: 'Preparing media request' });
        const result = await execute(controller.signal, update);
        if (controller.signal.aborted) return;
        if (result.isError || result.structuredContent?.status !== 'completed') throw new Error(result.content?.[0]?.text || 'Media generation failed.');
        const files: string[] = result.structuredContent?.artifacts || [];
        if (!files.length) throw new Error('[MEDIA_NOT_GENERATED] No media artifact was generated.');
        for (const file of files) {
          const resolved = this.checkedPath(file);
          const { bytes, mimeType } = await validateMediaArtifact(resolved, mode);
          job.artifacts.push({ id: crypto.randomUUID(), file: resolved, name: path.basename(resolved), bytes, mime_type: mimeType });
        }
        if (controller.signal.aborted) { job.artifacts = []; return; }
        job.provider = result.metadata?.providerUsed || job.provider;
        job.status = 'completed'; job.progress = 'Media saved';
      } catch (error: any) {
        if (!controller.signal.aborted) {
          job.artifacts = [];
          const uncertain = /SUBMISSION_UNCERTAIN/.test(error.message || '');
          job.status = uncertain ? 'uncertain' : 'failed';
          job.error = { code: uncertain ? 'submission_uncertain' : /MEDIA_NOT_GENERATED/.test(error.message || '') ? 'media_not_generated' : 'media_generation_failed', message: String(error.message || error) };
        }
      } finally {
        job.updatedAt = Date.now(); this.save(); this.controllers.delete(job.id); await cleanup();
      }
    }).catch(error => { console.error('[Media jobs] Queue persistence/cleanup failed:', error); });
    return structuredClone(job);
  }
  cancel(id: string, owner: string): MediaJob | undefined {
    const job = this.jobs.get(id); if (!job || job.owner !== owner) return undefined;
    if (!terminal.has(job.status)) {
      this.controllers.get(id)?.abort(); job.status = 'cancelled'; job.updatedAt = Date.now();
      job.progress = job.submitted ? 'Stopped waiting. Provider generation may continue.' : 'Cancelled before submission'; this.save();
    }
    return structuredClone(job);
  }
  private checkedPath(file: string) {
    const root = fs.realpathSync(this.libraryRoot()), resolved = fs.realpathSync(file);
    if (!resolved.startsWith(root + path.sep) || !fs.statSync(resolved).isFile()) throw new Error('Artifact is outside the media library.');
    return resolved;
  }
  artifact(id: string, artifactId: string, owner: string) {
    const job = this.get(id, owner); const artifact = job?.status === 'completed' ? job.artifacts.find(a => a.id === artifactId) : undefined;
    return artifact ? { ...artifact, file: this.checkedPath(artifact.file) } : undefined;
  }
  async settled() { await this.tail; }
}
