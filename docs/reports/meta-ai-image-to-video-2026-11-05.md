# Meta AI image-to-video verification — 2026-11-05

Recipe `meta` 1.1.1 now advertises one PNG/JPEG/WebP image reference for video mode. `edit_video` and `generate_video` with an image use the existing upload, inline-reference preservation, eight-second readiness interval, prompt generation and validated-download pipeline. Video-file inputs and multiple references remain unsupported.

## Investigation

The November 4 failures used a 96×96 synthetic red/blue PNG. Meta replied with renderer/service-error explanations, but that did not establish a universal image-to-video failure or a documented minimum input size. The prior gate was appropriate for the available evidence.

A new Chrome Sync 1.2.1 authentication transfer established an isolated Electron session. Without changing the generation prompt or request wrapper, a 1600×1600 WebP reference succeeded. A second, scene-based PNG succeeded through the final compiled recipe with no test overrides. Input dimensions/content or transient service behavior may explain the earlier failures; the precise provider-side cause remains unproven. No arbitrary minimum size, silent resizing or automatic post-submission replay was added.

The native media viewer was inspected; no new animation-control sequence was needed. Meta's [Vibes description](https://ai.meta.com/meta-ai/vibes/) documents animation of images, while its [engineering overview](https://engineering.fb.com/2024/08/14/production-engineering/how-meta-animates-ai-generated-images-at-scale/) describes the animation service. These sources are background, not proof of current account execution.

## Correction on our side

The generic recipe observer reused a mode's content selector for image detection. A video selector could therefore classify a video element as an image. It also accepted video sources before player readiness and could clear generating state even with a visible Stop control.

The observer now:

- Excludes image candidates in video/music modes and requires actual image elements for generic image extraction.
- Waits for video frame readiness before collecting a player source.
- Rejects baseline video URLs before marking completion.
- Preserves active native Stop/spinner state when media becomes available.

ChatGPT and other dedicated provider branches retain their existing detection behavior. Chromium fixtures cover loading video plus reference preview, ready video while Stop remains active, and baseline-video exclusion.

## Live results

| Request | Result |
| --- | --- |
| Animate 1600×1600 synthetic red/blue/green WebP | Completed in 67.7 seconds; validated H.264/AAC MP4, 960×960, 10 seconds. |
| Animate paper-boat PNG, final tracked recipe | Completed in 79.5 seconds; validated H.264/AAC MP4, 1280×720, 10 seconds. Frames at 0 and 5 seconds visually confirm boat movement and changing ripples. |

Both results were newly generated through the production Electron MCP pipeline and decoded successfully. SHA-256 evidence and the synthetic videos are retained under `/private/tmp/transgentic-meta-evidence-20261105/`; authentication data is excluded.

## Final checks

- 774 tests passed; 12 live tests skipped.
- 37 real Chromium checks passed at 390px and 1280px.
- Full production build, recipe consistency, publication snapshot and whitespace checks passed.
- No commit, release or deployment was performed. The disposable authentication profile was removed after verification.
