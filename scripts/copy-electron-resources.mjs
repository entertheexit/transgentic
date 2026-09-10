import { copyFileSync, cpSync, existsSync, mkdirSync, watchFile } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const preload = path.join(root, 'dist-electron/main/preload');
mkdirSync(preload, { recursive: true });
for (const name of ['mainPreload.cjs', 'stealthPreload.cjs']) {
  copyFileSync(path.join(root, 'src/main/preload', name), path.join(preload, name));
}
if (process.argv.includes('--watch')) {
  for (const filename of ['mainPreload.cjs', 'stealthPreload.cjs']) {
    watchFile(path.join(root, 'src/main/preload', filename), { interval: 500 }, () => {
      try {
        copyFileSync(path.join(root, 'src/main/preload', filename), path.join(preload, filename));
        console.log(`[Preload] Copied ${filename}. Restart Electron to load bridge changes.`);
      } catch (error) {
        console.error(`[Preload] Could not copy ${filename}:`, error.message);
      }
    });
  }
}
// A clean source checkout may have no optional preconfigs directory.
const preconfigs = path.join(root, 'preconfigs');
if (existsSync(preconfigs)) {
  for (const target of ['dist-electron/main/preconfigs', 'dist-electron/preconfigs']) {
    cpSync(preconfigs, path.join(root, target), { recursive: true });
  }
}
