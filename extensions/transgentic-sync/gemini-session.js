// Cookie presence alone cannot distinguish a live Gemini session from a signed-out one.
async function hasSignedInGeminiTab(extension, tabId) {
  const tabs = tabId === undefined
    ? await extension.tabs.query({ url: 'https://gemini.google.com/*' })
    : [{ id: tabId }];
  for (const tab of tabs) {
    if (!Number.isInteger(tab.id)) continue;
    try {
      const results = await extension.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          if (location.origin !== 'https://gemini.google.com') return false;
          const visible = element => element.getClientRects().length > 0 &&
            getComputedStyle(element).visibility === 'visible';
          return Array.from(document.querySelectorAll(
            'a[aria-label*="Google Account" i], button[aria-label*="Google Account" i], [data-id="avatar-button"]'
          )).some(visible);
        },
      });
      if (results.some(result => result.result === true)) return true;
    } catch {
      // An inaccessible or closed tab cannot prove sign-in.
    }
  }
  return false;
}
