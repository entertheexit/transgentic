import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

describe('development preload resource copying', () => {
  it('copies CJS bridges initially and after a source edit', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tg-preload-watch-'));
    const source = path.join(root, 'src/main/preload');
    fs.mkdirSync(source, { recursive: true }); fs.mkdirSync(path.join(root, 'scripts'));
    fs.copyFileSync('scripts/copy-electron-resources.mjs', path.join(root, 'scripts/copy-electron-resources.mjs'));
    for (const name of ['mainPreload.cjs', 'stealthPreload.cjs']) fs.writeFileSync(path.join(source, name), 'initial');
    const child = spawn(process.execPath, ['scripts/copy-electron-resources.mjs', '--watch'], { cwd: root, stdio: 'ignore' });
    const closed = new Promise<void>(resolve => child.on('close', () => resolve()));
    const output = path.join(root, 'dist-electron/main/preload/mainPreload.cjs');
    const waitFor = async (expected: string) => {
      for (let i = 0; i < 100; i++) {
        if (fs.existsSync(output) && fs.readFileSync(output, 'utf8') === expected) return;
        await delay(20);
      }
      throw new Error('Preload resource was not synchronized');
    };
    try {
      await waitFor('initial');
      fs.writeFileSync(path.join(source, 'mainPreload.cjs'), 'updated bridge');
      await waitFor('updated bridge');
      expect(fs.readFileSync(path.join(root, 'dist-electron/main/preload/stealthPreload.cjs'), 'utf8')).toBe('initial');
    } finally { child.kill(); await closed; fs.rmSync(root, { recursive: true, force: true }); }
  });
});
