/**
 * @quoin-terms Integration, Validation, Document, Type Declaration, Validation Result
 * @quoin-docs docs/design/D5-node-cli-integration.md
 */

import type { EffectiveConfig } from '../node-lib/config.js';
import { serializeEffectiveConfig } from '../node-lib/config.js';
import { formatTimingHuman } from '../node-lib/timing.js';
import { expandTargets, runValidate, type ValidateResult } from '../node-lib/validate.js';
import { printHuman, printJson } from './output.js';

export type {
  TargetDiagnostic,
  ValidateResult,
  ValidationTargetResult,
} from '../node-lib/validate.js';
export { expandTargets, runValidate };

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
      case 'ambiguous-binding':
        printHuman(
          `FAIL  ${t.path}: ambiguous bindings (${t.candidates.map((c) => `${c.type}:${c.match}`).join(', ')})`,
        );
        break;
      case 'binding-type-not-found':
        printHuman(
          `FAIL  ${t.path}: bound type "${t.typeName}" not found via ${t.matchedBinding.match}`,
        );
        break;
      case 'binding-type-ambiguous':
        printHuman(
          `FAIL  ${t.path}: bound type "${t.typeName}" is ambiguous via ${t.matchedBinding.match}`,
        );
        break;
      case 'binding-type-unavailable':
        printHuman(
          `FAIL  ${t.path}: bound type unavailable via ${t.matchedBinding.match}: ${t.reason}`,
        );
        break;
    }
  }

  const passed = result.targets.filter((t) => t.kind === 'validated' && t.result.passed).length;
  const failed = result.targets.filter(
    (t) =>
      (t.kind === 'validated' && !t.result.passed) ||
      t.kind === 'invalid-type-declaration' ||
      t.kind === 'type-not-found' ||
      t.kind === 'type-ambiguous' ||
      t.kind === 'type-unavailable' ||
      t.kind === 'ambiguous-binding' ||
      t.kind === 'binding-type-not-found' ||
      t.kind === 'binding-type-ambiguous' ||
      t.kind === 'binding-type-unavailable',
  ).length;
  const skipped = result.targets.filter(
    (t) => t.kind === 'skipped-untyped' || t.kind === 'warn-untyped',
  ).length;

  printHuman(`\nResults: ${passed} passed, ${failed} failed, ${skipped} skipped/untyped`);
  printHuman(
    `Diagnostics: ${result.ingestFailures.length} ingest, ${result.typeParseFailures.length} parse, ${result.targetDiagnostics.length} target`,
  );
  printHuman(`Exit: ${result.exitCode}`);
  printHuman(formatTimingHuman(result.timing));
}

export function formatValidateJson(result: ValidateResult, config: EffectiveConfig): void {
  const passed = result.targets.filter((t) => t.kind === 'validated' && t.result.passed).length;
  const failed = result.targets.filter(
    (t) =>
      (t.kind === 'validated' && !t.result.passed) ||
      t.kind === 'invalid-type-declaration' ||
      t.kind === 'type-not-found' ||
      t.kind === 'type-ambiguous' ||
      t.kind === 'type-unavailable' ||
      t.kind === 'ambiguous-binding' ||
      t.kind === 'binding-type-not-found' ||
      t.kind === 'binding-type-ambiguous' ||
      t.kind === 'binding-type-unavailable',
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
    effectiveConfig: serializeEffectiveConfig(config),
    timing: result.timing,
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
