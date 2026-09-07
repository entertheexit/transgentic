import { rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// TypeScript does not delete JavaScript emitted for subsequently deleted source files.
const output = fileURLToPath(new URL('../dist-electron/', import.meta.url));
rmSync(output, { recursive: true, force: true });
