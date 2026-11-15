import { describe, it, expect, beforeEach } from 'vitest';
import { ServiceManifestManager } from '../src/main/registry/serviceManifest.js';
import { effortModelId } from '../src/shared/modelEffort.js';
import { ModelRegistryManager } from '../src/main/registry/modelRegistry.js';

describe('ModelRegistryManager', () => {
  beforeEach(() => {
    ModelRegistryManager.resetToDefaults();
  });

  it('starts web providers on their current native selection without advertising retired models', () => {
    for (const provider of ['chatgpt', 'claude', 'gemini', 'grok', 'meta'] as const) {
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

  it('adds a verified effort without replacing the rest of the live catalog', () => {
    const named = [
      { id: 'gpt-6', displayName: 'GPT-6' },
      { id: 'gpt-5-6-sol', displayName: 'GPT-5.6 Sol' },
    ];
    const effort = { id: effortModelId('gpt-5-6-sol', 'high'), displayName: 'GPT-5.6 Sol High' };
    ModelRegistryManager.mergeDiscoveredModels('chatgpt', named);
    ModelRegistryManager.mergeDiscoveredModels('chatgpt', [effort], true);

    const visible = ServiceManifestManager.getModelsForMode('chatgpt', 'general');
    expect(visible.map(model => model.id)).toEqual(['default', ...named.map(model => model.id), effort.id]);
    expect(ServiceManifestManager.getModelsForMode('chatgpt', 'image').map(model => model.id))
      .toEqual(visible.map(model => model.id));
    expect(ServiceManifestManager.getModelsForMode('chatgpt', 'video')).toEqual([]);
    expect(ModelRegistryManager.getProviderConfig('chatgpt').models.filter(model => model.discoveredAvailable).map(model => model.id))
      .toEqual(['default', ...named.map(model => model.id), effort.id]);
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
