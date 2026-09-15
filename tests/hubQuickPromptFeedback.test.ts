import React from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { RadialHub } from '../src/renderer/components/RadialHub.js';
import type { CoreStatus, McpRequestLog } from '../src/shared/types.js';

const coreStatus: CoreStatus = {
  state: 'idle', activeMode: 'general', requestCount: 1, totalTokensProtected: 0,
  activeVaultSecrets: 0, port: 58420, uptimeSeconds: 1,
};

const renderHub = (log: McpRequestLog) => renderToString(React.createElement(RadialHub, {
  coreStatus,
  providers: {} as any,
  logs: [log],
  onProviderClick: () => {},
  onModeChange: () => {},
}));

describe('Hub Quick Prompt feedback', () => {
  it('surfaces a failed Quick Prompt as a clickable error after Hub remounts', () => {
    const html = renderHub({
      id: 'failed-quick-prompt', timestamp: Date.now(), mode: 'general',
      targetProvider: 'gemini', status: 'failed', maskedSecretsCount: 0,
      promptSnippet: 'fixture prompt', responseText: 'Provider chat mode verification failed',
      error: 'Provider chat mode verification failed', isQuickPrompt: true,
    });

    expect(html).toContain('aria-label="View latest Quick Prompt error"');
    expect(html).toContain('Quick Prompt failed. Open the error button for details.');
    expect(html).not.toContain('Checking provider chat mode');
    expect(html).not.toContain('Provider chat mode verification failed');
  });

  it('keeps a successful result on the response button', () => {
    const html = renderHub({
      id: 'successful-quick-prompt', timestamp: Date.now(), mode: 'general',
      targetProvider: 'chatgpt', status: 'success', maskedSecretsCount: 0,
      promptSnippet: 'fixture prompt', responseText: 'OK', isQuickPrompt: true,
    });

    expect(html).toContain('aria-label="View latest AI response"');
    expect(html).not.toContain('View latest Quick Prompt error');
  });
});
