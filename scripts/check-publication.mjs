import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const files = [...new Set(execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { cwd: root, encoding: 'utf8' }).split('\0').filter(Boolean))];
const issues = [];
const privatePaths = /(^|\/)(workspace|backup|Recipes|userData|Partitions|Cache|release|dist-electron|dist)(\/|$)|(^|\/)(request_logs|accounts_registry|client_auth|models_registry|custom_recipes|dom_healing_reports)\.json$|(^|\/)\.test_|(^|\/)\.env(?:\.|$)|^\.(cursor\/mcp\.json|codex\/config\.toml|claude\/settings\.json)$|^extensions\/.*\.zip$/;
// Optional private deployment terms are supplied locally, never embedded in this public script.
const terms = (process.env.PRIVATE_PROVIDER_TERMS || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
const privateRecipes = path.join(root, 'workspace', 'recipes');
if (existsSync(privateRecipes)) {
  for (const name of readdirSync(privateRecipes).filter(n => n.endsWith('.json'))) {
    try {
      const recipe = JSON.parse(readFileSync(path.join(privateRecipes, name), 'utf8'));
      for (const value of [recipe.domainMatch, recipe.domain, recipe.id]) {
        if (typeof value === 'string' && value.length > 3) terms.push(value.toLowerCase());
      }
    } catch { issues.push('A private recipe could not be inspected.'); }
  }
}
for (const file of files) {
  const absolute = path.join(root, file);
  if (!existsSync(absolute)) continue; // Pending tracked deletions are omitted from the future snapshot.
  if (privatePaths.test(file)) issues.push(`Private/runtime artifact: ${file}`);
  const data = readFileSync(absolute);
  if (data.includes(0)) continue;
  const text = data.toString('utf8');
  if (terms.some(term => text.toLowerCase().includes(term))) issues.push(`Private provider reference: ${file}`);
  if (!file.startsWith('tests/') && /(?:-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|gh[pousr]_[A-Za-z0-9]{30,}|sk-[A-Za-z0-9_-]{32,}|AKIA[0-9A-Z]{16})/.test(text)) {
    issues.push(`Possible credential: ${file}`);
  }
}
if (issues.length) {
  console.error(issues.join('\n'));
  process.exitCode = 1;
} else {
  console.log('Working snapshot (tracked files and unignored additions) passed publication checks. This check does not sanitize Git history or release archives.');
}
