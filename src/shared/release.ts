export const TRANSGENTIC_RELEASES_URL = 'https://github.com/entertheexit/transgentic/releases';
export const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000;

export function getExtensionDownloadUrl(appVersion: string): string {
  return `${TRANSGENTIC_RELEASES_URL}/download/v${appVersion}/transgentic-sync-v1.2.0.zip`;
}
