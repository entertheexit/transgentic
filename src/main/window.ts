import { BrowserWindow, screen, app, Menu, MenuItem } from 'electron';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class WindowManager {
  private mainWindow: BrowserWindow | null = null;
  private isPinned: boolean = false;
  private isDrawerOpen: boolean = false;
  public isQuitting: boolean = false;

  public createMainWindow(): BrowserWindow {
    const primaryDisplay = screen.getPrimaryDisplay();
    const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize;

    // Center window initially
    const width = 480;
    const height = 706;
    const x = Math.floor((screenWidth - width) / 2);
    const y = Math.floor((screenHeight - height) / 2);

    const preloadPath = fs.existsSync(path.join(__dirname, 'preload', 'mainPreload.cjs'))
      ? path.join(__dirname, 'preload', 'mainPreload.cjs')
      : path.join(__dirname, 'preload', 'mainPreload.js');

    this.mainWindow = new BrowserWindow({
      width,
      height,
      x,
      y,
      show: true,
      frame: false,
      transparent: true,
      backgroundColor: '#00000000',
      vibrancy: 'popover',
      visualEffectState: 'active',
      hasShadow: true,
      resizable: true,
      minWidth: 480,
      minHeight: 520,
      alwaysOnTop: this.isPinned,
      title: 'Transgentic Hub',
      webPreferences: {
        preload: preloadPath,
        nodeIntegration: false,
        contextIsolation: true,
        webviewTag: true,
      },
    });

    const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged || !!process.env.VITE_DEV_SERVER_URL;

    // Attach right-click context menu for DevTools in development mode
    if (isDev) {
      this.mainWindow.webContents.on('context-menu', (_, params) => {
        const menu = new Menu();
        menu.append(
          new MenuItem({
            label: 'Inspect Element',
            click: () => {
              this.mainWindow?.webContents.inspectElement(params.x, params.y);
              if (!this.mainWindow?.webContents.isDevToolsOpened()) {
                this.mainWindow?.webContents.openDevTools({ mode: 'detach' });
              }
            },
          })
        );
        menu.append(
          new MenuItem({
            label: 'Toggle Developer Tools',
            click: () => {
              this.mainWindow?.webContents.toggleDevTools();
            },
          })
        );
        menu.append(new MenuItem({ type: 'separator' }));
        menu.append(
          new MenuItem({
            label: 'Reload App',
            click: () => {
              this.mainWindow?.webContents.reload();
            },
          })
        );
        menu.popup();
      });
    }

    // Pipe renderer logs to terminal for debugging
    this.mainWindow.webContents.on('console-message', (e, level, message, line, sourceId) => {
      console.log(`[Renderer Log] ${message}`);
    });

    this.mainWindow.webContents.on('did-fail-load', (e, errorCode, errorDesc, validatedURL) => {
      console.error(`[Renderer Failed Load] Code: ${errorCode}, Desc: ${errorDesc}, URL: ${validatedURL}`);
    });

    const localDist = path.join(process.cwd(), 'dist', 'index.html');
    const relativeDist = path.join(__dirname, '../../dist/index.html');
    const distPath = fs.existsSync(localDist) ? localDist : relativeDist;

    if (process.env.VITE_DEV_SERVER_URL) {
      this.mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL).catch(() => {
        if (fs.existsSync(distPath)) {
          this.mainWindow?.loadFile(distPath);
        }
      });
    } else if (fs.existsSync(distPath)) {
      this.mainWindow.loadFile(distPath);
    } else {
      this.mainWindow.loadURL('http://localhost:5173').catch(() => {
        if (fs.existsSync(distPath)) {
          this.mainWindow?.loadFile(distPath);
        }
      });
    }

    this.mainWindow.once('ready-to-show', () => {
      this.mainWindow?.show();
      this.mainWindow?.focus();
    });

    // Intercept window close to keep background MCP servers and Webviews active
    this.mainWindow.on('close', (event) => {
      if (!this.isQuitting) {
        event.preventDefault();
        this.mainWindow?.hide();
      }
    });

    return this.mainWindow;
  }

  public getMainWindow(): BrowserWindow | null {
    return this.mainWindow;
  }

  public setDrawerState(open: boolean): void {
    this.isDrawerOpen = open;
    if (!this.mainWindow) return;

    const bounds = this.mainWindow.getBounds();
    if (open) {
      const targetWidth = 1180; // 480px hub + 700px browser drawer = 1180px total
      const targetHeight = 706;
      const newX = Math.max(20, bounds.x - (targetWidth - bounds.width));
      this.mainWindow.setBounds(
        {
          x: newX,
          y: bounds.y,
          width: targetWidth,
          height: targetHeight,
        },
        true
      );
    } else {
      const newX = bounds.x + (bounds.width - 480);
      this.mainWindow.setBounds(
        {
          x: newX,
          y: bounds.y,
          width: 480,
          height: 706,
        },
        true
      );
    }
  }

  private previousBounds: { width: number; height: number; x: number; y: number } | null = null;
  private previousPinnedBeforeCompact: boolean = false;
  private isCompact: boolean = false;

  public setCompactMode(compact: boolean): { isCompact: boolean; isPinned: boolean } {
    if (!this.mainWindow) return { isCompact: false, isPinned: this.isPinned };
    this.isCompact = compact;

    if (compact) {
      this.previousBounds = this.mainWindow.getBounds();
      this.previousPinnedBeforeCompact = this.isPinned;
      
      // Auto-pin to top in compact mode
      this.isPinned = true;
      this.mainWindow.setAlwaysOnTop(true, 'floating');
      this.mainWindow.setMinimumSize(320, 84);
      
      const compactWidth = 320;
      const compactHeight = 84;
      
      this.mainWindow.setBounds({
        x: this.previousBounds.x + Math.floor((this.previousBounds.width - compactWidth) / 2),
        y: this.previousBounds.y,
        width: compactWidth,
        height: compactHeight,
      }, true);
      this.mainWindow.setSize(compactWidth, compactHeight, true);
    } else {
      // Restore previous pinned state
      this.isPinned = this.previousPinnedBeforeCompact;
      this.mainWindow.setAlwaysOnTop(this.isPinned);
      this.mainWindow.setMinimumSize(480, 520);
      
      const targetWidth = this.previousBounds ? this.previousBounds.width : 480;
      const targetHeight = this.previousBounds ? this.previousBounds.height : 706;
      const targetX = this.previousBounds ? this.previousBounds.x : undefined;
      const targetY = this.previousBounds ? this.previousBounds.y : undefined;
      
      this.mainWindow.setBounds({
        x: targetX,
        y: targetY,
        width: targetWidth,
        height: targetHeight,
      }, true);
    }

    return { isCompact: this.isCompact, isPinned: this.isPinned };
  }

  public togglePin(): boolean {
    if (!this.mainWindow) return this.isPinned;
    this.isPinned = !this.isPinned;
    this.mainWindow.setAlwaysOnTop(this.isPinned);
    return this.isPinned;
  }

  public show(): void {
    if (this.mainWindow) {
      this.mainWindow.show();
      this.mainWindow.focus();
    }
  }

  public hide(): void {
    this.mainWindow?.hide();
  }

  public minimize(): void {
    this.mainWindow?.minimize();
  }
}

export const globalWindowManager = new WindowManager();
