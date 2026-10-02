/** All geometry is in Electron/CSS device-independent pixels. */
export interface WindowLayout {
  mainPaneWidth: number;
  drawerOpen: boolean;
  isCompact: boolean;
  revision: number;
}

export interface DrawerOpenResult {
  presentation: 'inline' | 'window';
  layout: WindowLayout;
}

export const MAIN_PANE_WIDTH = 480;
export const BROWSER_WIDTH = 700;
export const MIN_BROWSER_WIDTH = 320;

export function appUiScale(width: number): number {
  return Math.min(1.25, Math.max(1, 1 + (width - MAIN_PANE_WIDTH) / 960));
}
