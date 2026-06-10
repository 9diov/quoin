import type {
  ParseError,
  ParsedTypeDefinitionDocument,
  PropertyTypeName,
} from '../../core/parser.js';

import { serializeEffectiveConfig, type EffectiveConfig } from './config.js';
import { printHuman, printJson } from './output.js';
import { buildProjectUniverse } from './project.js';

export type TypeSummary = {
  id: string;
  name: string;
  propertyCount: number;
  sectionCount: number;
  hasTemplate: boolean;
};

export type TypeDetailProperty = {
  name: string;
  type: string;
  required: boolean;
  allowEmpty: boolean;
  hasDefault: boolean;
};

export type TypeDetail = {
  id: string;
  name: string;
  properties: TypeDetailProperty[];
  sections: { heading: string; level: number; required: boolean }[];
  hasTemplate: boolean;
};

export type TypeDetailResult =
  | { kind: 'detail'; detail: TypeDetail }
  | { kind: 'detail-not-found'; name: string }
  | { kind: 'detail-ambiguous'; name: string; candidateIds: string[] }
  | { kind: 'detail-unavailable'; name: string; reason: string };

export type TypesResult = {
  types: TypeSummary[];
  ambiguousNames: { name: string; ids: string[] }[];
  parseFailures: { path: string; errors: ParseError[] }[];
  detail: TypeDetailResult | null;
  exitCode: number;
};

function renderPropertyType(type: PropertyTypeName): string {
  if (typeof type === 'string') {
    return type;
  }
  return `${type.kind}<${type.of}>`;
}

function summarize(typeDef: ParsedTypeDefinitionDocument): TypeSummary {
  return {
    id: typeDef.id,
    name: typeDef.name,
    propertyCount: Object.keys(typeDef.schema.properties).length,
    sectionCount: typeDef.templateBlock?.sections.length ?? 0,
    hasTemplate: typeDef.templateBlock !== undefined,
  };
}

function detailOf(typeDef: ParsedTypeDefinitionDocument): TypeDetail {
  const properties: TypeDetailProperty[] = Object.entries(
    typeDef.schema.properties,
  ).map(([name, schema]) => ({
    name,
    type: renderPropertyType(schema.type),
    required: schema.required === true,
    allowEmpty: schema['allow-empty'] === true,
    hasDefault: 'default' in schema,
  }));

  const sections = (typeDef.templateBlock?.sections ?? []).map((s) => ({
    heading: s.heading,
    level: s.level,
    required: s.required,
  }));

  return {
    id: typeDef.id,
    name: typeDef.name,
    properties,
    sections,
    hasTemplate: typeDef.templateBlock !== undefined,
  };
}

export async function runTypes(
  config: EffectiveConfig,
  detailName?: string,
): Promise<TypesResult> {
  const universe = await buildProjectUniverse(config);

  const types = universe.parsedTypes
    .map(summarize)
    .sort((a, b) => a.id.localeCompare(b.id));

  const byName = new Map<string, ParsedTypeDefinitionDocument[]>();
  for (const typeDef of universe.parsedTypes) {
    const existing = byName.get(typeDef.name);
    if (existing) {
      existing.push(typeDef);
    } else {
      byName.set(typeDef.name, [typeDef]);
    }
  }

  const ambiguousNames = [...byName.entries()]
    .filter(([, defs]) => defs.length > 1)
    .map(([name, defs]) => ({
      name,
      ids: defs.map((d) => d.id).sort(),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const parseFailures = universe.typeParseFailures
    .map((f) => ({ path: f.path, errors: f.errors }))
    .sort((a, b) => a.path.localeCompare(b.path));

  let detail: TypeDetailResult | null = null;
  if (detailName !== undefined) {
    const lookup = universe.typeRegistry.getByName(detailName);
    switch (lookup.kind) {
      case 'found':
        detail = { kind: 'detail', detail: detailOf(lookup.typeDef) };
        break;
      case 'not-found':
        detail = { kind: 'detail-not-found', name: lookup.typeName };
        break;
      case 'ambiguous':
        detail = {
          kind: 'detail-ambiguous',
          name: lookup.typeName,
          candidateIds: lookup.candidates.map((c) => c.id).sort(),
        };
        break;
      case 'unavailable':
        detail = {
          kind: 'detail-unavailable',
          name: detailName.toLowerCase(),
          reason: lookup.reason,
        };
        break;
    }
  }

  // types exit status is driven only by Type Definition parse failures (D5);
  // ordinary document ingest failures do not control it.
  const exitCode = parseFailures.length > 0 ? 1 : 0;

  return { types, ambiguousNames, parseFailures, detail, exitCode };
}

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
      const template = t.hasTemplate
        ? `, ${t.sectionCount} section(s)`
        : ', no template';
      printHuman(
        `  ${t.name}  (${t.id})  ${t.propertyCount} property(ies)${template}`,
      );
    }
  }

  if (result.ambiguousNames.length > 0) {
    printHuman('--- Ambiguous Names ---');
    for (const a of result.ambiguousNames) {
      printHuman(`  ${a.name}: ${a.ids.join(', ')}`);
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
        printHuman(
          `  ${'#'.repeat(s.level)} ${s.heading}${s.required ? '  [required]' : ''}`,
        );
      }
      break;
    case 'detail-not-found':
      printHuman(`Type "${detail.name}" not found.`);
      break;
    case 'detail-ambiguous':
      printHuman(
        `Type "${detail.name}" is ambiguous: ${detail.candidateIds.join(', ')}`,
      );
      break;
    case 'detail-unavailable':
      printHuman(`Type "${detail.name}" unavailable: ${detail.reason}`);
      break;
  }
}

export function formatTypesJson(
  result: TypesResult,
  config: EffectiveConfig,
): void {
  printJson({
    command: 'types',
    summary: {
      types: result.types.length,
      ambiguous: result.ambiguousNames.length,
      parseFailures: result.parseFailures.length,
    },
    types: result.types,
    ambiguousNames: result.ambiguousNames,
    parseFailures: result.parseFailures,
    detail: result.detail,
    effectiveConfig: serializeEffectiveConfig(config),
    exitCode: result.exitCode,
  });
}
