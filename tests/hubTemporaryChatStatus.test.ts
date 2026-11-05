import React from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { chatModeChoices } from '../src/renderer/components/ChatModeControl.js';
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
    expect(renderStatus()).toContain('Status unavailable');
    expect(renderStatus()).not.toContain('Temporary Chat unsupported');
  });

  it('shows declared support as unavailable while preserving an enabled mode selector', () => {
    const html = renderStatus({ supported: true, availability: 'unavailable', reason: 'Sign in required' }, true);
    expect(html).toContain('Sign in required');
    expect(html).toContain('aria-label="Chat mode: Personalized Temporary"');
    expect(html).toContain('aria-haspopup="menu"');
    expect(html).toContain('bg-amber-400');
    expect(html).not.toMatch(/disabled=""[^>]*aria-label="Chat mode:/);
  });

  it('reserves unsupported for a provider that explicitly lacks native support', () => {
    expect(renderStatus({ supported: false, availability: 'unavailable' })).toContain('Temporary Chat unsupported');
  });

  it('allows a supported pending capability to be preferred for verification at request time', () => {
    const html = renderStatus({ supported: true, availability: 'unknown' });
    expect(html).toContain('aria-label="Selected mode is verified when starting"');
    expect(html).toContain('bg-slate-500');
    expect(html).not.toMatch(/disabled=""[^>]*aria-label="Chat mode:/);
  });
});

it('shows the selected text trigger while keeping declared choices in the popover', () => {
  const capability: TemporaryChatCapability = { supported: true, availability: 'unknown', variants: ['personalized', 'unpersonalized'] };
  const html = renderStatus(capability, true);
  expect(html).toContain('aria-label="Chat mode: Personalized Temporary"');
  expect(html).toContain('aria-expanded="false"');
  expect(html).not.toContain('role="menuitemradio"');
  expect(html).not.toContain('aria-pressed=');
  expect(chatModeChoices(capability).map(([value]) => value)).toEqual(['normal', 'temporary-personalized', 'temporary-unpersonalized']);
  expect(chatModeChoices({ ...capability, variants: ['unpersonalized'] }).map(([value]) => value)).toEqual(['normal', 'temporary-unpersonalized']);
  expect(chatModeChoices({ supported: false, availability: 'unavailable' }).map(([value]) => value)).toEqual(['normal']);
});

it('distinguishes an active check from an idle unknown capability', () => {
  expect(renderStatus({ supported: true, availability: 'unknown', checking: true })).toContain('Checking Temporary Chat…');
  expect(renderStatus({ supported: true, availability: 'unknown', checkFailed: true })).toContain('Couldn’t verify');
});
