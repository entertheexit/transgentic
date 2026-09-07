import { copyFileSync, cpSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const preload = path.join(root, 'dist-electron/main/preload');
mkdirSync(preload, { recursive: true });
for (const name of ['mainPreload.cjs', 'stealthPreload.cjs']) {
  copyFileSync(path.join(root, 'src/main/preload', name), path.join(preload, name));
}
// A clean source checkout may have no optional preconfigs directory.
const preconfigs = path.join(root, 'preconfigs');
if (existsSync(preconfigs)) {
  for (const target of ['dist-electron/main/preconfigs', 'dist-electron/preconfigs']) {
    cpSync(preconfigs, path.join(root, target), { recursive: true });
  }
}
