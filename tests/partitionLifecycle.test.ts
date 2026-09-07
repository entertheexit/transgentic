import { describe, it, expect, vi } from 'vitest';
import { PartitionLifecycleManager } from '../src/main/auth/partitionLifecycle.js';

describe('PartitionLifecycleManager', () => {
  it('should generate consistent and strict partition keys', () => {
    expect(PartitionLifecycleManager.getPartitionKey('gemini')).toBe('persist:transgentic_gemini');
    expect(PartitionLifecycleManager.getPartitionKey('gemini', 'acc_gemini_default')).toBe('persist:transgentic_gemini');
    expect(PartitionLifecycleManager.getPartitionKey('gemini', 'primary')).toBe('persist:transgentic_gemini');
    expect(PartitionLifecycleManager.getPartitionKey('gemini', 'acc_02')).toBe('persist:transgentic_gemini_acc_02');
    expect(PartitionLifecycleManager.getPartitionKey('chatgpt', 'acc_work')).toBe('persist:transgentic_chatgpt_acc_work');
    expect(PartitionLifecycleManager.getPartitionKey('claude', 'acc_personal')).toBe('persist:transgentic_claude_acc_personal');
  });

  it('should execute deleteAccountPartition and clearPartitionData gracefully', async () => {
    // Should not throw even when running in test environment
    await expect(PartitionLifecycleManager.deleteAccountPartition('gemini', 'acc_02')).resolves.not.toThrow();
    await expect(PartitionLifecycleManager.clearPartitionData('persist:transgentic_test')).resolves.not.toThrow();
  });

  it('should execute non-destructive cookie sync gracefully without error', async () => {
    const cookies = [
      { name: '__Secure-1PSID', value: 'sample_psid_token_12345678901234567890' },
      { name: '__Secure-1PSIDTS', value: 'sample_psidts_token_12345678901234567890' }
    ];
    await expect(
      PartitionLifecycleManager.syncCookiesToPartition('persist:transgentic_gemini', cookies, '.google.com')
    ).resolves.toBeDefined();
  });
});
