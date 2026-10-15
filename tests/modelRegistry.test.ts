import { describe, it, expect, beforeEach } from 'vitest';
import { ModelRegistryManager } from '../src/main/registry/modelRegistry.js';

describe('ModelRegistryManager', () => {
  beforeEach(() => {
    ModelRegistryManager.resetToDefaults();
  });

  it('starts web providers on their current native selection without advertising retired models', () => {
    for (const provider of ['chatgpt', 'claude', 'gemini', 'grok'] as const) {
      const config = ModelRegistryManager.getProviderConfig(provider);
      expect(config.defaultModelId).toBe('default');
      expect(config.models.map(model => model.id)).toEqual(['default']);
      expect(ModelRegistryManager.getEffectiveModel(provider)).toBe('default');
    }
    expect(ModelRegistryManager.isModelUsable('chatgpt', 'gpt-4o')).toBe(false);
  });

  it('only accepts a named override after discovery and respects user choices', () => {
    expect(ModelRegistryManager.getEffectiveModel('chatgpt', 'new-model')).toBe('default');
    ModelRegistryManager.mergeDiscoveredModels('chatgpt', [{ id: 'new-model', displayName: 'New Model' }]);
    expect(ModelRegistryManager.getEffectiveModel('chatgpt', 'new-model')).toBe('new-model');
    ModelRegistryManager.toggleModel('chatgpt', 'new-model', false);
    expect(ModelRegistryManager.isModelUsable('chatgpt', 'new-model')).toBe(false);
    expect(ModelRegistryManager.getEffectiveModel('chatgpt', 'new-model')).toBe('default');
  });

  it('preserves previous user settings while marking choices missing from the live picker unavailable', () => {
    ModelRegistryManager.mergeDiscoveredModels('chatgpt', [
      { id: 'model-a', displayName: 'Model A' },
      { id: 'model-b', displayName: 'Model B' },
    ]);
    ModelRegistryManager.toggleModel('chatgpt', 'model-a', false);
    ModelRegistryManager.mergeDiscoveredModels('chatgpt', [{ id: 'model-b', displayName: 'Model B' }]);
    const models = ModelRegistryManager.getProviderConfig('chatgpt').models;
    expect(models.find(model => model.id === 'model-a')).toMatchObject({ userEnabled: false, discoveredAvailable: false });
    expect(models.find(model => model.id === 'model-b')?.discoveredAvailable).toBe(true);
    expect(models.find(model => model.id === 'default')?.discoveredAvailable).toBe(true);
  });
});
