import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const tempDir = mkdtempSync(join(tmpdir(), 'quoin-pack-'));
const npmCacheDir = mkdtempSync(join(tmpdir(), 'quoin-npm-cache-'));
let tarballPath = '';

function run(command, args, cwd = repoRoot) {
  const effectiveArgs = command === 'npm' ? ['--cache', npmCacheDir, ...args] : args;
  const result = spawnSync(command, effectiveArgs, {
    cwd,
    env: {
      ...process.env,
      NPM_CONFIG_CACHE: npmCacheDir,
      npm_config_cache: npmCacheDir,
    },
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  if (result.status !== 0) {
    process.stderr.write(result.stdout);
    process.stderr.write(result.stderr);
    throw new Error(`${command} ${effectiveArgs.join(' ')} failed`);
  }

  return result.stdout.trim();
}

try {
  run('npm', ['run', 'build']);

  const beforePack = new Set(readdirSync(repoRoot));
  const tarballName = run('npm', ['pack', '--quiet']);
  const packedName =
    tarballName.split('\n').filter(Boolean).at(-1) ??
    readdirSync(repoRoot).find((entry) => !beforePack.has(entry) && entry.endsWith('.tgz'));
  if (!packedName) {
    throw new Error('npm pack did not report or create a package tarball');
  }
  tarballPath = join(repoRoot, packedName);

  run('tar', ['-xzf', tarballPath, '-C', tempDir]);
  symlinkSync(join(repoRoot, 'node_modules'), join(tempDir, 'package/node_modules'));
  run('node', [join(tempDir, 'package/dist/integration/node-cli/index.js'), '--help'], tempDir);
} finally {
  rmSync(tempDir, { recursive: true, force: true });
  rmSync(npmCacheDir, { recursive: true, force: true });
  if (tarballPath) {
    rmSync(tarballPath, { force: true });
  }
}
