/**
 * Standard Browser Compatibility Preload for Transgentic Guest WebViews & Sessions
 * Injected at document-start before any guest or authentication scripts run.
 */

(function () {
  'use strict';

  // 1. Clean navigator.webdriver without breaking prototype chain
  try {
    if ('webdriver' in navigator) {
      delete navigator.__proto__.webdriver;
    }
  } catch (e) {}

  // 2. Dynamic Host OS Languages
  try {
    const hostLocale = typeof Intl !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().locale : 'en-US';
    const langList = Array.from(new Set([hostLocale, 'th-TH', 'th', 'en-US', 'en']));
    Object.defineProperty(navigator, 'languages', {
      get: () => Object.freeze(langList),
      configurable: true,
    });
    Object.defineProperty(navigator, 'language', {
      get: () => hostLocale,
      configurable: true,
    });
  } catch (e) {}

  // 3. Hardware Concurrency & Memory Defaults
  try {
    Object.defineProperty(navigator, 'hardwareConcurrency', {
      get: () => 8,
      configurable: true,
    });
    Object.defineProperty(navigator, 'deviceMemory', {
      get: () => 8,
      configurable: true,
    });
  } catch (e) {}

  // 4. Standard window.chrome Runtime Object (matching genuine Google Chrome)
  try {
    if (!window.chrome) {
      window.chrome = {};
    }

    if (!window.chrome.app) {
      window.chrome.app = {
        isInstalled: false,
        InstallState: { DISABLED: 'disabled', INSTALLED: 'installed', NOT_INSTALLED: 'not_installed' },
        RunningState: { CANNOT_RUN: 'cannot_run', READY_TO_RUN: 'ready_to_run', RUNNING: 'running' },
        getIsInstalled: () => false,
        getDetails: () => null,
      };
    }

    if (!window.chrome.loadTimes) {
      window.chrome.loadTimes = function () {
        const now = Date.now() / 1000;
        return {
          commitLoadTime: now,
          connectionInfo: 'h2',
          finishDocumentLoadTime: now + 0.2,
          finishLoadTime: now + 0.4,
          firstPaintAfterLoadTime: 0,
          firstPaintTime: now + 0.1,
          navigationType: 'Other',
          npnNegotiatedProtocol: 'h2',
          requestTime: now - 0.1,
          startLoadTime: now,
          wasAlternateProtocolAvailable: false,
          wasFetchedViaSpdy: true,
          wasNpnNegotiated: true,
        };
      };
    }

    if (!window.chrome.csi) {
      window.chrome.csi = function () {
        return {
          onloadT: Date.now(),
          pageT: performance.now(),
          startE: Date.now() - performance.now(),
          tran: 15,
        };
      };
    }
  } catch (e) {}

  // 5. Standard Permissions Query (avoid automation permission overrides)
  try {
    if (navigator.permissions && navigator.permissions.query) {
      const origQuery = navigator.permissions.query.bind(navigator.permissions);
      navigator.permissions.query = function (parameters) {
        if (parameters && parameters.name === 'notifications') {
          return Promise.resolve({
            state: 'default',
            onchange: null,
            name: 'notifications',
            addEventListener: function () {},
            removeEventListener: function () {},
            dispatchEvent: function () { return true; },
          });
        }
        return origQuery(parameters);
      };
    }
  } catch (e) {}
})();
