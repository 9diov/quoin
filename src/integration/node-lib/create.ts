import { mkdir, stat, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, posix, relative, resolve } from 'node:path';
import type {
  ValidationConfig,
  ValidationError,
  ValidationWarning,
} from '../../core/validation.js';
import { buildCreateCandidate } from '../common/create-candidate.js';

export { serializeDocument } from '../common/frontmatter.js';

import type { EffectiveConfig } from './config.js';
import type { ParseFailure } from './lookup.js';
import type { IngestFailure } from './project.js';
import { buildProjectUniverse } from './project.js';
import { createTimingRecorder, type Timing } from './timing.js';

type CreateResultBase =
  | {
      kind: 'created';
      path: string;
      typeId: string;
      typeName: string;
      declaration: string;
      warnings: ValidationWarning[];
    }
  | {
      kind: 'discovery-unhealthy';
      ingestFailures: { path: string; stage: string; reason: string }[];
      typeParseFailures: { path: string; errors: unknown[] }[];
    }
  | { kind: 'type-not-found'; typeName: string }
  | { kind: 'type-ambiguous'; typeName: string; candidateIds: string[] }
  | { kind: 'type-unavailable'; typeName: string; reason: string }
  | { kind: 'output-invalid'; output: string; reason: string }
  | { kind: 'output-exists'; path: string }
  | {
      kind: 'validation-failed';
      path: string;
      errors: ValidationError[];
      warnings: ValidationWarning[];
    }
  | { kind: 'io-error'; output: string; reason: string };

export type CreateResult = CreateResultBase & { timing: Timing };

/** The only successful outcome exits 0; every other outcome exits 1. */
export function createExitCode(result: CreateResult): number {
  return result.kind === 'created' ? 0 : 1;
}

/**
 * Resolve and validate the explicit output path.
 *
 * Returns the normalized root-relative POSIX path on success, or a terminal
 * CreateResult describing why the path is unusable.
 */
async function resolveOutputPath(
  config: EffectiveConfig,
  output: string,
): Promise<
  { ok: true; relativePath: string; absolutePath: string } | { ok: false; result: CreateResultBase }
> {
  const absolutePath = isAbsolute(output) ? resolve(output) : resolve(config.root, output);

  const relToRoot = relative(config.root, absolutePath);
  if (relToRoot.startsWith('..') || isAbsolute(relToRoot) || relToRoot === '') {
    return {
      ok: false,
      result: {
        kind: 'output-invalid',
        output,
        reason: 'Output path must be inside the project root.',
      },
    };
  }

  const exists = await stat(absolutePath).then(
    () => true,
    () => false,
  );
  if (exists) {
    return {
      ok: false,
      result: { kind: 'output-exists', path: posix.normalize(relToRoot) },
    };
  }

  return {
    ok: true,
    relativePath: posix.normalize(relToRoot),
    absolutePath,
  };
}

export async function runCreate(
  config: EffectiveConfig,
  typeName: string,
  output: string,
): Promise<CreateResult> {
  const timing = createTimingRecorder();
  const withTiming = (result: CreateResultBase): CreateResult => ({
    ...result,
    timing: timing.finish(),
  });

  const universePhase = timing.startPhase();
  const universe = await buildProjectUniverse(config);
  timing.endPhase('universe', universePhase);

  // create is strict about discovery health: any ingest or type-parse failure
  // aborts before we synthesize or write anything (D5).
  if (universe.ingestFailures.length > 0 || universe.typeParseFailures.length > 0) {
    return withTiming({
      kind: 'discovery-unhealthy',
      ingestFailures: universe.ingestFailures.map((f: IngestFailure) => ({
        path: f.path,
        stage: f.stage,
        reason: f.reason,
      })),
      typeParseFailures: universe.typeParseFailures.map((f: ParseFailure) => ({
        path: f.path,
        errors: f.errors,
      })),
    });
  }

  const synthesisPhase = timing.startPhase();
  const lookup = universe.typeRegistry.getByName(typeName);
  switch (lookup.kind) {
    case 'not-found':
      timing.endPhase('synthesis', synthesisPhase);
      return withTiming({ kind: 'type-not-found', typeName: lookup.typeName });
    case 'ambiguous':
      timing.endPhase('synthesis', synthesisPhase);
      return withTiming({
        kind: 'type-ambiguous',
        typeName: lookup.typeName,
        candidateIds: lookup.candidates.map((c) => c.id),
      });
    case 'unavailable':
      timing.endPhase('synthesis', synthesisPhase);
      return withTiming({ kind: 'type-unavailable', typeName, reason: lookup.reason });
  }

  const typeDef = lookup.typeDef;

  const outputResolution = await resolveOutputPath(config, output);
  if (!outputResolution.ok) {
    timing.endPhase('synthesis', synthesisPhase);
    return withTiming(outputResolution.result);
  }

  const validationConfig: ValidationConfig = {
    typeDeclarationKey: config.typeDeclarationKey,
    untypedDocumentBehavior: config.untypedDocumentBehavior,
    referentialValidation: config.referentialValidation,
  };

  const candidate = buildCreateCandidate({
    outputPath: outputResolution.relativePath,
    typeDef,
    typeDeclarationKey: config.typeDeclarationKey,
    validationConfig,
    resolver: universe.resolver,
    typeRegistry: universe.typeRegistry,
  });
  timing.endPhase('synthesis', synthesisPhase);

  const validationPhase = timing.startPhase();
  const validation = candidate.validation;
  timing.endPhase('validation', validationPhase);

  if (validation.errors.length > 0) {
    return withTiming({
      kind: 'validation-failed',
      path: outputResolution.relativePath,
      errors: validation.errors,
      warnings: validation.warnings,
    });
  }

  const content = candidate.contents;

  const writePhase = timing.startPhase();
  try {
    await mkdir(dirname(outputResolution.absolutePath), { recursive: true });
    await writeFile(outputResolution.absolutePath, content, {
      encoding: 'utf-8',
      flag: 'wx',
    });
  } catch (err) {
    timing.endPhase('write', writePhase);
    return withTiming({
      kind: 'io-error',
      output,
      reason: err instanceof Error ? err.message : 'Unknown write error',
    });
  }
  timing.endPhase('write', writePhase);

  return withTiming({
    kind: 'created',
    path: outputResolution.relativePath,
    typeId: typeDef.id,
    typeName: typeDef.name,
    declaration: candidate.declaration,
    warnings: validation.warnings,
  });
}
