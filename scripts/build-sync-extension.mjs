import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = fileURLToPath(new URL('../', import.meta.url));
const source = path.join(root, 'extensions', 'transgentic-sync');
const manifest = JSON.parse(fs.readFileSync(path.join(source, 'manifest.json'), 'utf8'));
const filename = `transgentic-sync-v${manifest.version}.zip`;
const releaseSource = fs.readFileSync(path.join(root, 'src', 'shared', 'release.ts'), 'utf8');
if (!releaseSource.includes(`TRANSGENTIC_SYNC_ARCHIVE = '${filename}'`)) {
  throw new Error('The desktop extension archive name does not match the extension manifest version.');
}
const output = path.join(root, 'extensions', filename);
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'transgentic-extension-'));
try {
  fs.cpSync(source, temporary, { recursive: true, filter: file => path.basename(file) !== '.DS_Store' });
  fs.rmSync(output, { force: true });
  if (process.platform === 'win32') {
    execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
      'Compress-Archive -Path (Join-Path $env:TRANSGENTIC_EXTENSION_SOURCE "*") -DestinationPath $env:TRANSGENTIC_EXTENSION_OUTPUT -Force'], {
      env: { ...process.env, TRANSGENTIC_EXTENSION_SOURCE: temporary, TRANSGENTIC_EXTENSION_OUTPUT: output },
      stdio: 'inherit',
    });
  } else {
    execFileSync('zip', ['-q', '-r', output, '.'], { cwd: temporary, stdio: 'inherit' });
  }
  console.log(`Built ${filename}`);
} finally {
  fs.rmSync(temporary, { recursive: true, force: true });
}
