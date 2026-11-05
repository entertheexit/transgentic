# Transgentic custom webview recipes

Configure Transgentic web adapters with JSON recipes for selectors, authentication checks, model controls, and response extraction. Includes placeholder examples, installation steps, consent handling, storage, and repair limitations.

[Documentation index](../README.md#documentation-index)

For declarative media activation, guarded option indexes, setting verification and generation defaults, see [Media settings and generation API](MEDIA_API.md#recipe-controls).

Recipes configure web adapters using JSON selectors, response extraction rules, authentication checks, and model controls. A recipe is not a provider approval or a guarantee of compatibility.

Use only services and content you are authorized to use. Any automated workflow must comply with the provider's applicable terms and permissions; access to an account does not itself establish permission to automate it. Recipe consent notices do not grant that permission.

## Contents

- [How recipes work](#how-recipes-work)
- [Field reference](#field-reference)
- [Examples](#examples)
- [Installation and consent](#installation-and-consent)
- [Storage and versioning](#storage-and-versioning)
- [Selector repair](#selector-repair)

The field reference below covers commonly used fields, not a complete validation schema. Examples use placeholder domains and model IDs; replace them with reviewed configuration for your service. They are not working third-party integrations.

## How recipes work

1. **Declarative DOM Landmarks**: Recipes define CSS selectors (or prioritized fallback candidate lists) for text input areas, send buttons, stop generation buttons, and model switchers.
2. **Multi-Mode Extraction**: The `response.modes` configuration defines extraction selectors for **Text/Markdown**, **Images** (`<img>`, `data:image/...`), **Videos** (`<video>`, `.mp4`), and **Music** (`<audio>`, `.mp3`), allowing Transgentic to download media assets directly to local disk.
3. **Cookie Synchronization (`cookie_sync`)**: Transgentic bridges session cookies from your active Google Chrome browser via the **Transgentic Sync** companion extension into an isolated background Electron partition (`persist:transgentic_<provider>`). Google Chrome does not need to stay open.
4. **URL recovery (`resetUrlPatterns`)**: If a webview navigates away from the active chat view (e.g. into `/projects` or `/settings`), configured redirect rules can return the session back to the clean chat interface.

---

## Meta AI built-in recipe

Meta AI is registered as `meta` at `https://www.meta.ai/`. Select it in Providers or configure it explicitly in a route; adding it does not change saved routing defaults. MCP clients can call `ask_meta` or `prompt_model` with `provider: "meta"`. `default` retains the native selection; Instant and Thinking are selectable after discovery from the signed-in account's picker.

Reload the updated Transgentic Sync extension and restart the rebuilt desktop application before syncing a signed-in Meta AI tab. Authentication requires a visible account-menu marker, because the guest site also exposes a composer. Only Meta AI domains are imported. Optional background refresh is off by default and requires an open signed-in Meta AI tab.

Image and video generation use prompt-directed configuration and are enabled after successful Electron MCP execution and validated WebP/MP4 downloads. Explicit duration, quality and aspect-ratio settings are not advertised. A single PNG, JPEG or WebP reference image is supported for text requests, image editing and image-to-video. Upload readiness must remain confirmed for eight seconds before typing, because the inline thumbnail can appear before Meta finishes processing it. Prompt insertion preserves inline references, and output extraction distinguishes generated tiles and edited comparison outputs from reference previews. Documents, video-file uploads, multiple references, Temporary Chat and Music are not enabled.

The shared Chrome authentication extension is version 1.2.1. Build its local archive with `npm run build:extension`, or reload `extensions/transgentic-sync` as the existing unpacked extension. Desktop download and installer resources use the matching archive. Published release links remain unchanged until a release is published.

See [image-to-video verification](reports/meta-ai-image-to-video-2026-11-05.md) and the [Meta AI compatibility report](reports/meta-ai-integration-2026-11-04.md) for the observed browser behavior and remaining runtime checks.

## Field reference

| Top-Level Field | Type | Description |
| :--- | :--- | :--- |
| `id` | `string` (required) | Unique alphanumeric slug (e.g. `"custom_ai"`, `"enterprise_portal"`). |
| `title` | `string` (required) | Human-readable provider name displayed across the UI (e.g. `"Enterprise AI Portal"`). |
| `version` | `string` (required) | Semantic version string (e.g. `"1.0.0"`). Automatically bumped by Self-Healing. |
| `modeSchemaVersion` | `2` | Identifies the Music mode schema. Recipes without it migrate the former `audio` mode key to `music`. |
| `domainMatch` | `string` (required) | Hostname pattern used by the Chrome extension to detect the site (e.g. `"chat.example.com"`). |
| `url` | `string` (optional) | Default entry URL loaded inside the background webview partition. |
| `newChatUrl` | `string` (optional) | Direct URL loaded when starting a brand new conversation turn (e.g. `"https://chat.example.com/new"`). |
| `resetUrlPatterns` | `Array<{ pattern, redirectTo }>` | Rules to redirect away from stranded pages (e.g. pattern: `"/settings"`, redirectTo: `"/new"`). |
| `selectors` | `object` (required) | Interactive DOM selector landmarks (see below). |
| `response` | `object` (required) | Output observation and media extraction schema (see below). |
| `authStrategy` | `"cookie_sync"` | Session authentication strategy. |
| `auth` | `object` (optional) | Verification cookies, logged-in badges, and login page redirect patterns. |
| `rateLimit` | `object` (optional) | Text patterns and error banner selectors indicating rate-limit cooldowns. |
| `models` | `Array<ModelDef>` (optional) | Models supported by the provider with declared modes (`general`, `coding`, `image`, `video`, `music`). |

### Selectors

* **`inputPrompt`** (*string | string[]*): CSS selector for the chat composer (e.g. `#prompt-textarea, div[contenteditable="true"]`).
* **`submitButton`** (*string | string[]*): CSS selector for the send/submit button.
* **`stopButton`** (*string | string[]*, optional): CSS selector for the cancel/stop generating button.
* **`modelDropdownTrigger`** (*string | string[]*, optional): Selector for opening the model switcher menu.

### Response modes

* **`text`**: `{ enabled: true, contentSelector?: "...", mediaKind: "text" }` — Prose and code extraction.
* **`image`**: `{ enabled: true, contentSelector: "img.generated-image, img[src*='storage']", downloadSelector?: "...", mediaKind: "image" }` — Image generation.
* **`video`**: `{ enabled: true, contentSelector: "video source, video[src]", downloadSelector?: "...", mediaKind: "video" }` — Video generation.
* **`music`**: `{ enabled: true, contentSelector: "audio source, audio[src]", downloadSelector?: "...", mediaKind: "audio" }` — Music generation. The product mode stays Music even when the provider packages its audio track in an MP4 video container.

Any mode may opt into uploads with `inputAttachments`. It declares `fileInput`, optional `revealSteps`, legacy `trigger`, `ready`, and `cleanup` selectors, optional `readyStableMs` (0–10000 ms of continuously confirmed readiness), `preserveInComposer` for inline reference nodes, `acceptedKinds` (`image`, `document`, `video`), optional `acceptedMimeTypes`, and `multiple`. Each reveal step is an upload-scoped `{ "action": "click", "target": { "selectors"?, "role"?, "name"? } }`; `name` is an exact accessible-name value or localized fallback list. Recipes without this block remain text-only.

Transgentic first uses an already available native file input. Only when no unambiguous usable input exists does it replay the minimum reveal steps, preferring semantic role/name matching with ordered CSS fallbacks. It intercepts the native chooser, attaches every file, verifies the input and provider readiness UI, then types and submits exactly once. Missing or ambiguous controls fail before prompt entry. A pre-submit failure invokes cleanup, clears the input, and closes transient menus before the composer can be reused. Existing `trigger` recipes remain compatible as a one-step reveal flow.

---

## Examples

### Text and coding example

```json
{
  "id": "custom_ai",
  "title": "Custom Enterprise AI",
  "version": "1.0.0",
  "domainMatch": "chat.example.com",
  "url": "https://chat.example.com",
  "newChatUrl": "https://chat.example.com/new",
  "resetUrlPatterns": [
    { "pattern": "/settings", "redirectTo": "/new" },
    { "pattern": "/projects", "redirectTo": "/new" }
  ],
  "authStrategy": "cookie_sync",
  "auth": {
    "authCookies": ["session_token", "__Secure-auth-session"],
    "minCookieLength": 20,
    "loggedInSelector": "button[data-testid='user-profile'], img[alt*='Avatar' i]",
    "loggedOutSelector": "a[href*='/login'], button[data-testid='login-btn']",
    "loginUrls": ["/login", "/signin"]
  },
  "rateLimit": {
    "textPatterns": ["Rate limit reached", "Too many requests", "Please try again later"],
    "selector": "[data-testid='error-banner'], .alert-danger"
  },
  "selectors": {
    "inputPrompt": "#prompt-textarea, div.ProseMirror[contenteditable='true'], textarea",
    "submitButton": "button[data-testid='send-button'], button[aria-label*='Send' i], button[type='submit']",
    "stopButton": "button[data-testid='stop-button'], button[aria-label*='Stop' i]",
    "modelDropdownTrigger": "button[data-testid='model-selector']"
  },
  "response": {
    "container": "[data-role='assistant'], div[data-testid^='turn-']:not([data-role='user'])",
    "textSelector": ".markdown, .prose, [data-testid='message-text']",
    "actionButtons": "button[aria-label*='Copy' i], button[title*='Copy' i]",
    "generatingIndicator": ".animate-pulse, [data-is-streaming='true']",
    "excludeSelectors": ["details", ".thinking-accordion", "footer"],
    "modes": {
      "text": {
        "enabled": true,
        "contentSelector": ".markdown, .prose",
        "mediaKind": "text"
      }
    }
  },
  "models": [
    {
      "id": "enterprise-v2",
      "displayName": "Enterprise V2 (Reasoning)",
      "mode": "general",
      "modes": ["general", "coding"]
    }
  ]
}
```

### Text, image, and video example

```json
{
  "id": "creative_studio",
  "title": "Creative Studio AI",
  "version": "1.0.0",
  "domainMatch": "studio.example.com",
  "url": "https://studio.example.com/create",
  "authStrategy": "cookie_sync",
  "selectors": {
    "inputPrompt": "textarea[placeholder*='Describe' i], div[contenteditable='true']",
    "submitButton": "button[aria-label*='Generate' i], button[type='submit']",
    "stopButton": "button[aria-label*='Cancel' i]"
  },
  "response": {
    "container": ".generation-card, .result-turn",
    "textSelector": ".prompt-output-text",
    "modes": {
      "text": { "enabled": true, "mediaKind": "text" },
      "image": {
        "enabled": true,
        "contentSelector": "img.generated-art, img[src*='cdn.example.com']",
        "downloadSelector": "a[download][href*='.png']",
        "mediaKind": "image"
      },
      "video": {
        "enabled": true,
        "pageUrl": "/video",
        "contentSelector": "video source, video[src]",
        "downloadSelector": "a[download][href*='.mp4']",
        "mediaKind": "video"
      }
    }
  },
  "models": [
    { "id": "example-image-model", "displayName": "Example Image Model", "mode": "image" },
    { "id": "example-video-model", "displayName": "Example Video Model", "mode": "video" }
  ]
}
```

---

## Installation and consent

### In-app installation

1. In Transgentic, navigate to **Settings → Providers → Manage Providers → Webview tab**.
2. Click **"+ Add Webview Provider"**.
3. **Paste JSON**, **Upload `.json` file**, or click **"Load Template"** to pre-fill a valid recipe blueprint.
4. Click **"Save & Register Recipe"**. Transgentic stores the recipe locally and initializes the session partition.
   The desktop first displays the recipe notice and asks for confirmation. Cancel leaves the recipe and session uninstalled. Enabling an existing custom recipe also requires confirmation.
5. Open Google Chrome, navigate to the target AI domain, and click **"Sync Active Session"** in the Transgentic Sync extension.

### Extension inspector

1. Open the target AI web portal in Google Chrome.
2. Open the **Transgentic Sync** extension and click **"Visual Inspector"** (<img src="../extensions/transgentic-sync/icons/ui/target.svg" width="12" height="12" />).
3. Hover and click the composer input, send button, and response container. In the optional attachment stage, use the provider's upload UI normally; the inspector records the minimum clicks, rejects unstable framework IDs, and detects the native file input. Cancel the browser picker if it appears because recording never reads a local file.
4. Click **"Export Recipe"** and install it directly into Transgentic.

---

## Storage and versioning

Custom model discovery and switching use the optional `modelSelection` object in the recipe. Supply `item` (model card selector), and optionally `trigger`, `name`, `idAttribute`, `tier`, `tabs`, `confirm`, `close`, and `scrollContainer`. These values are CSS selectors except `idAttribute`, which names an attribute on each card. The engine uses the recipe's `models` catalog when discovery is unavailable; without model controls, automatic model switching is unavailable. Site-specific catalogs and selectors belong in the relevant recipe.

Recipes may include `disclaimer` and `disclaimerVersion`. The desktop preserves and displays this text, then records the accepted text, version, and timestamp locally as `disclaimerAcceptance`. Imported acceptance records never replace desktop confirmation. The notice does not grant provider authorization.

The configured storage root (default: `~/Documents/Transgentic`) groups custom recipes, repair history, and saved media as follows. Media folders describe intended formats, not a guarantee of download success:

```
~/Documents/Transgentic/
├── Library/
│   ├── Images/     # Downloaded PNG/WebP images
│   ├── Videos/     # Downloaded MP4 videos
│   └── Music/      # Downloaded MP3/WAV music tracks
└── Recipes/
    ├── Custom/     # User-installed recipes (<id>.json)
    ├── Healed/     # Self-healed active selector overrides (<id>.json)
    └── History/    # Versioned historical snapshots (<id>.v<version>_<timestamp>.json)
```

- **Media paths**:

  MCP results include paths to saved files on the Transgentic host. Use the returned path rather than assuming a particular relative-path prefix or extension.

- **Version tracking**:

  Saved selector repairs bump the semantic patch version (e.g. `1.0.0` → `1.0.1`), archive a historical snapshot in `Recipes/History/`, and record an audit changelog.

- **Rollback**:

  Settings provides controls to restore available historical recipe versions or reset built-in defaults. Recovery depends on the snapshots retained locally.

---

## Selector repair

Selector repair can attempt the following when a provider interface changes and a suitable local model is configured. These are recovery steps, not a guarantee of a working repair:

1. **DOM Landmark Watchdog**: Detects missing or non-responsive input composers, send buttons, or response containers.
2. **History Snapshot**: Archives the pre-repair recipe to `Recipes/History/<id>.v<version>_<timestamp>.json`.
3. **Local LLM DOM Repair**: Transgentic sends a DOM snapshot to your configured Local LLM (Ollama, LM Studio) to identify the updated element selectors.
4. **Live Hot-Reload**: Writes the repaired recipe to `Recipes/Healed/<id>.json`, bumps the version (`1.0.1`), and reloads the active Electron webview adapter in memory without restarting the application. Repair can fail or select the wrong element; inspect the result before relying on it.

## Temporary Chat personalization

`temporaryChat` retains its native activation steps, positive `activeWhen` and
`inactiveWhen` locators, and optional conversation continuation contract. Recipes
may additionally declare `variants.personalized` and `variants.unpersonalized`.
Each variant requires `activationSteps` (ordered click targets) and `activeWhen`
(positive evidence of the selected personalization). An optional `continuationWhen`
locator can declare the native marker that replaces the picker after submission.
It is accepted only after the variant was verified in the same browser view and
remains bound to its conversation path; a URL alone cannot establish the mode.
Use exact accessible names,
including description alternatives where necessary. Never match `Personalized`
with a substring search: that also matches `Unpersonalized`.

Home and Settings expose only declared modes and remember choices per task mode
and provider. New Coding configurations default to ChatGPT Unpersonalized; saved
choices and legacy boolean preferences remain unchanged. Other supported web
providers use their native Temporary mode. Recipes may declare `personalization`
as `disabled`, `profile-only`, `selectable`, or `unknown`; absent metadata means
unknown. Gemini declares disabled personalization, while Claude Incognito may
still use profile preferences and custom styles.

When Recall is enabled, Transgentic skips its generated Recall instruction for
Unpersonalized and generic Temporary chats. Explicitly Personalized ChatGPT and
Normal chats may use Recall. The original prompt and saved Recall setting remain
unchanged. Local logging and Library storage follow their own settings.

Desktop IPC accepts `chatMode`; MCP tools, completion requests, and media jobs
accept `chat_mode`: `normal`, `temporary`, `temporary-personalized`, or
`temporary-unpersonalized`. `temporary_chat` remains supported: false selects
Normal, and true requires Temporary Chat (Personalized on ChatGPT). Contradictory
fields are rejected. Exact personalization selections never fall back to another
history or personalization mode. Execution metadata reports `requestedSelection`
and `actualSelection` alongside the compatible normal/temporary classification.

The selected mode is captured before queueing. Mode changes isolate conversation
history, and exact personalization must be verified again before uploads, prompt
entry, submission, and continuation. A temporary URL alone does not prove the
selected personalization. Missing or ambiguous controls stop execution. Idle
availability uses a neutral status circle with a verification-on-start tooltip.
The text trigger opens a mode-selection popover with Recheck availability.
Recheck uses an isolated hidden page in the active account
partition, with an eight-second budget covering navigation, hydration and inspection.
It does not activate a chat mode or change an open conversation. Results remain
bound to the current account, partition and recipe; account or recipe changes
invalidate them. A failed check exposes retry/open-provider recovery. The exact
selected mode is still verified independently before uploads and submission.
