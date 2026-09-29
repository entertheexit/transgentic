/** Real Chromium regression checks; run after npm run build:electron:
 * node_modules/.bin/electron scripts/verify-provider-dom.cjs
 * Uses only local HTML and an isolated, disposable browser profile.
 */
const { app, BrowserWindow } = require('electron');
const { mkdtempSync, rmSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const assert = require('node:assert/strict');
const profile = mkdtempSync(join(tmpdir(), 'transgentic-dom-'));
app.setPath('userData', profile);
app.whenReady().then(async () => {
  const { CustomRecipeAdapter } = await import('../dist-electron/main/webviews/customRecipeAdapter.js');
  const { HealingManager } = await import('../dist-electron/main/healing/healingManager.js');
  const { DomObserver } = await import('../dist-electron/main/webviews/domObserver.js');
  const { BUILTIN_RECIPES } = await import('../dist-electron/shared/types/recipe.js');
  const { InputDispatcher } = await import('../dist-electron/main/security/inputDispatcher.js');
  const win = new BrowserWindow({ show: false, webPreferences: { nodeIntegration: false, contextIsolation: true } });
  let checks = 0;
  const inspect = async (provider, html, expected) => {
    await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
    const result = await win.webContents.executeJavaScript(DomObserver.getInspectionScript(provider, 'general', BUILTIN_RECIPES[provider]));
    assert.equal(result.error, undefined);
    assert.equal(result.text, expected);
    checks++;
  };
  try {
    for (const width of [390, 1280]) {
      win.setContentSize(width, 844);
      await inspect('chatgpt', `<main><div data-content-search-unit-key="turn:user"><h4 data-conversation-role="user">You said:</h4><p>USER SENTINEL</p></div><div data-content-search-unit-key="turn:assistant"><h4 data-conversation-role="assistant">ChatGPT said:</h4><div data-markdown-text-style="assistant-message"><p>Current answer</p><details>HIDDEN REASONING</details></div></div><div data-content-search-unit-key="next:user"><h4 data-conversation-role="user">You said:</h4><p>NEW USER SENTINEL</p></div></main>`, 'Current answer');
      await inspect('chatgpt', `<main><article data-testid="conversation-turn-1"><div data-message-author-role="assistant"><div class="markdown">Legacy answer</div></div></article><div data-testid="conversation-turn-2"><div data-message-author-role="user">USER SENTINEL</div></div></main>`, 'Legacy answer');
      await inspect('chatgpt', '<main><div data-content-search-unit-key="turn:user"><h4 data-conversation-role="user">You said:</h4><p>USER SENTINEL</p></div></main>', '');
      await inspect('grok', '<main><div data-testid="user-message">USER SENTINEL</div><div id="last-reply-container"><div id="response-one"><div class="streamdown-chat-md">Grok answer</div><button aria-label="Copy">Copy</button></div></div></main>', 'Grok answer');
      await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(`<form><button type="button" aria-label="Ask Grok" onclick="window.wrong=true">Model</button><button type="submit" aria-label="Submit" data-testid="chat-submit" style="display:none" onclick="window.wrong=true">Hidden submit</button><textarea aria-label="Ask Grok anything"></textarea><button type="submit" aria-label="Submit" data-testid="chat-submit">Send</button></form><script>window.submissions=0;document.querySelector('form').onsubmit=e=>{e.preventDefault();window.submissions++}</script>`));
      const submitted = await win.webContents.executeJavaScript(InputDispatcher.getSubmitScript(BUILTIN_RECIPES.grok.selectors.submitButton, BUILTIN_RECIPES.grok.selectors.inputPrompt));
      assert.equal(submitted.success, true);
      assert.deepEqual(await win.webContents.executeJavaScript('({count:window.submissions,wrong:!!window.wrong})'), { count: 1, wrong: false });
      checks++;
      // A navigation audit must never send Escape or click upload controls:
      // Claude cancels its in-flight response on Escape.
      await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(`<textarea>Keep draft</textarea><button aria-label="Stop response">Stop</button><button aria-label="Upload & tools" onclick="window.revealClicks++">Upload</button><script>window.revealClicks=0;window.cancelled=false;document.addEventListener('keydown',e=>{if(e.key==='Escape')window.cancelled=true})</script>`));
      const healer = new HealingManager();
      const beforeAudit = await win.webContents.executeJavaScript('document.body.innerHTML');
      const audit = await healer.auditProvider('gemini', win.webContents);
      assert.equal(audit.attachmentLandmarks['attachment.text.fileInput'].exists, false);
      assert.equal(audit.attachmentLandmarks['attachment.text.fileInput'].found, true);
      assert.deepEqual(await win.webContents.executeJavaScript('({cancelled:window.cancelled,revealClicks:window.revealClicks,draft:document.querySelector("textarea").value})'), {cancelled:false,revealClicks:0,draft:'Keep draft'});
      assert.equal(await win.webContents.executeJavaScript('document.body.innerHTML'), beforeAudit);
      checks++;
      const stagedPath = join(profile, 'sample.jpg');
      writeFileSync(stagedPath, 'local upload fixture');
      const attachment = { path: stagedPath, name: 'sample.jpg', mimeType: 'image/jpeg', kind: 'image', size: 20, sha256: 'fixture' };
      const uploadFixtures = {
        chatgpt: `<input type="file" aria-label="Attach photos or videos" accept="image/*,video/*"><input type="file" aria-label="Attach photos" accept="image/*"><input id="chosen" type="file" aria-label="Attach files"><div data-composer-attachments><div role="button" id="chip" style="display:none"><span role="progressbar" id="pending"></span><button aria-label="Remove sample.jpg">Remove</button></div></div>`,
        claude: `<input id="chosen" type="file" data-testid="file-upload"><div data-cds-attachment id="chip" style="display:none"><span role="status" id="pending">Loading</span><button data-cds-attachment-remove>Remove</button></div>`,
        gemini: `<button id="reveal" aria-label="Upload & tools">Upload</button><div id="inputs"></div><uploader-file-preview id="chip" style="display:none"><span role="progressbar" id="pending"></span><button aria-label="close attachment">Close</button></uploader-file-preview>`,
        grok: `<input id="chosen" type="file" accept="image/*">`,
      };
      for (const [provider, fixture] of Object.entries(uploadFixtures)) {
        await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(fixture + `<script>
          const install=()=>{document.querySelector('#chosen').onchange=e=>{
            window.chosenFiles=[...e.target.files].map(file=>file.name);
            const chip=document.querySelector('#chip');
            if(chip){chip.style.display='block';e.target.value='';setTimeout(()=>{document.querySelector('#pending').remove();window.uploadComplete=true},250)}
          }};
          const reveal=document.querySelector('#reveal');
          if(reveal)reveal.onclick=()=>{document.querySelector('#inputs').innerHTML='<uploader><input type="file" accept=".pdf,.txt"><input id="chosen" type="file" accept="image/*"></uploader>';install()};else install();
        </script>`));
        const adapter = new CustomRecipeAdapter(BUILTIN_RECIPES[provider]);
        adapter.setWebContents(win.webContents);
        await adapter.attachFiles(BUILTIN_RECIPES[provider].response.modes.text.inputAttachments, [attachment]);
        assert.deepEqual(await win.webContents.executeJavaScript('window.chosenFiles'), ['sample.jpg']);
        if(provider !== 'grok') assert.equal(await win.webContents.executeJavaScript('window.uploadComplete'), true);
        checks++;
      }
    }
    console.log(`PASS: ${checks} Chromium DOM checks at 390px and 1280px`);
    win.destroy();
    rmSync(profile, { recursive: true, force: true });
    app.exit(0);
  } catch (error) {
    console.error(error);
    app.exit(1);
  }
}).catch(error => { console.error(error); app.exit(1); });
app.on('will-quit', () => { try { rmSync(profile, { recursive: true, force: true }); } catch {} });
