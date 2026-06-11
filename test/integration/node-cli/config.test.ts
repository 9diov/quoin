import { describe, expect, it } from 'vitest';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  ConfigLoadError,
  ConfigValidationError,
  defaultEffectiveConfig,
  findConfigFile,
  loadConfigFile,
  resolveEffectiveConfig,
  serializeEffectiveConfig,
} from '../../../src/integration/node-cli/config.js';

describe('defaultEffectiveConfig', () => {
  it('fills all fields with expected defaults rooted at cwd', () => {
    const result = defaultEffectiveConfig('/my/project');

    expect(result).toEqual({
      root: '/my/project',
      include: ['**/*.md'],
      exclude: ['.git/**', 'node_modules/**'],
      bindings: [],
      typeDeclarationKey: '_type',
      allowedUrlSchemes: ['http', 'https', 'mailto'],
      untypedDocumentBehavior: 'skip',
      referentialValidation: true,
      resolverStrategy: 'basename',
      outputFormat: 'human',
    });
  });
});

describe('loadConfigFile', () => {
  it('parses a valid JSONC config file', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'mts-test-'));
    const configPath = join(dir, 'config.jsonc');
    await writeFile(
      configPath,
      `{
        // project root
        "root": "./docs",
        "include": ["**/*.md", "*.mdx"],
        "typeDeclarationKey": "kind",
        "referentialValidation": false,
        "output": {
          "format": "json"
        }
      }`,
    );

    try {
      const config = await loadConfigFile(configPath);

      expect(config.root).toBe('./docs');
      expect(config.include).toEqual(['**/*.md', '*.mdx']);
      expect(config.typeDeclarationKey).toBe('kind');
      expect(config.referentialValidation).toBe(false);
      expect(config.output?.format).toBe('json');
      expect(config.bindings).toBeUndefined();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('parses valid bindings from config', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'mts-test-'));
    const configPath = join(dir, 'config.jsonc');
    await writeFile(
      configPath,
      `{
        "bindings": [
          { "type": "concept", "match": "notes/**/*.md" }
        ]
      }`,
    );

    try {
      const config = await loadConfigFile(configPath);
      expect(config.bindings).toEqual([
        { type: 'concept', match: 'notes/**/*.md' },
      ]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('throws ConfigLoadError for malformed JSONC', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'mts-test-'));
    const configPath = join(dir, 'bad.jsonc');
    await writeFile(configPath, '{ invalid {{{');

    try {
      await loadConfigFile(configPath);
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(ConfigLoadError);
      expect((err as ConfigLoadError).parseErrors.length).toBeGreaterThan(0);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('returns empty config for non-object JSON root', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'mts-test-'));
    const configPath = join(dir, 'arr.jsonc');
    await writeFile(configPath, '[1, 2, 3]');

    try {
      const config = await loadConfigFile(configPath);
      expect(config.root).toBeUndefined();
      expect(config.include).toBeUndefined();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('throws ConfigValidationError for non-array bindings', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'mts-test-'));
    const configPath = join(dir, 'bad-bindings.jsonc');
    await writeFile(configPath, '{ "bindings": "notes/**/*.md" }');

    try {
      await loadConfigFile(configPath);
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(ConfigValidationError);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('throws ConfigValidationError for malformed binding entries', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'mts-test-'));
    const configPath = join(dir, 'bad-binding-entry.jsonc');
    await writeFile(
      configPath,
      '{ "bindings": [{ "type": "concept", "match": "notes/**/*.md", "extra": true }] }',
    );

    try {
      await loadConfigFile(configPath);
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(ConfigValidationError);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('throws ConfigValidationError for duplicate bindings', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'mts-test-'));
    const configPath = join(dir, 'dup-binding.jsonc');
    await writeFile(
      configPath,
      '{ "bindings": [{ "type": "concept", "match": "notes/**/*.md" }, { "type": "concept", "match": "notes/**/*.md" }] }',
    );

    try {
      await loadConfigFile(configPath);
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(ConfigValidationError);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe('findConfigFile', () => {
  it('finds config in start directory', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'mts-test-'));
    const configPath = join(dir, 'markdown-type-system.config.jsonc');
    await writeFile(configPath, '{}');

    try {
      const found = await findConfigFile(dir);
      expect(found).toBe(configPath);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('finds config in ancestor directory', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'mts-test-'));
    const childDir = join(dir, 'deep', 'subdir');
    const configPath = join(dir, 'markdown-type-system.config.jsonc');
    await writeFile(configPath, '{}');

    try {
      const found = await findConfigFile(childDir);
      expect(found).toBe(configPath);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('returns null when no config found', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'mts-test-'));
    try {
      const found = await findConfigFile(dir);
      expect(found).toBeNull();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe('resolveEffectiveConfig', () => {
  it('uses cwd as root when no config and no overrides', () => {
    const result = resolveEffectiveConfig(null, null, '/my/project');
    expect(result.root).toBe('/my/project');
  });

  it('uses config file directory as root when config loaded without explicit root', () => {
    const result = resolveEffectiveConfig(
      {},
      '/my/project/markdown-type-system.config.jsonc',
      '/some/other/cwd',
    );
    expect(result.root).toBe('/my/project');
  });

  it('uses config.root resolved against config file dir', () => {
    const result = resolveEffectiveConfig(
      { root: 'docs' },
      '/my/project/markdown-type-system.config.jsonc',
      '/some/other/cwd',
    );
    expect(result.root).toBe('/my/project/docs');
  });

  it('uses absolute config.root directly', () => {
    const result = resolveEffectiveConfig(
      { root: '/absolute/path' },
      '/my/project/markdown-type-system.config.jsonc',
      '/cwd',
    );
    expect(result.root).toBe('/absolute/path');
  });

  it('--root overrides config.root', () => {
    const result = resolveEffectiveConfig(
      { root: 'docs' },
      '/my/project/markdown-type-system.config.jsonc',
      '/cwd',
      { root: '/cli/root' },
    );
    expect(result.root).toBe('/cli/root');
  });

  it('--root overrides config file dir', () => {
    const result = resolveEffectiveConfig(
      {},
      '/my/project/markdown-type-system.config.jsonc',
      '/cwd',
      { root: '/cli/root' },
    );
    expect(result.root).toBe('/cli/root');
  });

  it('relative --root resolves against cwd', () => {
    const result = resolveEffectiveConfig(null, null, '/cwd', {
      root: 'subdir',
    });
    expect(result.root).toBe('/cwd/subdir');
  });

  it('format: CLI override wins over config', () => {
    const result = resolveEffectiveConfig(
      { output: { format: 'human' } },
      null,
      '/cwd',
      { format: 'json' },
    );
    expect(result.outputFormat).toBe('json');
  });

  it('format: config wins over default when no CLI override', () => {
    const result = resolveEffectiveConfig(
      { output: { format: 'json' } },
      null,
      '/cwd',
    );
    expect(result.outputFormat).toBe('json');
  });

  it('format: defaults to human when no config and no CLI override', () => {
    const result = resolveEffectiveConfig(null, null, '/cwd');
    expect(result.outputFormat).toBe('human');
  });

  it('referential: CLI false overrides config true', () => {
    const result = resolveEffectiveConfig(
      { referentialValidation: true },
      null,
      '/cwd',
      { referentialValidation: false },
    );
    expect(result.referentialValidation).toBe(false);
  });

  it('referential: config value used when no CLI override', () => {
    const result = resolveEffectiveConfig(
      { referentialValidation: false },
      null,
      '/cwd',
    );
    expect(result.referentialValidation).toBe(false);
  });

  it('referential: defaults to true when no config and no CLI override', () => {
    const result = resolveEffectiveConfig(null, null, '/cwd');
    expect(result.referentialValidation).toBe(true);
  });

  it('fills all fields from config', () => {
    const result = resolveEffectiveConfig(
      {
        include: ['**/*.mdx'],
        exclude: ['.cache/**'],
        bindings: [{ type: 'concept', match: 'notes/**/*.md' }],
        typeDeclarationKey: 'kind',
        allowedUrlSchemes: ['https'],
        untypedDocumentBehavior: 'warn',
        resolver: { strategy: 'basename' },
      },
      null,
      '/cwd',
    );

    expect(result.include).toEqual(['**/*.mdx']);
    expect(result.exclude).toEqual(['.cache/**']);
    expect(result.bindings).toEqual([
      { type: 'concept', match: 'notes/**/*.md' },
    ]);
    expect(result.typeDeclarationKey).toBe('kind');
    expect(result.allowedUrlSchemes).toEqual(['https']);
    expect(result.untypedDocumentBehavior).toBe('warn');
    expect(result.resolverStrategy).toBe('basename');
    expect(result.root).toBe('/cwd');
  });

  it('uses defaults for missing config fields', () => {
    const result = resolveEffectiveConfig({}, null, '/cwd');

    expect(result.include).toEqual(['**/*.md']);
    expect(result.exclude).toEqual(['.git/**', 'node_modules/**']);
    expect(result.bindings).toEqual([]);
    expect(result.typeDeclarationKey).toBe('_type');
    expect(result.allowedUrlSchemes).toEqual(['http', 'https', 'mailto']);
    expect(result.untypedDocumentBehavior).toBe('skip');
    expect(result.referentialValidation).toBe(true);
    expect(result.resolverStrategy).toBe('basename');
    expect(result.outputFormat).toBe('human');
  });

  it('coerces invalid typed values from JSONC (via loadConfigFile)', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'mts-test-'));
    const configPath = join(dir, 'config.jsonc');
    await writeFile(
      configPath,
      JSON.stringify({
        root: 123,
        include: 'not-an-array',
        referentialValidation: 'yes',
        untypedDocumentBehavior: 'invalid',
        resolver: { strategy: 'unknown' },
        output: { format: 'xml' },
      }),
    );

    let result;
    try {
      const config = await loadConfigFile(configPath);
      result = resolveEffectiveConfig(config, null, '/cwd');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }

    expect(result.root).toBe('/cwd');
    expect(result.include).toEqual(['**/*.md']);
    expect(result.referentialValidation).toBe(true);
    expect(result.untypedDocumentBehavior).toBe('skip');
    expect(result.resolverStrategy).toBe('basename');
    expect(result.outputFormat).toBe('human');
  });

  it('preserves bindings declaration order in serialized effective config', () => {
    const config = resolveEffectiveConfig(
      {
        bindings: [
          { type: 'a', match: 'one/**/*.md' },
          { type: 'b', match: 'two/**/*.md' },
          { type: 'c', match: 'three/**/*.md' },
        ],
      },
      null,
      '/cwd',
    );

    const serialized = serializeEffectiveConfig(config);
    expect(serialized['bindings']).toEqual([
      { type: 'a', match: 'one/**/*.md' },
      { type: 'b', match: 'two/**/*.md' },
      { type: 'c', match: 'three/**/*.md' },
    ]);
  });
});
