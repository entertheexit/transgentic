# Source-available publication workflow

The intended public offering is reviewed application source and binaries under the custom Transgentic Source-Available License in `LICENSE`. Personal and internal business use are free, including paid client work and independently created outputs. Selling or commercially redistributing the Software, and offering its functionality to third parties as a hosted or managed service, require separate written permission. Internal hosting and free noncommercial forks are permitted. Do not describe this as OSI open source or as a blanket ban on commercial use.

Keep the existing repository private until an explicit publication step. Prefer a fresh public repository containing only an audited snapshot, while retaining the private repository and history as a backup. If the private repository occupies the desired public name, it can be renamed before creating the public repository. Renaming, creating repositories, committing, pushing, changing visibility, and rewriting history all require separate authorization; updating local licensing does none of these.

Start the public repository from an empty directory. Copy only the reviewed source, tests, build configuration, license, documentation, and deliberate public assets. Do not copy the entire working directory or its `.git` history, private recipes, credentials, runtime data, backups, or old build artifacts. Verify a fresh clone before announcing publication. The public repository and its automatic source archives will expose the selected source under the included license.

## Source hygiene and build checks

Keep private recipes and runtime data outside the published tree. `workspace/`, `backup/`, runtime recipe folders, logs, account/session files, and local MCP client configurations are ignored. Ignoring a file does not remove an already tracked copy.

Run `npm run check:publication` before committing. This checks tracked files plus unignored new files, omitting pending deletions. It derives private provider identifiers from local `workspace/recipes/*.json`; optionally set `PRIVATE_PROVIDER_TERMS` to a comma-separated list of additional private identifiers. The check reports filenames without printing matching secrets. It is a targeted check, not a guarantee that every possible secret has been detected.

Run tests in an isolated copy: existing integration tests write runtime JSON to their working directory. Do not run them against a working checkout containing personal runtime data.

`npm run build` compiles the renderer and clears `dist-electron` before compiling the desktop. Deleted source therefore cannot survive as stale JavaScript. Electron packaging includes only the current extension source folder; old extension ZIPs and runtime model registries are excluded. npm publishing is disabled with `private: true`, and an explicit package allowlist also restricts pack previews. Inspect each final archive before distribution; rebuilding source does not update old installers.

## Before any public source or binary release

- Confirm the original history stays private and the destination contains only the reviewed snapshot.
- Have a qualified lawyer review this custom license before publication, including its resale, paid bundling, hosted-service, distribution, and termination provisions. It is a project-specific draft, not a legal assurance.
- Review ownership, contributor permissions, and prior grants. This license does not relicense third-party code or revoke earlier distributed licenses. Establish contribution terms before accepting outside code if future commercial licensing requires those rights.
- The license covers source and binaries supplied under it. Review any additional release or paid-service terms for consistency; the license change alone does not set pricing, grant provider access, or guarantee compliance with provider terms. Keep npm publishing disabled with `private: true`; `SEE LICENSE IN LICENSE` identifies the custom license rather than an SPDX open-source license.
- Inventory the dependencies actually shipped, including bundled renderer code, Electron/Chromium, and the companion extension. Include all required third-party license and attribution notices. A lockfile license field alone is not a completed notice audit.
- Build fresh installers, verify functionality, and inspect actual artifacts for private recipes, credentials, runtime data, development paths, and unintended source maps. Public source and bundled JavaScript are inspectable; the license is a legal restriction, not a copying barrier.
- Upload only reviewed source and deliberately approved release assets. Do not upload npm tarballs, development output folders, old installers, or archives indiscriminately.
- Verify the public repository and downloaded release assets before announcing availability.

Source cleanup does not grant third-party permission to use a private recipe. The public engine supports user-supplied configuration; provider-specific authorization remains separate.
