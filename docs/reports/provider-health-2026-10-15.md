# Provider health check — 15 October 2026

Time zone: Asia/Bangkok. Scope: initial compatibility investigation, Temporary Chat checks, and local implementation follow-up. Inspected source commit: `3c35535`. The local Transgentic 2.2.0 desktop was restarted from this checkout after the repairs below; this does not establish the state of a released installer. Results remain scoped to the named paths and settings.

Use [the weekly runbook](../PROVIDER_HEALTH_CHECK.md) for subsequent checks. Browser and native CLI observations below are distinct from Transgentic end-to-end verification.

## Confirmed findings

| Area | Evidence | Result and required work |
| --- | --- | --- |
| Built-in model catalogs | Source inspection of `modelScrapers.ts`, manifests, and registries | Discovery returns fixed older lists for the four built-in web providers. Replace with verified discovery and reconcile defaults, persisted choices, and MCP schemas. |
| Built-in model selection | Source inspection | Several switchers return success without selecting/verifying the requested model. Built-in selection failure is not consistently rejected by `selectRequestedModel`. Require verified selection before submission. |
| Gemini model picker | Live browser and recipe selector comparison | Picker displays 3.5 Flash-Lite, 3.8 Flash, 3.1 Pro, and 4 Argon. The existing recipe picker selector matches zero elements. Update controls from current DOM evidence, including disabled/quota states. |
| Gemini media | Initial live browser observation | Image/video/music activation selectors existed, but the controls appeared disabled at that time. The later same-day recheck below supersedes this observation. |
| ChatGPT Temporary Chat indicator | Running desktop screenshot, live ChatGPT browser, source inspection | Desktop shows General routed to ChatGPT and “Temporary Chat Unsupported”. ChatGPT native Temporary Chat activates, and its active-state and authentication selectors match visible elements. An explicit Transgentic MCP request returns `[TEMPORARY_CHAT_UNAVAILABLE] Sign in to check Temporary Chat availability.` despite the desktop Connected badge. The renderer labels unavailable/missing capability state as unsupported. Repair status classification and investigate stale or conflicting authentication observations; do not remove native verification. |
| Gemini Temporary Chat | Live browser with synthetic prompt | Native activation succeeds; initial and follow-up replies are `temporary-ok`; recipe active-state selector matches before submission and after both replies. Transgentic transport result is tracked separately below. |
| Claude Incognito | Live browser with synthetic prompt | `Use incognito` activates native Incognito; initial and follow-up replies are `temporary-ok`; `Exit incognito` remains visible after both completions. Transgentic transport result is tracked separately below. |
| Claude Temporary Chat through Transgentic | Explicit MCP request with `temporary_chat: true`, new thread, General mode | Completed with `temporary-ok`. This is one live transport success; it does not establish every mode, attachment, or continuation path. Returned model metadata still uses an older catalog ID, so the actual native model is not established by that field. |
| Gemini Temporary Chat through Transgentic | Explicit MCP request with `temporary_chat: true`, new thread, General mode | Connector timed out awaiting the tool response after 300 seconds. The local health endpoint remained online. Submission/completion inside the provider was not established; do not replay automatically or classify the provider as unsupported. |
| Codex CLI 0.157.0 | Existing live tests through Transgentic's OS sandbox | Three tests passed: answer/resume, editing with commands disabled, and commands with editing disabled. Other mode/attachment/permission combinations remain separate coverage. |
| Antigravity CLI 1.2.0 | Native model listing and existing live adapter tests | Model listing returns current 3.8 Flash effort variants and other account-available models. Answer/resume passed; editing failed with an empty final answer; command test skipped. Root cause is unresolved. Capture events and file outcomes before retrying. |

The ChatGPT label defect is confirmed at the visible UI level. The runtime reports login-required unavailability; the reason this conflicts with the Connected badge is not yet established. Source evidence identifies the conflated predicate in `RadialHub.tsx`, recipe capability reporting in `sessionManager.ts`, and availability inspection in `customRecipeAdapter.ts`; the runtime error establishes authentication availability as the immediate blocker, but not why the account observation became inconsistent.

One source-level mechanism can produce this disagreement: provider refresh may retain Connected based on partition cookies after a negative DOM authentication observation, while Temporary Chat availability performs its own authentication check. A previously unavailable result can also remain stored when no attached view is inspected. Verify the active partition/view and observation timing before selecting a repair; the browser account alone cannot settle Electron authentication state.

## Validation and gaps

- Initial targeted run: six files, 91 tests passed; recipe-generation consistency passed.
- Follow-up isolated run: `temporaryChat.test.ts` and `recipeVersioningAndStorage.test.ts`, 21 tests passed.
- Documentation publication check, relative-link validation for the new documents, and `git diff --check` passed.
- Initial live Codex: three passed. Initial live Antigravity: one passed, one failed, one skipped. See the implementation update below for the repaired adapter result.
- ChatGPT, Claude, and Grok model/media behavior has not received complete live coverage. Native browser checks above do not establish Electron partition health.
- ChatGPT native activation was verified and a synthetic request was submitted; browser control disconnected before its final response could be inspected. Browser test-session cleanup was not verified after that disconnection.
- Claude Code was found locally but not live-tested. Grok CLI was not found in the checked executable locations.
- Custom recipes require private local inventory and verification under the generic procedure; no individual custom recipe is identified in this public report.
- The initial audit changed documentation only. The implementation follow-up below changed local source and one bundled recipe; no provider account configuration or installed binary was changed.

## Repair order and closure criteria

1. **Temporary Chat status:** distinguish support, availability, authentication, loading, and preference; reproduce the false label with runtime payload evidence; verify recovery and toggle behavior for ChatGPT, Gemini, Claude, and personalized/healed built-in overrides.
2. **Models:** repair Gemini's picker and shared built-in discovery/selection, including current catalog exposure through MCP and routing. Reject explicit mismatches before submission.
3. **Antigravity editing:** capture sanitized final/step events and actual disposable file outcomes. Diagnose parser, permission, provider, or quota behavior without weakening the sandbox or retrying uncertain side effects.
4. **Gemini transport timeout and remaining coverage:** inspect request-scoped logs and the owned temporary view to determine whether activation, submission, response extraction, or transport completion stalled. Do not replay an uncertain submission. Complete every applicable mode and transport in the runbook, keeping quota/login/control blockers explicit until live evidence is available.

For each repair, record local validation, active-runtime verification, and release inclusion separately. A passed build alone does not close a live compatibility finding.

## Local implementation update

- **Temporary Chat status:** The hub now separates missing/loading capability, declared support, current availability, and the saved preference. An enabled preference can be turned off after availability becomes unavailable. Provider refresh clears a previous availability result when its view is gone. A loaded page's explicit signed-out state now takes precedence over partition cookies, and hidden sign-in controls no longer count as logged-out evidence. Older healed built-in overrides that omit a Temporary Chat declaration inherit the bundled native contract in memory; an explicit disabled declaration is respected and the saved override is left untouched. Native privacy activation and reply verification remain required. This corrects the misleading *Unsupported* classification in source and fixture tests; ChatGPT personalized status still needs verification in a restarted desktop with its active Electron account.
- **Web models:** The bundled built-in catalogs now start with the current native selection instead of asserting retired named models are available. Named choices are discovered from the live account's visible, enabled picker entries. Previously saved named choices remain in the registry but are unavailable until rediscovered; user-enabled preferences are preserved. A requested named model must be found and visibly selected before submission, and an unavailable explicit override no longer silently falls back. Gemini's mode-picker trigger was updated to the observed current control. Live Electron picker behavior remains to be checked in the rebuilt app; a selector or picker failure now blocks explicit selection rather than claiming success.
- **Native CLIs:** A native disposable reproduction on the installed Antigravity CLI 1.3.5 produced a headless `write_file` permission denial, a `SUCCESS` result event with an empty response, and no file. The adapter now grants headless tool prompts only when project editing or commands are allowed by the user; the existing OS sandbox still enforces the workspace and action boundary. Live Transgentic adapter checks then passed answer/resume, edit-only, command-only, and combined edit/command cases for both Antigravity and Codex in disposable projects. Seven real macOS sandbox boundary checks passed, covering all four grant combinations.
- **Validation:** `npm run build`, `npm run check:recipes`, and 128 focused tests across 11 files passed. The full fixture suite reached 639 passed, 15 loopback-listen failures (`EPERM` from the restricted sandbox), and 26 skipped live tests; all five affected suites were rerun with local loopback permission and passed (52 tests, including the 15). The live CLI matrix passed four cases for each of Codex and Antigravity. Browser-control attachment failed during the implementation follow-up, so the rebuilt desktop and current live picker were not rechecked. Gemini's earlier Transgentic Temporary Chat timeout, quota-limited media paths, and the remaining provider/mode/transport matrix remain open under the weekly runbook.

## Restarted desktop verification

- Restarted the source checkout with `npm run dev` on port 5173 and the local MCP endpoint on port 58420. The TypeScript watcher reported zero errors. The running desktop showed General routed to ChatGPT, connected built-in providers, and a Temporary Chat indicator that progressed from Checking to Disabled. The toggle switched to Enabled and back to Disabled, restoring the original preference. A strict ChatGPT Temporary Chat request through Transgentic returned `temporary-ok`.
- Inspected the current Gemini web picker in the signed-in browser. It exposes 3.5 Flash-Lite, 3.8 Flash, 3.1 Pro, and 4 Argon as menu items with separate label and description nodes. The desktop's first scan found no named models while reporting success. The scraper now waits for the picker, reads only model labels from Gemini's current item structure, and ignores Thinking level choices. A restarted desktop scan then displayed all four as **Discovered Live**. The scan notice now describes completion without asserting choices were found.
- The Gemini picker abbreviates the selected 3.8 Flash choice as “Flash” in its trigger. Selection verification now checks the picker's selected item rather than comparing that abbreviated trigger with the full model name. Focused scraper and registry tests passed (16 tests), `npm run build` passed, and `git diff --check` passed. An explicit Gemini 3.8 Flash Temporary Chat request stopped producing the immediate model-selection error, but the connector timed out after 300 seconds. Submission and completion were not established; the prompt was not replayed.
- These checks do not certify every provider mode. Claude/Gemini native privacy behavior and the CLI matrix retain the earlier evidence and gaps above.

## Gemini media recheck — restored controls

The same signed-in Gemini web account now shows enabled **Create image**, **Create video**, and **Create music** controls. Model **4 Argon** with **Low** thinking was selected and verified in both the browser and Transgentic's embedded Gemini view. The earlier description of these controls as quota-limited was an unsupported inference; the initial observation established only that they appeared disabled then.

| Mode | Native Gemini web result | Transgentic MCP result |
| --- | --- | --- |
| Image | A simple blue-circle image completed, with a full-size download control. | An explicit 4 Argon, 1:1 request completed and saved a 1024×1024 JPEG. The file was opened and visually matched its green-square test prompt. |
| Video | A simple motion prompt completed with a playable, downloadable 10-second video. | An explicit 4 Argon, 16:9 request completed and saved a valid 10.005-second MP4. |
| Music | The first short instrumental piano prompt returned an explicit provider error. A simpler short instrumental ambient prompt then completed with a playable 63-second track. | An explicit 4 Argon, Short, Instrumental request completed and saved a 63.633-second MP4 containing AAC audio and H.264 video. |

The first Transgentic image request failed before submission with `[MEDIA_SETTINGS_FAILED] Media control scope is ambiguous.` The media-control resolver now waits up to five seconds for overlapping animated menus to settle while preserving its rejection of persistently ambiguous scopes. After 31 focused media-setting tests passed and the desktop restarted, the identical image request succeeded. The subsequent video and music requests also completed. This verifies generation, selected settings, response extraction, and local persistence for these three tested paths. Attachment handling, alternate settings, temporary media sessions, and automatic routing still require separate checks under the weekly runbook.

## Additional built-in web-service checks

| Provider and path | Evidence | Result |
| --- | --- | --- |
| ChatGPT General | Forced Transgentic MCP request with an exact synthetic reply | Pass: returned `chatgpt-general-ok`. |
| ChatGPT Coding | Forced Transgentic MCP request, native browser conversation, then a fresh request after repair | Initial failure: the transport response joined the language label to the code and dropped its fence. The observer now reconstructs ChatGPT code blocks before extracting text; the fresh desktop request returned a correctly fenced TypeScript function. |
| ChatGPT Writing | Forced Transgentic MCP request with a literal phrase | Pass: returned a coherent sentence containing the requested phrase. |
| ChatGPT image | Native normal-chat composer and forced Transgentic MCP request with Temporary Chat off | Pass after repair: the desktop saved a 1254×1254 PNG that visually matches the purple-circle prompt. The earlier pre-submit failure occurred because generic rich-text entry replaced ChatGPT's inline image-mode pill. The adapter now types after the pill, verifies it remains, and reuses only an exact matching unsent draft. |
| Claude General | Forced Transgentic MCP request | Pass: returned `claude-general-ok`. |
| Claude Coding | Native browser and forced Transgentic MCP requests before and after response-extraction repair | Initial result joined the language label to source code. The repaired observer returned a fenced TypeScript function on a fresh desktop request. |
| Claude Writing | Forced Transgentic MCP request | Pass: returned a short sentence containing the literal phrase. |
| Grok General | Forced Transgentic MCP request after updating the chat composer selector | Pass: returned `grok-general-ok`. |
| Grok Coding | Native browser and forced Transgentic MCP requests before and after response-extraction repair | Initial result joined the language label to source code. The repaired observer returned a fenced TypeScript function on a fresh desktop request. |
| Grok Writing | Forced Transgentic MCP request | Pass: returned a short sentence containing the literal phrase. |
| Grok image, free account | Native Grok Imagine and forced Transgentic MCP request | Pass: the native page produced an image; Transgentic selected Image and Speed and saved a 768×1152 JPEG for a 2:3 prompt. |
| Grok video, free account | Native Grok Imagine controls and forced Transgentic MCP request | Pass: 480p, 6 seconds, 16:9 request saved a 6.042-second MP4 with H.264 video and AAC audio. The first request stopped before submission because the video aspect-ratio menu had gained an Auto entry; the recipe was updated and the same settings then succeeded. |
| Gemini General | Forced Transgentic MCP request after the media recheck | Pass: returned `gemini-general-ok`. |
| Gemini Coding | Forced Transgentic MCP requests with and without the saved Temporary Chat preference | The preference-enabled request stopped before submission because the activation control was not found. With Temporary Chat explicitly off, coding completed but initially lost its code fence; the repaired observer returned a fenced TypeScript function on a fresh request. |
| Gemini Writing | Forced Transgentic MCP request with Temporary Chat explicitly off | Pass: returned a short sentence containing the literal phrase. |

The Grok recipe previously targeted obsolete radio-group and chat-composer structures. The current native page exposes labelled Generation mode, Image generation speed, Video resolution, and Video duration groups, plus a six-choice video aspect-ratio menu. Bundled recipe version 1.1.4 updates those controls. An older installed healed override initially shadowed the repair; previous copies were archived locally and the installed override was aligned before the successful desktop requests. ChatGPT's previous installed override was also archived before its image marker was updated. Installed override state is local and is not included in this public repository.

| Built-in web provider | General | Coding | Writing | Image | Video | Music | Native privacy path |
| --- | --- | --- | --- | --- | --- | --- | --- |
| ChatGPT | Pass | Pass | Pass | Pass | Not offered by active media capabilities | Not offered by active media capabilities | Temporary Chat pass in the restarted desktop check above. |
| Claude | Pass | Pass | Pass | Not offered by active media capabilities | Not offered by active media capabilities | Not offered by active media capabilities | Incognito pass in native browser and explicit Transgentic request above. |
| Gemini | Pass | Pass with Temporary Chat off | Pass with Temporary Chat off | Pass | Pass | Pass | Native behavior passed earlier; the current preference-enabled Coding request failed before submission because no activation control was found. |
| Grok | Pass | Pass | Pass | Pass on free account | Pass on free account | Not offered by active media capabilities | Not declared by the active recipe. |

This matrix covers one synthetic end-to-end request per available primary mode, plus the listed retries after repair. It does not imply that every setting, attachment kind, transport, continuation, cancellation, or account state was exercised. Gemini Temporary Chat transport remains an open finding; private custom-recipe details are kept outside this report.

The final local source check passed 113 focused tests across nine suites, `npm run build`, `npm run check:recipes`, `npm run check:publication`, and `git diff --check`. Two additional log-category tests passed after replacing a provider-specific fixture with a generic custom-provider ID. The normal desktop dev process remained available on its local MCP endpoint, and the temporary loopback debugger used for DOM inspection was removed and closed.
