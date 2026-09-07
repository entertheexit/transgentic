// Injected into guest webview contexts for browser profile compatibility and DOM readiness
(function () {
  'use strict';

  // 1. Neutralize navigator.webdriver
  try {
    Object.defineProperty(navigator, 'webdriver', {
      get: () => undefined,
      configurable: true,
      enumerable: true,
    });
    delete (navigator as any).__proto__.webdriver;
  } catch (e) {}

  // 2. Dynamic Host OS Languages
  try {
    const hostLocale = typeof Intl !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().locale : 'en-US';
    const langList = Array.from(new Set([hostLocale, 'en-US', 'en']));
    Object.defineProperty(navigator, 'languages', {
      get: () => Object.freeze(langList),
      configurable: true,
      enumerable: true,
    });
    Object.defineProperty(navigator, 'language', {
      get: () => hostLocale,
      configurable: true,
      enumerable: true,
    });
  } catch (e) {}

  // 3. Hardware Concurrency & Memory Defaults
  try {
    Object.defineProperty(navigator, 'hardwareConcurrency', {
      get: () => 8,
      configurable: true,
      enumerable: true,
    });
    Object.defineProperty(navigator, 'deviceMemory', {
      get: () => 8,
      configurable: true,
      enumerable: true,
    });
  } catch (e) {}

  // 4. Mock window.chrome Runtime Objects
  try {
    const w = window as any;
    if (!w.chrome) {
      w.chrome = {};
    }

    w.chrome.app = {
      isInstalled: false,
      InstallState: { DISABLED: 'disabled', INSTALLED: 'installed', NOT_INSTALLED: 'not_installed' },
      RunningState: { CANNOT_RUN: 'cannot_run', READY_TO_RUN: 'ready_to_run', RUNNING: 'running' },
      getIsInstalled: () => false,
      getDetails: () => null,
    };

    w.chrome.runtime = {
      OnInstalledReason: { CHROME_UPDATE: 'chrome_update', INSTALL: 'install', SHARED_MODULE_UPDATE: 'shared_module_update', UPDATE: 'update' },
      OnRestartRequiredReason: { APP_UPDATE: 'app_update', OS_UPDATE: 'os_update', PERIODIC: 'periodic' },
      PlatformArch: { ARM: 'arm', ARM64: 'arm64', MIPS: 'mips', MIPS64: 'mips64', X86_32: 'x86-32', X86_64: 'x86-64' },
      PlatformNaclArch: { ARM: 'arm', MIPS: 'mips', MIPS64: 'mips64', X86_32: 'x86-32', X86_64: 'x86-64' },
      PlatformOs: { ANDROID: 'android', CROS: 'cros', LINUX: 'linux', MAC: 'mac', OPENBSD: 'openbsd', WIN: 'win' },
      RequestUpdateCheckStatus: { NO_UPDATE: 'no_update', THROTTLED: 'throttled', UPDATE_AVAILABLE: 'update_available' },
      connect: function () {
        return {
          disconnect: function () {},
          name: '',
          onDisconnect: { addListener: function () {}, removeListener: function () {} },
          onMessage: { addListener: function () {}, removeListener: function () {} },
          postMessage: function () {},
        };
      },
      sendMessage: function () {},
    };

    w.chrome.loadTimes = function () {
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

    w.chrome.csi = function () {
      return {
        onloadT: Date.now(),
        pageT: performance.now(),
        startE: Date.now() - performance.now(),
        tran: 15,
      };
    };
  } catch (e) {}

  // 5. Mock navigator.plugins and navigator.mimeTypes (Chrome Desktop Spec)
  try {
    const rawPlugins = [
      {
        name: 'PDF Viewer',
        filename: 'internal-pdf-viewer',
        description: 'Portable Document Format',
        mimeTypes: [
          { type: 'application/pdf', suffixes: 'pdf', description: 'Portable Document Format' },
          { type: 'text/pdf', suffixes: 'pdf', description: 'Portable Document Format' },
        ],
      },
      {
        name: 'Chrome PDF Viewer',
        filename: 'internal-pdf-viewer',
        description: 'Portable Document Format',
        mimeTypes: [
          { type: 'application/pdf', suffixes: 'pdf', description: 'Portable Document Format' },
          { type: 'text/pdf', suffixes: 'pdf', description: 'Portable Document Format' },
        ],
      },
      {
        name: 'Chromium PDF Viewer',
        filename: 'internal-pdf-viewer',
        description: 'Portable Document Format',
        mimeTypes: [
          { type: 'application/pdf', suffixes: 'pdf', description: 'Portable Document Format' },
          { type: 'text/pdf', suffixes: 'pdf', description: 'Portable Document Format' },
        ],
      },
      {
        name: 'Microsoft Edge PDF Viewer',
        filename: 'internal-pdf-viewer',
        description: 'Portable Document Format',
        mimeTypes: [
          { type: 'application/pdf', suffixes: 'pdf', description: 'Portable Document Format' },
          { type: 'text/pdf', suffixes: 'pdf', description: 'Portable Document Format' },
        ],
      },
      {
        name: 'WebKit built-in PDF',
        filename: 'internal-pdf-viewer',
        description: 'Portable Document Format',
        mimeTypes: [
          { type: 'application/pdf', suffixes: 'pdf', description: 'Portable Document Format' },
          { type: 'text/pdf', suffixes: 'pdf', description: 'Portable Document Format' },
        ],
      },
    ];

    const pluginsArray: any = [];
    const mimeTypesArray: any = [];

    rawPlugins.forEach((p, idx) => {
      const pluginObj: any = {
        name: p.name,
        filename: p.filename,
        description: p.description,
        length: p.mimeTypes.length,
        item: (i: number) => pluginObj[i] || null,
        namedItem: (n: string) => (pluginObj[n] ? pluginObj[n] : null),
      };

      p.mimeTypes.forEach((m, mIdx) => {
        const mimeObj: any = {
          type: m.type,
          suffixes: m.suffixes,
          description: m.description,
          enabledPlugin: pluginObj,
        };
        pluginObj[mIdx] = mimeObj;
        pluginObj[m.type] = mimeObj;

        mimeTypesArray.push(mimeObj);
        mimeTypesArray[m.type] = mimeObj;
      });

      pluginsArray.push(pluginObj);
      pluginsArray[p.name] = pluginObj;
    });

    pluginsArray.item = (i: number) => pluginsArray[i] || null;
    pluginsArray.namedItem = (n: string) => pluginsArray[n] || null;
    pluginsArray.refresh = () => {};

    mimeTypesArray.item = (i: number) => mimeTypesArray[i] || null;
    mimeTypesArray.namedItem = (n: string) => mimeTypesArray[n] || null;

    Object.defineProperty(navigator, 'plugins', {
      get: () => pluginsArray,
      configurable: true,
      enumerable: true,
    });

    Object.defineProperty(navigator, 'mimeTypes', {
      get: () => mimeTypesArray,
      configurable: true,
      enumerable: true,
    });
  } catch (e) {}

  console.log('[Transgentic Guest Session] Browser compatibility preload initialized.');
})();
