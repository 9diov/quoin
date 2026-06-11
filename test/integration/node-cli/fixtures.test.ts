import { describe, expect, it, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

import { runValidate } from '../../../src/integration/node-cli/validate.js';
import { runTypes } from '../../../src/integration/node-cli/types.js';
import { runCreate, createExitCode } from '../../../src/integration/node-cli/create.js';
import {
  loadConfigFile,
  resolveEffectiveConfig,
  type EffectiveConfig,
} from '../../../src/integration/node-cli/config.js';
import { defaultConfig } from './helpers.js';

const FIXTURES_DIR = fileURLToPath(new URL('../../../fixtures/', import.meta.url));
const CONFIG_NAME = 'quoin.config.jsonc';
const GOLDEN_OUT_DIR = '.golden-out';

type Entry = {
  dir: string;
  command: 'validate' | 'create' | 'types';
  exitCode: number;
  useConfig?: boolean;
  referentialValidation?: boolean;
  type?: string;
  targets?: string[];
  expectKinds?: string[];
  expectWarningKinds?: string[];
  expectTypeNames?: string[];
  expectBindingSummaries?: { typeName: string; status: string }[];
  expectIngestFailure?: boolean;
  expectTypeParseFailure?: boolean;
  expectFrontmatterOnly?: boolean;
  expectBodyContains?: string;
};

const manifest = JSON.parse(
  readFileSync(join(FIXTURES_DIR, 'manifest.json'), 'utf-8'),
) as { scenarios: Entry[]; vaults: Entry[] };

/** Build the EffectiveConfig exactly as the CLI would for a given fixture. */
async function configFor(entry: Entry): Promise<EffectiveConfig> {
  const root = join(FIXTURES_DIR, entry.dir);
  if (entry.useConfig) {
    const configPath = join(root, CONFIG_NAME);
    const fileConfig = await loadConfigFile(configPath);
    return resolveEffectiveConfig(fileConfig, configPath, process.cwd(), { root });
  }
  const overrides =
    entry.referentialValidation === undefined
      ? {}
      : { referentialValidation: entry.referentialValidation };
  return defaultConfig(root, overrides);
}

async function runValidateEntry(entry: Entry): Promise<void> {
  const config = await configFor(entry);
  const result = await runValidate(config, entry.targets ?? []);

  expect(result.exitCode).toBe(entry.exitCode);

  const targetKinds = result.targets.map((t) => t.kind);
  const errorKinds = result.targets.flatMap((t) =>
    t.kind === 'validated' ? t.result.errors.map((e) => e.kind) : [],
  );
  const warningKinds = result.targets.flatMap((t) =>
    t.kind === 'validated' ? t.result.warnings.map((w) => w.kind) : [],
  );
  const observed = new Set([...targetKinds, ...errorKinds]);

  for (const kind of entry.expectKinds ?? []) {
    expect(observed, `expected kind "${kind}" in ${entry.dir}`).toContain(kind);
  }
  for (const kind of entry.expectWarningKinds ?? []) {
    expect(new Set(warningKinds)).toContain(kind);
  }
  if (entry.expectIngestFailure) {
    expect(result.ingestFailures.length).toBeGreaterThan(0);
  }
  if (entry.expectTypeParseFailure) {
    expect(result.typeParseFailures.length).toBeGreaterThan(0);
  }
}

async function runTypesEntry(entry: Entry): Promise<void> {
  const config = await configFor(entry);
  const result = await runTypes(config);

  expect(result.exitCode).toBe(entry.exitCode);
  const names = result.types.map((t) => t.name);
  for (const name of entry.expectTypeNames ?? []) {
    expect(names).toContain(name);
  }
  for (const expected of entry.expectBindingSummaries ?? []) {
    expect(result.bindingSummaries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          typeName: expected.typeName,
          status: expected.status,
        }),
      ]),
    );
  }
}

async function runCreateEntry(entry: Entry): Promise<void> {
  const config = await configFor(entry);
  const relOutput = `${GOLDEN_OUT_DIR}/out.md`;
  const result = await runCreate(config, entry.type ?? '', relOutput);

  expect(createExitCode(result)).toBe(entry.exitCode);
  if (entry.expectKinds) {
    expect(entry.expectKinds).toContain(result.kind);
  }

  if (result.kind === 'created') {
    const written = await readFile(join(config.root, relOutput), 'utf-8');
    if (entry.expectFrontmatterOnly) {
      expect(written.endsWith('---\n')).toBe(true);
    }
    if (entry.expectBodyContains) {
      expect(written).toContain(entry.expectBodyContains);
    }
  }
}

afterEach(async () => {
  // create entries write into <fixture>/.golden-out; never leave it behind.
  await Promise.all(
    [...manifest.scenarios, ...manifest.vaults]
      .filter((e) => e.command === 'create')
      .map((e) => rm(join(FIXTURES_DIR, e.dir, GOLDEN_OUT_DIR), { recursive: true, force: true })),
  );
});

describe('fixture manifest', () => {
  for (const entry of [...manifest.scenarios, ...manifest.vaults]) {
    const ref =
      entry.referentialValidation === false ? ' [--no-referential]' : '';
    const tgt =
      entry.targets && entry.targets.length > 0
        ? ` [${entry.targets.join(',')}]`
        : '';
    const label = `${entry.dir} :: ${entry.command}${ref}${tgt} -> exit ${entry.exitCode}`;
    it(label, async () => {
      if (entry.command === 'validate') await runValidateEntry(entry);
      else if (entry.command === 'types') await runTypesEntry(entry);
      else await runCreateEntry(entry);
    });
  }
});
