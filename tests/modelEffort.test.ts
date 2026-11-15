import { describe, expect, it } from 'vitest';
import { effortModelId, parseEffortModel } from '../src/shared/modelEffort.js';

describe('model effort requests', () => {
  it('normalizes a qualified model and a separate effort to the same target', () => {
    const model = 'transgentic/provider/claude/model/sonnet-5-5';
    expect(parseEffortModel(effortModelId(model, 'max'))).toEqual(parseEffortModel(model, 'max'));
  });

  it('preserves native IDs and rejects ambiguous or malformed overrides', () => {
    expect(parseEffortModel('gemini-flash-medium')).toEqual({ model: 'gemini-flash-medium' });
    expect(() => parseEffortModel(effortModelId('gemini-flash', 'low'), 'high')).toThrow('Conflicting');
    expect(() => parseEffortModel('gemini-flash', 'high\n')).toThrow('Invalid');
  });
});
