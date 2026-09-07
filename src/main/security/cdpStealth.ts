import { WebContents } from 'electron';
import { SessionProfileManager } from './antiDetection.js';

export class CdpCompatibilityManager {
  /**
   * Applies browser profile alignment scripts via safe execution and DevTools Protocol hooks
   * without interfering with guest view navigation.
   */
  public static async attachCompatibility(webContents: WebContents): Promise<void> {
    if (!webContents || webContents.isDestroyed()) return;

    const script = SessionProfileManager.getPreloadCompatibilityScript();

    webContents.on('dom-ready', () => {
      try {
        if (!webContents.isDestroyed()) {
          webContents.executeJavaScript(script, true).catch(() => {});
        }
      } catch {}
    });
  }

  public static async attachStealth(webContents: WebContents): Promise<void> {
    return this.attachCompatibility(webContents);
  }
}

export const CdpStealthManager = CdpCompatibilityManager;
