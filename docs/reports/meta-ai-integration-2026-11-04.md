# Meta AI built-in integration — 2026-11-04

Local implementation against source baseline `cc963bd`, package version `2.2.2`, with recipe `meta` version `1.1.0`. Verification was performed on macOS; dates and observed browser times use Asia/Bangkok. This report describes the working-tree implementation and browser observations, not an installed release.

## Delivered behavior

Meta AI appears as a built-in web provider with an isolated `persist:transgentic_meta` account partition, recipe reset/repair support, model discovery, route selection, status/rate-limit tracking, and extension detection. Existing route defaults and saved account partitions are preserved. Clients can call `ask_meta`, force `provider: "meta"` in existing completion interfaces, or use the authenticated `/meta/mcp` and `/meta/sse` endpoints.

`default` keeps the current native choice. Instant and Thinking are discovered and selected using native menu identities, with selection verified before submission. Authentication requires a visible account marker at the configured origin; the guest composer and unrelated cookies cannot establish authentication. Manual and optional background sync filter cookies to Meta AI domains. Background refresh defaults off and requires an open signed-in Meta AI tab.

The observer excludes reasoning and suggestions from the answer, rejects ambiguous visible composers, and avoids treating the header's unrelated Cancel action as active generation. Recognizable Stop fallbacks for existing providers remain intact.

## Results by verification layer

| Behavior | Result | Evidence and limit |
| --- | --- | --- |
| Registration, account migration, recipe validation and MCP endpoints | Pass, automated | Unit/integration coverage, including preservation of an older account partition. |
| Guest and wrong-origin authentication rejection | Pass, fixtures | Visible-marker requirements and negative cases execute against the adapter; this is not a real session-transfer test. |
| Browser text | Pass | A fresh synthetic prompt returned exactly `META_OK_1104`. |
| Browser mode selection | Pass | Selecting Thinking changed the native trigger; selecting Instant restored it. Automated discovery/selection cases also pass. |
| Browser image generation | Pass | A fresh blue-cube request produced an assistant-owned `ur-image-tile` image. |
| Browser video generation | Pass | A fresh rotating-cube request produced a video element with `readyState: 4` and a 10-second duration. This is one observed result, not a duration-setting guarantee. |
| Downloaded media artifact | Pass, Electron | Real MCP image generation saved a validated purple-cone WebP in 43.4s; video generation saved a validated MP4 in 66.3s. Chromium decoding handles WebP unsupported by Electron nativeImage. |
| Meta authentication in Electron | Pass, Chrome Sync 1.2.1 | A new isolated profile was confirmed signed out, then authenticated after the user reloaded Sync 1.2.1 and synced the signed-in Meta tab. A production MCP request returned exactly `SYNC_META_OK_1104` in 13.8s. Authentication persisted after restarting that profile. Native Facebook/Meta sign-in was also verified independently. |
| Meta requests through Electron | Pass, image/video | Production MCP server, adapter, downloads and artifact validators executed in an isolated authenticated Electron workbench. |
| Text attachments | Pass, enabled for one image | A Chrome-synced production request completed in 20.0s, identified red/blue correctly, and returned no false reference-preview artifact. PNG was exercised live; PNG/JPEG/WebP are the declared native image MIME contract. Multiple references, documents and video files are not advertised. |
| Image editing | Pass, enabled for one image | A real `edit_image` request completed in 50.8s and saved a validated 1600×1600 WebP. Visual inspection confirmed red/blue halves plus the requested new green triangle. Edited output uses the direct image child of the before/after slider, excluding its original-image overlay. |
| Video references | Not enabled | Two distinct `edit_video` requests returned explicit provider generation-service/renderer errors, including a simpler slow-zoom request. Both were reported as failures with no artifact. Video reference support remains gated. |
| Music and native Temporary Chat | Not enabled | The recipe does not advertise either capability. |

## Media gate

Image and video configuration uses the explicit prompt-directed strategy: verify composer readiness, prefix a fixed media instruction, then require a newly generated and validated artifact. Existing recipes retain their native control strategy.

Both media modes are enabled after independent successful Electron generation, download and decoding checks. The recipe does not advertise unsupported explicit settings. Single-image text and image-editing inputs are enabled after their independent gates passed. Initial attachment requests submitted too early after the thumbnail appeared and lost their live conversation view. Requiring eight seconds of continuously confirmed upload readiness resolved the observed race. Reference URLs are excluded before image conversion, and text-mode media selectors reject reference-preview thumbnails. A root reload alone did not fix the race. Video references, documents and video-file uploads remain disabled.

The shared extension is now 1.2.1, with matching local ZIP build, desktop download route and installer resources. Its download endpoint returned an archive identical to the built ZIP. Published release assets were not changed. Meta cookie import remains scoped to Meta AI; Facebook login cookies are not exported. Download cookies are filtered to the target URL and dropped on cross-origin redirects.

## Automated validation

- Full suite: **774 passed, 12 skipped**; three live-test files remain skipped.
- Real Electron/Chromium harness: **35 checks passed** at 390px and 1280px widths, using local HTML and a disposable browser profile.
- Production build, recipe consistency, extension JavaScript syntax checks and whitespace checks passed.
- The build retains Vite's existing large-chunk advisory. No installer was published or deployed.

## Local use

Run the rebuilt application, reload the updated Transgentic Sync extension, then sync an authenticated `https://www.meta.ai/` tab. Select Meta AI explicitly in Providers, a route, or an MCP request. Discover the current account's native choices before requesting Instant or Thinking. Text, image, and video requests accept one PNG/JPEG/WebP reference; image-to-video was enabled after the follow-up verification below.

## 2026-11-05 follow-up

Image-to-video was subsequently verified with larger reference images and enabled in recipe 1.1.1. See [the investigation and final verification](meta-ai-image-to-video-2026-11-05.md). The disabled-reference statements above record the November 4 verification boundary.

Later on November 5, a reconnected Meta AI session completed fresh text requests through `ask_meta` and `/v1/chat/completions` using `transgentic/provider/meta`. Both image and video were available in HTTP capability discovery. A fresh Meta image job completed through `/v1/media/jobs`, and its WebP artifact was downloaded successfully through the authenticated artifact endpoint. This check did not repeat live video generation; the separate image-to-video report records that earlier verification.
