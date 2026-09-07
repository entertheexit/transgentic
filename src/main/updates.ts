import { UPDATE_CHECK_INTERVAL_MS } from '../shared/release.js';

export interface AvailableUpdate {
  version: string;
  url: string;
}

export function getAvailableUpdate(current: string, release: any): AvailableUpdate | null {
  if (!release || release.draft || release.prerelease || typeof release.tag_name !== 'string') return null;
  const latest = /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:\+[\w.-]+)?$/.exec(release.tag_name);
  const installed = /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(-[\w.-]+)?(?:\+[\w.-]+)?$/.exec(current);
  if (!latest || !installed) return null;
  let newer = false;
  for (let i = 1; i <= 3; i++) {
    const a = BigInt(latest[i]), b = BigInt(installed[i]);
    if (a !== b) { newer = a > b; break; }
    if (i === 3) newer = Boolean(installed[4]);
  }
  if (!newer) return null;
  return {
    version: release.tag_name.replace(/^v/, ''),
    url: `https://github.com/entertheexit/transgentic/releases/tag/${encodeURIComponent(release.tag_name)}`,
  };
}

// Coalesce concurrent requests and cache results for one hour, including failures.
export function createUpdateChecker(fetcher: typeof fetch = fetch) {
  let pending: Promise<AvailableUpdate | null> | undefined;
  let startedAt = 0;
  let inFlight = false;
  return (currentVersion: string) => {
    if (pending && (inFlight || Date.now() - startedAt < UPDATE_CHECK_INTERVAL_MS)) return pending;
    startedAt = Date.now();
    inFlight = true;
    pending = (async () => {
    try {
      const response = await fetcher('https://api.github.com/repos/entertheexit/transgentic/releases/latest', {
        headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'Transgentic-Update-Check' },
        signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) return null;
      return getAvailableUpdate(currentVersion, await response.json());
    } catch {
      return null; // Offline, rate-limited, or unavailable: do not interrupt startup.
    } finally {
      inFlight = false;
    }
  })();
    return pending;
  };
}
