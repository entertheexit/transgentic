import fs from 'fs';
import path from 'path';
import { app } from 'electron';
import { McpRequestLog, MODE_SCHEMA_VERSION } from '../../shared/types.js';

export function migratePersistedLog(log: McpRequestLog): McpRequestLog {
  const legacyMode = log.modeSchemaVersion !== MODE_SCHEMA_VERSION && log.mode === 'audio' ? 'music' : log.mode;
  let mediaPath = log.mediaPath;
  if (mediaPath?.includes(`${path.sep}Library${path.sep}Audios${path.sep}`)) {
    const migratedPath = mediaPath.replace(`${path.sep}Library${path.sep}Audios${path.sep}`, `${path.sep}Library${path.sep}Music${path.sep}`);
    if (!fs.existsSync(mediaPath) && fs.existsSync(migratedPath)) mediaPath = migratedPath;
  }
  return { ...log, modeSchemaVersion: MODE_SCHEMA_VERSION, mode: legacyMode, ...(mediaPath ? { mediaPath } : {}) };
}

export class PersistentLogStorage {
  private inMemoryCache: McpRequestLog[] = [];
  private isLoaded = false;

  private getStoragePath(): string {
    try {
      if (app && typeof app.getPath === 'function') {
        return path.join(app.getPath('userData'), 'request_logs.json');
      }
    } catch {}
    return path.join(process.cwd(), 'request_logs.json');
  }

  private ensureLoaded(): void {
    if (this.isLoaded) return;
    try {
      const filePath = this.getStoragePath();
      if (fs.existsSync(filePath)) {
        const raw = fs.readFileSync(filePath, 'utf-8');
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          let hasUnfinished = false;
          this.inMemoryCache = parsed.map((l: McpRequestLog) => {
            l = migratePersistedLog(l);
            if (l.status === 'pending' || (l.status as any) === 'processing' || (l.status as any) === 'routing' || l.status === 'fallback') {
              hasUnfinished = true;
              return {
                ...l,
                status: 'failed' as const,
                error: l.error || 'Terminated: App exited during execution.',
              };
            }
            return l;
          });
          if (hasUnfinished) {
            this.flushToDisk();
          }
        }
      }
    } catch (e: any) {
      console.warn('[Transgentic LogStorage] Error loading logs:', e.message);
      this.inMemoryCache = [];
    }
    this.isLoaded = true;
  }

  private flushToDisk(): void {
    try {
      const filePath = this.getStoragePath();
      const dir = path.dirname(filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      // Cap persistent logs at 1,000 items to guarantee zero memory or disk bloat
      const trimmed = this.inMemoryCache.slice(0, 1000);
      fs.writeFileSync(filePath, JSON.stringify(trimmed, null, 2), 'utf-8');
    } catch (e: any) {
      console.warn('[Transgentic LogStorage] Error saving logs:', e.message);
    }
  }

  public insert(log: McpRequestLog): void {
    this.ensureLoaded();
    log = { ...log, modeSchemaVersion: MODE_SCHEMA_VERSION };
    const existingIdx = this.inMemoryCache.findIndex((l) => l.id === log.id);
    if (existingIdx !== -1) {
      this.inMemoryCache[existingIdx] = { ...log };
    } else {
      this.inMemoryCache.unshift({ ...log });
    }
    this.flushToDisk();
  }

  public update(log: McpRequestLog): void {
    this.ensureLoaded();
    log = { ...log, modeSchemaVersion: MODE_SCHEMA_VERSION };
    const idx = this.inMemoryCache.findIndex((l) => l.id === log.id);
    if (idx !== -1) {
      this.inMemoryCache[idx] = { ...log };
    } else {
      this.inMemoryCache.unshift({ ...log });
    }
    this.flushToDisk();
  }

  public query(limit = 20, offset = 0): { logs: McpRequestLog[]; total: number } {
    this.ensureLoaded();
    const total = this.inMemoryCache.length;
    const logs = this.inMemoryCache.slice(offset, offset + limit);
    return { logs, total };
  }

  public getAll(): McpRequestLog[] {
    this.ensureLoaded();
    return [...this.inMemoryCache];
  }

  public getById(id: string): McpRequestLog | undefined {
    this.ensureLoaded();
    return this.inMemoryCache.find((l) => l.id === id);
  }

  public getPending(): McpRequestLog[] {
    this.ensureLoaded();
    return this.inMemoryCache.filter((l) => l.status === 'pending');
  }

  public updateStatus(id: string, status: McpRequestLog['status'], error?: string): McpRequestLog | undefined {
    this.ensureLoaded();
    const log = this.inMemoryCache.find((l) => l.id === id);
    if (log) {
      log.status = status;
      if (error !== undefined) log.error = error;
      if (status === 'failed' || status === 'success') {
        log.durationMs = Date.now() - log.timestamp;
      }
      this.flushToDisk();
      return { ...log };
    }
    return undefined;
  }

  public clear(): void {
    this.inMemoryCache = [];
    this.flushToDisk();
  }
}

export const globalLogStorage = new PersistentLogStorage();
