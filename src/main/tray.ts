import { app, Menu, Tray, nativeImage, NativeImage } from 'electron';
import { globalMcpServer } from './mcp/server.js';
import { globalSessionManager } from './webviews/sessionManager.js';
import { RouteMode } from '../shared/types.js';

export class TrayManager {
  private tray: Tray | null = null;
  private onShowHubCallback: () => void;

  constructor(onShowHub: () => void) {
    this.onShowHubCallback = onShowHub;
  }

  public createTray(): void {
    // Generate a simple 16x16 icon in memory
    const icon = this.createDefaultIcon();
    this.tray = new Tray(icon);
    this.tray.setToolTip('Transgentic - Local MCP Bridge');

    this.updateContextMenu();

    // Note: Do not attach tray.on('click') so clicking the icon naturally opens
    // the system popover menu without unexpectedly showing the hub window.

    // Update tray menu whenever statuses change
    globalSessionManager.onStatusUpdate(() => this.updateContextMenu());
    globalMcpServer.onCoreStatus(() => this.updateContextMenu());
  }

  public updateContextMenu(): void {
    if (!this.tray) return;

    const core = globalMcpServer.getCoreStatus();
    const statuses = globalSessionManager.getAllStatuses();

    const providerItems = Object.values(statuses).map((p) => {
      const stateIcon = p.state === 'ready' ? '🟢' : p.state === 'rate_limited' ? '🟡' : '🔴';
      return {
        label: `${stateIcon} ${p.name}: ${p.state}`,
        enabled: false,
      };
    });

    const modes: RouteMode[] = ['general', 'coding', 'image', 'video', 'music'];
    const modeItems = modes.map((m) => ({
      label: m.toUpperCase(),
      type: 'radio' as const,
      checked: core.activeMode === m,
      click: () => globalMcpServer.setMode(m),
    }));

    const contextMenu = Menu.buildFromTemplate([
      { label: `Transgentic Hub (Port: ${core.port})`, enabled: false },
      { label: `State: ${core.state.toUpperCase()}`, enabled: false },
      { type: 'separator' },
      { label: 'Providers:', enabled: false },
      ...providerItems,
      { type: 'separator' },
      { label: 'Active Mode:', enabled: false },
      ...modeItems,
      { type: 'separator' },
      {
        label: 'Open Transgentic Hub',
        click: () => this.onShowHubCallback(),
      },
      {
        label: 'Quit Transgentic',
        click: () => {
          app.quit();
        },
      },
    ]);

    this.tray.setContextMenu(contextMenu);
  }

  private createDefaultIcon(): NativeImage {
    // Create a 16x16 circular monochrome tray icon
    const size = 16;
    const canvas = Buffer.alloc(size * size * 4);
    const center = size / 2;
    const radius = 6;

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const idx = (y * size + x) * 4;
        const dist = Math.sqrt((x - center) ** 2 + (y - center) ** 2);
        if (dist <= radius) {
          canvas[idx] = 255;     // R
          canvas[idx + 1] = 255; // G
          canvas[idx + 2] = 255; // B
          canvas[idx + 3] = dist > radius - 1 ? 180 : 255; // Alpha
        } else {
          canvas[idx + 3] = 0;
        }
      }
    }

    return nativeImage.createFromBuffer(canvas, { width: size, height: size });
  }

  public destroy(): void {
    if (this.tray) {
      this.tray.destroy();
      this.tray = null;
    }
  }
}
