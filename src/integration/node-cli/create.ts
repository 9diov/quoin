import type { EffectiveConfig } from '../node-lib/config.js';
import { serializeEffectiveConfig } from '../node-lib/config.js';
import {
  type CreateResult,
  createExitCode,
  runCreate,
  serializeDocument,
} from '../node-lib/create.js';
import { formatTimingHuman } from '../node-lib/timing.js';
import { printHuman, printJson } from './output.js';

export type { CreateResult };
export { createExitCode, runCreate, serializeDocument };

export function formatCreateHuman(result: CreateResult): void {
  switch (result.kind) {
    case 'created':
      printHuman(`CREATED  ${result.path} (${result.typeName})`);
      for (const warn of result.warnings) {
        printHuman(`  WARN: ${warn.message}`);
      }
      break;
    case 'discovery-unhealthy':
      printHuman('ABORT  discovery is not clean; refusing to create.');
      for (const f of result.ingestFailures) {
        printHuman(`  ingest: ${f.path}: ${f.reason}`);
      }
      for (const f of result.typeParseFailures) {
        printHuman(`  type-parse: ${f.path}: ${f.errors.length} error(s)`);
      }
      break;
    case 'type-not-found':
      printHuman(`ABORT  type "${result.typeName}" not found.`);
      break;
    case 'type-ambiguous':
      printHuman(
        `ABORT  type "${result.typeName}" is ambiguous: ${result.candidateIds.join(', ')}`,
      );
      break;
    case 'type-unavailable':
      printHuman(`ABORT  type "${result.typeName}" unavailable: ${result.reason}`);
      break;
    case 'output-invalid':
      printHuman(`ABORT  invalid output "${result.output}": ${result.reason}`);
      break;
    case 'output-exists':
      printHuman(`ABORT  output already exists: ${result.path}`);
      break;
    case 'validation-failed':
      printHuman(`ABORT  generated document failed validation: ${result.path}`);
      for (const err of result.errors) {
        printHuman(`  ${err.kind}: ${err.message}`);
      }
      break;
    case 'io-error':
      printHuman(`ABORT  write failed for "${result.output}": ${result.reason}`);
      break;
  }

  printHuman(formatTimingHuman(result.timing));
}

export function formatCreateJson(result: CreateResult, config: EffectiveConfig): void {
  const { timing, ...resultWithoutTiming } = result;
  printJson({
    command: 'create',
    result: resultWithoutTiming,
    exitCode: createExitCode(result),
    effectiveConfig: serializeEffectiveConfig(config),
    timing,
  });
}
