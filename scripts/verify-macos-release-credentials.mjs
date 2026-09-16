const complete = (names) => names.every((name) => Boolean(process.env[name]));

export function hasNotarizationCredentials() {
  return complete(['APPLE_API_KEY', 'APPLE_API_KEY_ID', 'APPLE_API_ISSUER'])
    || complete(['APPLE_ID', 'APPLE_APP_SPECIFIC_PASSWORD', 'APPLE_TEAM_ID'])
    || Boolean(process.env.APPLE_KEYCHAIN_PROFILE);
}

export default async function verifyMacosReleaseCredentials(context) {
  if (context.electronPlatformName !== 'darwin') return;

  if (!hasNotarizationCredentials()) {
    throw new Error(
      'macOS release packaging requires complete Apple notarization credentials. '
      + 'Set APPLE_API_KEY, APPLE_API_KEY_ID, and APPLE_API_ISSUER; '
      + 'or use the supported Apple ID or Keychain profile credential set.',
    );
  }
}
