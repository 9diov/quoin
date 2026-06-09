import { stat } from 'node:fs/promises';
import { join, relative, resolve, isAbsolute, posix } from 'node:path';
import mm from 'micromatch';

import { validate } from '../../core/validation.js';
import type {
  ValidationConfig,
  ValidationResult,
  ValidationWarning,
} from '../../core/validation.js';
import type { Document } from '../../core/types.js';

import type { EffectiveConfig } from './config.js';
import { printHuman, printJson, printError } from './output.js';
import {
  discoverMarkdownFiles,
  filterTypeDefinitionCandidates,
  ingestMarkdownFiles,
  type IngestedMarkdown,
} from './ingestion.js';
import {
  createResolver,
  createTypeRegistry,
  parseTypeCandidates,
} from './lookup.js';

export type ValidationTargetResult =
  | {
      kind: 'validated';
      path: string;
      result: ValidationResult;
      typeId: string;
      typeName: string;
    }
  | { kind: 'skipped-untyped'; path: string }
  | { kind: 'warn-untyped'; path: string; warning: ValidationWarning }
  | { kind: 'invalid-type-declaration'; path: string; value: unknown }
  | {
      kind: 'type-not-found';
      path: string;
      declaration: unknown;
      typeName: string;
    }
  | {
      kind: 'type-ambiguous';
      path: string;
      declaration: unknown;
      typeName: string;
      candidateIds: string[];
    }
  | {
      kind: 'type-unavailable';
      path: string;
      declaration: unknown;
      reason: string;
    };

export type TargetDiagnostic =
  | { kind: 'target:outside-root'; input: string }
  | { kind: 'target:unsupported-kind'; input: string }
  | { kind: 'target:excluded'; input: string }
  | { kind: 'target:not-found'; input: string };

export type ValidateResult = {
  targets: ValidationTargetResult[];
  targetDiagnostics: TargetDiagnostic[];
  ingestFailures: Extract<IngestedMarkdown, { kind: 'ingest-failure' }>[];
  typeParseFailures: { path: string; errors: unknown[] }[];
  exitCode: number;
};

function isExcluded(relativePath: string, exclude: string[]): boolean {
  return mm.isMatch(relativePath, exclude);
}

function isMarkdownFile(filePath: string): boolean {
  return filePath.endsWith('.md');
}

export async function expandTargets(
  root: string,
  rawTargets: string[],
  exclude: string[],
): Promise<{
  paths: string[];
  diagnostics: TargetDiagnostic[];
}> {
  const paths: string[] = [];
  const diagnostics: TargetDiagnostic[] = [];

  for (const raw of rawTargets) {
    const absolute = isAbsolute(raw) ? resolve(raw) : resolve(root, raw);

    const relToRoot = relative(root, absolute);
    if (relToRoot.startsWith('..') || isAbsolute(relToRoot)) {
      diagnostics.push({ kind: 'target:outside-root', input: raw });
      continue;
    }

    let fileStat;
    try {
      fileStat = await stat(absolute);
    } catch {
      diagnostics.push({ kind: 'target:not-found', input: raw });
      continue;
    }

    if (fileStat.isFile()) {
      if (!isMarkdownFile(absolute)) {
        diagnostics.push({ kind: 'target:unsupported-kind', input: raw });
        continue;
      }
      if (isExcluded(relToRoot, exclude)) {
        diagnostics.push({ kind: 'target:excluded', input: raw });
        continue;
      }
      paths.push(posix.normalize(relToRoot));
    } else if (fileStat.isDirectory()) {
      const entries = await discoverMarkdownFiles(absolute, ['**/*.md'], []);
      for (const entry of entries) {
        const relPath = posix.normalize(join(relToRoot, entry));
        if (!isExcluded(relPath, exclude)) {
          paths.push(relPath);
        }
      }
    } else {
      diagnostics.push({ kind: 'target:unsupported-kind', input: raw });
    }
  }

  const unique = [...new Set(paths)].sort();
  return { paths: unique, diagnostics };
}

export async function runValidate(
  config: EffectiveConfig,
  rawTargets: string[],
): Promise<ValidateResult> {
  const ingestFailures: Extract<
    IngestedMarkdown,
    { kind: 'ingest-failure' }
  >[] = [];
  const ingestedDocs: Extract<IngestedMarkdown, { kind: 'document' }>[] = [];
  const typeParseFailures: { path: string; errors: unknown[] }[] = [];
  const targetDiagnostics: TargetDiagnostic[] = [];
  const targets: ValidationTargetResult[] = [];

  const allResults = await discoverMarkdownFiles(
    config.root,
    config.include,
    config.exclude,
  );

  const rawTargetPaths =
    rawTargets.length > 0
      ? (await expandTargets(config.root, rawTargets, config.exclude))
      : null;

  const discoveredPaths = new Set(allResults);
  if (rawTargetPaths) {
    for (const path of rawTargetPaths.paths) {
      discoveredPaths.add(path);
    }
  }

  const allPaths = [...discoveredPaths].sort();

  const ingestionResults = await ingestMarkdownFiles(config.root, allPaths);

  for (const result of ingestionResults) {
    if (result.kind === 'ingest-failure') {
      ingestFailures.push(result);
    } else {
      ingestedDocs.push(result);
    }
  }

  const candidates = filterTypeDefinitionCandidates(
    ingestedDocs,
    config.typeDeclarationKey,
  );

  const withRaw = candidates.map((c) => {
    const found = ingestedDocs.find((d) => d.path === c.path);
    return { path: c.path, raw: found?.raw ?? '' };
  });

  const { parsed, failures } = parseTypeCandidates(withRaw, {
    typeDeclarationKey: config.typeDeclarationKey,
    allowedUrlSchemes: config.allowedUrlSchemes,
  });

  for (const failure of failures) {
    typeParseFailures.push({
      path: failure.path,
      errors: failure.errors,
    });
  }

  const typeRegistry = createTypeRegistry(parsed, failures);
  const resolver = createResolver([
    ...ingestedDocs,
    ...ingestFailures,
  ]);

  let targetPaths: string[];
  if (rawTargetPaths) {
    for (const diag of rawTargetPaths.diagnostics) {
      targetDiagnostics.push(diag);
    }
    targetPaths = rawTargetPaths.paths;
  } else {
    const typeDefPaths = new Set(parsed.map((t) => t.id));
    const typeCandidatePaths = new Set(candidates.map((c) => c.path));
    for (const failure of failures) {
      typeCandidatePaths.add(failure.path);
    }
    targetPaths = ingestedDocs
      .map((d) => d.path)
      .filter((p) => !typeCandidatePaths.has(p))
      .sort();
  }

  const validationConfig: ValidationConfig = {
    typeDeclarationKey: config.typeDeclarationKey,
    untypedDocumentBehavior: config.untypedDocumentBehavior,
    referentialValidation: config.referentialValidation,
    allowedUrlSchemes: config.allowedUrlSchemes,
  };

  for (const path of targetPaths) {
    const ingested = ingestedDocs.find((d) => d.path === path);
    if (!ingested) continue;

    const doc = ingested.document;
    const declaration = doc.frontmatter[config.typeDeclarationKey];

    if (declaration === undefined) {
      if (config.untypedDocumentBehavior === 'warn') {
        targets.push({
          kind: 'warn-untyped',
          path,
          warning: {
            kind: 'document:untyped',
            message: `Document "${path}" has no Type Declaration at "${config.typeDeclarationKey}".`,
            location: { scope: 'config' },
            details: { path, key: config.typeDeclarationKey },
          },
        });
      } else {
        targets.push({ kind: 'skipped-untyped', path });
      }
      continue;
    }

    const declResult = typeRegistry.getByDeclaration(declaration);

    switch (declResult.kind) {
      case 'found': {
        const result = validate(
          doc,
          declResult.typeDef,
          validationConfig,
          resolver,
          typeRegistry,
        );
        targets.push({
          kind: 'validated',
          path,
          result,
          typeId: declResult.typeDef.id,
          typeName: declResult.typeDef.name,
        });
        break;
      }
      case 'invalid-declaration':
        targets.push({
          kind: 'invalid-type-declaration',
          path,
          value: declResult.value,
        });
        break;
      case 'missing-declaration':
        targets.push({ kind: 'skipped-untyped', path });
        break;
      case 'not-found':
        targets.push({
          kind: 'type-not-found',
          path,
          declaration,
          typeName: declResult.typeName,
        });
        break;
      case 'ambiguous':
        targets.push({
          kind: 'type-ambiguous',
          path,
          declaration,
          typeName: declResult.typeName,
          candidateIds: declResult.candidates.map((c) => c.id),
        });
        break;
      case 'unavailable':
        targets.push({
          kind: 'type-unavailable',
          path,
          declaration,
          reason: declResult.reason,
        });
        break;
    }
  }

  const hasIngestFailures = ingestFailures.length > 0;
  const hasTypeParseFailures = typeParseFailures.length > 0;
  const hasTargetDiagnostics = targetDiagnostics.length > 0;
  const hasValidationErrors = targets.some(
    (t) =>
      t.kind === 'validated' && t.result.errors.length > 0,
  );
  const hasResolutionFailures = targets.some(
    (t) =>
      t.kind === 'invalid-type-declaration' ||
      t.kind === 'type-not-found' ||
      t.kind === 'type-ambiguous' ||
      t.kind === 'type-unavailable',
  );

  const exitCode =
    hasIngestFailures ||
    hasTypeParseFailures ||
    hasTargetDiagnostics ||
    hasValidationErrors ||
    hasResolutionFailures
      ? 1
      : 0;

  return {
    targets,
    targetDiagnostics,
    ingestFailures: ingestFailures.map((f) => ({
      kind: f.kind,
      path: f.path,
      stage: f.stage,
      reason: f.reason,
    })) as Extract<IngestedMarkdown, { kind: 'ingest-failure' }>[],
    typeParseFailures,
    exitCode,
  };
}

export function formatValidateHuman(result: ValidateResult): void {
  if (result.ingestFailures.length > 0) {
    printHuman('--- Ingestion Failures ---');
    for (const f of result.ingestFailures) {
      printHuman(`  ${f.path}: ${f.reason}`);
    }
  }

  if (result.typeParseFailures.length > 0) {
    printHuman('--- Type Parse Failures ---');
    for (const f of result.typeParseFailures) {
      printHuman(`  ${f.path}: ${f.errors.length} error(s)`);
    }
  }

  if (result.targetDiagnostics.length > 0) {
    printHuman('--- Target Diagnostics ---');
    for (const d of result.targetDiagnostics) {
      printHuman(`  ${d.input}: ${d.kind}`);
    }
  }

  for (const t of result.targets) {
    switch (t.kind) {
      case 'validated':
        if (t.result.passed) {
          printHuman(`PASS  ${t.path} (${t.typeName})`);
        } else {
          printHuman(`FAIL  ${t.path} (${t.typeName})`);
          for (const err of t.result.errors) {
            printHuman(`  ${err.kind}: ${err.message}`);
          }
        }
        for (const warn of t.result.warnings) {
          printHuman(`  WARN: ${warn.message}`);
        }
        break;
      case 'skipped-untyped':
        printHuman(`SKIP  ${t.path} (untyped)`);
        break;
      case 'warn-untyped':
        printHuman(`WARN  ${t.path}: ${t.warning.message}`);
        break;
      case 'invalid-type-declaration':
        printHuman(`FAIL  ${t.path}: invalid type declaration`);
        break;
      case 'type-not-found':
        printHuman(`FAIL  ${t.path}: type "${t.typeName}" not found`);
        break;
      case 'type-ambiguous':
        printHuman(`FAIL  ${t.path}: type "${t.typeName}" is ambiguous`);
        break;
      case 'type-unavailable':
        printHuman(`FAIL  ${t.path}: ${t.reason}`);
        break;
    }
  }

  const passed = result.targets.filter(
    (t) => t.kind === 'validated' && t.result.passed,
  ).length;
  const failed = result.targets.filter(
    (t) =>
      (t.kind === 'validated' && !t.result.passed) ||
      t.kind === 'invalid-type-declaration' ||
      t.kind === 'type-not-found' ||
      t.kind === 'type-ambiguous' ||
      t.kind === 'type-unavailable',
  ).length;
  const skipped = result.targets.filter(
    (t) => t.kind === 'skipped-untyped' || t.kind === 'warn-untyped',
  ).length;

  printHuman(
    `\nResults: ${passed} passed, ${failed} failed, ${skipped} skipped/untyped`,
  );
  printHuman(
    `Diagnostics: ${result.ingestFailures.length} ingest, ${result.typeParseFailures.length} parse, ${result.targetDiagnostics.length} target`,
  );
  printHuman(`Exit: ${result.exitCode}`);
}

export function formatValidateJson(
  result: ValidateResult,
  config: EffectiveConfig,
): void {
  const passed = result.targets.filter(
    (t) => t.kind === 'validated' && t.result.passed,
  ).length;
  const failed = result.targets.filter(
    (t) =>
      (t.kind === 'validated' && !t.result.passed) ||
      t.kind === 'invalid-type-declaration' ||
      t.kind === 'type-not-found' ||
      t.kind === 'type-ambiguous' ||
      t.kind === 'type-unavailable',
  ).length;
  const skipped = result.targets.filter(
    (t) => t.kind === 'skipped-untyped' || t.kind === 'warn-untyped',
  ).length;
  const errors = result.targets
    .filter((t) => t.kind === 'validated')
    .reduce((sum, t) => sum + t.result.errors.length, 0);
  const warnings = result.targets
    .filter((t) => t.kind === 'validated')
    .reduce((sum, t) => sum + t.result.warnings.length, 0);

  printJson({
    summary: {
      targets: result.targets.length,
      passed,
      failed,
      skipped,
      errors,
      warnings,
      ingestFailures: result.ingestFailures.length,
      typeParseFailures: result.typeParseFailures.length,
      targetDiagnostics: result.targetDiagnostics.length,
    },
    effectiveConfig: {
      root: config.root,
      include: config.include,
      exclude: config.exclude,
      typeDeclarationKey: config.typeDeclarationKey,
      allowedUrlSchemes: config.allowedUrlSchemes,
      untypedDocumentBehavior: config.untypedDocumentBehavior,
      referentialValidation: config.referentialValidation,
      resolverStrategy: config.resolverStrategy,
      outputFormat: config.outputFormat,
    },
    targets: result.targets.map((t) => {
      if (t.kind === 'validated') {
        return {
          kind: t.kind,
          path: t.path,
          typeId: t.typeId,
          typeName: t.typeName,
          passed: t.result.passed,
          errors: t.result.errors,
          warnings: t.result.warnings,
        };
      }
      return t;
    }),
    targetDiagnostics: result.targetDiagnostics,
    ingestFailures: result.ingestFailures.map((f) => ({
      path: f.path,
      stage: f.stage,
      reason: f.reason,
    })),
    typeParseFailures: result.typeParseFailures,
    exitCode: result.exitCode,
  });
}
