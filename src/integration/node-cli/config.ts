import { readFile } from 'node:fs/promises';
import { join, dirname, resolve } from 'node:path';
import { isAbsolute } from 'node:path';
import { parse as parseJsonc, printParseErrorCode, type ParseError } from 'jsonc-parser';

import type { UntypedDocumentBehavior } from '../../core/validation.js';

export type ResolverStrategy = 'basename';

export type OutputFormat = 'human' | 'json';

export type NodeCliConfig = {
  root?: string;
  include?: string[];
  exclude?: string[];
  typeDeclarationKey?: string;
  allowedUrlSchemes?: string[];
  untypedDocumentBehavior?: UntypedDocumentBehavior;
  referentialValidation?: boolean;
  resolver?: {
    strategy?: ResolverStrategy;
  };
  output?: {
    format?: OutputFormat;
  };
};

export type EffectiveConfig = {
  root: string;
  include: string[];
  exclude: string[];
  typeDeclarationKey: string;
  allowedUrlSchemes: string[];
  untypedDocumentBehavior: UntypedDocumentBehavior;
  referentialValidation: boolean;
  resolverStrategy: ResolverStrategy;
  outputFormat: OutputFormat;
};

export class ConfigLoadError extends Error {
  constructor(
    message: string,
    public readonly parseErrors: ParseError[],
  ) {
    super(message);
    this.name = 'ConfigLoadError';
  }
}

const CONFIG_FILE_NAME = 'markdown-type-system.config.jsonc';

export function defaultEffectiveConfig(cwd: string): EffectiveConfig {
  return {
    root: resolve(cwd),
    include: ['**/*.md'],
    exclude: ['.git/**', 'node_modules/**'],
    typeDeclarationKey: '_type',
    allowedUrlSchemes: ['http', 'https', 'mailto'],
    untypedDocumentBehavior: 'skip',
    referentialValidation: true,
    resolverStrategy: 'basename',
    outputFormat: 'human',
  };
}

/** Stable JSON snapshot of the effective config, shared by all command outputs. */
export function serializeEffectiveConfig(
  config: EffectiveConfig,
): Record<string, unknown> {
  return {
    root: config.root,
    include: config.include,
    exclude: config.exclude,
    typeDeclarationKey: config.typeDeclarationKey,
    allowedUrlSchemes: config.allowedUrlSchemes,
    untypedDocumentBehavior: config.untypedDocumentBehavior,
    referentialValidation: config.referentialValidation,
    resolverStrategy: config.resolverStrategy,
    outputFormat: config.outputFormat,
  };
}

function isValidOutputFormat(value: unknown): value is OutputFormat {
  return value === 'human' || value === 'json';
}

function isValidUntypedBehavior(value: unknown): value is UntypedDocumentBehavior {
  return value === 'skip' || value === 'warn';
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function coerceStringArray(value: unknown): string[] | undefined {
  if (value === undefined) return undefined;
  if (isStringArray(value)) return value;
  return undefined;
}

function coerceString(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  return undefined;
}

function coerceBoolean(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') return value;
  return undefined;
}

function parseConfig(raw: unknown): NodeCliConfig {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return {};
  }

  const obj = raw as Record<string, unknown>;
  const result: NodeCliConfig = {};

  const root = coerceString(obj['root']);
  if (root !== undefined) result.root = root;

  const include = coerceStringArray(obj['include']);
  if (include !== undefined) result.include = include;

  const exclude = coerceStringArray(obj['exclude']);
  if (exclude !== undefined) result.exclude = exclude;

  const typeDeclarationKey = coerceString(obj['typeDeclarationKey']);
  if (typeDeclarationKey !== undefined)
    result.typeDeclarationKey = typeDeclarationKey;

  const allowedUrlSchemes = coerceStringArray(obj['allowedUrlSchemes']);
  if (allowedUrlSchemes !== undefined)
    result.allowedUrlSchemes = allowedUrlSchemes;

  const untypedBehavior = obj['untypedDocumentBehavior'];
  if (isValidUntypedBehavior(untypedBehavior))
    result.untypedDocumentBehavior = untypedBehavior;

  const referentialValidation = coerceBoolean(obj['referentialValidation']);
  if (referentialValidation !== undefined)
    result.referentialValidation = referentialValidation;

  const resolverRaw = obj['resolver'] as Record<string, unknown> | undefined;
  if (resolverRaw) {
    const strategy = coerceString(resolverRaw['strategy']);
    if (strategy === 'basename') {
      result.resolver = { strategy };
    }
  }

  const outputRaw = obj['output'] as Record<string, unknown> | undefined;
  if (outputRaw) {
    const format = outputRaw['format'];
    if (isValidOutputFormat(format)) {
      result.output = { format };
    }
  }

  return result;
}

export async function loadConfigFile(configPath: string): Promise<NodeCliConfig> {
  const raw = await readFile(configPath, 'utf-8');
  const errors: ParseError[] = [];
  const parsed = parseJsonc(raw, errors);
  if (errors.length > 0) {
    const messages = errors.map(
      (e) => `${printParseErrorCode(e.error)} at offset ${e.offset}`,
    );
    throw new ConfigLoadError(
      `Failed to parse config file "${configPath}": ${messages.join('; ')}`,
      errors,
    );
  }
  return parseConfig(parsed);
}

export async function findConfigFile(startDir: string): Promise<string | null> {
  const searchPath = resolve(startDir);

  for (
    let dir: string = searchPath;
    dir !== dirname(dir);
    dir = dirname(dir)
  ) {
    const candidate = join(dir, CONFIG_FILE_NAME);
    try {
      await readFile(candidate, 'utf-8');
      return candidate;
    } catch {
      continue;
    }
  }

  const rootCandidate = join('/', CONFIG_FILE_NAME);
  try {
    await readFile(rootCandidate, 'utf-8');
    return rootCandidate;
  } catch {
    return null;
  }
}

export function resolveEffectiveConfig(
  config: NodeCliConfig | null,
  configFilePath: string | null,
  cwd: string,
  overrides: {
    root?: string;
    format?: OutputFormat;
    referentialValidation?: boolean;
  } = {},
): EffectiveConfig {
  const defaults = defaultEffectiveConfig(cwd);

  const configBaseDir =
    configFilePath !== null ? dirname(configFilePath) : cwd;

  let root: string;

  if (overrides.root !== undefined) {
    root = isAbsolute(overrides.root)
      ? resolve(overrides.root)
      : resolve(cwd, overrides.root);
  } else if (config?.root !== undefined) {
    root = isAbsolute(config.root)
      ? resolve(config.root)
      : resolve(configBaseDir, config.root);
  } else if (configFilePath !== null) {
    root = resolve(dirname(configFilePath));
  } else {
    root = defaults.root;
  }

  return {
    root,
    include: config?.include ?? defaults.include,
    exclude: config?.exclude ?? defaults.exclude,
    typeDeclarationKey:
      config?.typeDeclarationKey ?? defaults.typeDeclarationKey,
    allowedUrlSchemes:
      config?.allowedUrlSchemes ?? defaults.allowedUrlSchemes,
    untypedDocumentBehavior:
      config?.untypedDocumentBehavior ?? defaults.untypedDocumentBehavior,
    referentialValidation:
      overrides.referentialValidation ??
      config?.referentialValidation ??
      defaults.referentialValidation,
    resolverStrategy:
      config?.resolver?.strategy ?? defaults.resolverStrategy,
    outputFormat:
      overrides.format ??
      config?.output?.format ??
      defaults.outputFormat,
  };
}
