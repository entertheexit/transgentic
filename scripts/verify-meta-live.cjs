/** Authenticated Meta E2E workbench. Uses a disposable profile and production MCP/adapter code.
 * Start after build:electron, then use Transgentic Sync to sync the signed-in Meta tab.
 * Wait for ready, then write {id, action:'status'|'open'|'probe'|'run'|'cancel'|'quit', tool?, args?}.
 * Test-only recipe overrides may be supplied in the disposable profile's recipe-overrides.json.
 * Cookies remain inside the disposable Electron profile and are never exported to logs.
 */
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const resume = process.env.TRANSGENTIC_META_PROFILE;
if (resume && (!path.basename(resume).startsWith('transgentic-meta-live-') || !fs.existsSync(resume))) {
  throw new Error('Only an existing Meta verification profile can be resumed.');
}
const profile = resume || fs.mkdtempSync(path.join(os.tmpdir(), 'transgentic-meta-live-'));
app.setPath('userData', profile);
const work = path.join(profile, 'work');
fs.mkdirSync(work, { recursive: true });
process.chdir(work);
const control = path.join(profile, 'control.json');
const state = path.join(profile, 'state.json');
const safeError = error => String(error?.message || error).replace(/https?:\/\/[^\s"']+/g, '[url]').slice(0, 3000);
app.whenReady().then(async () => {
  const { globalAssetManager } = await import('../dist-electron/main/storage/assetManager.js');
  globalAssetManager.setAssetsDirectory(path.join(profile, 'assets'));
  const { globalRecipeManager } = await import('../dist-electron/main/registry/recipeManager.js');
  globalRecipeManager.setStorageDirectory(path.join(profile, 'assets'));
  const { globalSessionManager } = await import('../dist-electron/main/webviews/sessionManager.js');
  const { CustomRecipeAdapter } = await import('../dist-electron/main/webviews/customRecipeAdapter.js');
  const { BUILTIN_RECIPES } = await import('../dist-electron/shared/types/recipe.js');
  const { ServiceManifestManager } = await import('../dist-electron/main/registry/serviceManifest.js');
  const { AccountRegistryManager } = await import('../dist-electron/main/registry/accountRegistry.js');
  const { ModelRegistryManager } = await import('../dist-electron/main/registry/modelRegistry.js');
  const { TransgenticMcpServer } = await import('../dist-electron/main/mcp/server.js');
  AccountRegistryManager.initialize();
  ServiceManifestManager.loadManifest();
  ModelRegistryManager.loadPersistedRegistry();
  const recipe = structuredClone(BUILTIN_RECIPES.meta);
  const overridesPath = path.join(profile, 'recipe-overrides.json');
  if (fs.existsSync(overridesPath)) {
    const overrides = JSON.parse(fs.readFileSync(overridesPath, 'utf8'));
    for (const [mode, config] of Object.entries(overrides)) {
      if (recipe.response.modes[mode]) Object.assign(recipe.response.modes[mode], config);
    }
  }
  const adapter = new CustomRecipeAdapter(recipe);
  globalSessionManager.registerAdapter(adapter);
  const service = ServiceManifestManager.getManifest().services.meta;
  service.models[0].modes = ['general', 'coding', 'image', 'video'];
  const sess = globalSessionManager.configureSession(adapter.partition);
  const win = new BrowserWindow({ width: 1280, height: 900, title: 'Transgentic Meta AI verification', webPreferences: { session: sess, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false } });
  adapter.setWebContents(win.webContents);
  await win.loadURL(recipe.url);
  const server = new TransgenticMcpServer(58420);
  await server.start();
  const writeState = value => fs.writeFileSync(state, JSON.stringify(value, null, 2));
  writeState({ stage: 'ready', profile, control, authenticated: await adapter.checkAuthStatus() });
  console.log(JSON.stringify({ stage: 'ready', profile, control, state }));
  let previous;
  try { previous = JSON.parse(fs.readFileSync(control, 'utf8')).id; } catch {}
  let busy = false;
  let activeRequest;
  setInterval(async () => {
    if (!fs.existsSync(control)) return;
    let command;
    try { command = JSON.parse(fs.readFileSync(control, 'utf8')); } catch { return; }
    if (command.id === previous) return;
    if (command.action === 'cancel') { previous = command.id; activeRequest?.abort(); return; }
    if (command.action === 'probe') {
      previous = command.id;
      const observations = [];
      for (const window of BrowserWindow.getAllWindows()) {
        try {
          const observation = await window.webContents.executeJavaScript(`({ path: location.pathname, assistants: Array.from(document.querySelectorAll('[data-testid="assistant-message"]')).map(e => ({ text: e.querySelector('.prose')?.textContent?.slice(0,300), visible: e.getClientRects().length > 0 })), composer: document.querySelector('[data-testid="composer-input"]')?.textContent?.slice(0,200), stop: !!document.querySelector('[data-testid="composer-stop-button"]') })`);
          observations.push(observation);
        } catch {}
      }
      fs.writeFileSync(path.join(profile, 'probe.json'), JSON.stringify(observations, null, 2));
      return;
    }
    if (busy) return;
    previous = command.id;
    busy = true;
    try {
      await globalSessionManager.refreshProviderStatus('meta');
      if (command.action === 'open') {
        await win.loadURL(recipe.url);
        writeState({ id: command.id, stage: 'opened', authenticated: await adapter.checkAuthStatus() });
      } else if (command.action === 'status') {
        writeState({ id: command.id, stage: 'status', authenticated: await adapter.checkAuthStatus(), url: new URL(win.webContents.getURL()).origin, capabilities: server.getMediaCapabilities() });
      } else if (command.action === 'run') {
        writeState({ id: command.id, stage: 'running', tool: command.tool });
        activeRequest = new AbortController();
        const timeout = setTimeout(() => activeRequest.abort(), 420000);
        let result;
        try { result = await server.executeMcpTool(command.tool, command.args || {}, 'meta', activeRequest.signal); }
        finally { clearTimeout(timeout); activeRequest = undefined; }
        writeState({ id: command.id, stage: 'done', result });
      } else if (command.action === 'quit') {
        await sess.cookies.flushStore();
        await server.stop();
        win.destroy();
        app.exit(0);
      }
    } catch (error) { writeState({ id: command.id, stage: 'error', error: safeError(error) }); }
    finally { busy = false; }
  }, 500);
}).catch(error => { console.error(safeError(error)); app.exit(1); });
