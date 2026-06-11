import { chmodSync, readFileSync, writeFileSync } from 'node:fs';

const cliEntry = new URL('../dist/integration/node-cli/index.js', import.meta.url);
const shebang = '#!/usr/bin/env node\n';

const current = readFileSync(cliEntry, 'utf8');
const next = current.startsWith(shebang) ? current : `${shebang}${current}`;

if (next !== current) {
  writeFileSync(cliEntry, next, 'utf8');
}

chmodSync(cliEntry, 0o755);
