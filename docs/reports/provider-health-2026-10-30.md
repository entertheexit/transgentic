# WebView provider health check — 30 October 2026

**Latest acceptance:** see [the final full-suite and WebView recheck](#final-full-suite-and-webview-recheck). Earlier tables below are historical and do not override the latest results.

Time zone: Asia/Bangkok. Live verification: approximately **00:35–00:59 on 30 October 2026**. Source commit: `a5ce4b9c810e03187e278c1ee4dc7485c44795f6`. Running desktop: **2.2.1**, development Electron process from this checkout, with its process confirmed as the listener on the configured MCP port. OS: macOS 27.0.1, build 26A434. The working tree was clean at the start. This audit covers the four built-in WebView services and configured **custom recipes**; CLI, local-model and API-provider execution is outside this requested WebView scope. CLI versions were not probed.

**Repair follow-up:** the initial audit below is retained as historical evidence. See [repair and recheck](#repair-and-recheck) for the later source changes and live results.

Follow [the weekly runbook](../PROVIDER_HEALTH_CHECK.md). Results below concern the current local runtime, not a released installer. A Pass covers only the named observation. The complete runbook acceptance matrix is **not certified**: remaining gaps and closure criteria are listed below.

## Recipe and runtime inventory

All four built-in web services and the configured custom recipes reported ready/authenticated. These status flags did not guarantee successful requests.

| Built-in | Bundled version | Installed provenance inspected |
| --- | --- | --- |
| ChatGPT | 1.2.3 | Healed override matches the bundled JSON. |
| Claude | 1.1.2 | No healed override found; bundled recipe applies. |
| Gemini | 1.1.3 | Healed override remains at 1.1.2. Its model-picker trigger omits the bundled `Open mode picker` selector. Other differences are version metadata. |
| Grok | 1.1.4 | Healed override matches the bundled JSON. |

Generated built-in recipes passed their consistency check. Installed provenance and loader precedence were inspected; active adapter JSON was not independently exported. No installed override, account, preference, binary, or recipe was replaced. Custom-recipe evidence is retained outside the repository and is intentionally reported only in aggregate.

Persisted built-in registries retain historical named defaults and choices, marked unavailable until rediscovered. Tests below explicitly requested `default`, meaning the current native selection. Successful response metadata saying `default` does not identify the underlying native model.

## Initial audit results

Unless stated otherwise, execution evidence is **Transgentic transport** through the connected MCP tools, using synthetic prompts, explicit providers, new audit threads, plain responses and Temporary Chat explicitly disabled. Media files were saved by the desktop. No uncertain submission was replayed.

| Service | General | Coding | Writing | Image | Video | Music | Temporary Chat |
| --- | --- | --- | --- | --- | --- | --- | --- |
| ChatGPT | Pass after a pre-submission navigation failure | Pass for code/fence content; language tag absent | Pass | Pass; saved PNG opened and visually checked | Excluded from future checks | Excluded from future checks | Pass: strict request and follow-up; local execution metadata verified |
| Claude | Pass | Pass for code/fence content; language tag absent | Pass | Unsupported by this integration | Unsupported by this integration | Unsupported by this integration | Pass: strict request and follow-up; native Incognito also verified |
| Gemini | Fail: response-completion timeout | Blocked: connector deadline and cancellation | Fail: response-completion timeout | Fail: renderer-script execution error | Fail: renderer-script execution error | Fail: renderer-script execution error | Fail in transport; native browser initial reply and follow-up passed |
| Grok | Pass | Pass for code/fence content; language tag absent | Fail: response-completion timeout | Pass; saved JPEG opened and visually checked | Pass for saved/decodable media | Unsupported by this integration | Unsupported by active recipe; native Private control exists but was not tested |
| Custom recipes | Pass | Fail before submission during model verification | Pass | Pass; saved image opened and visually checked | Pass for saved/decodable media | Pass for saved/decodable audio | Unsupported by configured declarations |

ChatGPT's first General request failed while navigating to its new-chat URL with Chromium error `-3`. One fresh attempt was safe because the failure occurred before submission; that attempt and subsequent Coding, Writing, privacy and image checks succeeded. This is a recovered navigation observation, not an established persistent outage.

The three successful built-in Coding checks returned the exact deterministic function inside Markdown fences. They omitted the requested TypeScript language marker. Source inspection shows that `preserveCodeFence` reconstructs bare fences without a language identifier. Code-content preservation passed; full syntax-label preservation did not.

Grok's video was 6.041667 seconds with H.264 video and AAC audio. The request specified 480p and 16:9; the encoded frame size was 752×416, so exact resolution/aspect fidelity remains open. Full decoding completed without errors. Custom recipes also produced a saved video that passed full decoding, and a saved music file with an audio stream that passed full decoding. This establishes valid saved media, not every setting, real-time playback UI, or semantic motion requirement.

## Confirmed findings and reproduction

1. **Built-in discovery includes non-model menu entries.** Evidence layers: source inspection, native browser DOM and an isolated regression fixture. `ModelScraperEngine.scrapeBuiltIn` collects every visible enabled `menuitem`, `menuitemradio` and `option` across the document for non-Gemini providers. Applying its current read-only filter to the open Claude picker returned the model's label concatenated with its description, plus `Effort`, `More models`, and a plan-information link. ChatGPT's picker contains `Select model` and `Power` menu items alongside model choices, so the same filter admits non-model controls there. A separate synthetic regression test failed because discovery returned `Effort Medium` and `More models` as models. Discovery needs provider-specific item/label contracts and menu scoping. The present green fixtures do not close this live-DOM defect.
2. **Gemini normal and strict Temporary Chat requests do not complete through Transgentic.** General and strict Temporary Chat ended after the 60-second response-completion deadline, respectively with `WEBVIEW_SUBMISSION_UNCERTAIN` and `TEMPORARY_CHAT_SUBMISSION_UNCERTAIN`. A distinct Writing request also ended with `WEBVIEW_SUBMISSION_UNCERTAIN` after 60 seconds. The strict request's log retained `verified: false`; no normal-chat fallback was reported. Native browser Temporary Chat returned the exact token twice with the privacy marker present. Native response DOM still contains matching Markdown and action-button elements. This narrows the investigation but does not establish whether the embedded failure is generation, session state, observation or extraction. Do not replay these uncertain requests.
3. **Gemini media execution errors.** Separate image, video and music audit requests returned the generic renderer-script execution error and no artifact. Their submission stage was not established. Capture request-scoped renderer diagnostics before retrying; the public error alone does not identify the failing selector or script.
4. **Custom recipes reject the Coding model selection.** General and Writing succeeded, but Coding stopped with `MODEL_SELECTION_FAILED` before submission. Inspect the effective Coding model choice and current native picker privately. Failing closed is correct; this is not evidence that the provider lacks Coding support.
5. **Grok Writing completion timed out.** A distinct Writing request ended with `WEBVIEW_SUBMISSION_UNCERTAIN` after 60 seconds. General, Coding, image and video had passed. A later status snapshot reported Grok as `rate_limited`; the native quota message was not captured, so this is a runtime-reported availability boundary rather than an independently confirmed provider quota diagnosis. No retry was performed; reproducibility and the cause remain unresolved.

Gemini Coding additionally reached the connector's 300-second tool-call deadline. The local server log then recorded `Request cancelled.` at 300306 ms. No answer was established. This is a blocked transport result, not a successful deliberate-cancellation acceptance test or proof of the provider's completion state. A distinct Writing request was started only after the server recorded the Coding request as ended.

## Native model and privacy observations

- **Gemini:** picker labels were `3.5 Flash-Lite`, `3.8 Flash`, `3.1 Pro`, and `4 Argon`. Switching from 4 Argon to 3.8 Flash was verified in the selected picker item; 4 Argon was restored and verified. Create image/video/music controls were visible without disabled labels. This is native-browser availability evidence, not embedded execution proof.
- **Claude:** the ordinary picker displayed Sonnet 5.5, Haiku 5.5, and plan-gated Fable 5.1/Opus 5.5 choices. Haiku selection was verified and Sonnet restored. Incognito activation, the exact initial reply, follow-up reply, and persistent Exit incognito control were verified in a separate browser audit tab.
- **Grok:** the picker offered Fast and Build, with Auto/Expert/Heavy labelled as requiring SuperGrok. Build was selected and verified, then Fast restored. Imagine exposed native image/video controls. These labels must not be converted into guessed API model IDs.
- **ChatGPT:** the inherited empty composer had an image-mode pill, which was preserved. Its selector exposed GPT-6 and GPT-5.6 Sol entries, power controls, and locked/usage-limit notices. Native model switching was not attempted because availability was not unambiguously established. These observations do not establish both models as usable.
- **Transport privacy:** ChatGPT and Claude each returned the exact synthetic privacy token on the initial strict request and the follow-up. Request logs recorded `policy: require-temporary`, `actualMode: temporary`, and `verified: true`. Claude also completed a subsequent explicit normal request. Native provider privacy does not remove Transgentic's local request logs or saved artifacts.

Official documentation was consulted for [ChatGPT Temporary Chat](https://help.openai.com/en/articles/8914046), [Gemini models](https://support.google.com/gemini/answer/18648722?hl=en), [Gemini temporary chats](https://support.google.com/gemini/answer/13275745?hl=en), [Claude Incognito](https://support.claude.com/en/articles/12260368-use-incognito-chats), and [Grok video capabilities](https://docs.x.ai/developers/model-capabilities/video/overview). Documentation describes product contracts; current account availability and WebView selectors were assessed separately. API media documentation was not used to infer web picker IDs or settings.

## Attachments, validation and remaining coverage

Claude completed one synthetic text-document attachment request and returned the exact file contents. This passes that document path only. Image inputs, multiple files, media-edit inputs, all declared attachment kinds, live rejection/cleanup, and next-request leakage remain **Not tested** for the complete provider matrix. Fixture coverage is not a substitute for these live checks.

Validation ran in an isolated tracked-source copy without personal runtime stores, reusing installed dependencies:

- `npm run check:recipes`: passed.
- Runbook WebView subset: five files, **69 tests passed** (`webviewScraper`, `temporaryChat`, `mediaSettings`, `modelRegistry`, `recipeVersioningAndStorage`).
- Attachment/status/ownership subset: four files, **22 tests passed** (`providerAttachmentInputs`, `attachmentManager`, `hubTemporaryChatStatus`, `conversationScope`).
- Existing suites: **91 fixture tests passed**. An additional regression reproducer created only in the isolated copy **failed one test**, confirming non-model discovery contamination. It was not added to the working tree. `npm run check:publication` and `git diff --check` also passed. No application code or recipe changed, so no rebuild or live CLI suite was run.

Remaining work is explicit:

| Coverage gap | Evidence needed to close it |
| --- | --- |
| Gemini Coding/Writing and media recovery | Diagnose the current completion/script failures, then verify repaired paths and inspect saved artifacts. Existing October results are not carried forward as current passes. |
| Model discovery/selection through the desktop | Correct non-model contamination, verify closed/open picker discovery, exact labels, disabled/ambiguous/absent choices and restored selection in each active Electron partition. Native selection alone does not close this. |
| Temporary Chat lifecycle and UI | End synthetic embedded sessions through the supported UI; verify ended-session rejection, preference changes, routed-provider indicator, refresh/recovery, startup and authentication transitions. Successful replies do not certify the full lifecycle. |
| General lifecycle | Verify ordinary follow-up ownership, deliberate cancellation, duplicate-submission prevention and recovery for every service. Privacy follow-ups cover only their named path. |
| Media settings and attachments | Alternate/default settings, declared edit inputs, all attachment kinds, multiple files, unsupported-file cleanup and next-request isolation. Saved video decode is separate from playback UI and visual motion checks. |
| UI/transport variants | Quick Prompt, automatic routing/fallbacks, Balanced/Agent Guard combinations, direct provider tools, stdio, legacy SSE and the completion gateway were not separately exercised. Only the connected MCP transport was used for execution. |
| Layouts/locales and account states | Compact layouts, additional locales, offline/rate-limit recovery, sign-in/out and account switching need dedicated controlled checks. Existing user accounts/grants were preserved. |

Follow-up owner: integration maintainer/operator. Prioritize discovery contracts and Gemini request-scoped diagnostics, then the private Coding selection failure and Grok timeout investigation. Do not close a finding from fixture success alone; require the corresponding live acceptance check.

At the end of the initial audit, only this dated report had been added. No commit, push, publication, deployment, installation or scheduling was performed. Disposable native-browser tabs were closed; existing user tabs were preserved. Generated test requests/assets and local audit logs remain operator-local. Public-data review excludes runtime stores, account/profile identifiers, custom-provider identifiers, private paths, screenshots and custom-recipe contents from this report.


## Repair and recheck

The user subsequently authorized repairs and a recheck of every WebView service and mode. Repair verification ran approximately 01:00–11:12 Asia/Bangkok on 30 October 2026; one browser upload-helper call stalled for several hours before reporting an extension file-access restriction. Native desktop controls were used to diagnose the upload boundary. These results supersede the initial failures above where explicitly stated. Work remains local to the development checkout; no release, commit, push, publication, or deployment was performed.

### Changes

- Model discovery and selection now share a picker-owned menu contract. Effort controls, submenu entries, unrelated menus, and unavailable choices are excluded. Named selections remain fail-closed; explicit `default` preserves the current native selection for custom recipes.
- Rich-text insertion preserves provider editor state after native insertion. Submission resolves the unique composer-owned control, scrolls it into view, and uses trusted browser input without requiring a focused desktop window. Closing backdrops are allowed up to two seconds to clear; controls that remain covered or out of the viewport fail before a click. A partially dispatched action cannot trigger a second submission or fallback.
- Code extraction preserves language labels and chooses a fence long enough to retain embedded backticks.
- Rate-limit and security notices exclude conversation text, hidden elements, and script/style templates. This prevents dormant quota strings in a provider's hydration data from falsely blocking a ready service.
- Custom recipes were repaired and validated privately.
- Active hidden requests temporarily disable background throttling and restore the previous policy on success, error, and cancellation.
- Media recipes can declare a visible account/entitlement dialog. Grok's native Imagine subscription dialog now returns a prompt unavailable result instead of waiting for the media deadline, while leaving text modes usable.
- Mixed-kind uploads can use separate native inputs with cumulative readiness checks. A shared input retains a single batch when it accepts every file. ChatGPT readiness counts completed remove controls for documents as well as images; Gemini input selectors identify its declared uploader rather than every file input on the page.

Bundled recipe revisions: ChatGPT **1.2.4**, Gemini **1.1.6**, Grok **1.1.5**, Claude unchanged at **1.1.2**. Generated recipes were rebuilt. Previous installed built-in overrides were archived locally; only the relevant picker/upload/entitlement fields and version metadata were updated. Custom recipes remain private and are reported only in aggregate. Detailed custom-recipe changes and version history remain operator-local.

### Recheck evidence

Evidence is Transgentic transport against the repaired development desktop unless a row explicitly states native browser or fixture evidence. Verification took place on 30 October 2026 in Asia/Bangkok, in multiple repair rounds. Earlier passing requests are distinguished from the last build; this report does not certify every optional setting or lifecycle variant in the runbook.

| Service | General | Coding | Writing | Image | Video | Music | Temporary Chat |
| --- | --- | --- | --- | --- | --- | --- | --- |
| ChatGPT | Pass | Pass, including TypeScript language fence | Pass | Pass, saved PNG visually verified | Excluded from future checks | Excluded from future checks | Pass: strict initial reply and follow-up, stable caller session |
| Claude | Pass | Pass, including TypeScript language fence | Pass | Unsupported by integration | Unsupported by integration | Unsupported by integration | Pass: strict initial reply and follow-up, stable caller session |
| Gemini | Pass | Pass, including TypeScript language fence | Pass | Pass after downloader repair: saved and visually verified 1024×1024 JPEG | Pass: saved and decoded MP4 | Pass: saved MP4 with decoded audio track | Pass: strict initial reply and follow-up, stable caller session |
| Grok | Pass | Pass, including TypeScript language fence | Pass | Pass: saved JPEG visually verified | Blocked: native subscription dialog; repaired adapter detects it | Unsupported by integration | Unsupported by active recipe |
| Custom recipes | Pass | Pass | Pass | Pass | Pass | Pass | Unsupported by active recipes |

Gemini's saved video contains H.264 video at 1280×720 and AAC audio, duration 10.005 seconds. Its saved music output is an MP4 containing H.264 and AAC, duration 62.233 seconds. Both files passed full decoding. Custom-recipe media validation and detailed evidence are retained privately; the aggregate media checks passed. These checks establish artifact/container validity; they do not certify every requested duration or visual setting.

Gemini image generation produced a provider-authored refusal in both the embedded request and a separate native-browser request. This is an account/provider availability boundary, not the former generic renderer-script failure. Grok video reached its native entitlement dialog; the repaired request reported that boundary in approximately 32 seconds instead of a seven-minute timeout. No subscription or account entitlement was changed. The aggregate custom-recipe media recheck passed; its detailed repair evidence remains private. The earlier video fidelity discrepancy remains unverified while native generation is blocked.

Attachment rechecks: Claude passed one image plus two documents in a single request. ChatGPT passed the same mixed three-file request after its readiness-selector repair. Grok also passed the same mixed three-file request. Gemini reached a native account consent dialog titled “Creating content from images and files”; documents did not become ready and the adapter stopped before submission. That upload path was initially Blocked pending the account owner’s review. The user subsequently reviewed and enabled uploads. The post-consent recheck exposed a second defect: native document removal labels now contain the filename, while the recipe matched only “close attachment.” Readiness and cleanup selectors were repaired in Gemini 1.1.6. The mixed image-plus-two-document request then passed, identifying the image color and both document tokens. The consent dialog was not accepted by the agent. The custom-recipe attachment recheck passed; its input declarations and detailed evidence remain private. Each result covers that combination only; undeclared formats and every media edit input are not certified.

### Verification and remaining limits

The final isolated complete suite passed **707 tests**, with **12 skipped** across 78 test files. The full application build, generated-recipe check, publication snapshot check, and whitespace/diff check passed. Tests use isolated runtime data; loopback-dependent mock-server tests require local socket access. Fixture success does not establish live provider availability.

Remaining live limitations include account-gated media, optional settings/edit inputs, compact/localized layouts, deliberate cancellation/recovery and the complete Temporary Chat UI lifecycle. All primary services and modes have an explicit result above; no untested variant is converted into a pass.


Final acceptance: General, Coding and Writing passed across every configured WebView service. Strict Temporary Chat initial and follow-up checks passed for ChatGPT, Claude and Gemini with a stable MCP caller session. Image, video and music results are recorded mode by mode above, including verified saved artifacts and explicit external blockers. The final aggregate custom-recipe text and attachment checks passed. Disposable native audit windows and browser tabs were closed; the final local development desktop remains running. Synthetic requests, artifacts and private evidence remain operator-local.


### Post-consent Gemini follow-up

On 30 October 2026 at approximately 13:23–13:25 Asia/Bangkok, the user confirmed enabling the native image/file consent. Gemini 1.1.6 now recognizes both image and document attachment chips, including their filename-specific removal labels. The three-file transport recheck passed on the rebuilt and restarted development desktop. The installed override was archived and only readiness, cleanup, and version fields were updated. Targeted attachment/media suites passed **41 tests** in the isolated copy; the full build, generated-recipe, publication, and diff checks passed.

A distinct post-consent image-generation retry returned `MEDIA_NOT_GENERATED` after approximately 34 seconds with no saved artifact. Uploads are now verified as passing; image generation remains unresolved. The earlier native refusal is retained as separate evidence and is not assumed to be explained by upload consent.


### Gemini image generation: native reply and downloader repair

A further investigation on 30 October 2026 (approximately 13:30–13:46 Asia/Bangkok) inspected the failed conversation's actual native reply. It said, “I don't seem to have access to that content.” A fresh request with image mode visibly selected on 3.8 Flash returned the same refusal in both the desktop provider window and normal Chrome under the same account. Earlier Argon requests also returned it. This response does not disclose the exact account/backend cause; an account-entitlement or selector explanation was not established. The original Argon selection was restored.

A later, distinct image request did produce media, exposing another concrete failure: Transgentic's Node HTTP downloader rejected the response with `Parse Error: Header overflow`. The downloader now accepts response headers up to a bounded **64 KiB**, instead of Node's default 16 KiB. An isolated local-server regression verifies acceptance of 32 KiB headers and rejection of 80 KiB headers. This change preserves a finite limit.

The media failure diagnostic also now includes a JSON-quoted excerpt of the actual provider reply, capped at 1,000 characters, when a provider returns text without a usable media artifact. Empty replies retain the generic error. Submitted requests are still not retried on another provider, and no media success is reported without a valid saved artifact.

After rebuilding and restarting the development desktop, a new Gemini image request **passed**: a **1024×1024 JPEG** was saved, opened, and visually verified to contain the requested green triangle centered on white. Gemini Image is therefore now Pass for this verified path. Earlier native refusals remain separate historical observations; the header-limit repair is not claimed to explain those refusals.

Validation: **81 targeted tests passed** across response orchestration, HTTP media jobs, and remote downloads. The full application build, generated-recipe check, publication snapshot check, and diff check passed. No account change, commit, push, or release was performed.

Google's [image-generation guide](https://support.google.com/gemini/answer/14286560?hl=en) documents model-dependent image backends. Its [troubleshooting guide](https://support.google.com/gemini/answer/18647528?hl=en) recommends a new chat for failed media actions; fresh chats were exercised here. The guides do not establish which cause produced this account's earlier generic refusal.


## Final full-suite and WebView recheck

This final pass was requested after the Gemini downloader repair. The full suite ran at **13:51 Asia/Bangkok on 30 October 2026**; fresh live service/mode checks ran approximately **13:53–14:09**, including the targeted Claude recovery described below. These results supersede earlier rounds where outcomes differ.

Runtime: development desktop **2.2.1** from this checkout on macOS **27.0.1**. The MCP listener's executable and checkout were verified. The source baseline remains `a5ce4b9c810e03187e278c1ee4dc7485c44795f6`, with the existing uncommitted repairs included. Built-in effective recipe versions matched the working-tree recipes: ChatGPT **1.2.4**, Claude **1.1.2**, Gemini **1.1.6**, and Grok **1.1.5**. ChatGPT, Gemini and Grok use the inspected installed overrides; Claude uses its bundled recipe. All configured custom WebView services were included privately. CLI, API-provider and local-model live execution remain outside this WebView-only pass.

### Full test suite

`npm test -- --maxWorkers=1` ran in the isolated source copy with local socket access for mock HTTP servers. Result: **710 passed, 12 skipped**; **76 test files passed and 3 were skipped**, 79 files total. Runtime was **22.18 seconds**. The skipped files are the opt-in live CLI adapter, CLI sandbox, and local-guidance suites; they were not enabled for this WebView-only task. No tests failed. Source, recipes, tests and relevant build/test configuration were refreshed into the isolated copy; personal runtime stores were not copied.

### Latest mode matrix

Evidence layer: **Transgentic transport to the current desktop**, with explicit providers, synthetic new conversations, current native model selection, and plain responses. General includes an exact initial reply plus a stable-session follow-up. Coding includes the TypeScript fence and function content. Attachment batches were checked for actual image/file contents. Temporary Chat includes strict initial and follow-up requests with stable MCP caller sessions.

| Service | General | Coding | Writing | Image | Video | Music | Attachments | Temporary Chat |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| ChatGPT | Pass | Pass | Pass | Pass | Excluded from future checks | Excluded from future checks | Pass | Pass |
| Claude | Pass | Pass | Pass after recovery | Unsupported by integration | Unsupported by integration | Unsupported by integration | Pass after recovery | Pass |
| Gemini | Pass | Pass | Pass | Blocked: native access refusal | Pass | Pass | Pass | Pass |
| Grok | Pass | Pass | Pass | Blocked: native entitlement dialog | Blocked: native entitlement dialog | Unsupported by integration | Pass | Unsupported by active recipe |
| Custom recipes | Pass | Pass | Pass | Pass | Pass | Pass | Pass | Unsupported by active recipes |

Every core service/mode pair was attempted through the transport, including the integration-unavailable media combinations. The 30 General/Coding/Writing/Image/Video/Music cells comprise **21 Pass, 3 Blocked, 4 Unsupported, and 2 Excluded** results after the documented recovery. Unsupported means the active integration does not implement that mode, not that the provider's wider product lacks it.

### Artifacts, blockers and recovery

- **Saved media:** six new artifacts passed metadata inspection and complete decoding. The generated image outputs and sampled video frames were opened and visually checked. Both successful music outputs contain an actual decodable audio stream. Custom-recipe artifact details and all identifying evidence remain private; only aggregate results are reported here.
- **Gemini Image:** this fresh request returned `MEDIA_NOT_GENERATED` with the actual native reply saying it did not have access to the requested content. This supersedes the immediately preceding successful image smoke test as the latest outcome. The earlier successful saved image proves the downloader repair worked for that request; it does not establish reliable current native generation. No new header-overflow failure occurred in this round. The exact reason for Google's access refusal remains undisclosed. Further closure requires a successful native generation and a corresponding new saved-artifact transport check; no account restriction or quota cause is assumed.
- **Grok Image and Video:** both fresh requests reached the recipe-declared native account/subscription boundary and returned `MEDIA_UNAVAILABLE`. The earlier Image pass is not carried forward. No plan, subscription, or account entitlement was changed. Retest after native media access is available; exact video-setting fidelity remains unverified while generation is blocked.
- **ChatGPT Video and Music:** the previous attempts stopped before generation. At the user’s direction, these modes are excluded from future ChatGPT health checks.
- **Claude recovery:** initial Writing and attachment attempts could not open a new chat because of `ERR_QUIC_PROTOCOL_ERROR (-356)`. These were pre-submission navigation failures. A fresh authenticated native provider window loaded successfully, after which one targeted Writing request and one mixed-attachment request both passed. The original failures remain in private evidence. No submitted request was replayed, and no network-security setting, protocol policy, or account was changed.

### Scope and cleanup

This pass covers every configured service and the named modes above. It does not certify every optional media setting, media-edit input combination, responsive layout/locale, cancellation scenario, automatic routing/fallback combination, transport variant, or the complete Temporary Chat preference/UI lifecycle. Tests cover additional contracts, but fixture results are not substituted for live evidence. Model-picker switching and alternate named-model execution were not repeated during this pass; current-model defaults were used.

The three audit Temporary Chat sessions were ended through the supported desktop API, and the disposable Claude recovery window and diagnostic tools were closed. Existing user sessions were preserved. The development desktop remains running. Synthetic provider conversations, artifacts, and detailed evidence remain operator-local.

Public reporting uses only **custom recipes** in aggregate. Custom names, domains, service/model IDs, versions, account identifiers, paths, prompts, screenshots, recipe contents, and detailed artifact metadata are excluded. The report and untracked additions were reviewed alongside the publication snapshot check. No commit, push, publication, deployment, or account change was performed.


## Gemini intermittent image-generation investigation

The earlier Image result was a **request-level native refusal**, not proof that image generation was permanently unavailable. The saved-image success and later native refusal are both valid observations. This section supersedes the final matrix's Gemini Image status with **Intermittent: latest controlled checks pass; refusal cause unresolved**.

Five controlled image requests in this investigation produced five new saved 1024×1024 images. Each file fully decoded and had a different SHA-256 hash. Cases covered the earlier successful green-triangle prompt; the exact previously failing blue-triangle prompt with explicit Argon selection; the same blue prompt with the current-model default; the same request after a strict Temporary Chat attempt; and the same request with the diagnostic provider window closed. The native provider window also visibly displayed the generated blue triangle. No application repair or account change was made between these controls, and the previously repaired downloader did not fail.

These controls did **not** reproduce the native access refusal. They do not support blaming the blue prompt, explicit versus default model selection, a permanent Argon entitlement restriction, the Temporary Chat transition, or background-window execution. They also do not establish that intermittent failure is fixed. Google's refusal text does not disclose its backend cause. An idle cookie-sync reload was considered as a possible application race, but no correlation with the refusal was established; a speculative race fix is not presented as a diagnosis.

A separate strict Temporary Chat control returned a completion timeout after submission, although opening its native conversation showed the exact requested text. It was not replayed. The subsequent normal image request succeeded. This is a distinct unresolved completion-observation issue, so the earlier Temporary Chat pass should not be read as a reliability guarantee.

No new application code was changed during this investigation. The prior **710 passed, 12 skipped** full-suite result remains the last full-suite run; it does not prove native-provider reliability. The diagnostic windows were closed, and the disposable Temporary Chat session was absent from the active session list after closing its window. Existing user conversations and the native Argon selection were preserved. Detailed evidence remains private; custom-service information is unchanged and remains excluded.


## Follow-up: media scope and Grok

At the user’s direction, future ChatGPT health checks exclude video and music. The preceding matrix retains the historical outcome for other modes and marks these two cells excluded. Gemini Temporary Chat was not revisited in this follow-up.

Fresh Grok image and video requests each returned the native media-unavailable account/subscription boundary, with no saved artifact. Both responses also indicated submission uncertainty, so neither request was replayed. No account or subscription change was made. Successful generation and video-setting fidelity remain unverified until native access is available.
