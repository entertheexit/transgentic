import { describe, it, expect, beforeEach } from 'vitest';
import { ModelRegistryManager } from '../src/main/registry/modelRegistry.js';

describe('ModelRegistryManager', () => {
  beforeEach(() => {
    ModelRegistryManager.resetToDefaults();
  });

  it('should correctly compute model availability according to IsUsable formula', () => {
    // IsUsable = serviceEnabled && userEnabled && discoveredAvailable
    expect(ModelRegistryManager.isModelUsable('chatgpt', 'gpt-4o')).toBe(true);

    // 1. User manual checkbox disabled
    ModelRegistryManager.toggleModel('chatgpt', 'gpt-4o', false);
    expect(ModelRegistryManager.isModelUsable('chatgpt', 'gpt-4o')).toBe(false);

    // Re-enable
    ModelRegistryManager.toggleModel('chatgpt', 'gpt-4o', true);
    expect(ModelRegistryManager.isModelUsable('chatgpt', 'gpt-4o')).toBe(true);

    // 2. Entire service disabled
    ModelRegistryManager.toggleService('chatgpt', false);
    expect(ModelRegistryManager.isModelUsable('chatgpt', 'gpt-4o')).toBe(false);
  });

  it('should evaluate 3-tier selection hierarchy properly', () => {
    // Case A: Hybrid with allowMcpOverride = true -> should accept requested usable model
    const eff1 = ModelRegistryManager.getEffectiveModel('chatgpt', 'o1');
    expect(eff1).toBe('o1');

    // Case B: allowMcpOverride = false -> should strictly use defaultModelId ('gpt-4o')
    ModelRegistryManager.updateProviderConfig('chatgpt', { allowMcpOverride: false });
    const eff2 = ModelRegistryManager.getEffectiveModel('chatgpt', 'o1');
    expect(eff2).toBe('gpt-4o');

    // Case C: Master Lock (lock_active_session = true) -> returns null (bypasses DOM switching)
    ModelRegistryManager.updateProviderConfig('chatgpt', { activeSelectionMode: 'lock_active_session' });
    const eff3 = ModelRegistryManager.getEffectiveModel('chatgpt', 'o1');
    expect(eff3).toBeNull();
  });

  it('should perform non-destructive sync merging without deleting historical models', () => {
    // Disable userEnabled on gpt-4o
    ModelRegistryManager.toggleModel('chatgpt', 'gpt-4o', false);

    // Perform sync discovery that only sees 'o1' and a brand new model 'gpt-5-preview'
    ModelRegistryManager.mergeDiscoveredModels('chatgpt', [
      { id: 'o1', displayName: 'o1 (Deep Reasoning)' },
      { id: 'gpt-5-preview', displayName: 'GPT-5 Preview', requiresTier: 'Pro' },
    ]);

    const reg = ModelRegistryManager.getRegistry();
    const chatgptModels = reg.chatgpt.models;

    // 1. Historical 'gpt-4o' was preserved, its userEnabled preference remained false, discoveredAvailable is now false
    const gpt4o = chatgptModels.find((m) => m.id === 'gpt-4o');
    expect(gpt4o).toBeDefined();
    expect(gpt4o?.userEnabled).toBe(false);
    expect(gpt4o?.discoveredAvailable).toBe(false);

    // 2. Discovered 'o1' is available
    const o1 = chatgptModels.find((m) => m.id === 'o1');
    expect(o1?.discoveredAvailable).toBe(true);

    // 3. New 'gpt-5-preview' was added non-destructively
    const gpt5 = chatgptModels.find((m) => m.id === 'gpt-5-preview');
    expect(gpt5).toBeDefined();
    expect(gpt5?.discoveredAvailable).toBe(true);
    expect(gpt5?.userEnabled).toBe(true);
  });
});
