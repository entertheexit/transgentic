/** Local Electron E2E: no provider sign-in, visible page, or external service needed. */
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const assert = require('node:assert/strict');
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'transgentic-availability-'));
app.setPath('userData', profile);
app.on('window-all-closed', () => {});
fs.mkdirSync(path.join(profile, 'work'));
process.chdir(path.join(profile, 'work'));
app.whenReady().then(async () => {
  let activations = 0;
  const server = http.createServer((req, res) => {
    if (req.url === '/activated') { activations++; res.end('unexpected activation'); return; }
    assert.ok(req.headers.cookie?.includes('probe_fixture=authenticated'));
    res.setHeader('content-type', 'text/html');
    res.end(`<html><body><script>setTimeout(() => { document.body.innerHTML = '<div id="account">Signed in fixture</div><button id="toggle">Temporary chat</button><div id="composer" contenteditable="true"></div>'; document.querySelector('#toggle').onclick = () => fetch('/activated'); }, 150)</script></body></html>`);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const { globalAssetManager } = await import('../dist-electron/main/storage/assetManager.js');
    globalAssetManager.setAssetsDirectory(path.join(profile, 'assets'));
    const { AccountRegistryManager } = await import('../dist-electron/main/registry/accountRegistry.js');
    const { SessionManager } = await import('../dist-electron/main/webviews/sessionManager.js');
    const { CustomRecipeAdapter } = await import('../dist-electron/main/webviews/customRecipeAdapter.js');
    AccountRegistryManager.initialize();
    const id = 'custom_availability_fixture';
    const partition = 'persist:availability_fixture';
    const url = `http://127.0.0.1:${server.address().port}/`;
    const adapter = new CustomRecipeAdapter({
      id, version: '1.0.0', title: 'Availability fixture', domainMatch: '127.0.0.1', url, newChatUrl: url, partition,
      authStrategy: 'cookie_sync', auth: { requireLoggedInSelector: true, loggedInSelector: '#account' },
      selectors: { inputPrompt: '#composer', submitButton: '#send' },
      response: { modes: { text: { enabled: true, mediaKind: 'text' } } },
      temporaryChat: { enabled: true, activationSteps: [{ action: 'click', target: { selectors: '#toggle' } }],
        activeWhen: { selectors: '#active' }, inactiveWhen: { selectors: '#toggle' } },
    });
    const manager = new SessionManager();
    manager.registerAdapter(adapter);
    AccountRegistryManager.setProviderPartition(id, partition);
    const session = manager.configureSession(partition);
    await session.cookies.set({ url, name: 'probe_fixture', value: 'authenticated' });
    const created = [];
    const onCreated = (_event, window) => { created.push(window); assert.equal(window.isVisible(), false); };
    app.on('browser-window-created', onCreated);
    assert.equal(adapter.getWebContents(), null);
    const first = manager.recheckTemporaryChatAvailability(id);
    assert.equal(manager.recheckTemporaryChatAvailability(id), first);
    const status = await first;
    assert.equal(status.temporaryChat.availability, 'available');
    assert.equal(status.temporaryChat.checking, false);
    assert.equal(adapter.getWebContents(), null);
    assert.equal(await adapter.verifyTemporaryChat(), false);
    assert.equal(created.length, 1);
    assert.equal(activations, 0);
    assert.ok(created.every(window => window.isDestroyed()));
    assert.equal(BrowserWindow.getAllWindows().length, 0);
    await manager.refreshProviderStatus(id);
    assert.equal(manager.getStatus(id).temporaryChat.availability, 'available');
    app.removeListener('browser-window-created', onCreated);
    // Exercise the same native menu event behavior used by ChatGPT's variant picker.
    const menuWindow = new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true } });
    try {
      await menuWindow.loadURL('data:text/html,' + encodeURIComponent(`<button aria-haspopup="menu">Unpersonalized</button><script>
        document.querySelector('button').addEventListener('pointerdown', () => {
          const option = document.createElement('div');
          option.setAttribute('role', 'menuitem'); option.textContent = 'Personalized';
          option.onclick = () => { document.querySelector('button').textContent = 'Personalized'; option.remove(); };
          document.body.append(option);
        });
      </script>`));
      const menuAdapter = new CustomRecipeAdapter(adapter.recipe);
      menuAdapter.setWebContents(menuWindow.webContents);
      await menuAdapter.executeClickStep({ action: 'click', target: { role: 'button', name: 'Unpersonalized' } });
      await menuAdapter.executeClickStep({ action: 'click', target: { selectors: '[role="menuitem"]', name: 'Personalized' } });
      assert.equal(await menuWindow.webContents.executeJavaScript('document.querySelector("button").textContent'), 'Personalized');
      assert.equal(menuWindow.isVisible(), false);
    } finally {
      menuWindow.destroy();
    }
    console.log('PASS: Hidden Electron check used the active session, waited for hydration, deduplicated requests, preserved the shared adapter, retained its result, and closed its window.');
    console.log('PASS: Hidden native menu activation dispatched pointer events and selected the requested personalization.');
    await new Promise(resolve => server.close(resolve));
    app.exit(0);
  } catch (error) {
    console.error(error);
    server.close();
    app.exit(1);
  }
}).catch(error => { console.error(error); app.exit(1); });
// Test ownership is limited to this exact disposable profile.
app.on('will-quit', () => { try { fs.rmSync(profile, { recursive: true, force: true }); } catch {} });
