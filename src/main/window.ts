import { BrowserWindow, screen, app, Menu, MenuItem } from 'electron';
import path from 'path';
import fs from 'fs';
import { MAIN_PANE_WIDTH, BROWSER_WIDTH, MIN_BROWSER_WIDTH, type WindowLayout } from '../shared/windowLayout.js';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class WindowManager {
  private mainWindow: BrowserWindow | null = null;
  private isPinned: boolean = false;
  private isDrawerOpen: boolean = false;
  public isQuitting: boolean = false;
  private mainPaneWidth = MAIN_PANE_WIDTH;
  private layoutRevision = 0;

  public getWindowLayout(): WindowLayout {
    return { mainPaneWidth: this.mainPaneWidth, drawerOpen: this.isDrawerOpen,
      isCompact: this.isCompact, revision: this.layoutRevision };
  }

  private publishLayout(): void {
    this.layoutRevision++;
    this.mainWindow?.webContents.send('window-layout-changed', this.getWindowLayout());
  }

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
      vibrancy: process.platform === 'darwin' ? 'popover' : undefined,
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

    this.mainWindow.on('resize', () => {
      if (!this.isCompact && !this.isDrawerOpen) {
        this.mainPaneWidth = this.mainWindow!.getContentBounds().width;
      }
      this.publishLayout();
    });
    this.mainPaneWidth = this.mainWindow.getContentBounds().width;
    return this.mainWindow;
  }

  public getMainWindow(): BrowserWindow | null {
    return this.mainWindow;
  }

  public setDrawerState(open: boolean): boolean {
    if (!this.mainWindow || this.isCompact) return false;
    if (open === this.isDrawerOpen) return true;

    const bounds = this.mainWindow.getBounds();
    if (open) {
      const mainWidth = this.mainWindow.getContentBounds().width;
      const workArea = screen.getDisplayMatching(bounds).workArea;
      const availableWidth = this.mainWindow.isMaximized() ? bounds.width : workArea.width;
      const browserWidth = Math.min(BROWSER_WIDTH, availableWidth - bounds.width);
      if (browserWidth < MIN_BROWSER_WIDTH) return false;
      this.mainPaneWidth = mainWidth;
      this.isDrawerOpen = true;
      const width = bounds.width + browserWidth;
      const x = Math.max(workArea.x, Math.min(bounds.x, workArea.x + workArea.width - width));
      this.mainWindow.setMinimumSize(bounds.width + MIN_BROWSER_WIDTH, 520);
      this.mainWindow.setBounds({ ...bounds, x, width });
    } else {
      this.isDrawerOpen = false;
      this.mainWindow.setMinimumSize(MAIN_PANE_WIDTH, 520);
      const frameWidth = bounds.width - this.mainWindow.getContentBounds().width;
      this.mainWindow.setBounds({ ...bounds, width: this.mainPaneWidth + frameWidth });
    }
    this.publishLayout();
    return true;
  }

  private previousBounds: { width: number; height: number; x: number; y: number } | null = null;
  private previousPinnedBeforeCompact: boolean = false;
  private isCompact: boolean = false;

  public setCompactMode(compact: boolean): { isCompact: boolean; isPinned: boolean } {
    if (!this.mainWindow) return { isCompact: false, isPinned: this.isPinned };
    if (compact === this.isCompact) return { isCompact: this.isCompact, isPinned: this.isPinned };
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
      this.mainWindow.setMinimumSize(this.isDrawerOpen ? this.mainPaneWidth + MIN_BROWSER_WIDTH : MAIN_PANE_WIDTH, 520);
      
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

    this.publishLayout();
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
