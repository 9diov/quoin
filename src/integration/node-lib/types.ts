/**
 * @quoin-terms Integration, Type Definition Document, TypeRegistry, Type Reference
 * @quoin-docs docs/design/D5-node-cli-integration.md
 */

import type {
  ParsedTypeDefinitionDocument,
  ParseError,
  PropertyTypeName,
} from '../../core/parser.js';
import type { TypeBinding } from './bindings.js';
import type { EffectiveConfig } from './config.js';
import { buildProjectUniverse } from './project.js';
import { createTimingRecorder, type Timing } from './timing.js';

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

export type BindingSummary =
  | { typeName: string; status: 'found'; bindings: TypeBinding[]; typeId: string }
  | { typeName: string; status: 'not-found'; bindings: TypeBinding[] }
  | {
      typeName: string;
      status: 'ambiguous';
      bindings: TypeBinding[];
      candidateIds: string[];
    }
  | { typeName: string; status: 'unavailable'; bindings: TypeBinding[]; reason: string };

export type TypesResult = {
  types: TypeSummary[];
  bindings: TypeBinding[];
  bindingSummaries: BindingSummary[];
  ambiguousNames: { name: string; ids: string[] }[];
  parseFailures: { path: string; errors: ParseError[] }[];
  detail: TypeDetailResult | null;
  exitCode: number;
  timing: Timing;
};

function renderDocRef(ref: { format?: string; referencedType?: string }): string {
  const parts: string[] = [];
  if (ref.format !== undefined) parts.push(ref.format);
  if (ref.referencedType !== undefined) parts.push(ref.referencedType);
  return parts.length === 0 ? 'doc-ref' : `doc-ref<${parts.join(', ')}>`;
}

function renderPropertyType(type: PropertyTypeName): string {
  if (typeof type === 'string') return type;
  switch (type.kind) {
    case 'doc-ref':
      return renderDocRef(type);
    case 'list': {
      const item = type.of.kind === 'primitive' ? type.of.name : renderDocRef(type.of);
      return `list<${item}>`;
    }
    case 'choice':
      return `choice<${type.members.map((m) => JSON.stringify(m.value)).join('|')}>`;
  }
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
  const properties: TypeDetailProperty[] = Object.entries(typeDef.schema.properties).map(
    ([name, schema]) => ({
      name,
      type: renderPropertyType(schema.type),
      required: schema.required === true,
      allowEmpty: schema['allow-empty'] === true,
      hasDefault: 'default' in schema,
    }),
  );

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

export async function runTypes(config: EffectiveConfig, detailName?: string): Promise<TypesResult> {
  const timing = createTimingRecorder();
  const universePhase = timing.startPhase();
  const universe = await buildProjectUniverse(config);
  timing.endPhase('universe', universePhase);

  const types = universe.parsedTypes.map(summarize).sort((a, b) => a.id.localeCompare(b.id));
  const bindings = [...config.bindings];
  const bindingsByType = new Map<string, TypeBinding[]>();
  for (const binding of bindings) {
    const existing = bindingsByType.get(binding.type);
    if (existing) {
      existing.push(binding);
    } else {
      bindingsByType.set(binding.type, [binding]);
    }
  }
  const toBindingSummary = (typeName: string, groupedBindings: TypeBinding[]): BindingSummary => {
    const lookup = universe.typeRegistry.getByName(typeName);
    switch (lookup.kind) {
      case 'found':
        return {
          typeName,
          status: 'found',
          bindings: groupedBindings,
          typeId: lookup.typeDef.id,
        };
      case 'not-found':
        return {
          typeName,
          status: 'not-found',
          bindings: groupedBindings,
        };
      case 'ambiguous':
        return {
          typeName,
          status: 'ambiguous',
          bindings: groupedBindings,
          candidateIds: lookup.candidates.map((c) => c.id).sort(),
        };
      case 'unavailable':
        return {
          typeName,
          status: 'unavailable',
          bindings: groupedBindings,
          reason: lookup.reason,
        };
    }
  };
  const bindingSummaries: BindingSummary[] = [...bindingsByType.entries()].map(([n, g]) =>
    toBindingSummary(n, g),
  );

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

  return {
    types,
    bindings,
    bindingSummaries,
    ambiguousNames,
    parseFailures,
    detail,
    exitCode,
    timing: timing.finish(),
  };
}
