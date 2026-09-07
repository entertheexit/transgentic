import { SessionProfileManager } from '../security/antiDetection.js';

let cachedHostChromeUA: string | null = null;

/**
 * Discovers host installed Google Chrome version and generates a clean,
 * authentic desktop User-Agent string without any Electron tokens.
 */
export function getHostChromeUserAgent(): string {
  if (cachedHostChromeUA) {
    return cachedHostChromeUA;
  }

  cachedHostChromeUA = SessionProfileManager.getNormalizedUserAgent();
  return cachedHostChromeUA;
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
  if (customUA && isValidDesktopUserAgent(customUA)) {
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

  // Fallback: bind host Chrome UA using SessionProfileManager.getNormalizedUserAgent()
  return await bindHostUserAgentToPartition(partitionKey);
}
