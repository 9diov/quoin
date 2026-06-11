import { mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const tempDir = mkdtempSync(join(tmpdir(), 'quoin-pack-'));
const npmCacheDir = mkdtempSync(join(tmpdir(), 'quoin-npm-cache-'));
let tarballPath = '';

function run(command, args, cwd = repoRoot) {
  const effectiveArgs =
    command === 'npm' ? ['--cache', npmCacheDir, ...args] : args;
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

  const tarballName = run('npm', ['pack', '--quiet']);
  tarballPath = join(repoRoot, tarballName.split('\n').at(-1) ?? '');

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
