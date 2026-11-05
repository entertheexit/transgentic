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
    if (provider === 'meta') assert.equal(result.isGenerating, false);
    checks++;
  };
  try {
    for (const width of [390, 1280]) {
      win.setContentSize(width, 844);
      // Meta retains hidden composers and completed thinking panels in the DOM.
      await inspect('meta', '<button aria-label="Cancel">Cancel rename</button><main><div data-testid="assistant-message"><div data-testid="thinking-status">Completed thinking</div><div data-testid="subagent-cot-list">PRIVATE REASONING</div><div class="prose ur-markdown">Meta answer</div><button aria-label="Copy response">Copy</button></div><div data-testid="assistant-message" style="display:none"><div class="prose ur-markdown">STALE ANSWER</div></div></main>', 'Meta answer');
      await win.loadURL('data:text/html,' + encodeURIComponent('<main><div data-testid="assistant-message"><div class="prose ur-markdown">Reference description</div><img src="blob:reference-preview"></div></main>'));
      const referencePreview = await win.webContents.executeJavaScript(DomObserver.getInspectionScript('meta', 'general', BUILTIN_RECIPES.meta));
      assert.equal(referencePreview.text, 'Reference description');
      assert.equal(referencePreview.mediaUrl, undefined);
      checks++;
      await win.loadURL('data:text/html,' + encodeURIComponent('<button data-testid="composer-stop-button">Stop</button><main><div data-testid="assistant-message"><img src="data:image/png;base64,preview"><video src="data:video/mp4;base64,loading"></video></div></main>'));
      const loadingVideo = await win.webContents.executeJavaScript(DomObserver.getInspectionScript('meta', 'video', BUILTIN_RECIPES.meta));
      assert.equal(loadingVideo.mediaUrl, undefined);
      assert.equal(loadingVideo.isGenerating, true);
      await win.webContents.executeJavaScript('Object.defineProperty(document.querySelector("video"), "readyState", { value: 2 }); void 0');
      const activeVideo = await win.webContents.executeJavaScript(DomObserver.getInspectionScript('meta', 'video', BUILTIN_RECIPES.meta));
      assert.equal(activeVideo.mediaType, 'video');
      assert.equal(activeVideo.isGenerating, true, 'A ready preview must not override the active native Stop control');
      const baselineVideo = await win.webContents.executeJavaScript(DomObserver.getInspectionScript('meta', 'video', BUILTIN_RECIPES.meta, ['data:video/mp4;base64,loading']));
      assert.equal(baselineVideo.mediaUrl, undefined);
      checks++;
      const referenceData = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWQ0AAAAASUVORK5CYII=';
      await win.loadURL('data:text/html,' + encodeURIComponent(`<main><div data-testid="assistant-message"><img data-testid="ur-image-tile" src="${referenceData}"></div></main>`));
      const excludedReference = await win.webContents.executeJavaScript(DomObserver.getInspectionScript('meta', 'image', BUILTIN_RECIPES.meta, [referenceData]));
      assert.equal(excludedReference.mediaUrl, undefined);
      checks++;
      await win.loadURL('data:text/html,' + encodeURIComponent(`<main><div data-testid="assistant-message"><div role="slider" aria-label="Before and after image comparison"><img src="${referenceData}"><div aria-hidden="true"><img src="blob:original-reference"></div></div></div></main>`));
      const editedOutput = await win.webContents.executeJavaScript(DomObserver.getInspectionScript('meta', 'image', BUILTIN_RECIPES.meta, ['blob:original-reference']));
      assert.equal(editedOutput.mediaType, 'image');
      assert.ok(editedOutput.mediaUrl?.startsWith('data:image/'));
      checks++;

      await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent('<textarea data-testid="composer-input" style="display:none"></textarea><div data-testid="composer-input" contenteditable="true">Visible draft</div><div data-testid="composer-input" contenteditable="true" style="display:none">Hidden draft</div>'));
      assert.equal(await win.webContents.executeJavaScript(`(${InputDispatcher.getInputTargetScript(BUILTIN_RECIPES.meta.selectors.inputPrompt)})?.textContent`), 'Visible draft');
      await win.webContents.executeJavaScript(`document.body.insertAdjacentHTML('beforeend', '<div data-testid="composer-input" contenteditable="true">Ambiguous draft</div>')`);
      assert.equal(await win.webContents.executeJavaScript(InputDispatcher.getInputTargetScript(BUILTIN_RECIPES.meta.selectors.inputPrompt)), null);
      checks++;
      await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent('<div data-testid="composer-input" contenteditable="true"><span contenteditable="false" data-inline-image-id="one"><img alt="one"></span><span contenteditable="false" data-inline-image-id="two"><img alt="two"></span></div>'));
      const inlineAdapter = new CustomRecipeAdapter(BUILTIN_RECIPES.meta);
      inlineAdapter.setWebContents(win.webContents);
      assert.equal((await inlineAdapter.dispatchPromptPreservingAttachments(BUILTIN_RECIPES.meta.selectors.inputPrompt, 'Describe both references', '[data-inline-image-id]', 2)).success, true);
      assert.equal(await win.webContents.executeJavaScript('document.querySelectorAll("[data-inline-image-id]").length'), 2);
      assert.equal((await inlineAdapter.dispatchPromptPreservingAttachments(BUILTIN_RECIPES.meta.selectors.inputPrompt, 'Describe both references', '[data-inline-image-id]', 2)).success, true);
      assert.equal((await inlineAdapter.dispatchPromptPreservingAttachments(BUILTIN_RECIPES.meta.selectors.inputPrompt, 'Overwrite an unrelated draft', '[data-inline-image-id]', 2)).success, false);
      assert.equal((await inlineAdapter.dispatchPromptPreservingAttachments(BUILTIN_RECIPES.meta.selectors.inputPrompt, 'Describe both references', '[data-inline-image-id]', 3)).success, false);
      checks++;

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
    const { AssetManager } = await import('../dist-electron/main/storage/assetManager.js');
    const { validateMediaArtifact } = await import('../dist-electron/main/media/artifacts.js');
    await win.loadURL('data:text/html,<html></html>');
    const webp = await win.webContents.executeJavaScript(`(() => { const canvas = document.createElement('canvas'); canvas.width = 16; canvas.height = 16; const context = canvas.getContext('2d'); context.fillStyle = '#ff6622'; context.fillRect(0, 0, 16, 16); return canvas.toDataURL('image/webp'); })()`);
    const assets = new AssetManager(join(profile, 'assets'));
    const savedWebp = await assets.saveMediaAsset(webp, 'image');
    assert.equal(savedWebp.filePath.endsWith('.webp'), true);
    assert.equal((await validateMediaArtifact(savedWebp.filePath, 'image')).mimeType, 'image/webp');
    const corrupt = join(profile, 'corrupt.webp');
    writeFileSync(corrupt, Buffer.from('RIFF0000WEBPinvalid-payload'));
    await assert.rejects(validateMediaArtifact(corrupt, 'image'), /decoded/);
    checks += 2;
    await win.loadURL('data:text/html,' + encodeURIComponent('<main><div data-testid="assistant-message"><div class="prose ur-markdown">Reply survives stalled media</div><video src="blob:stalled-fixture"></video></div></main>'));
    await win.webContents.executeJavaScript('window.fetch = () => new Promise(() => {}); Object.defineProperty(document.querySelector("video"), "readyState", { value: 2 }); void 0');
    const started = Date.now();
    const boundedBlob = await win.webContents.executeJavaScript(DomObserver.getInspectionScript('meta', 'video', BUILTIN_RECIPES.meta));
    assert.equal(boundedBlob.text, 'Reply survives stalled media');
    assert.equal(boundedBlob.mediaUrl, undefined);
    assert.ok(Date.now() - started < 8000, 'A stalled blob must not block inspection indefinitely');
    checks++;
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
