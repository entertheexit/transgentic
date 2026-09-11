# Transgentic custom webview recipes

Configure Transgentic web adapters with JSON recipes for selectors, authentication checks, model controls, and response extraction. Includes placeholder examples, installation steps, consent handling, storage, and repair limitations.

[Documentation index](../README.md#documentation-index)

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
2. **Multi-Mode Extraction**: The `response.modes` configuration defines extraction selectors for **Text/Markdown**, **Images** (`<img>`, `data:image/...`), **Videos** (`<video>`, `.mp4`), and **Audio/Music** (`<audio>`, `.mp3`), allowing Transgentic to download media assets directly to local disk.
3. **Cookie Synchronization (`cookie_sync`)**: Transgentic bridges session cookies from your active Google Chrome browser via the **Transgentic Sync** companion extension into an isolated background Electron partition (`persist:transgentic_<provider>`). Google Chrome does not need to stay open.
4. **URL recovery (`resetUrlPatterns`)**: If a webview navigates away from the active chat view (e.g. into `/projects` or `/settings`), configured redirect rules can return the session back to the clean chat interface.

---

## Field reference

| Top-Level Field | Type | Description |
| :--- | :--- | :--- |
| `id` | `string` (required) | Unique alphanumeric slug (e.g. `"custom_ai"`, `"enterprise_portal"`). |
| `title` | `string` (required) | Human-readable provider name displayed across the UI (e.g. `"Enterprise AI Portal"`). |
| `version` | `string` (required) | Semantic version string (e.g. `"1.0.0"`). Automatically bumped by Self-Healing. |
| `domainMatch` | `string` (required) | Hostname pattern used by the Chrome extension to detect the site (e.g. `"chat.example.com"`). |
| `url` | `string` (optional) | Default entry URL loaded inside the background webview partition. |
| `newChatUrl` | `string` (optional) | Direct URL loaded when starting a brand new conversation turn (e.g. `"https://chat.example.com/new"`). |
| `resetUrlPatterns` | `Array<{ pattern, redirectTo }>` | Rules to redirect away from stranded pages (e.g. pattern: `"/settings"`, redirectTo: `"/new"`). |
| `selectors` | `object` (required) | Interactive DOM selector landmarks (see below). |
| `response` | `object` (required) | Output observation and media extraction schema (see below). |
| `authStrategy` | `"cookie_sync"` | Session authentication strategy. |
| `auth` | `object` (optional) | Verification cookies, logged-in badges, and login page redirect patterns. |
| `rateLimit` | `object` (optional) | Text patterns and error banner selectors indicating rate-limit cooldowns. |
| `models` | `Array<ModelDef>` (optional) | Models supported by the provider with declared modes (`general`, `coding`, `image`, `video`, `audio`). |

### Selectors

* **`inputPrompt`** (*string | string[]*): CSS selector for the chat composer (e.g. `#prompt-textarea, div[contenteditable="true"]`).
* **`submitButton`** (*string | string[]*): CSS selector for the send/submit button.
* **`stopButton`** (*string | string[]*, optional): CSS selector for the cancel/stop generating button.
* **`modelDropdownTrigger`** (*string | string[]*, optional): Selector for opening the model switcher menu.

### Response modes

* **`text`**: `{ enabled: true, contentSelector?: "...", mediaKind: "text" }` — Prose and code extraction.
* **`image`**: `{ enabled: true, contentSelector: "img.generated-image, img[src*='storage']", downloadSelector?: "...", mediaKind: "image" }` — Image generation.
* **`video`**: `{ enabled: true, contentSelector: "video source, video[src]", downloadSelector?: "...", mediaKind: "video" }` — Video generation.
* **`audio`**: `{ enabled: true, contentSelector: "audio source, audio[src]", downloadSelector?: "...", mediaKind: "audio" }` — Audio/music generation.

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
3. Hover and click the composer input, send button, and response container. The extension highlights DOM landmarks and builds a recipe draft. Review the selectors before use.
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
│   └── Audios/     # Downloaded MP3/WAV tracks
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
