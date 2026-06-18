import type {
  TypeDeclarationLookupResult,
  TypeReferenceLookupResult,
  TypeRegistry,
} from '../../core/integration.js';
import type { ParsedTypeDefinitionDocument } from '../../core/parser.js';

import { extractWikiLinkTarget } from './doc-ref.js';
import type { ParseFailure } from './type-candidates.js';

export function deriveTypeIdentity(relativePath: string): {
  id: string;
  name: string;
} {
  const normalized = normalizeRelativePath(relativePath);
  const fileName = basenameWithoutExtension(normalized);
  return {
    id: normalized,
    name: fileName.toLowerCase(),
  };
}

export function createTypeRegistry(
  parsedTypeDefs: ParsedTypeDefinitionDocument[],
  parseFailures: ParseFailure[] = [],
  declarationTargetToTypeName: (target: string) => string = basenameWithoutExtension,
): TypeRegistry {
  const byName = new Map<string, ParsedTypeDefinitionDocument[]>();
  const failedByName = new Map<string, string>();

  for (const typeDef of parsedTypeDefs) {
    const existing = byName.get(typeDef.name);
    if (existing) {
      existing.push(typeDef);
    } else {
      byName.set(typeDef.name, [typeDef]);
    }
  }

  for (const failure of parseFailures) {
    const identity = deriveTypeIdentity(failure.path);
    if (!failedByName.has(identity.name)) {
      failedByName.set(identity.name, `Parse failed: ${failure.errors.length} error(s)`);
    }
  }

  const lookupByName = (typeName: string): TypeReferenceLookupResult => {
    const name = typeName.toLowerCase();
    const matches = byName.get(name);

    if (!matches || matches.length === 0) {
      const failureReason = failedByName.get(name);
      if (failureReason !== undefined) {
        return { kind: 'unavailable', reason: failureReason };
      }
      return { kind: 'not-found', typeName: name };
    }

    if (matches.length > 1) {
      return { kind: 'ambiguous', typeName: name, candidates: matches };
    }

    const typeDef = matches[0];
    if (!typeDef) {
      const failureReason = failedByName.get(name);
      if (failureReason !== undefined) {
        return { kind: 'unavailable', reason: failureReason };
      }
      return { kind: 'not-found', typeName: name };
    }

    return { kind: 'found', typeDef };
  };

  return {
    getByName(typeName: string): TypeReferenceLookupResult {
      return lookupByName(typeName);
    },

    getByDeclaration(value: unknown): TypeDeclarationLookupResult {
      if (value === undefined || value === null) {
        return { kind: 'missing-declaration' };
      }

      if (value === 'type') {
        return lookupByName('type');
      }

      if (typeof value === 'string') {
        const target = extractWikiLinkTarget(value);
        if (target !== null) {
          return lookupByName(declarationTargetToTypeName(target));
        }
      }

      return { kind: 'invalid-declaration', value };
    },
  };
}

function basenameWithoutExtension(path: string): string {
  const normalized = normalizeRelativePath(path);
  const filename = normalized.slice(normalized.lastIndexOf('/') + 1);
  const dot = filename.lastIndexOf('.');
  return dot <= 0 ? filename : filename.slice(0, dot);
}

function normalizeRelativePath(path: string): string {
  const absolute = path.trim().startsWith('/');
  const segments: string[] = [];

  for (const segment of path.trim().replaceAll('\\', '/').split('/')) {
    if (segment.length === 0 || segment === '.') continue;
    if (segment === '..') {
      if (segments.length > 0 && segments[segments.length - 1] !== '..') {
        segments.pop();
      } else {
        segments.push(segment);
      }
      continue;
    }
    segments.push(segment);
  }

  const normalized = segments.join('/');
  return absolute ? `/${normalized}` : normalized;
}
