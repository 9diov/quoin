import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import esbuild from 'esbuild';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const outDir = join(root, 'dist', 'integration', 'obsidian');
const manifestSource = join(root, 'src', 'integration', 'obsidian', 'manifest.json');
const manifestTarget = join(outDir, 'manifest.json');
const mainMapTarget = join(outDir, 'main.js.map');
const isProduction = process.env.NODE_ENV === 'production';

await mkdir(outDir, { recursive: true });

await esbuild.build({
  entryPoints: [join(root, 'src', 'integration', 'obsidian', 'main.ts')],
  bundle: true,
  outfile: join(outDir, 'main.js'),
  format: 'cjs',
  platform: 'browser',
  target: 'es2022',
  external: ['obsidian'],
  sourcemap: !isProduction,
});

if (isProduction) {
  await rm(mainMapTarget, { force: true });
}

await writeFile(manifestTarget, await readFile(manifestSource, 'utf8'));
