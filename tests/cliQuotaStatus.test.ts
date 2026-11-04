import { describe, expect, it } from 'vitest';
import { cliQuotaStatus } from '../src/shared/cli.js';
import { cliDiagnosticMessage } from '../src/main/cli/processRunner.js';

describe('CLI quota status', () => {
  it('preserves a relative reset as an absolute timestamp', () => {
    const message = 'Individual quota reached. Resets in 13h47m19s.';
    expect(cliQuotaStatus(message, 1000)).toEqual({ state: 'quota_exhausted', message: 'Quota exhausted', resetAt: 49640000 });
    expect(cliDiagnosticMessage(message + ' secret-token')).toBe('CLI provider quota exhausted. Resets in 13h47m19s.');
  });
  it('does not invent reset times or confuse authentication failures', () => {
    expect(cliQuotaStatus('CLI provider quota exhausted.', 1000)?.resetAt).toBeUndefined();
    expect(cliQuotaStatus('authentication required')).toBeUndefined();
  });
});
