/**
 * @quoin-terms Integration, Type Definition Document, TypeRegistry, Type Reference
 * @quoin-docs docs/design/D5-node-cli-integration.md
 */

import type { EffectiveConfig } from '../node-lib/config.js';
import { serializeEffectiveConfig } from '../node-lib/config.js';
import { formatTimingHuman } from '../node-lib/timing.js';
import { runTypes, type TypeDetailResult, type TypesResult } from '../node-lib/types.js';
import { printHuman, printJson } from './output.js';

export type {
  BindingSummary,
  TypeDetail,
  TypeDetailProperty,
  TypeDetailResult,
  TypeSummary,
  TypesResult,
} from '../node-lib/types.js';
export { runTypes };

export function formatTypesHuman(result: TypesResult): void {
  if (result.detail !== null) {
    formatDetailHuman(result.detail);
    printHuman('');
  }

  if (result.types.length === 0) {
    printHuman('No type definition documents discovered.');
  } else {
    printHuman('--- Types ---');
    for (const t of result.types) {
      const body = t.hasBody ? `, ${t.sectionCount} section(s)` : ', no body';
      printHuman(`  ${t.name}  (${t.id})  ${t.propertyCount} property(ies)${body}`);
    }
  }

  if (result.ambiguousNames.length > 0) {
    printHuman('--- Ambiguous Names ---');
    for (const a of result.ambiguousNames) {
      printHuman(`  ${a.name}: ${a.ids.join(', ')}`);
    }
  }

  if (result.bindings.length > 0) {
    printHuman('--- Bindings ---');
    for (const summary of result.bindingSummaries) {
      let suffix = '';
      switch (summary.status) {
        case 'found':
          suffix = `  [discovered: ${summary.typeId}]`;
          break;
        case 'not-found':
          suffix = '  [undiscovered]';
          break;
        case 'ambiguous':
          suffix = `  [ambiguous: ${summary.candidateIds.join(', ')}]`;
          break;
        case 'unavailable':
          suffix = `  [unavailable: ${summary.reason}]`;
          break;
      }
      printHuman(`  ${summary.typeName}${suffix}`);
      for (const binding of summary.bindings) {
        printHuman(`    ${binding.match}`);
      }
    }
  }

  if (result.parseFailures.length > 0) {
    printHuman('--- Type Parse Failures ---');
    for (const f of result.parseFailures) {
      printHuman(`  ${f.path}: ${f.errors.length} error(s)`);
    }
  }

  printHuman(
    `\nDiscovered: ${result.types.length} type(s), ${result.ambiguousNames.length} ambiguous, ${result.parseFailures.length} broken`,
  );
  printHuman(formatTimingHuman(result.timing));
}

function formatDetailHuman(detail: TypeDetailResult): void {
  switch (detail.kind) {
    case 'detail':
      printHuman(`=== ${detail.detail.name} (${detail.detail.id}) ===`);
      printHuman('Properties:');
      if (detail.detail.properties.length === 0) {
        printHuman('  (none)');
      }
      for (const p of detail.detail.properties) {
        const flags = [
          p.required ? 'required' : null,
          p.allowEmpty ? 'allow-empty' : null,
          p.hasDefault ? 'has-default' : null,
        ].filter(Boolean);
        const suffix = flags.length > 0 ? `  [${flags.join(', ')}]` : '';
        printHuman(`  ${p.name}: ${p.type}${suffix}`);
      }
      printHuman('Sections:');
      if (detail.detail.sections.length === 0) {
        printHuman('  (none)');
      }
      for (const s of detail.detail.sections) {
        printHuman(`  ${'#'.repeat(s.level)} ${s.heading}${s.required ? '  [required]' : ''}`);
      }
      break;
    case 'detail-not-found':
      printHuman(`Type "${detail.name}" not found.`);
      break;
    case 'detail-ambiguous':
      printHuman(`Type "${detail.name}" is ambiguous: ${detail.candidateIds.join(', ')}`);
      break;
    case 'detail-unavailable':
      printHuman(`Type "${detail.name}" unavailable: ${detail.reason}`);
      break;
  }
}

export function formatTypesJson(result: TypesResult, config: EffectiveConfig): void {
  printJson({
    command: 'types',
    summary: {
      types: result.types.length,
      ambiguous: result.ambiguousNames.length,
      parseFailures: result.parseFailures.length,
      bindings: result.bindings.length,
    },
    types: result.types,
    bindings: result.bindings,
    bindingSummaries: result.bindingSummaries,
    ambiguousNames: result.ambiguousNames,
    parseFailures: result.parseFailures,
    detail: result.detail,
    effectiveConfig: serializeEffectiveConfig(config),
    exitCode: result.exitCode,
    timing: result.timing,
  });
}
