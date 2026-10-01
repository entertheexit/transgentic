# Media generation

Media requests use recipe-controlled tools and settings through Quick Prompt, MCP, or the authenticated HTTP API. `/v1/chat/completions` keeps its existing text/completion contract. A media request completes only after a generated artifact is saved and validated; a text-only reply fails with `media_not_generated`.

## Discover settings first

`GET /v1/media/capabilities` returns the provider, mode, selected/configured model, availability, supported semantic options, defaults, native defaults, and reference attachment support. `get_media_capabilities` exposes the same inventory over MCP. Unverified legacy modes remain unavailable even if their older recipe declared media support. Authentication and verified controls are required; account entitlements and quota can still prevent a generation.

| Provider | Mode | Recipe defaults |
| --- | --- | --- |
| Gemini | Music | `length: "standard"`, `vocals: "custom"`, `genre: "custom"` |
| Gemini | Image | `aspect_ratio: "1:1"` |
| Gemini | Video | `aspect_ratio: "16:9"`; native duration and quality |
| Grok Imagine | Image | `quality: "speed"`, `aspect_ratio: "1:1"` |
| Grok Imagine | Video | `resolution: "480p"`, `duration_seconds: 6`, `aspect_ratio: "16:9"`, `sound: true` |
| ChatGPT | Image | Native automatic quality and aspect ratio; no verified configurable controls |

Gemini Music supports Short/Standard; Custom/Vocals on/Instrumental; and Custom, Pop, Hip-hop & rap, Rock, K-pop, Latin, Electronic, R&B, Country, Afrobeats, Reggae, Jazz & blues, Classical, Folk, Lo-fi, Acoustic, Cinematic, and Ambient. Use the semantic values returned by discovery (for example `hip_hop_rap`, `jazz_blues`, `instrumental`). Gemini image ratios are `1:1`, `9:16`, `3:4`, `4:3`, and `16:9`; video offers `16:9` and `9:16`. Grok ratios are `2:3`, `3:2`, `1:1`, `9:16`, and `16:9`; image quality is `speed` or `quality_2`; video offers 480p/720p and 6/10/15 seconds.


## HTTP jobs

| Method | Path | Result |
| --- | --- | --- |
| GET | `/v1/media/capabilities` | Available providers/models, supported settings, defaults and attachment limits |
| POST | `/v1/media/jobs` | Validate and enqueue; HTTP 202 with a job ID |
| GET | `/v1/media/jobs/:id` | Progress, effective settings, artifacts or failure |
| POST | `/v1/media/jobs/:id/cancel` | Cancel queued work or stop waiting for submitted work |
| GET | `/v1/media/jobs/:id/artifacts/:artifactId` | Download that job's registered artifact |


Every endpoint requires `Authorization: Bearer <Transgentic access token>`, including artifact downloads. MCP session IDs do not replace this authentication. Use the local base URL `http://127.0.0.1:58420/v1`; LAN requests use the configured gateway address.

```sh
curl "$TRANSGENTIC_URL/media/capabilities" \
  -H "Authorization: Bearer $TRANSGENTIC_TOKEN"

curl "$TRANSGENTIC_URL/media/jobs" \
  -H "Authorization: Bearer $TRANSGENTIC_TOKEN" \
  -H 'Content-Type: application/json' \
  -H 'Idempotency-Key: my-scene-001' \
  --data '{"mode":"video","provider":"grok","prompt":"A gentle ocean wave at sunrise","settings":{"aspect_ratio":"16:9","duration_seconds":6,"resolution":"480p","sound":true},"new_thread":true}'
```

Set `TRANSGENTIC_URL` to the `/v1` base URL and `TRANSGENTIC_TOKEN` to the copied access token. `POST /media/jobs` validates and stages references, persists the job, and returns `202` with its ID. Poll `GET /media/jobs/:id` for `queued`, `running`, `submitted`, `completed`, `failed`, `cancelled`, or `uncertain`, progress, effective settings, provider/model, and registered artifacts. Download each artifact through its returned `download_url`; arbitrary local paths are never accepted by the download endpoint.

```json
{
  "mode": "image",
  "prompt": "Turn this reference into a simple watercolor illustration",
  "provider": "gemini",
  "settings": { "aspect_ratio": "3:4" },
  "files": [{ "name": "reference.png", "mimeType": "image/png", "data": "<base64 bytes>" }],
  "new_thread": true,
  "temporary_chat": false
}
```

The request also accepts `model`, `provider_settings`, `thread_id`, and `project_name`. Attachment fields use the existing MCP attachment contract: inline base64/data URI, HTTPS URL, or a loopback-only local path. References retain existing validation: at most 10 files, 50 MiB per file, and 100 MiB total, with narrower recipe limits enforced. Image mode accepts images; Video accepts only the kinds declared by the provider (Grok currently accepts images); Music has no reference uploads.

Settings resolve as recipe defaults → explicit common `settings` → `provider_settings[provider]`. For example, a Gemini image choice of `3:4` skips Grok unless `provider_settings.grok.aspect_ratio` supplies a supported ratio. Unknown or unavailable explicit values never silently become defaults. Provider-specific options are discoverable and do not imply equivalent quality/duration semantics across services.

Idempotency keys are scoped to the authenticated caller, persisted, and bound to the prompt, options, and reference-byte identity. Reusing a key with another request returns `409`. Reusing it with the same request returns the original job, including after restart. Interrupted submitted jobs become `uncertain`; unsubmitted jobs become cancelled. Neither is replayed. After an uncertain UI submission, routing never retries another provider.

`POST /media/jobs/:id/cancel` prevents queued submission or stops waiting for submitted work. Provider generation may continue. Artifacts are available only for completed jobs belonging to the requesting access identity.

### Generate music, poll and download

Discover capabilities before choosing a provider or model. This example uses Gemini's verified music defaults:

```sh
curl "$TRANSGENTIC_URL/media/jobs" \
  -H "Authorization: Bearer $TRANSGENTIC_TOKEN" \
  -H 'Content-Type: application/json' \
  -H 'Idempotency-Key: original-music-001' \
  --data '{"mode":"music","provider":"gemini","prompt":"Create an original gentle piano instrumental, no vocals.","settings":{"length":"standard","vocals":"custom","genre":"custom"},"new_thread":true}'

# Replace JOB_ID with the ID returned by the POST.
curl "$TRANSGENTIC_URL/media/jobs/JOB_ID" \
  -H "Authorization: Bearer $TRANSGENTIC_TOKEN"

# After completion, use the artifact ID from the job response.
curl "$TRANSGENTIC_URL/media/jobs/JOB_ID/artifacts/ARTIFACT_ID" \
  -H "Authorization: Bearer $TRANSGENTIC_TOKEN" \
  --output generated-music.mp4

# Cancel or stop waiting for this job, if needed.
curl -X POST "$TRANSGENTIC_URL/media/jobs/JOB_ID/cancel" \
  -H "Authorization: Bearer $TRANSGENTIC_TOKEN"
```

`completed` means saved, validated media is available. `failed` includes an error code and message; `media_not_generated` means no usable media was returned. `uncertain` means submission may have reached the provider, so inspect its conversation before making a new request. Polling and downloading do not trigger another generation. Cancellation after submission does not guarantee that the provider stops generating. A music artifact may use an MP4 container with a playable audio track; use the returned MIME type and filename instead of assuming MP3.

## MCP and Quick Prompt

`generate_image`, `generate_video`, `generate_music`, `edit_image`, and `edit_video` accept `settings` and `provider_settings`. Image/video generation can include references in `files`; editing requires references. Example arguments:

```json
{
  "prompt": "A calm original acoustic instrumental",
  "provider": "gemini",
  "settings": { "length": "standard", "vocals": "instrumental", "genre": "acoustic" },
  "new_thread": true
}
```

Quick Prompt's fixed sparkle button opens a keyboard-accessible settings dialog for the selected mode. Primary and fallbacks follow route order. Fallbacks inherit compatible primary values; explicit override flags allow their own choices. Unsupported inherited values explain why a fallback will be skipped. Save persists choices per provider/mode on this device, Cancel discards edits, and Reset restores recipe defaults when saved. Model and route changes revalidate choices. Sending snapshots preferences so later edits cannot alter an active request. HTTP/MCP calls use their own arguments or recipe defaults, independently of desktop preferences.

## Recipe controls

Media modes add `generation` with declarative `activationSteps`, positive `activeWhen`, and `settings`. Each setting defines a semantic key, label, type, default, supported options, optional model dependencies, selection steps, and positive selected-value verification. `nativeDefaults` describes verified settings without exposed controls. Only `click`, `clickIfPresent`, `pointerDown`, `escape`, and `waitAbsent` actions are allowed; conditional clicks support clearing an optional selection; pointer presses open native menus that do not respond to click alone; neither bypasses final positive verification; recipes cannot execute arbitrary JavaScript or shell commands.

Indexed locators require a unique visible `scope`, zero-based `index`, and exact `expectedCount`. Where available, `identityAttribute`, `identitySelector`, and ordered `identities` guard option identity. `requiredAttributes` verifies selection. `compact` changes locators below 768 CSS pixels while inheriting verification attributes. Missing, reordered, disabled, or ambiguous controls fail before submission. Menu-close verification prevents one option group from being mistaken for the next. Labels are display text, not option-selection authority.

Execution activates the native tool, applies and verifies settings, uploads references, rechecks settings, and clicks one declared send control. Existing gallery/reference assets are excluded. Music stored as MP4 remains in `Library/Music` and requires a nonempty audio track; silent video is not successful music. Saved images must decode. Audio/video containers must contain the required nonempty tracks and pass a muted, isolated check using the app's shipped playback decoder. Current saved output support is PNG/JPEG/WebP/GIF, MP4, WAV, Ogg and MP3; other containers fail rather than being reported as usable.
