# Transgentic MCP responses and caller profiles

Response contract for Transgentic MCP clients: agentic and plain profiles, conversation scope, structured outcomes, cancellation, and progress.

[Documentation index](../README.md#documentation-index) · [Tool reference](MCP_TOOLS.md)

## Contents

- [Choosing a response profile](#choosing-a-response-profile)
- [Conversation and request isolation](#conversation-and-request-isolation)
- [Structured outcomes](#structured-outcomes)
- [Optional progress](#optional-progress)
- [Verification](#verification)

Transgentic keeps provider answers in the first text content block. Agentic connections receive a separate trailing workflow reminder. Plain connections and Quick Prompt receive neutral model prompts, answers, and errors. Existing `content` and `metadata` fields remain available.

## Choosing a response profile

During MCP initialization, recognized IDE names (including Codex, Cursor, Antigravity, Cline, Roo Code, Windsurf, and Claude Code) select `agentic`. Other initialized clients select `plain`. Client names only influence presentation; they do not grant permissions.

For an explicit connection preference, initialize with:

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "initialize",
  "params": {
    "protocolVersion": "2025-11-25",
    "clientInfo": { "name": "My application", "version": "1.0" },
    "capabilities": {},
    "_meta": { "transgentic/responseProfile": "plain" }
  }
}
```

An endpoint query parameter `response_profile=plain` or `response_profile=agentic` also sets the connection preference. A tool's `response_profile` argument overrides that preference for that request only. Profile overrides use separate conversations to avoid reusing agentic prompt history in plain requests.

Legacy callers that skip initialization retain agentic responses unless they explicitly select plain. Quick Prompt always uses plain responses. Its existing IPC error behavior is preserved.

## Conversation and request isolation

Reuse the `mcp-session-id` response header on subsequent Streamable HTTP requests, including cancellation notifications. SSE clients reuse their supplied session ID. Initialize a new connection after restarting the server if you need automatic caller detection again.

Conversation history is scoped by connection, profile, task mode, and the optional `thread_id`/project identifier. Separate connections do not implicitly share history, even when they use the same thread identifier. A new scoped conversation starts a fresh provider chat. Quick Prompt maintains a separate desktop conversation.

Quick Prompt's New Chat action clears only that desktop window's Quick Prompt sessions. It does not clear IDE conversations or immediately navigate a provider used by another request; navigation happens when the next Quick Prompt enters the provider queue. Explicit global session-management actions retain their existing behavior.

Request IDs are scoped to their connection and retain their JSON type: `1` and `"1"` are different IDs. Case and whitespace in prompts are preserved when matching duplicate requests. Different accounts, conversations, and independently cancellable requests do not share provider execution. Cancelled requests stop before trying another provider or submitting queued work.

## Structured outcomes

Model requests also return `structuredContent` with:

- `status`: `completed`, `partial`, `failed`, `cancelled`, or `handoff`.
- `answer`: the first text block, retained verbatim.
- `guidance`: the trailing agentic reminder, or an empty string for plain callers.
- `mode` and `responseProfile`.
- `providers`: actual Main/Co providers, models, completion states, and any pipeline errors.
- `artifacts`: saved asset paths from either pipeline.
- `failedProvider`: the identified failing provider, when available.

A surviving Double Agent answer is `partial` when the other pipeline failed. A media request with no saved artifact is also `partial`. No routed service produces an explicit `handoff` for an agentic client and an ordinary configuration error for a plain caller; no model is credited with an answer. Errors retain `isError: true`.

MCP cancellation suppresses the cancelled request's final result. The cancelled outcome remains available to the internal caller/log. Failure reminders and rate-limit notices apply only to agentic connections and respect the user's requested scope.

## Optional progress

Supply `params._meta.progressToken` on `tools/call`. On Streamable HTTP, include `text/event-stream` in the `Accept` header to receive SSE progress events followed by the final JSON-RPC result. Legacy SSE clients receive events on their existing stream. Progress values increase monotonically and carry the original token, including numeric zero.

Stages include accepted, routing, queued, generating, saving assets, and completion/failure. Requests without a progress token and JSON-only clients keep normal JSON responses. Progress does not contain private prompt text or generated answers.

## Verification

`responseGuidance.test.ts` tests real orchestration with mocked provider boundaries, including plain/agentic/Quick Prompt behavior. `mcpCallerTransport.test.ts` exercises real local HTTP connections, session isolation, progress negotiation, and cancellation. `localGuidance.live.test.ts` is opt-in via `TRANSGENTIC_LIVE_LOCAL_CONFIG`, pointing to a Transgentic config with an enabled local model.
