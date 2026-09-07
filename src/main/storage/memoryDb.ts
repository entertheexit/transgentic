import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { app } from 'electron';
import { createRequire } from 'module';
import { BlindedTokenMap } from '../../shared/types.js';

const require = createRequire(import.meta.url);

export interface EncryptedSecretRecord {
  token: string;
  type: BlindedTokenMap['type'];
  encryptedValue: string;
  iv: string;
  authTag: string;
  samplePreview: string;
  detectedAt: number;
}

export class MemoryDatabase {
  private static instance: MemoryDatabase | null = null;
  private db: any = null;
  private encryptionKey: Buffer;

  private constructor() {
    this.encryptionKey = this.getOrCreateMasterKey();
    this.initDatabase();
  }

  public static getInstance(): MemoryDatabase {
    if (!MemoryDatabase.instance) {
      MemoryDatabase.instance = new MemoryDatabase();
    }
    return MemoryDatabase.instance;
  }

  private getMasterKeyPath(): string {
    const userData = app && typeof app.getPath === 'function' ? app.getPath('userData') : process.cwd();
    return path.join(userData, '.transgentic_mem_key');
  }

  private getOrCreateMasterKey(): Buffer {
    try {
      const keyPath = this.getMasterKeyPath();
      if (fs.existsSync(keyPath)) {
        const raw = fs.readFileSync(keyPath);
        if (raw.length === 32) return raw;
      }
      const newKey = crypto.randomBytes(32);
      const dir = path.dirname(keyPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(keyPath, newKey, { mode: 0o600 });
      return newKey;
    } catch {
      return crypto.createHash('sha256').update('transgentic_memory_vault_fallback_key').digest();
    }
  }

  private getDbPath(): string {
    const userData = app && typeof app.getPath === 'function' ? app.getPath('userData') : process.cwd();
    return path.join(userData, 'transgentic_memory.db');
  }

  private initDatabase(): void {
    try {
      const dbPath = this.getDbPath();
      const dir = path.dirname(dbPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

      const { DatabaseSync } = require('node:sqlite');
      this.db = new DatabaseSync(dbPath);

      this.db.exec(`
        CREATE TABLE IF NOT EXISTS secret_vault (
          token TEXT PRIMARY KEY,
          type TEXT NOT NULL,
          encrypted_value TEXT NOT NULL,
          iv TEXT NOT NULL,
          auth_tag TEXT NOT NULL,
          sample_preview TEXT NOT NULL,
          detected_at INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS memory_entries (
          id TEXT PRIMARY KEY,
          category TEXT NOT NULL,
          key TEXT NOT NULL,
          value TEXT NOT NULL,
          metadata TEXT,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        );
      `);
    } catch (err: any) {
      console.warn('[MemoryDatabase] SQLite initialization notice:', err?.message || err);
    }
  }

  public encrypt(plainText: string): { ciphertext: string; iv: string; authTag: string } {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.encryptionKey, iv);
    let ciphertext = cipher.update(plainText, 'utf8', 'hex');
    ciphertext += cipher.final('hex');
    const authTag = cipher.getAuthTag().toString('hex');
    return {
      ciphertext,
      iv: iv.toString('hex'),
      authTag,
    };
  }

  public decrypt(ciphertext: string, ivHex: string, authTagHex: string): string {
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-gcm', this.encryptionKey, iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(ciphertext, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  }

  public insertSecret(
    token: string,
    original: string,
    type: BlindedTokenMap['type'],
    samplePreview: string,
    detectedAt: number
  ): void {
    const { ciphertext, iv, authTag } = this.encrypt(original);
    if (this.db) {
      try {
        const stmt = this.db.prepare(`
          INSERT OR REPLACE INTO secret_vault (token, type, encrypted_value, iv, auth_tag, sample_preview, detected_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `);
        stmt.run(token, type, ciphertext, iv, authTag, samplePreview, detectedAt);
      } catch (err: any) {
        console.error('[MemoryDatabase] Failed to insert secret into SQLite:', err?.message || err);
      }
    }
  }

  public getSecret(token: string): string | null {
    if (this.db) {
      try {
        const stmt = this.db.prepare('SELECT * FROM secret_vault WHERE token = ?');
        const row = stmt.get(token) as any;
        if (row && row.encrypted_value) {
          return this.decrypt(row.encrypted_value, row.iv, row.auth_tag);
        }
      } catch (err: any) {
        console.error('[MemoryDatabase] Failed to read secret from SQLite:', err?.message || err);
      }
    }
    return null;
  }

  public deleteSecret(token: string): void {
    if (this.db) {
      try {
        const stmt = this.db.prepare('DELETE FROM secret_vault WHERE token = ?');
        stmt.run(token);
      } catch (err: any) {
        console.error('[MemoryDatabase] Failed to delete secret from SQLite:', err?.message || err);
      }
    }
  }

  public getAllSecrets(): BlindedTokenMap[] {
    if (this.db) {
      try {
        const stmt = this.db.prepare(
          'SELECT token, type, sample_preview, detected_at FROM secret_vault ORDER BY detected_at DESC'
        );
        const rows = stmt.all() as any[];
        return rows.map((r) => ({
          token: r.token,
          type: r.type,
          samplePreview: r.sample_preview,
          detectedAt: r.detected_at,
        }));
      } catch (err: any) {
        console.error('[MemoryDatabase] Failed to query secrets from SQLite:', err?.message || err);
      }
    }
    return [];
  }

  public wipeAllSecrets(): void {
    if (this.db) {
      try {
        this.db.exec('DELETE FROM secret_vault');
      } catch (err: any) {
        console.error('[MemoryDatabase] Failed to wipe secrets from SQLite:', err?.message || err);
      }
    }
  }

  public wipeDatabase(): void {
    if (this.db) {
      try {
        this.db.exec('DELETE FROM secret_vault; DELETE FROM memory_entries;');
      } catch (err: any) {
        console.error('[MemoryDatabase] Failed to wipe memory database:', err?.message || err);
      }
    }
  }
}

export const globalMemoryDb = MemoryDatabase.getInstance();
