import { mkdtemp, writeFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';

import {
  defaultEffectiveConfig,
  type EffectiveConfig,
} from '../../../src/integration/node-cli/config.js';
import type { TypeBinding } from '../../../src/integration/node-cli/bindings.js';

/** An EffectiveConfig rooted at `root`, with per-test overrides on top. */
export function defaultConfig(
  root: string,
  overrides: Partial<EffectiveConfig> = {},
): EffectiveConfig {
  return { ...defaultEffectiveConfig(root), ...overrides };
}

export function binding(type: string, match: string): TypeBinding {
  return { type, match };
}

/** Materialize a throwaway project directory from a path -> content map. */
export async function createTempProject(
  files: Record<string, string>,
  prefix = 'mts-',
): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), prefix));
  for (const [relPath, content] of Object.entries(files)) {
    const fullPath = join(dir, relPath);
    await mkdir(dirname(fullPath), { recursive: true });
    await writeFile(fullPath, content, 'utf-8');
  }
  return dir;
}
