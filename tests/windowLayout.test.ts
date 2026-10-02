import { beforeEach, describe, expect, it, vi } from 'vitest';
import { appUiScale } from '../src/shared/windowLayout.js';

const mock = vi.hoisted(() => ({ window: null as any, workArea: { x: 0, y: 0, width: 1920, height: 1080 } }));
vi.mock('electron', () => ({
  BrowserWindow: class {
    bounds = { x: 100, y: 80, width: 480, height: 706 };
    listeners: Record<string, Function[]> = {};
    minimum = [480, 520];
    maximized = false;
    webContents = { on: vi.fn(), send: vi.fn() };
    constructor() { mock.window = this; }
    on(name: string, fn: Function) { (this.listeners[name] ||= []).push(fn); }
    once() {}
    getBounds() { return { ...this.bounds }; }
    getContentBounds() { return this.getBounds(); }
    setBounds(bounds: any) { this.bounds = { ...this.bounds, ...bounds }; this.listeners.resize?.forEach(fn => fn()); }
    setSize(width: number, height: number) { this.setBounds({ width, height }); }
    setMinimumSize(...size: number[]) { this.minimum = size; }
    setAlwaysOnTop() {}
    isMaximized() { return this.maximized; }
    loadFile() { return Promise.resolve(); }
    loadURL() { return Promise.resolve(); }
  },
  screen: { getPrimaryDisplay: () => ({ workAreaSize: mock.workArea }), getDisplayMatching: () => ({ workArea: mock.workArea }) },
  app: { isPackaged: true }, Menu: class {}, MenuItem: class {},
}));
import { WindowManager } from '../src/main/window.js';

let manager: WindowManager;
beforeEach(() => {
  mock.workArea = { x: 0, y: 0, width: 1920, height: 1080 };
  manager = new WindowManager(); manager.createMainWindow();
});

describe('automatic UI scale', () => {
  it.each([[320, 1], [480, 1], [600, 1.125], [720, 1.25], [1200, 1.25]])('%ipx scales to %s', (width, scale) => {
    expect(appUiScale(width)).toBe(scale);
  });
});

describe('native pane geometry', () => {
  it('preserves expanded main width and height across browser resizing and closing', () => {
    mock.window.setBounds({ width: 720, height: 800 });
    expect(manager.setDrawerState(true)).toBe(true);
    expect(mock.window.getBounds()).toEqual({ x: 100, y: 80, width: 1420, height: 800 });
    expect(manager.getWindowLayout()).toMatchObject({ mainPaneWidth: 720, drawerOpen: true });
    mock.window.setBounds({ x: 200, width: 1600, height: 900 });
    expect(manager.getWindowLayout().mainPaneWidth).toBe(720);
    manager.setDrawerState(false);
    expect(mock.window.getBounds()).toEqual({ x: 200, y: 80, width: 720, height: 900 });
    expect(mock.window.minimum).toEqual([480, 520]);
  });
  it('does not add width on repeated opens or reset geometry on repeated closes', () => {
    manager.setDrawerState(true);
    const first = mock.window.getBounds();
    manager.setDrawerState(true);
    expect(mock.window.getBounds()).toEqual(first);
    manager.setDrawerState(false);
    mock.window.setBounds({ width: 600, height: 840 });
    manager.setDrawerState(false);
    expect(mock.window.getBounds()).toMatchObject({ width: 600, height: 840 });
  });
  it('repositions within the matching display and narrows only the browser', () => {
    mock.workArea = { x: -1400, y: 0, width: 1200, height: 900 };
    mock.window.setBounds({ x: -700, width: 720 });
    manager.setDrawerState(true);
    expect(mock.window.getBounds()).toMatchObject({ x: -1400, width: 1200 });
    expect(manager.getWindowLayout().mainPaneWidth).toBe(720);
    expect(mock.window.minimum).toEqual([1040, 520]);
  });
  it.each([true, false])('falls back without mutation when inline space is insufficient (maximized=%s)', maximized => {
    mock.workArea.width = 1000;
    mock.window.setBounds({ width: 720 }); mock.window.maximized = maximized;
    const before = mock.window.getBounds();
    expect(manager.setDrawerState(true)).toBe(false);
    expect(mock.window.getBounds()).toEqual(before);
    expect(manager.getWindowLayout().drawerOpen).toBe(false);
  });
  it.each([true, false])('restores standard geometry and scale after compact mode (drawer=%s)', drawer => {
    mock.window.setBounds({ width: 600, height: 850 });
    if (drawer) manager.setDrawerState(true);
    const before = mock.window.getBounds();
    manager.setCompactMode(true); manager.setCompactMode(true);
    expect(manager.getWindowLayout()).toMatchObject({ isCompact: true, mainPaneWidth: 600, drawerOpen: drawer });
    expect(manager.setDrawerState(true)).toBe(false);
    manager.setCompactMode(false);
    expect(mock.window.getBounds()).toEqual(before);
    expect(manager.getWindowLayout()).toMatchObject({ isCompact: false, mainPaneWidth: 600, drawerOpen: drawer });
    expect(mock.window.minimum).toEqual([drawer ? 920 : 480, 520]);
  });
  it('publishes revisioned layout changes after resizing', () => {
    const before = manager.getWindowLayout().revision;
    mock.window.setBounds({ width: 600 });
    expect(mock.window.webContents.send).toHaveBeenLastCalledWith('window-layout-changed', manager.getWindowLayout());
    expect(manager.getWindowLayout().revision).toBeGreaterThan(before);
  });
});
