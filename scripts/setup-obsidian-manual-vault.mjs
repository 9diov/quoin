import { spawn } from 'node:child_process';
import { existsSync, watch } from 'node:fs';
import { cp, lstat, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const defaultVault = join(root, '.manual', 'obsidian-vault');
const defaultFixture = join(root, 'fixtures', 'vaults', 'manual-obsidian');
const pluginId = 'quoin';
const options = parseArgs(process.argv.slice(2));

await setupManualVault(options);

if (options.watch) {
  await watchSources(options);
}

async function setupManualVault(setupOptions) {
  const vaultPath = resolvePath(setupOptions.vault ?? defaultVault);
  const fixturePath = resolvePath(setupOptions.fixture ?? defaultFixture);
  const pluginSource = join(root, 'dist', 'integration', 'obsidian');
  const pluginTarget = join(vaultPath, '.obsidian', 'plugins', pluginId);

  if (setupOptions.reset) {
    await rm(vaultPath, { recursive: true, force: true });
    setupOptions.reset = false;
  }

  if (setupOptions.build) {
    await run('npm', ['run', 'build:obsidian']);
  }

  if (!existsSync(fixturePath)) {
    throw new Error(`Fixture vault does not exist: ${fixturePath}`);
  }

  if (!existsSync(pluginSource)) {
    throw new Error(
      `Obsidian plugin build output does not exist: ${pluginSource}\nRun npm run build:obsidian or omit --no-build.`,
    );
  }

  await mkdir(vaultPath, { recursive: true });
  await copyFixtureVault(fixturePath, vaultPath);
  await installPlugin(pluginSource, pluginTarget);
  await enablePlugin(vaultPath, pluginId);

  console.log(`Manual Obsidian vault ready: ${relativeToRoot(vaultPath)}`);
  console.log(`Installed plugin: ${relativeToRoot(pluginTarget)}`);
  console.log('Open the vault in Obsidian, then reload community plugins after rebuilding.');
}

async function copyFixtureVault(source, target) {
  await cp(source, target, {
    recursive: true,
    force: true,
    errorOnExist: false,
    filter: (path) => !path.includes(`${source}/.obsidian`),
  });
}

async function installPlugin(source, target) {
  const runtimeFiles = ['manifest.json', 'main.js', 'main.js.map'];

  await rm(target, { recursive: true, force: true });
  await mkdir(target, { recursive: true });

  for (const filename of runtimeFiles) {
    const sourcePath = join(source, filename);
    if (!existsSync(sourcePath)) continue;
    await cp(sourcePath, join(target, filename), {
      force: true,
      errorOnExist: false,
    });
  }
}

async function enablePlugin(vault, id) {
  const obsidianDir = join(vault, '.obsidian');
  const communityPluginsPath = join(obsidianDir, 'community-plugins.json');
  await mkdir(obsidianDir, { recursive: true });

  let enabled = [];
  if (existsSync(communityPluginsPath)) {
    const raw = await readFile(communityPluginsPath, 'utf8');
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) enabled = parsed.filter((value) => typeof value === 'string');
  }

  if (!enabled.includes(id)) enabled.push(id);
  await writeFile(communityPluginsPath, `${JSON.stringify(enabled, null, 2)}\n`);
}

function parseArgs(args) {
  const parsed = {
    build: true,
    fixture: undefined,
    reset: false,
    vault: undefined,
    watch: false,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    switch (arg) {
      case '--fixture':
        parsed.fixture = readValue(args, ++index, arg);
        break;
      case '--no-build':
        parsed.build = false;
        break;
      case '--reset':
        parsed.reset = true;
        break;
      case '--vault':
        parsed.vault = readValue(args, ++index, arg);
        break;
      case '--watch':
        parsed.watch = true;
        break;
      case '--help':
        printHelp();
        process.exit(0);
        break;
      case '-h':
        printHelp();
        process.exit(0);
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return parsed;
}

function readValue(args, index, flag) {
  const value = args[index];
  if (value === undefined || value.startsWith('--')) {
    throw new Error(`${flag} requires a value.`);
  }
  return value;
}

function resolvePath(path) {
  return isAbsolute(path) ? path : join(root, path);
}

function relativeToRoot(path) {
  return path.startsWith(root) ? path.slice(root.length + 1) : path;
}

function run(command, args) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, {
      cwd: root,
      stdio: 'inherit',
      shell: process.platform === 'win32',
    });

    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) {
        resolvePromise();
      } else {
        reject(new Error(`${command} ${args.join(' ')} exited with ${code ?? 'unknown status'}`));
      }
    });
  });
}

async function watchSources(setupOptions) {
  const watchRoots = [
    join(root, 'src', 'core'),
    join(root, 'src', 'integration', 'obsidian'),
    join(root, 'scripts', 'build-obsidian-plugin.mjs'),
  ];
  const directories = [];
  for (const watchRoot of watchRoots) {
    directories.push(...(await collectWatchTargets(watchRoot)));
  }

  let timer = null;
  let running = false;
  let rerun = false;
  const schedule = () => {
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      void runQueuedSetup();
    }, 200);
  };
  const runQueuedSetup = async () => {
    if (running) {
      rerun = true;
      return;
    }

    running = true;
    try {
      await setupManualVault({ ...setupOptions, reset: false });
    } catch (error) {
      console.error(error instanceof Error ? error.message : error);
    } finally {
      running = false;
      if (rerun) {
        rerun = false;
        await runQueuedSetup();
      }
    }
  };

  const watchers = directories.map((target) =>
    watch(target, { persistent: true }, (_eventType, filename) => {
      if (filename === null) return;
      schedule();
    }),
  );

  const close = () => {
    for (const watcher of watchers) watcher.close();
  };
  process.on('SIGINT', () => {
    close();
    process.exit(0);
  });
  process.on('SIGTERM', () => {
    close();
    process.exit(0);
  });

  console.log(`Watching ${directories.length} source path(s). Press Ctrl+C to stop.`);
  await new Promise(() => undefined);
}

async function collectWatchTargets(path) {
  if (!existsSync(path)) return [];
  const pathStat = await lstat(path);
  if (!pathStat.isDirectory()) return [path];

  const entries = await readdir(path, { withFileTypes: true });
  if (!entries.some((entry) => entry.isDirectory())) return [path];

  const targets = [path];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    targets.push(...(await collectWatchTargets(join(path, entry.name))));
  }
  return targets;
}

function printHelp() {
  console.log(`Usage: node scripts/setup-obsidian-manual-vault.mjs [options]

Options:
  --fixture <path>  Fixture vault to seed. Default: fixtures/vaults/manual-obsidian
  --vault <path>    Manual vault path. Default: .manual/obsidian-vault
  --no-build        Install the existing dist/integration/obsidian build
  --reset           Delete the manual vault before setup
  --watch           Rebuild and reinstall when source files change
  -h, --help        Show this help
`);
}
