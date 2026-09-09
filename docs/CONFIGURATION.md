# Transgentic settings, local models, and routing

Configure Transgentic provider routes, Balanced Mode, Double Agent, Recall, local model options, media storage, and request limits.

[Documentation index](../README.md#documentation-index)

## Contents

- [Providers and routes](#providers-and-routes)
- [Balanced Mode and caller profiles](#balanced-mode-and-caller-profiles)
- [Double Agent](#double-agent)
- [Local model options](#local-model-options)
- [Recall](#recall)
- [Limits and recovery](#limits-and-recovery)
- [Media, port, and updates](#media-port-and-updates)

## Providers and routes

The **Routing** page controls Main and Co-Agent provider order for each task mode. Settings can differ from repository defaults and from another installation.

Routes consider enabled services, declared mode support, active accounts, cooldowns, requested models, and configured fallbacks. A registry entry does not establish that the provider currently offers a model to your account. Web model discovery and switching depend on the recipe and provider interface.

An explicit provider request limits that request to the selected provider. Unforced requests may try configured alternatives after a failure. Review every fallback if you need a particular data destination; selecting a local primary does not by itself prevent an external fallback.

The Main and Co-Agent routing controls try to avoid selecting the same primary provider. A second suitable provider may not exist. Double Agent can return a partial result when one pipeline fails.

## Balanced Mode and caller profiles

Balanced Mode controls coordination and dispatch behavior. A response profile controls whether a client receives IDE-oriented prompt wrappers and trailing guidance. These are separate settings.

For agentic callers, guidance varies with the mode, selected provider, and conversation turn. It asks the client to stay within the user's requested scope. An agent decides how to act on that guidance; Transgentic does not control the client's permissions or guarantee its behavior.

Successful local and web requests return their actual answer before the reminder. Selecting a local model does not turn a non-micro-task request into a reminder-only response.

Quick Prompt and plain callers receive neutral answers and errors without IDE workflow reminders. Plain presentation does not disable user-configured routing, Double Agent, or data-handling options. See [caller profiles](MCP_RESPONSES.md).

## Double Agent

Double Agent is enabled per mode.

| Configuration | Dispatch |
| :--- | :--- |
| Disabled, or disabled for the mode | Main pipeline |
| Enabled with Balanced Mode | Main pipeline; agentic callers receive comparison guidance |
| Enabled without Balanced Mode | Main and Co-Agent pipelines run concurrently |

A forced provider request does not start the concurrent two-provider route. Quick Prompt applies its existing Balanced Mode dispatch setting to coding; its response profile remains plain.

In concurrent mode, outputs are combined and attributed to their actual providers. If one pipeline fails, the surviving answer is returned with a partial status. A comparison is not independent verification of correctness.

The Local LLM candidate option applies to supported text tasks; local text models are excluded from image, video, and audio dispatch.

## Local model options

### Local Micro-task

This option can promote a configured local model for recognized coding micro-tasks, such as regexes, type definitions, docstrings, test stubs, and standalone helper functions.

Promotion requires an available local model, an eligible request, no forced provider, and no concurrent Double Agent dispatch. The current route/session rules permit promotion when the route is empty, includes Local LLM, or has an established primary conversation. Do not assume that every first turn must use a web service, or that the classifier replaces model execution.

Disabling this option disables promotion; it does not remove Local LLM from configured primary or fallback routes.

### Local Compact

When enabled, Local Compact attempts to shorten eligible code or diff context using the configured model before a web request. The default threshold is 4,000 characters. The implementation applies additional content checks and retains the original prompt when compaction fails or does not sufficiently reduce it.

Compaction is lossy and may omit relevant details. Disable it where exact input preservation matters. The selected model endpoint receives the context being compacted.

### Local Zero-Leak

“Local Zero-Leak” is the UI name of an optional credential-masking feature, not a promise of zero disclosure. It replaces detected credential patterns with request-scoped placeholders and restores matching placeholders in the response.

Detection is incomplete by nature. Review input and output rather than relying on the feature name as a security guarantee. See [data handling](ARCHITECTURE.md#credential-masking-and-memory-hub).

## Recall

Recall adds instructions asking the configured web session to consult available memory, custom instructions, and conversation context. It does not directly read a provider's internal memory database or establish access to other chats.

Settings include per-mode selection and single-pass or two-stage prompting. “Two-stage” describes instructions to perform a memory audit and then answer; it is not proof that historical information was retrieved.

Applicable provider-side preset prompts are gated to new chats and rollovers. This is distinct from the trailing workflow reminders returned to agentic clients on subsequent requests.

## Limits and recovery

Settings include inter-message cooldowns, request pacing, and a sliding hourly request limit. These are local controls, not a substitute for provider limits or permissions.

Agent Halt Guard adds a pause notice for agentic callers when applicable failures or limits are encountered. It does not forcibly stop an external IDE. Plain callers receive ordinary errors.

Context rollover can start a new conversation after configured turn/length thresholds or a detected context-limit error. Continuity summaries and retained history are bounded and can lose information.

Selector repair attempts depend on the current page and configured local model. Login, verification, unsupported interfaces, and repair failures may require user attention. These mechanisms are not intended to circumvent provider restrictions.

## Media, port, and updates

- **Media storage:**

  Detected assets are saved under the configured storage root, by default `~/Documents/Transgentic`. Downloads and supported formats depend on the adapter and provider. A media request without a saved artifact can return a partial result.

- **Gateway port:**

  Settings can change the default port, 58420. Update connected clients to match the running gateway.

- **Automatic update check:**

  Enabled by default, with an About checkbox to disable it. It checks GitHub at launch and hourly. New versions are announced in the app; download and installation remain manual. A failed check does not establish that the installed version is current.
