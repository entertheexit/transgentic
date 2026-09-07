import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ClientAuthManager } from '../src/main/security/clientAuth.js';
import fs from 'fs';
import path from 'path';

describe('ClientAuthManager', () => {
  const authFile = path.join(process.cwd(), 'client_auth.json');

  beforeEach(() => {
    ClientAuthManager.resetForTesting();
  });

  afterEach(() => {
    try {
      if (fs.existsSync(authFile)) fs.unlinkSync(authFile);
    } catch {}
  });

  it('should generate a cryptographically strong master token starting with tg_live_', () => {
    const token = ClientAuthManager.getMasterToken();
    expect(token).toBeDefined();
    expect(token.startsWith('tg_live_')).toBe(true);
    expect(token.length).toBeGreaterThan(30);
  });

  it('should verify matching token correctly and reject wrong tokens', () => {
    const token = ClientAuthManager.getMasterToken();
    expect(ClientAuthManager.verifyToken(token)).toBe(true);
    expect(ClientAuthManager.verifyToken('tg_live_invalidtoken12345')).toBe(false);
    expect(ClientAuthManager.verifyToken('')).toBe(false);
    expect(ClientAuthManager.verifyToken(undefined)).toBe(false);
  });

  it('should regenerate master token and invalidate the previous one', () => {
    const oldToken = ClientAuthManager.getMasterToken();
    const newToken = ClientAuthManager.regenerateToken();

    expect(newToken).not.toBe(oldToken);
    expect(ClientAuthManager.verifyToken(newToken)).toBe(true);
    expect(ClientAuthManager.verifyToken(oldToken)).toBe(false);
  });

  it('should trigger listeners on token regeneration', () => {
    let notifiedToken = '';
    const unsub = ClientAuthManager.onTokenUpdated((t) => {
      notifiedToken = t;
    });

    const regenerated = ClientAuthManager.regenerateToken();
    expect(notifiedToken).toBe(regenerated);
    unsub();
  });
});
