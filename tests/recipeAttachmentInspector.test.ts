import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('Visual recipe attachment recorder', () => {
  const inspector = fs.readFileSync(path.join(process.cwd(), 'extensions/transgentic-sync/content/inspectorOverlay.js'), 'utf8');
  const popup = fs.readFileSync(path.join(process.cwd(), 'extensions/transgentic-sync/popup.js'), 'utf8');

  it('records an ordered upload flow and emits mode attachment declarations', () => {
    expect(inspector).toContain("key: 'attachmentFlow'");
    expect(inspector).toContain("attachmentFlow.steps.push({ action: 'click', target: locator })");
    expect(inspector).toContain('revealSteps: attachmentFlow.steps');
    expect(inspector).toContain("document.querySelectorAll('input[type=\"file\"]')");
    expect(inspector).toContain('Test without submitting');
  });

  it('rejects unstable generated IDs and teaches recipe creation to require observed upload controls', () => {
    expect(inspector).toContain('^base-ui-');
    expect(inspector).toContain('shortest usable sequence');
    expect(popup).toContain('Only include inputAttachments when upload controls or a native file input are present');
  });
});
