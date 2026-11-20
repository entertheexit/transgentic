import { SessionProfileManager } from '../security/antiDetection.js';

/**
 * Returns the engine-aligned desktop Chrome User-Agent without Electron tokens.
 */
export function getHostChromeUserAgent(): string {
  return SessionProfileManager.getNormalizedUserAgent();
}

/**
 * Binds the host Chrome User-Agent to the specified Electron session partition.
 * Calls SessionProfileManager.getNormalizedUserAgent() as the fallback.
 */
export async function bindHostUserAgentToPartition(partitionKey: string): Promise<string> {
  const ua = getHostChromeUserAgent();
  try {
    const { session } = await import('electron');
    if (session && typeof session.fromPartition === 'function') {
      const sess = session.fromPartition(partitionKey, { cache: true });
      sess.setUserAgent(ua);
    }
  } catch {}
  return ua;
}

/**
 * Validates whether a User-Agent string looks like a standard desktop browser UA.
 */
export function isValidDesktopUserAgent(ua?: string): boolean {
  if (!ua || typeof ua !== 'string') return false;
  const trimmed = ua.trim();
  if (trimmed.length < 20) return false;
  if (trimmed.toLowerCase().includes('electron') || trimmed.toLowerCase().includes('transgentic')) return false;
  return trimmed.includes('Mozilla/') && (trimmed.includes('Chrome/') || trimmed.includes('Safari/'));
}

/**
 * Binds either an incoming synced User-Agent (from the Chrome extension) or falls back
 * to bindHostUserAgentToPartition(partitionKey) which calls SessionProfileManager.getNormalizedUserAgent().
 */
export async function bindUserAgentToPartition(partitionKey: string, customUA?: string): Promise<string> {
  // Inside Electron, keep the partition aligned with the embedded Chromium
  // version when an incoming synced Chrome UA is from a different major version
  // (e.g. Chrome 157 synced into Chromium 132), preventing UA/Client-Hint/TLS mismatch.
  const embeddedChrome = typeof process !== 'undefined' ? (process.versions as Record<string, string | undefined>)?.chrome : undefined;
  const embeddedMajor = embeddedChrome?.split('.')[0];
  const customMajor = customUA?.match(/Chrome\/(\d+)\./)?.[1];
  const majorMatchesEngine = !embeddedMajor || !customMajor || embeddedMajor === customMajor;

  if (customUA && isValidDesktopUserAgent(customUA) && majorMatchesEngine) {
    const uaToApply = customUA.trim();
    try {
      const { session } = await import('electron');
      if (session && typeof session.fromPartition === 'function') {
        const sess = session.fromPartition(partitionKey, { cache: true });
        sess.setUserAgent(uaToApply);
      }
    } catch {}
    return uaToApply;
  }

  // Fallback: bind engine-aligned Chrome UA using SessionProfileManager.getNormalizedUserAgent()
  return await bindHostUserAgentToPartition(partitionKey);
}
