import { basename as nativeBasename, posix } from 'node:path';
import type {
  Resolver,
  ResolveWikiLinkResult,
  TypeDeclarationLookupResult,
  TypeReferenceLookupResult,
  TypeRegistry,
} from '../../core/integration.js';
import type { ParsedTypeDefinitionDocument, ParseError, ParserConfig } from '../../core/parser.js';
import { parseTypeDefinitionDocument } from '../../core/parser.js';
import type { Document } from '../../core/types.js';

import type { IngestedMarkdown } from './ingestion.js';

export type ParseFailure = {
  path: string;
  errors: ParseError[];
};

export function deriveIdentity(relativePath: string): {
  id: string;
  name: string;
} {
  const normalized = posix.normalize(relativePath.replaceAll('\\', '/'));
  const ext = posix.extname(normalized);
  const fileName = posix.basename(normalized, ext);
  return {
    id: normalized,
    name: fileName.toLowerCase(),
  };
}

export function parseTypeCandidates(
  candidates: { path: string; raw: string }[],
  parserConfig: ParserConfig,
): {
  parsed: ParsedTypeDefinitionDocument[];
  failures: ParseFailure[];
} {
  const parsed: ParsedTypeDefinitionDocument[] = [];
  const failures: ParseFailure[] = [];

  for (const candidate of candidates) {
    const identity = deriveIdentity(candidate.path);
    const result = parseTypeDefinitionDocument(candidate.raw, identity, parserConfig);

    if (result.kind === 'ok') {
      parsed.push(result.typeDef);
    } else {
      failures.push({ path: candidate.path, errors: result.errors });
    }
  }

  return { parsed, failures };
}

export function createResolver(ingested: IngestedMarkdown[]): Resolver {
  const byBasename = new Map<string, Document[]>();
  const failedBasenames = new Map<string, string[]>();

  for (const entry of ingested) {
    const basename = lowercaseBasename(entry.path);

    if (entry.kind === 'document') {
      const existing = byBasename.get(basename);
      if (existing) {
        existing.push(entry.document);
      } else {
        byBasename.set(basename, [entry.document]);
      }
    } else {
      const existing = failedBasenames.get(basename);
      if (existing) {
        existing.push(entry.reason);
      } else {
        failedBasenames.set(basename, [entry.reason]);
      }
    }
  }

  return (wikiLink: string): ResolveWikiLinkResult => {
    const target = extractWikiLinkTarget(wikiLink);
    if (target === null) {
      return {
        kind: 'invalid-link',
        wikiLink,
        reason: 'Wiki Link must be in the form [[Target]]',
      };
    }

    const basename = target.toLowerCase();
    const documents = byBasename.get(basename);
    const failures = failedBasenames.get(basename);

    const docCount = documents?.length ?? 0;
    const failureCount = failures?.length ?? 0;
    const totalCount = docCount + failureCount;

    if (totalCount === 0) {
      return { kind: 'not-found', wikiLink };
    }

    if (totalCount > 1) {
      return {
        kind: 'ambiguous',
        wikiLink,
        candidates: documents ?? [],
      };
    }

    if (documents !== undefined && documents.length === 1 && documents[0]) {
      return { kind: 'found', document: documents[0] };
    }

    const reason = failures?.[0] ?? 'Unknown ingestion failure';
    return { kind: 'unavailable', wikiLink, reason };
  };
}

export function createTypeRegistry(
  parsedTypeDefs: ParsedTypeDefinitionDocument[],
  parseFailures: ParseFailure[] = [],
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
    const identity = deriveIdentity(failure.path);
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
          return lookupByName(target);
        }
      }

      return { kind: 'invalid-declaration', value };
    },
  };
}

function extractWikiLinkTarget(wikiLink: string): string | null {
  if (!wikiLink.startsWith('[[') || !wikiLink.endsWith(']]')) {
    return null;
  }

  const inner = wikiLink.slice(2, -2);
  if (inner.length === 0) return null;

  const hashIdx = inner.indexOf('#');
  const pipeIdx = inner.indexOf('|');

  let targetEnd: number;
  if (hashIdx === -1 && pipeIdx === -1) {
    targetEnd = inner.length;
  } else if (hashIdx === -1) {
    targetEnd = pipeIdx;
  } else if (pipeIdx === -1) {
    targetEnd = hashIdx;
  } else {
    targetEnd = Math.min(hashIdx, pipeIdx);
  }

  const target = inner.slice(0, targetEnd);
  if (target.length === 0) return null;

  if (target.includes('[') || target.includes(']')) return null;

  const basename = nativeBasename(target);
  return basename;
}

function lowercaseBasename(relativePath: string): string {
  const ext = posix.extname(relativePath);
  const name = posix.basename(relativePath, ext);
  return name.toLowerCase();
}
