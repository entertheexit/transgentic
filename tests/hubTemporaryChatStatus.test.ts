import React from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { RadialHub } from '../src/renderer/components/RadialHub.js';
import type { CoreStatus, TemporaryChatCapability } from '../src/shared/types.js';

const coreStatus: CoreStatus = {
  state: 'idle', activeMode: 'general', requestCount: 0,
  totalTokensProtected: 0, activeVaultSecrets: 0, port: 58420, uptimeSeconds: 1,
};

function renderStatus(capability?: TemporaryChatCapability, preferred = false): string {
  return renderToString(React.createElement(RadialHub, {
    coreStatus,
    providers: { chatgpt: { id: 'chatgpt', state: 'ready', temporaryChat: capability } } as any,
    config: { temporaryChat: { general: preferred } } as any,
    routeMatrix: { main: { general: { defaultService: 'chatgpt' } } } as any,
    onProviderClick: () => {}, onModeChange: () => {},
    onToggleTemporaryChatMode: async () => true,
  }));
}

describe('Hub Temporary Chat status', () => {
  it('does not call an unknown capability unsupported', () => {
    expect(renderStatus()).toContain('Checking Temporary Chat');
    expect(renderStatus()).not.toContain('Temporary Chat Unsupported');
  });

  it('shows declared support as unavailable while preserving an enabled preference switch', () => {
    const html = renderStatus({ supported: true, availability: 'unavailable', reason: 'Sign in required' }, true);
    expect(html).toContain('Temporary Chat Preferred · Unavailable');
    expect(html).toContain('aria-pressed="true"');
    expect(html).not.toMatch(/aria-label="Temporary Chat Preferred · Unavailable[^\"]*" disabled/);
  });

  it('reserves unsupported for a provider that explicitly lacks native support', () => {
    expect(renderStatus({ supported: false, availability: 'unavailable' })).toContain('Temporary Chat Unsupported');
  });

  it('allows a supported pending capability to be preferred for verification at request time', () => {
    const html = renderStatus({ supported: true, availability: 'unknown' });
    expect(html).toContain('Temporary Chat Checking');
    expect(html).not.toMatch(/aria-label="Temporary Chat Checking[^\"]*" disabled/);
  });
});
