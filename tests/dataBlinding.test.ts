import { describe, it, expect, beforeEach } from 'vitest';
import { DataBlindingEngine } from '../src/main/security/dataBlinding.js';
import { globalMemoryDb } from '../src/main/storage/memoryDb.js';

describe('DataBlindingEngine', () => {
  let engine: DataBlindingEngine;

  beforeEach(() => {
    engine = new DataBlindingEngine();
    engine.clearVault();
  });

  it('should mask OpenAI, Anthropic, Google Cloud, and HuggingFace API keys with random tokens', () => {
    const prompt = 'Check sk-abcdef123456789012345678, sk-ant-api03-abcdef123456789012345678, AIzaSyD3x9L7mP2qR4vW6sT8uY0zB1aC3dE5fG7, and hf_abcdefghijklmnopqrstuvwxyz12345678';
    const result = engine.blind(prompt);

    expect(result.replacementsCount).toBe(4);
    expect(result.maskedText).toMatch(/\[\[TG_SEC_[a-f0-9]{10}\]\]/);
    expect(result.maskedText).not.toContain('sk-abcdef123456789012345678');
    expect(result.maskedText).not.toContain('sk-ant-api03-abcdef123456789012345678');
    expect(result.maskedText).not.toContain('AIzaSyD3x9L7mP2qR4vW6sT8uY0zB1aC3dE5fG7');
    expect(result.maskedText).not.toContain('hf_abcdefghijklmnopqrstuvwxyz12345678');
  });

  it('should mask Slack tokens and database URIs', () => {
    const prompt = 'Slack: xoxb-1234567890-1234567890123-abcdef1234567890\nDB: postgres://user:pass@db.internal:5432/production';
    const result = engine.blind(prompt);

    expect(result.replacementsCount).toBe(2);
    expect(result.maskedText).not.toContain('xoxb-1234567890-1234567890123-abcdef1234567890');
    expect(result.maskedText).not.toContain('postgres://user:pass@db.internal:5432/production');
  });

  it('should mask IPv4 and email addresses', () => {
    const prompt = 'Connect to host 198.51.100.42 with user admin@secretcompany.internal';
    const result = engine.blind(prompt);

    expect(result.replacementsCount).toBe(2);
    expect(result.maskedText).toMatch(/\[\[TG_SEC_[a-f0-9]{10}\]\]/);
  });

  it('should not mask localhost / loopback IP 127.0.0.1', () => {
    const prompt = 'Server running on http://127.0.0.1:58420';
    const result = engine.blind(prompt);

    expect(result.replacementsCount).toBe(0);
    expect(result.maskedText).toBe(prompt);
  });

  it('should accurately unblind LLM output and automatically remove secrets after unblinding', () => {
    const originalSecret = 'sk-live-9999988888777776666655555';
    const prompt = `Use key ${originalSecret} in headers`;
    const { maskedText } = engine.blind(prompt);

    expect(engine.getTokens().length).toBe(1);

    const token = maskedText.match(/\[\[TG_SEC_[a-f0-9]{10}\]\]/)![0];
    const mockLlmResponse = `Here is the code using header Authorization: Bearer ${token}`;
    const unblinded = engine.unblind(mockLlmResponse);

    expect(unblinded).toBe(`Here is the code using header Authorization: Bearer ${originalSecret}`);

    // Secret must be automatically purged from active vault and SQLite upon unblinding!
    expect(engine.getTokens().length).toBe(0);
    expect(globalMemoryDb.getSecret(token)).toBeNull();
  });

  it('should support request-scoped tokens and guaranteed context purge', () => {
    const contextId = engine.createRequestContext();
    const prompt = 'sk-live-4444455555666667777788888';
    const { maskedText } = engine.blind(prompt, contextId);

    expect(engine.getTokens().length).toBe(1);
    const token = maskedText.match(/\[\[TG_SEC_[a-f0-9]{10}\]\]/)![0];

    // Purge context (as in finally block)
    engine.purgeRequestContext(contextId);

    expect(engine.getTokens().length).toBe(0);
    expect(globalMemoryDb.getSecret(token)).toBeNull();
  });

  it('should clear vault secrets and wipe SQLite store completely', () => {
    engine.blind('sk-live-1111122222333334444455555');
    expect(engine.getTokens().length).toBe(1);

    engine.clearVault();
    expect(engine.getTokens().length).toBe(0);
    expect(globalMemoryDb.getAllSecrets().length).toBe(0);
  });

  it('should encrypt and decrypt secrets via AES-256-GCM in MemoryDatabase', () => {
    const sample = 'sk-ant-test-secret-value-1234567890';
    const { ciphertext, iv, authTag } = globalMemoryDb.encrypt(sample);

    expect(ciphertext).not.toBe(sample);
    expect(iv).toBeDefined();
    expect(authTag).toBeDefined();

    const decrypted = globalMemoryDb.decrypt(ciphertext, iv, authTag);
    expect(decrypted).toBe(sample);
  });
});
