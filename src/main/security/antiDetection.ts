import { execSync } from 'child_process';
import os from 'os';

/**
 * SessionProfileManager provides standard browser profile alignment
 * and host compatibility headers for local Chromium webviews.
 */
export class SessionProfileManager {
  private static cachedUserAgent: string | null = null;
  private static cachedChromeVersion: string | null = null;

  /**
   * Returns the embedded Chromium version when running inside Electron so that
   * User-Agent, Sec-CH-UA, navigator.userAgentData, and TLS/Blink fingerprints
   * stay 100% consistent. Outside Electron, discovers the host Chrome version.
   */
  public static getChromeVersion(): string {
    if (this.cachedChromeVersion) {
      return this.cachedChromeVersion;
    }

    const embeddedChrome = typeof process !== 'undefined' ? (process.versions as Record<string, string | undefined>)?.chrome : undefined;
    if (embeddedChrome && /^\d+\.\d+\.\d+\.\d+$/.test(embeddedChrome)) {
      this.cachedChromeVersion = embeddedChrome;
      return this.cachedChromeVersion;
    }

    const defaultFallback = '133.0.6943.126';
    let discoveredVersion: string | null = null;

    try {
      if (process.platform === 'darwin') {
        const macPaths = [
          '/Applications/Google\\ Chrome.app/Contents/MacOS/Google\\ Chrome --version',
          'defaults read /Applications/Google\\ Chrome.app/Contents/Info.plist CFBundleShortVersionString',
          '/Applications/Google\\ Chrome\\ Canary.app/Contents/MacOS/Google\\ Chrome\\ Canary --version',
          '~/Applications/Google\\ Chrome.app/Contents/MacOS/Google\\ Chrome --version',
        ];

        for (const cmd of macPaths) {
          try {
            const output = execSync(cmd, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'], timeout: 2000 });
            const match = output.match(/([\d\.]+)/);
            if (match && match[1] && match[1].includes('.')) {
              discoveredVersion = match[1].trim();
              break;
            }
          } catch {}
        }
      } else if (process.platform === 'win32') {
        const winCommands = [
          'reg query "HKLM\\Software\\Google\\Update\\Clients\\{8A69D345-D564-463c-AFF1-A69D9E530F96}" /v pv',
          'reg query "HKCU\\Software\\Google\\Chrome\\BLBeacon" /v version',
          'reg query "HKLM\\SOFTWARE\\WOW6432Node\\Google\\Update\\Clients\\{8A69D345-D564-463c-AFF1-A69D9E530F96}" /v pv',
        ];

        for (const cmd of winCommands) {
          try {
            const output = execSync(cmd, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'], timeout: 2000 });
            const match = output.match(/(?:pv|version)\s+REG_SZ\s+([\d\.]+)/i);
            if (match && match[1]) {
              discoveredVersion = match[1].trim();
              break;
            }
          } catch {}
        }
      } else if (process.platform === 'linux') {
        const linuxCommands = [
          'google-chrome --version',
          'google-chrome-stable --version',
          'chromium-browser --version',
          'chromium --version',
        ];

        for (const cmd of linuxCommands) {
          try {
            const output = execSync(cmd, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'], timeout: 2000 });
            const match = output.match(/Chrome\s+([\d\.]+)/i) || output.match(/([\d\.]+)/);
            if (match && match[1] && match[1].includes('.')) {
              discoveredVersion = match[1].trim();
              break;
            }
          } catch {}
        }
      }
    } catch {
      // Use fallback
    }

    this.cachedChromeVersion = discoveredVersion || defaultFallback;
    return this.cachedChromeVersion;
  }

  /**
   * Generates a standard desktop User-Agent matching the host platform.
   */
  public static getNormalizedUserAgent(): string {
    if (this.cachedUserAgent) {
      return this.cachedUserAgent;
    }

    const chromeVersion = this.getChromeVersion();
    const platform = process.platform;
    let osString = 'Macintosh; Intel Mac OS X 10_15_7';
    if (platform === 'win32') {
      osString = 'Windows NT 10.0; Win64; x64';
    } else if (platform === 'linux') {
      osString = 'X11; Linux x86_64';
    }

    this.cachedUserAgent = `Mozilla/5.0 (${osString}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chromeVersion} Safari/537.36`;
    return this.cachedUserAgent;
  }

  /**
   * Returns standard desktop User-Agent matching the host platform.
   */
  public static getOAuthUserAgent(): string {
    return this.getNormalizedUserAgent();
  }

  /**
   * Normalizes request headers for standard browser profile alignment.
   * If a custom/synced User-Agent is provided, aligns Sec-CH-UA client hints
   * with the Chrome version present in that User-Agent.
   */
  public static sanitizeHeaders(
    headers: Record<string, string | string[]>,
    customUA?: string
  ): Record<string, string | string[]> {
    const sanitized: Record<string, string | string[]> = {};
    const normalizedUA = (customUA && customUA.trim()) || this.getNormalizedUserAgent();

    // Extract Chrome version from the effective User-Agent, or fallback to detected host version
    const chromeMatch = normalizedUA.match(/Chrome\/([\d\.]+)/);
    const chromeVer = chromeMatch ? chromeMatch[1] : this.getChromeVersion();
    const majorVer = chromeVer.split('.')[0];

    const isWin = normalizedUA.includes('Windows');
    const isMac = normalizedUA.includes('Macintosh') || normalizedUA.includes('Mac OS X');
    const platformStr = isWin ? '"Windows"' : isMac ? '"macOS"' : '"Linux"';

    for (const [key, value] of Object.entries(headers)) {
      const lowerKey = key.toLowerCase();

      if (lowerKey.startsWith('x-electron') || lowerKey.startsWith('sec-electron')) {
        continue;
      }

      if (lowerKey === 'user-agent') {
        sanitized[key] = normalizedUA;
      } else if (lowerKey === 'sec-ch-ua') {
        sanitized[key] = `"Google Chrome";v="${majorVer}", "Chromium";v="${majorVer}", "Not=A?Brand";v="24"`;
      } else if (lowerKey === 'sec-ch-ua-mobile') {
        sanitized[key] = '?0';
      } else if (lowerKey === 'sec-ch-ua-platform') {
        sanitized[key] = platformStr;
      } else if (typeof value === 'string' && value.includes('Electron/')) {
        sanitized[key] = value.replace(/Electron\/[\d\.]+\s*/g, '');
      } else {
        sanitized[key] = value;
      }
    }

    // Ensure Client Hints are always present for anti-detection parity
    if (!sanitized['sec-ch-ua'] && !sanitized['Sec-CH-UA']) {
      sanitized['sec-ch-ua'] = `"Google Chrome";v="${majorVer}", "Chromium";v="${majorVer}", "Not=A?Brand";v="24"`;
    }
    if (!sanitized['sec-ch-ua-mobile'] && !sanitized['Sec-CH-UA-Mobile']) {
      sanitized['sec-ch-ua-mobile'] = '?0';
    }
    if (!sanitized['sec-ch-ua-platform'] && !sanitized['Sec-CH-UA-Platform']) {
      sanitized['sec-ch-ua-platform'] = platformStr;
    }

    return sanitized;
  }

  /**
   * Minimal non-invasive browser compatibility script.
   * Avoid mutating Navigator.prototype, adding own properties to navigator, or
   * injecting synthetic window.chrome functions — Electron with
   * --disable-blink-features=AutomationControlled already exposes native
   * navigator.webdriver === false, PluginArray, languages, and hardware info.
   */
  public static getPreloadCompatibilityScript(): string {
    return `
      (function() {
        // Only patch navigator.webdriver if a runtime explicitly left it true.
        try {
          if (navigator.webdriver === true) {
            Object.defineProperty(Navigator.prototype, 'webdriver', {
              get: () => false,
              configurable: true,
              enumerable: true,
            });
          }
        } catch (e) {}
      })();
    `;
  }

  public static getStealthScript(): string {
    return this.getPreloadCompatibilityScript();
  }
}

// Backwards compatibility alias
export const AntiDetectionManager = SessionProfileManager;
