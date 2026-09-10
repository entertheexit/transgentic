# Completion gateway

The completion gateway lets Cline and other OpenAI-compatible clients use Transgentic as their primary model provider:

```text
Cline → Transgentic → selected Webview/API/CLI/Local LLM
```

Use `/v1` when the client should own conversation history, file edits, commands, and tool execution. Use `/mcp` or `/sse` when an agent should call Transgentic as a tool.

## Client setup

Copy the access token from Transgentic, then configure the client:

| Setting | Value |
| --- | --- |
| Provider | OpenAI Compatible |
| Base URL | `http://127.0.0.1:58420/v1` |
| API key | Transgentic access token |
| Model | `transgentic/coding` |

The stable route models are:

- `transgentic/general`
- `transgentic/coding`
- `transgentic/writing`

`GET /v1/models` also lists compatible direct providers as `transgentic/provider/<provider-id>`. A CLI appears there only while enabled, connected, and in Provider Mode. Webview providers stay unlisted until their recipe can verify temporary-chat or equivalent account-memory isolation.

## Request behavior

Route models use the existing Main route and fallback order without an extra classification request. Each request starts a fresh backend conversation. Transgentic sends the caller's structured history once and does not resume a native CLI session or attach hidden Transgentic conversation context.

API and Local LLM providers receive structured messages and tools. CLI providers receive one serialized transcript. For tool-capable requests, their output must match a strict validated tool-call envelope. Transgentic returns valid tool calls to the caller and never executes them on the host. Unknown tools and malformed arguments fail the request instead of triggering a repair generation.

Streaming uses OpenAI-compatible server-sent events. Backends that cannot stream safely are buffered before chunks are returned, so fallback selection completes before response emission. Client cancellation aborts the active provider request.

Provider Mode forces host workspaces, project editing, and commands off. Completion Recall is managed in **Settings → General → Recall & Context Memory**, completion compaction in the **Local LLM** modal, and the Co-route review pass in the **Double Agent** widget. All three are off by default, so the caller normally owns the complete task history and causes one backend generation. Enabling one is an explicit opt-in for text-only requests. Any request that supplies tools or includes a tool cycle always bypasses all three extras and stays on the direct path.

## LAN sharing

The gateway binds to loopback by default. To use it from another computer, enable LAN sharing under **Settings → General → Gateway Port & Network**, select the advertised interface, apply the change, and copy the displayed `/v1` URL. Remote requests require the access token. Provider management and authentication endpoints accept loopback callers only.

On the client computer, use the copied LAN base URL such as `http://192.168.1.20:58420/v1`. Keep Cline's project and command tools enabled only on that client. A Provider Mode CLI running behind Transgentic receives the messages and proposes tool calls, while Cline performs the actual read, edit, and command operations in its local project.
