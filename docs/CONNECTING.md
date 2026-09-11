# Transgentic MCP connections and provider setup

Connect Transgentic to local models, synchronize permitted web sessions, and configure authenticated Model Context Protocol (MCP) clients over Streamable HTTP, legacy Server-Sent Events (SSE), or the stdio bridge.

[Documentation index](../README.md#documentation-index)

## Contents

- [Provider setup](#provider-setup)
- [MCP authentication](#mcp-authentication)
- [HTTP and SSE endpoints](#http-and-sse-endpoints)
  - [Choosing a transport](#choosing-a-transport)
  - [Unified gateway](#unified-gateway)
  - [Provider endpoints](#provider-endpoints)
  - [Task-mode endpoints](#task-mode-endpoints)
  - [Combining provider and mode choices](#combining-provider-and-mode-choices)
  - [Authentication and caller continuity](#authentication-and-caller-continuity)
- [Stdio clients](#stdio-clients)
- [Connection checks](#connection-checks)

## Provider setup

### Local models

In the Local LLM settings, enable the integration and configure the endpoint and model. The client supports presets for tools such as Ollama and LM Studio, plus compatible endpoints. Check the selected preset and endpoint against the model server you run.

A model described as local may still be hosted on another machine if its configured URL points there. To keep model requests on your machine, check the endpoint and every enabled fallback; choosing a local primary alone does not disable web fallbacks.

### Web sessions and companion extension

Built-in web adapters cover ChatGPT, Claude, Gemini, and Grok. Custom services use [recipes](RECIPES.md). These are configured integrations, not a statement of provider endorsement or current compatibility.

Use only sessions you are authorized to use, and confirm that the intended automation complies with the provider's terms and permissions. Account access alone is not permission to automate.

Download the **[Transgentic Sync Chrome extension ZIP](https://github.com/entertheexit/transgentic/releases/latest/download/transgentic-sync.zip)** alongside the **[desktop release](https://github.com/entertheexit/transgentic/releases/latest)**. Use the same release version for both; for an older desktop, find its matching extension in the [release history](https://github.com/entertheexit/transgentic/releases). Extract the ZIP before installation. In Chrome:

1. Open `chrome://extensions`.
2. Enable **Developer mode** and choose **Load unpacked**.
3. Select the extracted extension directory containing `manifest.json`.
4. Open the intended provider account and use **Sync Active Session**.

A source checkout is not required. For custom development, the extension source is in [extensions/transgentic-sync](../extensions/transgentic-sync). Follow the in-app setup instructions for the build you are using.

Synchronization imports session data into the desktop's provider partition. Chrome does not need to remain open after synchronization, but the provider may later require login or verification. Treat synchronized sessions as sensitive account access.

## MCP authentication

The default gateway is `http://127.0.0.1:58420`. Use the actual port shown in the app if it differs.

Find or regenerate your access token under **Settings → MCP Client Security & Authentication**. Configure your client to send:

```http
Authorization: Bearer YOUR_TOKEN
```

Endpoints also accept `?token=YOUR_TOKEN`. Prefer a header when your client supports one: URL tokens can appear in copied links, configuration exports, or logs. Do not commit tokens to a repository.

Client configuration formats and settings screens differ. Supply the endpoint and authentication using your client's supported MCP configuration. A field named “bearer token environment variable” expects a variable name, not the token value; the client process must be able to read that variable.

## HTTP and SSE endpoints

There are two separate choices: **transport** determines how the client exchanges MCP messages; **endpoint scope** supplies the provider or task-mode routing context. Choosing SSE does not select a different model or grant different provider access.

### Choosing a transport

- **Streamable HTTP — `/mcp`:**

  Use this when the client supports Streamable HTTP. The client posts MCP messages to the endpoint and receives JSON responses, or a streamed response when supported and requested. In Transgentic, optional progress can use SSE frames within this HTTP transport; “HTTP” does not mean “no streaming.”

- **Legacy SSE — `/sse`:**

  Use this when a client expects the older SSE connection flow. The client opens an event stream, then sends messages to the message endpoint announced by the server. Keep the stream open and let the MCP client follow that endpoint rather than constructing `/messages` requests manually.

Both transports require the [MCP access token](#mcp-authentication). Select the transport your client implements; changing transports does not resolve login, model-availability, or provider-permission issues.

### Unified gateway

Use the unified gateway for a client that handles several kinds of tasks or should follow your configured provider routes. This avoids maintaining a separate connection for each service or mode.

| Scope | Streamable HTTP | SSE |
| :--- | :--- | :--- |
| Configured routing | `/mcp` | `/sse` |

Set `mode` in the tool arguments when the task needs a specific route, especially for media. Local LLM and custom-provider routing also use this gateway; there are no dedicated `/localllm/mcp` or `/localllm/sse` routes in the current server.

### Provider endpoints

These connections supply a built-in provider selection for `prompt_model`. They are useful when the user or application requests a particular service instead of the configured cross-provider route. They still use Transgentic's local gateway and web adapter, not the provider's public API endpoint.

| Provider | When to choose it | Streamable HTTP | SSE |
| :--- | :--- | :--- | :--- |
| ChatGPT | The request should use your configured ChatGPT session. | `/chatgpt/mcp` | `/chatgpt/sse` |
| Claude | The request should use your configured Claude session. | `/claude/mcp` | `/claude/sse` |
| Gemini | The request should use your configured Gemini session. | `/gemini/mcp` | `/gemini/sse` |
| Grok | The request should use your configured Grok session. | `/grok/mcp` | `/grok/sse` |

For example, use `/claude/mcp` with `prompt_model` and `mode: "coding"` when the task specifically calls for Claude in coding mode. Provider-forced requests do not use the ordinary cross-provider fallback chain. A failed or unavailable service remains an error rather than permission to use it another way.

No endpoint establishes that a model or capability is available to your account. Check the provider state, model registry, and recipe before relying on it.

### Task-mode endpoints

These connections supply a default task mode while leaving provider selection to the configured routes. They are useful for a dedicated application whose requests consistently need the same mode.

| Mode | Purpose and reason to choose it | Streamable HTTP | SSE |
| :--- | :--- | :--- | :--- |
| General | Text questions and discussion using the general route. | `/general/mcp` | `/general/sse` |
| Writing | Prose and long-form work with Writing guidance using the General route configuration. | `/writing/mcp` | `/writing/sse` |
| Coding | Code, tests, and technical review using the coding route. | `/coding/mcp` | `/coding/sse` |
| Image | Image or storyboard requests that need image-mode routing rather than a text-only answer. | `/image/mcp` | `/image/sse` |
| Video | Video requests using configured video-capable candidates and extraction rules. | `/video/mcp` | `/video/sse` |
| Music | Songs, tracks, soundtracks, beats, melodies, jingles, BGM, and instrumentals using configured music-capable candidates. | `/music/mcp` | `/music/sse` |

For example, a storyboard application can connect to `/image/mcp` and call `prompt_model` without repeating the image mode on every request. Routing still depends on your enabled providers and available accounts. Local text models are not media generators, and a media request may fail or return without a saved artifact.

Writing remains a distinct backend request mode. `/writing/mcp`, `/writing/sse`, explicit `mode: "writing"`, and the `transgentic/writing` completion model retain Writing guidance and identity. They share General's configured provider route and per-mode policies, so no separate Writing route appears in the desktop controls.

Speech, narration, voiceover, TTS, podcasts, and sound effects are reserved for a future Audio provider. The former `/audio/mcp` and `/audio/sse` music aliases are not available.

### Combining provider and mode choices

- **One provider, different kinds of tasks:**

  Use a provider endpoint with `prompt_model` and set `mode` per request. For example: `/chatgpt/mcp` with `mode: "general"`.

- **One kind of task, configured provider selection:**

  Use a task-mode endpoint. For example: `/coding/mcp` follows the configured coding route unless the call explicitly selects a provider.

- **Mixed tasks and providers:**

  Use `/mcp` or `/sse` and pass the intended arguments on each call. This keeps the routing choice visible in the request.

These paths are routing conveniences, not enforced permission boundaries. In the current implementation, a named tool such as `ask_grok` can override a provider endpoint's selection, and an explicit `mode` argument can override a mode endpoint. Media tools also select a mode. Avoid conflicting choices. Combined paths such as `/claude/coding/mcp` are not registered; use a supported path plus tool arguments.

### Authentication and caller continuity

Prefix every table path with `http://127.0.0.1:58420`, or the gateway address and port shown in the app. Send the token in the `Authorization` header, or use `?token=YOUR_TOKEN` if the client cannot send headers. Do not publish a URL containing a real token.

For ordinary applications that should not receive IDE workflow reminders, select `response_profile=plain` on the endpoint or `response_profile: "plain"` in tool arguments. Provider and mode selection do not determine the response profile. See [caller profiles](MCP_RESPONSES.md#choosing-a-response-profile).

For Streamable HTTP, reuse the `mcp-session-id` returned by initialization on subsequent requests. For legacy SSE, retain the server-announced message endpoint and session. A configured URL is not proof that initialization or tool discovery succeeded.

## Stdio clients

The repository includes [bin/transgentic-cli.js](../bin/transgentic-cli.js), which can bridge a stdio client to the running desktop gateway. This is not a separate model server.

For a client that accepts `command`, `args`, and `env` entries, adapt this example to its configuration format:

```json
{
  "command": "node",
  "args": ["/absolute/path/to/transgentic/bin/transgentic-cli.js", "--mode", "coding"],
  "env": {
    "TRANSGENTIC_PORT": "58420",
    "TRANSGENTIC_TOKEN": "YOUR_TOKEN"
  }
}
```

Replace the path and token locally. Run `node bin/transgentic-cli.js --help` from the source checkout for supported flags. The `transgentic-cli` command name is usable only when that executable is available on the client's PATH.

The bridge has its own transport behavior; do not assume that every session or progress feature of a direct HTTP connection is forwarded by it. Use direct HTTP when verifying the [HTTP response contract](MCP_RESPONSES.md).

## Connection checks

- **App and port:**

  Confirm that Transgentic is running and that the client uses the port shown in the app.

- **Authentication:**

  Check authentication without posting the token in logs or issue reports.

- **Tool discovery:**

  Confirm initialization and tool discovery in the client, then send a small test prompt.

- **Missing model answer:**

  Inspect `isError`, `structuredContent.status`, and the app's logs. A handoff or reminder is not a provider answer.

- **Web provider failures:**

  Check the provider login state, selected recipe, and model availability. Do not repeatedly retry a provider reporting a restriction.

- **Follow-up context:**

  Reuse the connection, mode, response profile, and thread identifier. See [conversation isolation](MCP_RESPONSES.md#conversation-and-request-isolation).
