import { describe, it, expect, vi } from 'vitest';
import { CookieSyncManager } from '../src/main/auth/cookieSyncServer.js';
import { getHostChromeUserAgent } from '../src/main/utils/userAgent.js';

describe('CookieSyncManager', () => {
  it('should accurately normalize provider IDs and URLs', () => {
    expect(CookieSyncManager.normalizeProviderId('webview_custom_example')).toBe('webview_custom_example');
    expect(CookieSyncManager.normalizeProviderId('gemini')).toBe('gemini');
    expect(CookieSyncManager.normalizeProviderId('https://gemini.google.com')).toBe('gemini');
    expect(CookieSyncManager.normalizeProviderId('chatgpt')).toBe('chatgpt');
    expect(CookieSyncManager.normalizeProviderId('claude')).toBe('claude');
    expect(CookieSyncManager.normalizeProviderId('grok')).toBe('grok');
  });

  it('should validate missing provider in payload', async () => {
    // @ts-ignore
    await expect(CookieSyncManager.syncSession(null)).rejects.toThrow('Missing required "provider" field');
    // @ts-ignore
    await expect(CookieSyncManager.syncSession({ provider: '' })).rejects.toThrow('Missing required "provider" field');
  });

  it('should construct a clean host Chrome User-Agent without Electron tokens', () => {
    const ua = getHostChromeUserAgent();
    expect(ua).toBeDefined();
    expect(typeof ua).toBe('string');
    expect(ua).toContain('Mozilla/5.0');
    expect(ua).toContain('AppleWebKit');
    expect(ua).toContain('Safari');
    expect(ua).toContain('Chrome/');
    expect(ua.toLowerCase()).not.toContain('electron');
    expect(ua.toLowerCase()).not.toContain('transgentic');
  });

  it('should parse raw cookies from cURL commands, headers, and DevTools tables', () => {
    // 1. Semicolon-separated string
    const raw1 = '__Secure-next-auth.session-token=eyJhbGciOi; custom_device_id=v1.123';
    const parsed1 = CookieSyncManager.parseRawCookies(raw1, '.example.com');
    expect(parsed1).toHaveLength(2);
    expect(parsed1[0].name).toBe('__Secure-next-auth.session-token');
    expect(parsed1[0].value).toBe('eyJhbGciOi');
    expect(parsed1[0].httpOnly).toBe(true);

    // 2. cURL command
    const curl = `curl 'https://example.com/chat' -H 'cookie: __Secure-next-auth.session-token=token123; user_profile=url' -H 'accept: text/html'`;
    const parsed2 = CookieSyncManager.parseRawCookies(curl, '.example.com');
    expect(parsed2).toHaveLength(2);
    expect(parsed2[0].name).toBe('__Secure-next-auth.session-token');
    expect(parsed2[0].value).toBe('token123');

    // 4. Raw single token string
    const singleToken = 'vrAz2gAH54MpxERtokenSample1234567890';
    const parsed4 = CookieSyncManager.parseRawCookies(
      singleToken,
      '.example.com',
      'webview_custom_example'
    );
    expect(parsed4).toHaveLength(1);
    expect(parsed4[0].name).toBe('__Secure-next-auth.session-token');
    expect(parsed4[0].value).toBe(singleToken);
  });

  it('should validate and sync Chrome User-Agent with fallback to host Chrome UA', async () => {
    const { bindUserAgentToPartition, bindHostUserAgentToPartition, isValidDesktopUserAgent } = await import(
      '../src/main/utils/userAgent.js'
    );
    const { SessionProfileManager } = await import('../src/main/security/antiDetection.js');

    // 1. Validation logic
    const validSyncedUA =
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.6943.98 Safari/537.36';
    expect(isValidDesktopUserAgent(validSyncedUA)).toBe(true);
    expect(isValidDesktopUserAgent('Mozilla/5.0 Electron/34.0.0')).toBe(false);
    expect(isValidDesktopUserAgent('')).toBe(false);
    expect(isValidDesktopUserAgent('short')).toBe(false);

    // 2. Binding with valid synced UA
    const appliedSynced = await bindUserAgentToPartition('persist:test-partition', validSyncedUA);
    expect(appliedSynced).toBe(validSyncedUA);

    // 3. Fallback when synced UA is missing or invalid: calls bindHostUserAgentToPartition and getNormalizedUserAgent
    const fallbackUA = await bindUserAgentToPartition('persist:test-partition', undefined);
    const hostUA = await bindHostUserAgentToPartition('persist:test-partition');
    const normalizedUA = SessionProfileManager.getNormalizedUserAgent();
    expect(fallbackUA).toBe(normalizedUA);
    expect(hostUA).toBe(normalizedUA);

    // 4. Header sanitization aligns Sec-CH-UA and platform with synced UA
    const winUA =
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36';
    const sanitized = SessionProfileManager.sanitizeHeaders(
      {
        'user-agent': 'old-ua',
        'sec-electron-fetch': 'true',
        'x-electron-flag': '1',
      },
      winUA
    );

    expect(sanitized['user-agent']).toBe(winUA);
    expect(sanitized['sec-ch-ua']).toContain('"132"');
    expect(sanitized['sec-ch-ua-platform']).toBe('"Windows"');
    expect(sanitized['sec-electron-fetch']).toBeUndefined();
    expect(sanitized['x-electron-flag']).toBeUndefined();
  });
});
