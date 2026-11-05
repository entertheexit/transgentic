import type { BrowserWindow, WebContents } from 'electron';
import { CustomRecipeAdapter } from './customRecipeAdapter.js';

/** Bound provider DOM inspection without allowing late results to update status. */
export async function boundedTemporaryChatProbe<T>(inspect: () => Promise<T>, timeoutMs = 8_000): Promise<T | undefined> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      inspect(),
      new Promise<undefined>(resolve => { timer = setTimeout(() => resolve(undefined), timeoutMs); }),
    ]);
  } catch { return undefined; }
  finally { if (timer) clearTimeout(timer); }
}

/** Never let a late read attach to, or create, the shared execution view. */
class AvailabilityProbeAdapter extends CustomRecipeAdapter {
  constructor(source: CustomRecipeAdapter, private readonly target: WebContents, partition: string) {
    super(source.recipe);
    this.setCustomPartition(partition);
    this.setWebContents(target);
  }

  protected override async executeScript<T>(code: string): Promise<T> {
    if (this.target.isDestroyed()) throw new Error('Availability probe closed.');
    return this.target.executeJavaScript(code, false);
  }
}

/** Load and inspect only; this never activates Temporary Chat or submits input. */
export async function inspectTemporaryChatInBackground(
  source: CustomRecipeAdapter, window: BrowserWindow, partition: string, timeoutMs = 8_000,
): Promise<Awaited<ReturnType<CustomRecipeAdapter['inspectTemporaryChatAvailability']>> | undefined> {
  const probe = new AvailabilityProbeAdapter(source, window.webContents, partition);
  const deadline = Date.now() + Math.max(0, timeoutMs - 250);
  let closed = false;
  try {
    return await boundedTemporaryChatProbe(async () => {
      await window.loadURL(source.recipe.newChatUrl || source.url);
      let observed: Awaited<ReturnType<typeof probe.inspectTemporaryChatAvailability>> | undefined;
      // Hydration may temporarily hide account and Temporary Chat controls.
      while (!closed && !window.isDestroyed() && Date.now() < deadline) {
        observed = await probe.inspectTemporaryChatAvailability();
        if (observed.availability === 'available') return observed;
        await new Promise(resolve => setTimeout(resolve, 150));
      }
      return observed;
    }, timeoutMs);
  } finally {
    closed = true;
    if (!window.isDestroyed()) window.destroy();
  }
}
