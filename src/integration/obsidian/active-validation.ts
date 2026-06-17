import type { App, CachedMetadata, TFile } from 'obsidian';

import type { TypeRegistry } from '../../core/integration.js';
import type { ParsedTypeDefinitionDocument } from '../../core/parser.js';
import type { Document } from '../../core/types.js';
import type { ValidationResult } from '../../core/validation.js';
import { validate } from '../../core/validation.js';
import type { EffectiveTypeDeclaration, TypeBinding } from './bindings.js';
import { deriveObsidianTypeIdentity, inspectTypeDefinitionCandidate } from './discovery.js';
import type { ObsidianBasenameIndex } from './lookup.js';
import { createObsidianResolver, resolveObsidianEffectiveTypeDeclaration } from './lookup.js';
import type { ObsidianPluginSettings } from './settings.js';

export type ActiveFileValidationState =
  | { kind: 'hidden' }
  | { kind: 'read-failure'; path: string; reason: string }
  | { kind: 'frontmatter-failure'; path: string; reason: string }
  | { kind: 'type-definition'; path: string; typeName: string }
  | { kind: 'untyped'; path: string }
  | { kind: 'ambiguous-binding'; path: string; candidates: TypeBinding[] }
  | { kind: 'invalid-type-declaration'; path: string; value: unknown }
  | { kind: 'type-not-found'; path: string; typeName: string; declaration: unknown }
  | {
      kind: 'type-ambiguous';
      path: string;
      typeName: string;
      declaration: unknown;
      candidateIds: string[];
    }
  | { kind: 'type-unavailable'; path: string; reason: string; declaration: unknown }
  | {
      kind: 'binding-type-not-found';
      path: string;
      typeName: string;
      matchedBinding: TypeBinding;
    }
  | {
      kind: 'binding-type-ambiguous';
      path: string;
      typeName: string;
      matchedBinding: TypeBinding;
      candidateIds: string[];
    }
  | { kind: 'binding-type-unavailable'; path: string; reason: string; matchedBinding: TypeBinding }
  | {
      kind: 'validated';
      path: string;
      typeId: string;
      typeName: string;
      result: ValidationResult;
    };

export type ActiveFileValidationDependencies = {
  app: App;
  file: TFile | null;
  settings: ObsidianPluginSettings;
  typeRegistry: TypeRegistry;
  basenameIndex: ObsidianBasenameIndex;
};

export type ActiveFileStatusRender =
  | { visible: false }
  | {
      visible: true;
      text: string;
      tooltip: string;
      statusKind:
        | 'untyped'
        | 'type-definition'
        | 'warning'
        | 'error'
        | 'success'
        | 'success-warning';
      clickTarget: 'validation' | 'types';
    };

export async function validateActiveFile(
  deps: ActiveFileValidationDependencies,
): Promise<ActiveFileValidationState> {
  const { app, file, settings, typeRegistry, basenameIndex } = deps;
  if (file === null || file.extension !== 'md') return { kind: 'hidden' };

  const fileCache = app.metadataCache.getFileCache(file);
  const frontmatter = fileCache?.frontmatter;
  const candidate = inspectTypeDefinitionCandidate(
    file.path,
    frontmatter,
    settings.typeDeclarationKey,
  );

  if (candidate.kind === 'diagnostic') {
    return {
      kind: 'frontmatter-failure',
      path: file.path,
      reason: candidate.diagnostic.reason,
    };
  }

  let raw: string;
  try {
    raw = await app.vault.read(file);
  } catch (error) {
    return {
      kind: 'read-failure',
      path: file.path,
      reason: error instanceof Error ? error.message : 'Unknown read error',
    };
  }

  const document: Document = {
    path: file.path,
    frontmatter: isRecord(frontmatter) ? frontmatter : {},
    body: getDocumentBody(raw, fileCache),
  };

  if (candidate.kind === 'candidate') {
    return {
      kind: 'type-definition',
      path: file.path,
      typeName: deriveObsidianTypeIdentity(file.path).name,
    };
  }

  const effective = resolveObsidianEffectiveTypeDeclaration(document, file.path, settings);

  return validateByEffectiveDeclaration({
    app,
    basenameIndex,
    document,
    effective,
    settings,
    typeRegistry,
  });
}

export function renderActiveFileStatus(state: ActiveFileValidationState): ActiveFileStatusRender {
  switch (state.kind) {
    case 'hidden':
      return { visible: false };
    case 'untyped':
      return {
        visible: true,
        text: '•',
        tooltip: 'Untyped',
        statusKind: 'untyped',
        clickTarget: 'validation',
      };
    case 'type-definition':
      return {
        visible: true,
        text: '◇',
        tooltip: `Type definition: ${state.typeName}`,
        statusKind: 'type-definition',
        clickTarget: 'types',
      };
    case 'validated':
      if (state.result.errors.length > 0) {
        return {
          visible: true,
          text: `✗ ${state.result.errors.length}`,
          tooltip: `${state.result.errors.length} validation error(s)`,
          statusKind: 'error',
          clickTarget: 'validation',
        };
      }

      if (state.result.warnings.length > 0) {
        return {
          visible: true,
          text: '✓',
          tooltip: `Conforms with ${state.result.warnings.length} warning(s)`,
          statusKind: 'success-warning',
          clickTarget: 'validation',
        };
      }

      return {
        visible: true,
        text: '✓',
        tooltip: `Conforms to ${state.typeName}`,
        statusKind: 'success',
        clickTarget: 'validation',
      };
    case 'read-failure':
      return warningStatus(`Could not read ${state.path}: ${state.reason}`);
    case 'frontmatter-failure':
      return warningStatus(state.reason);
    case 'ambiguous-binding':
      return warningStatus(`Ambiguous bindings: ${state.candidates.map(formatBinding).join(', ')}`);
    case 'invalid-type-declaration':
      return warningStatus(`Invalid type declaration: ${JSON.stringify(state.value)}`);
    case 'type-not-found':
      return warningStatus(`Type not found: ${state.typeName}`);
    case 'type-ambiguous':
      return warningStatus(`Type is ambiguous: ${state.typeName}`);
    case 'type-unavailable':
      return warningStatus(state.reason);
    case 'binding-type-not-found':
      return warningStatus(`Bound type not found: ${state.typeName}`);
    case 'binding-type-ambiguous':
      return warningStatus(`Bound type is ambiguous: ${state.typeName}`);
    case 'binding-type-unavailable':
      return warningStatus(state.reason);
  }
}

function validateByEffectiveDeclaration(args: {
  app: App;
  basenameIndex: ObsidianBasenameIndex;
  document: Document;
  effective: EffectiveTypeDeclaration;
  settings: ObsidianPluginSettings;
  typeRegistry: TypeRegistry;
}): ActiveFileValidationState {
  const { app, basenameIndex, document, effective, settings, typeRegistry } = args;

  switch (effective.kind) {
    case 'untyped':
      return { kind: 'untyped', path: document.path };
    case 'ambiguous-binding':
      return { kind: 'ambiguous-binding', path: document.path, candidates: effective.candidates };
    case 'frontmatter':
      return validateFrontmatterDeclaration(document, effective.value, args);
    case 'binding':
      return validateBindingDeclaration(document, effective, {
        app,
        basenameIndex,
        settings,
        typeRegistry,
      });
  }
}

function validateFrontmatterDeclaration(
  document: Document,
  declaration: unknown,
  args: {
    app: App;
    basenameIndex: ObsidianBasenameIndex;
    settings: ObsidianPluginSettings;
    typeRegistry: TypeRegistry;
  },
): ActiveFileValidationState {
  const lookup = args.typeRegistry.getByDeclaration(declaration);

  switch (lookup.kind) {
    case 'found':
      return validated(document, lookup.typeDef, args);
    case 'missing-declaration':
      return { kind: 'untyped', path: document.path };
    case 'invalid-declaration':
      return { kind: 'invalid-type-declaration', path: document.path, value: lookup.value };
    case 'not-found':
      return {
        kind: 'type-not-found',
        path: document.path,
        typeName: lookup.typeName,
        declaration,
      };
    case 'ambiguous':
      return {
        kind: 'type-ambiguous',
        path: document.path,
        typeName: lookup.typeName,
        declaration,
        candidateIds: lookup.candidates.map((candidate) => candidate.id),
      };
    case 'unavailable':
      return {
        kind: 'type-unavailable',
        path: document.path,
        reason: lookup.reason,
        declaration,
      };
  }
}

function validateBindingDeclaration(
  document: Document,
  effective: Extract<EffectiveTypeDeclaration, { kind: 'binding' }>,
  args: {
    app: App;
    basenameIndex: ObsidianBasenameIndex;
    settings: ObsidianPluginSettings;
    typeRegistry: TypeRegistry;
  },
): ActiveFileValidationState {
  const lookup = args.typeRegistry.getByName(effective.typeName);

  switch (lookup.kind) {
    case 'found':
      return validated(document, lookup.typeDef, args);
    case 'not-found':
      return {
        kind: 'binding-type-not-found',
        path: document.path,
        typeName: lookup.typeName,
        matchedBinding: effective.matchedBinding,
      };
    case 'ambiguous':
      return {
        kind: 'binding-type-ambiguous',
        path: document.path,
        typeName: lookup.typeName,
        matchedBinding: effective.matchedBinding,
        candidateIds: lookup.candidates.map((candidate) => candidate.id),
      };
    case 'unavailable':
      return {
        kind: 'binding-type-unavailable',
        path: document.path,
        reason: lookup.reason,
        matchedBinding: effective.matchedBinding,
      };
  }
}

function validated(
  document: Document,
  typeDef: ParsedTypeDefinitionDocument,
  args: {
    app: App;
    basenameIndex: ObsidianBasenameIndex;
    settings: ObsidianPluginSettings;
    typeRegistry: TypeRegistry;
  },
): ActiveFileValidationState {
  const result = validate(
    document,
    typeDef,
    {
      typeDeclarationKey: args.settings.typeDeclarationKey,
      untypedDocumentBehavior: args.settings.untypedDocumentBehavior,
      referentialValidation: args.settings.referentialValidation,
      allowedUrlSchemes: args.settings.allowedUrlSchemes,
      integration: 'obsidian',
    },
    createObsidianResolver(args.app, args.basenameIndex, document.path),
    args.typeRegistry,
  );

  return {
    kind: 'validated',
    path: document.path,
    typeId: typeDef.id,
    typeName: typeDef.name,
    result,
  };
}

function warningStatus(tooltip: string): ActiveFileStatusRender {
  return {
    visible: true,
    text: '⚠',
    tooltip,
    statusKind: 'warning',
    clickTarget: 'validation',
  };
}

function formatBinding(binding: TypeBinding): string {
  return `${binding.type}:${binding.match}`;
}

function getDocumentBody(raw: string, fileCache: CachedMetadata | null): string {
  const endOffset = fileCache?.frontmatterPosition?.end.offset;
  if (typeof endOffset === 'number' && endOffset >= 0 && endOffset <= raw.length) {
    return raw.slice(skipLineEnding(raw, endOffset));
  }

  // NOTE: Older or mocked metadata cache shapes may not include frontmatterPosition.
  // Keep this fallback aligned with the core ingestion delimiter model.
  return splitFrontmatterBody(raw);
}

function splitFrontmatterBody(raw: string): string {
  const lines = raw.split(/\r?\n/);
  if (lines.length === 0 || !/^---\s*$/.test(lines[0] ?? '')) return raw;

  for (let index = 1; index < lines.length; index += 1) {
    if (/^(---|\.\.\.)\s*$/.test(lines[index] ?? '')) {
      return lines.slice(index + 1).join('\n');
    }
  }

  return raw;
}

function skipLineEnding(raw: string, offset: number): number {
  if (raw[offset] === '\r' && raw[offset + 1] === '\n') return offset + 2;
  if (raw[offset] === '\n') return offset + 1;
  return offset;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
