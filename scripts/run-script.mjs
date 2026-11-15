import { spawnSync } from 'node:child_process';

// Run nested scripts with the same package manager that launched the parent.
const packageManager = process.env.npm_execpath;
if (!packageManager) {
  console.error('Run this command through npm run or yarn run.');
  process.exit(1);
}

const result = spawnSync(process.execPath, [packageManager, 'run', ...process.argv.slice(2)], {
  stdio: 'inherit',
});
if (result.error) {
  console.error(result.error.message);
}
process.exitCode = result.status ?? 1;
