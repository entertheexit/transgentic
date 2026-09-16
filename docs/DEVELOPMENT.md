# Transgentic custom development and desktop builds

Source setup, isolated tests, and desktop packaging for developers modifying Transgentic. To use a published desktop build without a development toolchain, see [desktop and Chrome extension downloads](../README.md#getting-started).

[Documentation index](../README.md#documentation-index)

## Contents

- [Source setup](#source-setup)
- [Tests](#tests)
- [Builds](#builds)
- [Signed macOS and draft releases](#signed-macos-and-draft-releases)
- [Documentation and publication checks](#documentation-and-publication-checks)

## Source setup

These commands obtain a source checkout governed by [LICENSE](../LICENSE). Install Git, Node.js 20 or later, and npm 10 or later. Check dependency engine requirements for the versions being installed.

```bash
git clone https://github.com/entertheexit/transgentic.git
cd transgentic
npm install
npm run dev
```

If you already have a checkout, run the last two commands from its directory. Development mode starts the renderer and Electron watchers. The desktop is still a running application: it can load local configuration, session data, and enabled provider connections. These steps do not install a local model.

## Tests

Run tests only in an isolated checkout without personal runtime data. Some integration tests write runtime JSON to their working directory; do not run the full suite against a checkout containing personal data.

```bash
npm test
```

Response-specific coverage includes:

- `tests/responseGuidance.test.ts`: orchestration with mocked provider boundaries.
- `tests/mcpCallerTransport.test.ts`: local HTTP/SSE connections, profiles, progress, and cancellation.
- `tests/conversationScope.test.ts`: Quick Prompt conversation ownership.
- `tests/localGuidance.live.test.ts`: opt-in local-model integration via `TRANSGENTIC_LIVE_LOCAL_CONFIG`.

The live test sends prompts to the configured model. A passing mocked test is not a live provider compatibility check. Keep test configuration and credentials out of version control.

## Builds

Scripts are defined in [package.json](../package.json).

| Command | Purpose |
| :--- | :--- |
| `npm run build` | Compile renderer and desktop |
| `npm run build:mac` | Request macOS packaging |
| `npm run build:mac:signed` | Build, sign, and notarize macOS packages with the local `transgentic-notary` Keychain profile |
| `npm run build:mac:arm64` | Request macOS ARM64 packaging |
| `npm run build:mac:x64` | Request macOS x64 packaging |
| `npm run build:win` | Request Windows packaging |
| `npm run build:linux` | Request Linux packaging |
| `npm run dist` | Run the default electron-builder packaging configuration |
| `npm run build:all` | Request macOS, Windows, and Linux targets |

Packaging depends on the host toolchain, target requirements, and signing configuration. A script's presence does not establish that its installer has been tested on every platform. Building does not publish or update an existing release.

`build:all` requests all targets from one host, but it is not the release workflow: macOS signing only works on macOS, Linux packaging is best run on Linux, and Windows packaging/signing has its own toolchain. The GitHub workflow therefore uses one native runner per operating system.

## Signed macOS and draft releases

Production macOS packages use the bundle identifier `one.transgentic.desktop`. The builder requires a Developer ID Application signature, Hardened Runtime, and Apple notarization; it fails instead of emitting an unsigned release when credentials are missing.

The `Build draft release` GitHub Actions workflow runs automatically for a pushed `v*` tag, or manually for an existing tag. It builds macOS on macOS, Windows on Windows, and Linux on Ubuntu, then creates or updates a draft GitHub Release. Review its generated notes and artifacts before publishing the draft. Configure these repository secrets before running it:

| Secret | Value |
| :--- | :--- |
| `MACOS_CERTIFICATE` | Base64-encoded `.p12` export containing the **Developer ID Application** certificate and private key |
| `MACOS_CERTIFICATE_PASSWORD` | Password used when exporting that `.p12` |
| `APPLE_API_KEY_BASE64` | Base64-encoded App Store Connect API private key (`.p8`) |
| `APPLE_API_KEY_ID` | App Store Connect API key ID |
| `APPLE_API_ISSUER` | App Store Connect API issuer ID |

Encode each binary credential as a single line on macOS before copying it into the corresponding secret:

```bash
base64 -i DeveloperIDApplication.p12 | tr -d '\n'
base64 -i AuthKey_KEYID.p8 | tr -d '\n'
```

The workflow builds both Intel and Apple Silicon DMG/ZIP packages, verifies the bundle identifier and strict code signature, validates the stapled notarization ticket, and asks Gatekeeper to assess each app. It also builds the configured Windows and Linux targets on their native GitHub runners. Only after all three jobs pass are the artifacts attached to a draft release.

`transgentic-notary` is an arbitrary local Keychain profile name, not the App Store Connect API key's display name. Create it once with the downloaded API key:

```bash
xcrun notarytool store-credentials "transgentic-notary" \
  --key "/path/to/AuthKey_KEYID.p8" \
  --key-id "KEYID" \
  --issuer "ISSUER-ID"
```

After that succeeds, `npm run build:mac:signed` builds, signs, and notarizes both macOS architectures using the Developer ID Application identity already installed in the login Keychain. The ordinary `build:mac` command also supports explicit `APPLE_API_KEY`, `APPLE_API_KEY_ID`, and `APPLE_API_ISSUER` environment variables. Do not place certificates, private keys, or passwords in the repository.

Windows uses a separate Authenticode certificate or Microsoft Artifact Signing configuration; the Apple certificate cannot sign Windows executables. Until Windows signing credentials are configured, the workflow's Windows artifacts are unsigned and can trigger Microsoft Defender SmartScreen. Electron Builder does not apply a platform code-signing phase to Linux AppImage or DEB targets; signing a Linux package repository is a separate distribution concern.

## Documentation and publication checks

```bash
npm run check:publication
git diff --check
```

The publication check scans the working snapshot for selected private/runtime paths and likely credentials. It does not audit legal compliance, sanitize Git history, inspect every existing release archive, or guarantee that all secrets have been detected.

When changing documentation:

- Keep [README](../README.md) as the entry point and link detailed guides from its index.
- Check relative links, heading anchors, fenced examples, and the source behind behavior claims.
- Distinguish repository behavior, installed builds, mocked tests, and live provider observations.
- Describe settings and limitations without claims of provider approval, restriction avoidance, guaranteed privacy, or guaranteed correctness.
- Treat changes to [LICENSE](../LICENSE), publication terms, and release state as separate decisions.

Follow [Publication guidance](PUBLICATION.md) before any release. Nothing in these commands authorizes a commit, push, visibility change, or publication.
