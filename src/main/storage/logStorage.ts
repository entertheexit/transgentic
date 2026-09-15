import fs from 'fs';
import path from 'path';
import { app } from 'electron';
import { McpRequestLog, MODE_SCHEMA_VERSION, type ChatMode } from '../../shared/types.js';

export function logCategory(log: McpRequestLog): ChatMode {
  return log.chatExecution?.policy
    ? (log.chatExecution.policy === 'normal' ? 'normal' : 'temporary')
    : log.temporaryChat ? 'temporary' : 'normal';
}

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
  private clearedPendingIds = new Set<string>();

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
          this.inMemoryCache = parsed.slice(0, 1000).map((l: McpRequestLog) => {
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
    if (this.clearedPendingIds.has(log.id)) return;
    log = { ...log, modeSchemaVersion: MODE_SCHEMA_VERSION };
    const existingIdx = this.inMemoryCache.findIndex((l) => l.id === log.id);
    if (existingIdx !== -1) {
      this.inMemoryCache[existingIdx] = { ...log };
    } else {
      this.inMemoryCache.unshift({ ...log });
    }
    if (this.inMemoryCache.length > 1000) this.inMemoryCache.length = 1000;
    this.flushToDisk();
  }

  public update(log: McpRequestLog): void {
    this.ensureLoaded();
    if (this.clearedPendingIds.has(log.id)) return;
    log = { ...log, modeSchemaVersion: MODE_SCHEMA_VERSION };
    const idx = this.inMemoryCache.findIndex((l) => l.id === log.id);
    if (idx !== -1) {
      this.inMemoryCache[idx] = { ...log };
    } else {
      this.inMemoryCache.unshift({ ...log });
    }
    if (this.inMemoryCache.length > 1000) this.inMemoryCache.length = 1000;
    this.flushToDisk();
  }

  public query(limit = 20, offset = 0, category?: ChatMode): { logs: McpRequestLog[]; total: number } {
    this.ensureLoaded();
    const matching = category ? this.inMemoryCache.filter(log => logCategory(log) === category) : this.inMemoryCache;
    const total = matching.length;
    const logs = matching.slice(offset, offset + limit);
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

  public clear(category?: ChatMode): void {
    this.ensureLoaded();
    const removed = category ? this.inMemoryCache.filter(log => logCategory(log) === category) : this.inMemoryCache;
    for (const log of removed) {
      if (log.status === 'pending' || (log.status as string) === 'processing' || (log.status as string) === 'routing' || log.status === 'fallback') {
        this.clearedPendingIds.add(log.id);
      }
    }
    this.inMemoryCache = category ? this.inMemoryCache.filter(log => logCategory(log) !== category) : [];
    this.flushToDisk();
  }

  public wasCleared(id: string): boolean { return this.clearedPendingIds.has(id); }
}

export const globalLogStorage = new PersistentLogStorage();
