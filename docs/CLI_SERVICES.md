# CLI services

Transgentic includes four built-in service definitions: `cli_codex`, `cli_claude_code`, `cli_antigravity`, and `cli_grok`. They sit beside Webview and API providers under **Settings → Providers → CLI** and use installed native executables and native sign-in. Transgentic does not install these executables automatically. CLI models may send supplied context and, only in Agentic Mode, permitted host project content to their provider.

## Setup

1. Open **Settings → Providers → CLI**. Install and sign in to the native CLI using its official guide.
2. Choose the executable if automatic discovery does not find it. **Check installation** verifies required options; **Test connection** sends a small real prompt. Detection alone does not establish authentication.
3. Enable the service and select it in the existing General, Coding, and Writing routes. Quick Prompt, MCP, and OpenAI-compatible route models follow those routes without a separate Hub selector. Webview, API, CLI, and local LLM services share the routing model. CLI services do not support image, video, or audio generation routes.
4. Optionally choose a native model in the service settings. An empty override uses the CLI's default. Provider web-model catalogs are not reused as verified CLI models.

Enabled CLI services automatically run the same small, answer-only connection test when Transgentic starts. Enabling a CLI later also starts this check. A successful check changes its Hub status to **Connected**. It uses a temporary scratch directory with project editing and commands disabled, although the native CLI may still contact its configured model provider and consume a small request.

## Work modes and project permissions

**Provider Mode** is the default for new and migrated CLI configurations. It starts a fresh native conversation for every completion, accepts only the caller's messages, ignores stale route workspace bindings, and forces host project editing and commands off. Use it for `Cline → Transgentic → CLI`, where Cline executes tools on its own machine.

**Agentic Mode** is for MCP workflows that intentionally allow the CLI to work in a registered project on the Transgentic host. Workspaces use one shared registry opened from any CLI panel, while grants remain separate per CLI. Switching a CLI to Provider Mode cancels incompatible active work and makes all workspace grants inactive.

In Agentic Mode, both **Allow project editing** and **Allow commands** default to off. To permit an action, enable its service switch and its grant for a registered workspace. Under Routes, each Agentic CLI in the selected mode and pipeline has an optional **Host workspace** setting. The host is the machine running Transgentic, not the MCP client machine. Without a workspace, both permissions remain off.

| Editing | Commands | Behavior |
| --- | --- | --- |
| Off | Off | Project context can be read if a workspace is selected; no project writes or external commands. |
| On | Off | File-editing tools may write inside the selected project; shells remain blocked. |
| Off | On | Commands may execute, but project writes remain blocked, including shell redirection. |
| On | On | Commands and project writes are allowed within the enforced filesystem boundary. |

Native runtime bookkeeping and per-request temporary files remain writable as needed. Installed CLI binaries, native plugins, and settings are protected. Native state and credentials stay under the CLI's control; this is not isolation between separate operating-system users. Certain native configuration filenames are also protected inside projects in this first implementation.

Workspaces must be selected locally. MCP callers use a registered ID and need that workspace's separate **Allow authenticated MCP clients** grant. A request can reduce permissions, but cannot override a local denial. Permissions apply to all authenticated callers granted that workspace, rather than individual client identities. Changing configuration or removing a workspace cancels active CLI work. Cancellation does not roll back actions already performed.

The Co pipeline runs with editing and commands disabled. Work on the same registered workspace is serialized. A failed request that might have performed project actions is not automatically replayed on a fallback provider.

## Provider, MCP, and terminal usage

For a client that owns project actions, configure its OpenAI-compatible provider with base URL `http://127.0.0.1:58420/v1`, the Transgentic access token as its API key, and a route model such as `transgentic/coding`. Only Provider Mode CLIs advertise direct models. Transgentic sends the supplied history once, creates no resumable native session, and returns tool calls to the client without executing them on the host. See [Completion gateway](COMPLETION_GATEWAY.md).

For Agentic Mode through MCP, use `prompt_model` with a CLI provider ID, or `ask_codex_cli`, `ask_claude_code_cli`, `ask_antigravity_cli`, and `ask_grok_cli`. Existing web aliases retain their original meaning.

Example tool arguments:

```json
{
  "prompt": "Review the project and suggest improvements",
  "provider": "cli_codex",
  "mode": "coding",
  "workspace_id": "ID copied from Settings",
  "allow_project_editing": false,
  "allow_commands": false
}
```

The terminal wrapper accepts `--workspace <registered-id>`, `--disallow-editing`, and `--disallow-commands` with its existing prompt/provider options. Omitting the restriction flags never overrides local grants.

The shared pipeline retains scoped conversations, bounded rollover context, request logging, cancellation, configured routing, fallback handling, Recall guidance, and the existing coding preprocessing. CLI Recall uses only supplied/scoped context. It does not promise access to web-chat memory. Native session IDs are held in memory, expire after 24 hours, and are invalidated on relevant settings changes; restarting Transgentic starts a fresh native conversation. This implementation does not discover a full authenticated CLI model catalog or expose native sessions as browser tabs.

## Compatibility and verification

Execution currently requires **macOS with `/usr/bin/sandbox-exec`**. Windows/Linux are deliberately unavailable until equivalent permission boundaries are implemented and tested. Native binaries are recommended; interpreted launcher scripts can be blocked when commands are off. There is no unsandboxed fallback.

| Adapter | Transport | Live verification in this checkout |
| --- | --- | --- |
| Codex | `exec --json`, explicit session resume | Native 0.142.5 on macOS arm64: answer, two-turn continuation, project editing with commands off, and an actual command with editing off. |
| Claude Code | Print mode, stream JSON, safe mode and explicit tool permissions | Protocol fixtures tested; native installation/login unavailable in this environment. |
| Antigravity | `agy -p`, stream JSON, explicit conversation | Native 1.2.0 authenticated answer verified with the fixed Keychain helper allowance while shell commands remain blocked. |
| Grok | ACP stdio, explicit session and permission callbacks | Protocol fixtures tested; native installation/login unavailable in this environment. |

Codex's inner macOS sandbox cannot initialize inside the mandatory Transgentic sandbox. The adapter therefore uses `--sandbox danger-full-access` **inside the already confined child process** and disables shell tools when commands are off. Transgentic's outer sandbox remains the actual permission authority and cannot be disabled through request arguments. Inherited native plugins/rules/configuration are blocked. Do not launch the adapter arguments outside the runtime manager.

Live OS tests cover all four permission combinations, indirect shell writes, unrelated-file reads/writes, and executable protection. Unit/integration tests cover UTF-8 framing, malformed/oversized events, final versus partial answers, nonzero exits after completion, cancellation, Grok callbacks, explicit CLI routing, model/workspace forwarding, media rejection, and no replay after possible mutations. The desktop settings were checked in an isolated Electron instance at its compact window size.

Full four-vendor release qualification, packaged builds, Windows/Linux execution, comprehensive native model discovery, and a detailed per-action activity panel remain outstanding. The built-in entries and adapter code should not be interpreted as evidence that every installed CLI/version/authentication combination works.

## Development checks

Run tests against an isolated checkout/copy: existing regression tests write runtime registries. `npm run build` checks renderer and Electron builds. Opt-in live tests:

```sh
TRANSGENTIC_CLI_SANDBOX_TEST=1 npx vitest run tests/cliSandbox.live.test.ts
TRANSGENTIC_CLI_LIVE=cli_codex npx vitest run tests/cliAdapters.live.test.ts
```

Live adapter tests send small model requests and create only disposable project fixtures. Substitute another built-in ID only after installing and signing into that native CLI.

## Client and host separation

An MCP or completion client such as Cline submits a task; Transgentic chooses and executes the configured service on its host. CLI providers are service backends, not a separate IDE workflow. Authentication and native installation belong to the host. Loopback remains the default. **Settings → General → Gateway Port & Network** can explicitly enable authenticated LAN sharing, choose the advertised interface, and copy both MCP and `/v1` URLs. Administrative endpoints remain loopback-only.
