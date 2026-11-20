# Chrome Sync and browser compatibility

Chrome Sync imports session data from the active Chrome profile into the corresponding provider account partition in Transgentic. The provider drawer runs on the Chromium engine bundled with Transgentic's Electron runtime. Updating Chrome on your Mac updates the browser you sync from. The drawer's Chromium version changes with a Transgentic build that updates Electron.

## Why the versions matter

An older Transgentic build could apply Chrome's user-agent version to the drawer even when its embedded Chromium had a different major version. For example, the drawer could advertise Chrome 157 while running Chromium 132. That left browser identity signals inconsistent. A newer or older Chrome installation could both produce a mismatch. Being behind on Chrome updates alone does not explain a generation failure.

Starting in v2.4.3, Transgentic keeps its engine-aligned user agent when the synced Chrome major version differs. The desktop also preserves Google's security response headers and limits its default navigation request headers to top-level navigations. These changes address differences observed in the embedded browser. Gemini's generic generation error alone does not identify the reason Google returned it.

## Troubleshooting a synced session

1. Fully quit and reopen Transgentic after installing the update so Electron starts with the new settings.
2. Open the intended account in the provider drawer and check that you're signed in. If the session has expired or requests verification, sign in directly in the drawer or sync the intended Chrome profile again.
3. Compare results you already have from standalone Chrome, the provider drawer, and Quick Prompt before spending another generation. A failure during manual use in the drawer points the investigation toward the embedded browser or its account session. If manual use succeeds there and only Quick Prompt fails, inspect tool selection, attachments, and submission handling.
4. Record the Transgentic version, Chrome version, exact provider message, and whether the request used an attachment. Keep cookies, account details, and private prompts out of shared reports.
