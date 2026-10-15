# Weekly provider health check

[Documentation index](../README.md#documentation-index)

Use this runbook weekly, after a provider UI/model change, and before a release that changes provider integration. It is a repeatable investigation and verification plan; it does not create a scheduled job or authorize publication, installation, account changes, or deployment.

## Outcome and evidence

Produce a dated report with a result for every configured service and applicable mode. Record the source commit, running application version, recipe versions and provenance, CLI versions, operating system, and verification time zone. Confirm which checkout or installed build serves the running application. A source fix, generated recipe, running adapter, and released installer are separate states.

Use these result categories:

| Result | Required meaning |
| --- | --- |
| Pass | The named behavior was observed at the stated layer. |
| Fail | An attempted supported operation produced reproducible incorrect behavior. |
| Blocked | Authentication, quota, account entitlement, network, browser control, or another dependency prevented verification. |
| Unsupported | Positive evidence shows that the provider or integration does not implement the capability. |
| Not tested | No sufficient execution evidence was collected. |

State the evidence layer for each result: source inspection, fixture test, native provider browser, native CLI, Transgentic desktop, or Transgentic transport. Browser success does not prove Electron/session integration success. Passing tests with mocked providers does not prove current provider compatibility. Never convert unknown, signed-out, quota-limited, or stale state into Unsupported.

## 1. Establish scope and protect local state

1. Read repository instructions and [development guidance](DEVELOPMENT.md). Inspect the working tree and preserve unrelated changes.
2. Inventory built-in web providers, installed CLIs, local/API services, and configured custom recipes from the active runtime. Record disabled or missing services explicitly.
3. Resolve browser/account mappings locally. Check the intended account before testing; Chrome and Electron partitions may have different authentication and entitlements.
4. Compare bundled recipes, generated recipes, installed overrides, active adapters, service manifests, and model registries. An older local override can shadow a bundled repair. Preserve customizations and archive the previous version when an update is authorized.
5. Use synthetic prompts, disposable workspaces, and generated attachment fixtures. Run integration tests in an isolated copy without personal runtime stores. Keep native sandbox boundaries and existing grants intact.
6. Prefer an existing safe new-chat page or an isolated audit tab. Do not overwrite drafts or repeatedly replay a request whose submission or side effects are uncertain.

## 2. Model discovery and selection

For ChatGPT, Claude, Gemini, Grok, and each configured integration:

- Inspect the current account's model picker and official provider documentation. Record exact labels/IDs, reasoning controls, selected state, disabled choices, and plan/quota restrictions. Do not infer web model IDs from API or CLI naming.
- Compare the live list with the manifest, registry, route settings, and MCP tool schemas. Identify retired defaults, missing models, invented availability, and stale cached discovery.
- Test discovery with the picker closed and already open. Exclude unrelated menus and restore any transient UI opened by inspection.
- Select a different available model, verify the resulting active selection, then restore the original selection. A click or opened picker alone is not success.
- Test an absent model, disabled model, ambiguous label, and unavailable picker using fixtures where live tests would waste quota. Explicit selection must fail before submission when the requested model cannot be verified.
- Verify that `default` intentionally uses the provider's current selection. Preserve user-enabled choices and defaults when refreshing the catalog.
- Check wide and compact layouts and supported locales where locators depend on text, structure, order, or icons.

## 3. Web-service mode matrix

Apply this matrix to every configured web service. Mark unsupported modes with evidence; do not claim support merely because a recipe contains an output selector.

| Mode/path | Minimum verification |
| --- | --- |
| General | New chat, exact synthetic reply, response completion, follow-up context, cancellation, no duplicate submission. |
| Coding | Small deterministic function or transformation; preserve code fences/content and verify the configured route/model. If a custom renderer wraps code with a language toolbar, use its recipe's `response.codeBlockSelector` to identify the whole wrapper. |
| Writing | Short prose task; verify its General-route mapping and writing guidance without losing literal output. |
| Image | Native tool activation, default and explicit supported settings, image input where declared, generated artifact saved and previewable. |
| Video | Native tool activation, supported duration/aspect/quality settings, declared inputs, playable saved output. |
| Music | Native tool activation, supported duration/style/settings, declared inputs, saved output with an actual audio track; inspect MP4 containers when used. |
| Attachments | Each declared input kind, multiple files, readiness before submission, rejection/cleanup for unsupported files, no leaked attachment into the next request. |
| Temporary chat | Native activation and verification before submission and after every reply; use the procedure below. |

Check empty/loading/error/rate-limit states and recovery. Inspect disabled native media tools before spending generation quota. Verify that prompt entry preserves a selected media mode, especially when the provider puts a non-editable mode pill inside the composer. Treat a matching unsent draft differently from an unrelated draft, and never submit the latter. Record untestable settings individually. A text response to a media request is not a successful generated artifact.

## 4. Temporary Chat, Incognito, and personalized overrides

Run for ChatGPT, Gemini, Claude, and any custom recipe that explicitly declares native support. Names and descriptions may differ between providers.

1. Inspect the effective recipe's `temporaryChat` declaration and its provenance. Compare a personalized/healed built-in override with the bundled version without replacing it automatically.
2. Observe the ordinary new-chat state and the native entry control. Check that `inactiveWhen` matches a visible element.
3. Activate native temporary/incognito mode using the recipe's steps. Verify a visible `activeWhen` marker before typing or submitting.
4. Send `Health check. Reply with exactly: temporary-ok`. Verify the answer, native privacy indicator, response extraction, and completion detection.
5. Send a synthetic follow-up and verify the marker again. If the entry toggle disappears, validate the recipe's continuation contract; a URL alone must never establish temporary mode or authorize a different conversation.
6. Repeat through Transgentic with explicit `temporary_chat: true`. Verify actual mode and verification metadata, conversation ownership, and no silent fallback to normal chat. Test preferred temporary and explicit normal requests separately.
7. Inspect the hub indicator, toggle, route changes, startup/loading, sign-out/sign-in, account switching, refresh, and recovery after an earlier failure. The status must describe the routed provider, not whichever drawer happens to be open.
8. Distinguish declared support from current availability. Unknown/loading and login-required states need accurate labels. An unavailable account must not be described as an unsupported provider. A stored preference must not become impossible to turn off just because availability changed.
9. Close the synthetic session or restore its original empty state. Confirm that subsequent ordinary requests do not accidentally reuse temporary state, and that ended temporary sessions cannot be resumed as if still verified.

Provider-native Temporary Chat is not a claim that Transgentic stores no local logs or generated files. Report the existing local retention behavior accurately.

Use this acceptance matrix when checking the indicator and preference switch. Final wording should follow the product's UI conventions, but these states must remain distinct:

| Observation | Expected UI meaning |
| --- | --- |
| No routed provider | Select a service; do not attribute missing support to a provider. |
| Status has not loaded | Checking availability; do not show Unsupported. |
| Recipe explicitly lacks native support | Unsupported for the selected provider. |
| Support declared, authentication required | Sign-in/connection needed, with a recovery action. |
| Support declared, account unavailable | Unavailable with the observed reason; preserve the preference. |
| Support declared, availability unknown | Verification pending; verify at execution time before submission. |
| Support available | Show the stored preference as enabled or disabled. |
| Availability changes while preference is enabled | Allow turning the preference off; do not trap an enabled setting behind a disabled switch. |

## 5. Native CLI modes

Read [CLI service contracts](CLI_SERVICES.md). Check all configured CLI providers, including Codex and Antigravity. Use the installed executable's help/version and current official documentation before changing flags.

- Probe installation, authentication, protocol compatibility, model listing, model overrides, and default-model behavior. A model-list command succeeding is not proof that generation or editing works.
- Verify Provider mode for General, Coding, and Writing, including new conversations, explicit resume, cancellation, timeout, and error classification.
- Verify Agentic mode in disposable projects for all four editing/command permission combinations. Check actual files and command events, not just the final answer. Read-only mode must preserve the project; granted actions must stay within the existing sandbox/workspace boundary.
- Verify attachment behavior and advertised kinds. CLI text modes must not be advertised as native image/video/music generation without an implemented artifact contract.
- Capture sanitized, request-scoped event evidence for protocol changes. On an empty final answer, distinguish parsing failure, permission denial, quota, interrupted generation, and completed side effects before proposing a fix.
- Never retry or fall back automatically after a request may have edited files or run commands. Preserve diagnostic evidence before disposable cleanup when investigating a failure.
- Treat model/effort availability as account-specific. Keep binary updates separate from recipe or adapter changes; verify again after an authorized update.

## 6. Routing and transport coverage

Exercise Quick Prompt/desktop, direct MCP tools, MCP over HTTP/SSE and stdio where configured, and the `/v1` completion gateway. Check that General/Coding/Writing and supported media routes use the intended service/model and report the actual outcome.

Cover explicit provider/model requests, automatic routing, fallbacks, Balanced Mode, Agent Guard/Double Agent where configured, conversation continuity, cancellation, temporary-chat policy, and attachments. Ensure failed or partial media/agentic actions are not replayed through fallback. Keep service capability, model capability, account availability, and user preference consistent across UI and transports.

## 7. Custom recipe coverage and public reporting

Discover configured custom recipes locally and apply the same checks according to their declared capabilities. Add new custom recipes to the local inventory automatically on the next run; the public plan must not require a provider-specific addition.

Public reports must refer only to **custom recipes** in aggregate. Do not include custom-provider names, titles, domains, service IDs, account/profile identifiers, private paths, prompts, screenshots, recipe contents, or history. Keep detailed evidence in operator-controlled private storage outside the repository. Use generic synthetic fixtures for any regression tests contributed to the project.

Check both the diff and untracked additions before publication. Do not copy runtime stores or browser evidence into a public report. The publication script is a useful check, not a complete privacy review.

## 8. Validation and repair handoff

Run relevant checks from an isolated source copy. Select tests according to the findings; do not repeatedly run the entire suite without a reason.

```bash
npm run check:recipes
npx vitest run tests/webviewScraper.test.ts tests/temporaryChat.test.ts tests/mediaSettings.test.ts tests/modelRegistry.test.ts tests/recipeVersioningAndStorage.test.ts --no-file-parallelism
npx vitest run tests/cliRuntime.test.ts tests/cliProcess.test.ts tests/cliOrchestration.test.ts --no-file-parallelism
```

When live CLI checks are within the authorized scope, inspect the test file first, then run one provider at a time. The tests contact real providers and use disposable workspaces:

```bash
TRANSGENTIC_CLI_LIVE=cli_codex npx vitest run tests/cliAdapters.live.test.ts
TRANSGENTIC_CLI_LIVE=cli_antigravity npx vitest run tests/cliAdapters.live.test.ts
TRANSGENTIC_CLI_SANDBOX_TEST=1 npx vitest run tests/cliSandbox.live.test.ts
```

The current live suite covers provider answer/resume plus edit-only, command-only, and combined grants for Codex and Antigravity. A green run still does not establish every route, attachment, or temporary-chat path. The sandbox suite is macOS-specific.

For an authorized repair, keep activation/verification controls in recipe JSON, preserve installed override history, regenerate with `npm run generate:recipes`, and add tests for the observed failure. Review changes to shared discovery/status/routing across every affected provider. Run `npm run build` for code or recipe changes and verify the resulting runtime, then:

```bash
npm run check:publication
git diff --check
```

Do not mark the health check complete with an unexplained coverage gap. Record blockers and the exact evidence needed to close them. Committing, publishing, deploying, or scheduling future runs requires the corresponding user instruction.

## Report template

```text
Date/time zone:
Source commit / running build:
Recipe provenance and versions (built-ins only in public report):
CLI versions:

Service | Capability/mode | Result | Evidence layer | Observation | Next action

Confirmed regressions and reproduction:
Account/environment blockers:
Untested paths:
Changes made and runtime verification:
Checks executed and exact results:
Public-data review:
Follow-up owner and closure criteria:
```

Keep dated findings separate from this reusable procedure. The initial audit is recorded in [the October 2026 report](reports/provider-health-2026-10-15.md); its account availability and provider UI observations expire as providers change.
