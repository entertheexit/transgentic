# Transgentic MCP tools and application integration

Reference for Transgentic tool arguments, task modes, multi-turn requests, result handling, and optional command-line use. These examples describe the local gateway, not a provider's public API.

[Documentation index](../README.md#documentation-index) · [Connection setup](CONNECTING.md)

## Contents

- [Tools](#tools)
- [Prompt arguments](#prompt-arguments)
- [Multi-turn example](#multi-turn-example)
- [Handling results](#handling-results)
- [Command-line requests](#command-line-requests)

## Tools

The connected server's `tools/list` response is the reference for the tools and schemas exposed by that running build.

| Tool | Role |
| :--- | :--- |
| `prompt_model` | Send a prompt through configured routing |
| `ask_chatgpt`, `ask_claude`, `ask_gemini`, `ask_grok` | Request a specific built-in provider |
| `generate_image` | Request image mode |
| `generate_video` | Request video mode |
| `generate_audio`, `generate_music` | Request audio mode |
| `get_status` | Inspect server health, provider state, limits, and model registry |

Media tools request generation and attempt to save detected assets. They do not guarantee that a provider can generate the requested media or that extraction will succeed.

Use an explicit mode for media requests. Supported task modes are `general`, `coding`, `writing`, `image`, `video`, and `audio`. Availability is determined by the configured model catalog, active account, and adapter; this guide intentionally does not list provider model IDs as permanent capabilities.

## Prompt arguments

| Argument | Purpose |
| :--- | :--- |
| `prompt` | Required prompt text |
| `mode` | Task mode; otherwise the gateway uses its default and intent classification |
| `provider` | Optional built-in provider override; check the tool's enum |
| `model` | Requested model ID, subject to the registry, override settings, and switching support |
| `thread_id` | Conversation identifier within the caller's scope |
| `new_thread` | Start a fresh conversation |
| `project_name` | Project grouping used when a thread identifier is absent |
| `response_profile` | `agentic` or `plain`; overrides the connection's response style |

Camel-case aliases `threadId`, `newThread`, and `projectName` are accepted. Use one spelling consistently.

Local LLM and custom-provider selection are configured through routing; do not assume the public `provider` enum accepts every internal provider ID.

## Multi-turn example

The following are `tools/call` parameter objects, not complete HTTP requests. Use your MCP client's tool-call method after initializing the connection.

First turn:

```json
{
  "name": "prompt_model",
  "arguments": {
    "prompt": "Write a JavaScript function square(n) that returns n * n.",
    "mode": "coding",
    "thread_id": "square-example",
    "new_thread": true,
    "response_profile": "plain"
  }
}
```

Follow-up on the same connection:

```json
{
  "name": "prompt_model",
  "arguments": {
    "prompt": "Add two standalone unit tests for that function.",
    "mode": "coding",
    "thread_id": "square-example",
    "response_profile": "plain"
  }
}
```

Repeat the mode as well as the thread identifier. Different modes and response profiles have separate conversation scopes. Another connection using the same thread identifier does not inherit this conversation.

To start again, send `new_thread: true`. Continuity is bounded by the local session lifetime, rollover rules, and the context the provider retains; it is not permanent archival storage.

## Handling results

1. Check `isError` and, when present, `structuredContent.status`.
2. Read the first text content block as the answer or error/handoff text.
3. Treat trailing agentic guidance as workflow advice, not evidence that a model answered.
4. Check provider details and artifact paths before consuming a result. A partial result may contain usable output from only one pipeline.
5. Review generated code before running it. Do not interpret `completed` as correctness verification.

Paths refer to files saved on the Transgentic host. They may not be accessible to a client running on another machine.

See [MCP responses](MCP_RESPONSES.md) for structured fields, progress, cancellation, and plain/agentic behavior. Applications should handle older builds that expose only `content` and `metadata`.

## Command-line requests

From a source checkout with dependencies installed and the desktop running:

```bash
node bin/transgentic-cli.js prompt "Write a function square(n) that returns n * n." --mode coding --json
node bin/transgentic-cli.js image "A storyboard frame of a quiet railway platform"
node bin/transgentic-cli.js video "A short shot of clouds moving over a hillside"
node bin/transgentic-cli.js status
```

Configure authentication locally as described in [Connections](CONNECTING.md#stdio-clients). The CLI can also resolve its token from the app's local authentication file. Do not share that file.

Use `--provider` or `--model` only with a configured, available option. These examples illustrate requests, not verified capabilities of every provider or release.
