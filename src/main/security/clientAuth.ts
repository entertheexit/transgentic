import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { app } from 'electron';

export interface ClientAuthStore {
  masterToken: string;
  createdAt: number;
  lastUsedAt?: number;
}

export class ClientAuthManager {
  private static store: ClientAuthStore | null = null;
  private static listeners: Array<(token: string) => void> = [];

  private static getStorePath(): string {
    const userData = app && typeof app.getPath === 'function' ? app.getPath('userData') : process.cwd();
    return path.join(userData, 'client_auth.json');
  }

  public static initialize(): void {
    const storePath = this.getStorePath();
    try {
      if (fs.existsSync(storePath)) {
        const raw = fs.readFileSync(storePath, 'utf-8');
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed.masterToken === 'string' && parsed.masterToken.startsWith('tg_live_')) {
          this.store = parsed;
          return;
        }
      }
    } catch (err) {
      console.warn('[ClientAuthManager] Notice reading auth store, generating fresh token:', err);
    }

    // Generate fresh master client token
    this.store = {
      masterToken: this.generateToken(),
      createdAt: Date.now(),
    };
    this.save();
  }

  private static generateToken(): string {
    return `tg_live_${crypto.randomBytes(24).toString('hex')}`;
  }

  private static save(): void {
    if (!this.store) return;
    const storePath = this.getStorePath();
    try {
      const dir = path.dirname(storePath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(storePath, JSON.stringify(this.store, null, 2), { mode: 0o600 });
    } catch (err) {
      console.error('[ClientAuthManager] Failed to save client auth store:', err);
    }
  }

  public static getMasterToken(): string {
    if (!this.store) {
      this.initialize();
    }
    return this.store!.masterToken;
  }

  public static regenerateToken(): string {
    this.store = {
      masterToken: this.generateToken(),
      createdAt: Date.now(),
    };
    this.save();
    this.notifyListeners();
    return this.store.masterToken;
  }

  public static verifyToken(providedToken?: string | null): boolean {
    if (!providedToken) return false;
    const current = this.getMasterToken();
    if (typeof providedToken !== 'string') return false;

    // Constant-time comparison to prevent timing attacks
    try {
      const a = Buffer.from(providedToken);
      const b = Buffer.from(current);
      if (a.length !== b.length) return false;
      const isMatch = crypto.timingSafeEqual(a, b);
      if (isMatch && this.store) {
        this.store.lastUsedAt = Date.now();
      }
      return isMatch;
    } catch {
      return false;
    }
  }

  public static onTokenUpdated(listener: (token: string) => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  private static notifyListeners(): void {
    if (!this.store) return;
    const token = this.store.masterToken;
    for (const listener of this.listeners) {
      try {
        listener(token);
      } catch {}
    }
  }

  public static resetForTesting(): void {
    this.store = null;
    this.listeners = [];
  }
}
