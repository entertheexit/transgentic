# Transgentic custom development and desktop builds

Source setup, isolated tests, and desktop packaging for developers modifying Transgentic. To use a published desktop build without a development toolchain, see [desktop and Chrome extension downloads](../README.md#getting-started).

[Documentation index](../README.md#documentation-index)

## Contents

- [Source setup](#source-setup)
- [Tests](#tests)
- [Builds](#builds)
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
| `npm run build:mac:arm64` | Request macOS ARM64 packaging |
| `npm run build:mac:x64` | Request macOS x64 packaging |
| `npm run build:win` | Request Windows packaging |
| `npm run build:linux` | Request Linux packaging |
| `npm run dist` | Run the default electron-builder packaging configuration |
| `npm run build:all` | Request macOS, Windows, and Linux targets |

Packaging depends on the host toolchain, target requirements, and signing configuration. A script's presence does not establish that its installer has been tested on every platform. Building does not publish or update an existing release.

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
