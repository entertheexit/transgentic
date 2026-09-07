import { describe, it, expect, beforeEach } from 'vitest';
import { LocalZeroLeakManager, globalLocalZeroLeakManager } from '../src/main/localllm/localZeroLeak.js';

describe('Local Zero-Leak Unit Tests', () => {
  let manager: LocalZeroLeakManager;

  beforeEach(() => {
    manager = new LocalZeroLeakManager();
    globalLocalZeroLeakManager.clearAll();
  });

  describe('Pre-Dispatch Inbound Credential Masking', () => {
    it('should mask private API tokens (OpenAI, Anthropic, GitHub, Slack, AWS)', () => {
      const reqId = 'req_token_test_1';
      const prompt = `
Please inspect this setup:
OpenAI: sk-proj-abcdef1234567890abcdef1234567890
Anthropic: sk-ant-api03-abcdef1234567890abcdef1234567890
GitHub: ghp_123456789012345678901234567890123456
Slack: xoxb-1234567890-abcdefghij
AWS: AKIAIOSFODNN7EXAMPLE
`;
      const result = manager.sanitizePrompt(prompt, reqId);

      expect(result.maskedCount).toBeGreaterThanOrEqual(4);
      expect(result.sanitizedText).not.toContain('sk-proj-abcdef1234567890abcdef1234567890');
      expect(result.sanitizedText).not.toContain('sk-ant-api03-abcdef1234567890abcdef1234567890');
      expect(result.sanitizedText).not.toContain('ghp_123456789012345678901234567890123456');
      expect(result.sanitizedText).not.toContain('xoxb-1234567890-abcdefghij');
      expect(result.sanitizedText).not.toContain('AKIAIOSFODNN7EXAMPLE');

      expect(result.sanitizedText).toContain('{{TRANSGENTIC_SECRET_KEY_1}}');
      expect(result.sanitizedText).toContain('{{TRANSGENTIC_SECRET_KEY_2}}');
    });

    it('should mask sensitive environment variables', () => {
      const reqId = 'req_env_test_1';
      const prompt = `
DATABASE_PASSWORD="super_secret_production_password_99"
API_SECRET_KEY=prod_live_sec_key_xyz987654321
export JWT_SECRET="super-strong-jwt-encryption-key"
`;
      const result = manager.sanitizePrompt(prompt, reqId);

      expect(result.maskedCount).toBe(3);
      expect(result.sanitizedText).not.toContain('super_secret_production_password_99');
      expect(result.sanitizedText).not.toContain('prod_live_sec_key_xyz987654321');
      expect(result.sanitizedText).not.toContain('super-strong-jwt-encryption-key');
      expect(result.sanitizedText).toContain('{{TRANSGENTIC_SECRET_KEY_1}}');
      expect(result.sanitizedText).toContain('{{TRANSGENTIC_SECRET_KEY_2}}');
      expect(result.sanitizedText).toContain('{{TRANSGENTIC_SECRET_KEY_3}}');
    });

    it('should mask database connection URIs', () => {
      const reqId = 'req_db_test_1';
      const prompt = `
Connect to postgres://admin:supersecret@10.0.0.15:5432/production_db
and mongodb+srv://cluster_user:P@ssw0rd123@cluster0.abcde.mongodb.net/test
`;
      const result = manager.sanitizePrompt(prompt, reqId);

      expect(result.sanitizedText).not.toContain('postgres://admin:supersecret@10.0.0.15:5432/production_db');
      expect(result.sanitizedText).not.toContain('mongodb+srv://cluster_user:P@ssw0rd123@cluster0.abcde.mongodb.net/test');
      expect(result.sanitizedText).toContain('{{TRANSGENTIC_SECRET_KEY_1}}');
      expect(result.sanitizedText).toContain('{{TRANSGENTIC_SECRET_KEY_2}}');
    });

    it('should mask RFC 1918 private IPv4 addresses and internal domains', () => {
      const reqId = 'req_net_test_1';
      const prompt = `
Database primary: 10.12.34.56
Secondary node: 192.168.1.105
DMZ server: 172.20.5.12
Auth domain: auth-service.internal
Vault server: vault.corp
`;
      const result = manager.sanitizePrompt(prompt, reqId);

      expect(result.sanitizedText).not.toContain('10.12.34.56');
      expect(result.sanitizedText).not.toContain('192.168.1.105');
      expect(result.sanitizedText).not.toContain('172.20.5.12');
      expect(result.sanitizedText).not.toContain('auth-service.internal');
      expect(result.sanitizedText).not.toContain('vault.corp');
    });

    it('should assign identical placeholders to identical repeated secrets', () => {
      const reqId = 'req_repeat_test';
      const prompt = `Token 1: sk-1234567890123456789012345 and Token 2: sk-1234567890123456789012345`;
      const result = manager.sanitizePrompt(prompt, reqId);

      expect(result.maskedCount).toBe(1);
      const matches = result.sanitizedText.match(/\{\{TRANSGENTIC_SECRET_KEY_1\}\}/g);
      expect(matches?.length).toBe(2);
    });
  });

  describe('Post-Dispatch Outbound Secret Restoration', () => {
    it('should restore secret values in Cloud AI Webview response before returning to Codex', () => {
      const reqId = 'req_restore_1';
      const secretKey = 'sk-proj-xyz98765432101234567890';
      const dbUri = 'postgres://admin:secret@10.0.1.2:5432/mydb';

      const inboundPrompt = `Config: ${secretKey} and ${dbUri}`;
      const masked = manager.sanitizePrompt(inboundPrompt, reqId);

      expect(masked.sanitizedText).toContain('{{TRANSGENTIC_SECRET_KEY_1}}');
      expect(masked.sanitizedText).toContain('{{TRANSGENTIC_SECRET_KEY_2}}');

      // Simulated Cloud AI response repeating placeholders in its response
      const cloudAiResponse = `
Here is the code to initialize the client:
\`\`\`typescript
const client = new OpenAI({ apiKey: process.env.API_KEY || "{{TRANSGENTIC_SECRET_KEY_1}}" });
const db = connect("{{TRANSGENTIC_SECRET_KEY_2}}");
\`\`\`
`;

      const restored = manager.restoreResponse(cloudAiResponse, reqId);

      expect(restored).toContain(`"${secretKey}"`);
      expect(restored).toContain(`"${dbUri}"`);
      expect(restored).not.toContain('{{TRANSGENTIC_SECRET_KEY_1}}');
      expect(restored).not.toContain('{{TRANSGENTIC_SECRET_KEY_2}}');
    });
  });

  describe('Request-Scoped Memory Purge', () => {
    it('should completely wipe ephemeral vault for requestId on purge', () => {
      const reqId = 'req_purge_1';
      manager.sanitizePrompt('API_KEY=my_super_secret_token_val_123', reqId);

      expect(manager.hasSecretsForRequest(reqId)).toBe(true);
      expect(manager.getSecretCount(reqId)).toBe(1);

      manager.purgeRequestContext(reqId);

      expect(manager.hasSecretsForRequest(reqId)).toBe(false);
      expect(manager.getSecretCount(reqId)).toBe(0);

      // Attempting restore after purge leaves text unchanged
      const sample = 'Output with {{TRANSGENTIC_SECRET_KEY_1}}';
      expect(manager.restoreResponse(sample, reqId)).toBe(sample);
    });
  });
});
