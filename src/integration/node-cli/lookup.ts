import { basename as nativeBasename, posix } from 'node:path';
import type {
  ResolveDocReferenceInput,
  ResolveDocReferenceResult,
  Resolver,
  TypeDeclarationLookupResult,
  TypeReferenceLookupResult,
  TypeRegistry,
} from '../../core/integration.js';
import { parseMarkdownLink } from '../../core/link-grammar.js';
import type {
  DocRefFormat,
  ParsedTypeDefinitionDocument,
  ParseError,
  ParserConfig,
} from '../../core/parser.js';
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

function detectFormat(value: string): DocRefFormat | null {
  if (value.startsWith('[[') && value.endsWith(']]')) return 'wiki-link';
  if (parseMarkdownLink(value) !== null) return 'markdown-link';
  return null;
}

export function createResolver(ingested: IngestedMarkdown[]): Resolver {
  type FailureRecord = { path: string; reason: string };
  const byBasename = new Map<string, Document[]>();
  const failedBasenames = new Map<string, FailureRecord[]>();
  const byPath = new Map<string, Document>();
  const failedByPath = new Map<string, string>();

  for (const entry of ingested) {
    const basename = lowercaseBasename(entry.path);
    const normalizedPath = posix.normalize(entry.path.replaceAll('\\', '/'));

    if (entry.kind === 'document') {
      const existing = byBasename.get(basename);
      if (existing) {
        existing.push(entry.document);
      } else {
        byBasename.set(basename, [entry.document]);
      }
      byPath.set(normalizedPath, entry.document);
    } else {
      const record: FailureRecord = { path: normalizedPath, reason: entry.reason };
      const existing = failedBasenames.get(basename);
      if (existing) {
        existing.push(record);
      } else {
        failedBasenames.set(basename, [record]);
      }
      failedByPath.set(normalizedPath, entry.reason);
    }
  }

  const resolveWikiLink = (input: ResolveDocReferenceInput): ResolveDocReferenceResult => {
    const target = extractWikiLinkTarget(input.value);
    if (target === null) {
      return {
        kind: 'invalid-link',
        value: input.value,
        format: 'wiki-link',
        reason: 'Wiki Link must be in the form [[Target]]',
      };
    }

    const basename = nativeBasename(target).toLowerCase();
    const documents = byBasename.get(basename) ?? [];
    const failures = failedBasenames.get(basename) ?? [];
    const totalCount = documents.length + failures.length;

    if (totalCount === 0) {
      return { kind: 'not-found', value: input.value, format: 'wiki-link' };
    }

    if (totalCount > 1 && target.includes('/')) {
      const narrowedDocs = documents.filter((doc) => matchesPathQualifier(doc.path, target));
      const narrowedFailures = failures.filter((f) => matchesPathQualifier(f.path, target));
      const narrowedTotal = narrowedDocs.length + narrowedFailures.length;

      if (narrowedTotal === 1) {
        if (narrowedDocs.length === 1 && narrowedDocs[0]) {
          return { kind: 'found', document: narrowedDocs[0] };
        }
        const reason = narrowedFailures[0]?.reason ?? 'Unknown ingestion failure';
        return { kind: 'unavailable', value: input.value, format: 'wiki-link', reason };
      }

      if (narrowedTotal > 1) {
        return {
          kind: 'ambiguous',
          value: input.value,
          format: 'wiki-link',
          candidates: narrowedDocs,
        };
      }
      // narrowedTotal === 0: qualifier matched nothing — fall through to
      // report the original basename ambiguity so the user sees what was
      // available.
    }

    if (totalCount > 1) {
      return {
        kind: 'ambiguous',
        value: input.value,
        format: 'wiki-link',
        candidates: documents,
      };
    }

    if (documents.length === 1 && documents[0]) {
      return { kind: 'found', document: documents[0] };
    }

    const reason = failures[0]?.reason ?? 'Unknown ingestion failure';
    return { kind: 'unavailable', value: input.value, format: 'wiki-link', reason };
  };

  const resolveMarkdownLink = (input: ResolveDocReferenceInput): ResolveDocReferenceResult => {
    const parts = parseMarkdownLink(input.value);
    if (parts === null) {
      return {
        kind: 'invalid-link',
        value: input.value,
        format: 'markdown-link',
        reason: 'Markdown link must be in the form [label](target)',
      };
    }

    const targetWithoutFragment = stripFragment(parts.target);
    if (targetWithoutFragment.length === 0) {
      return {
        kind: 'invalid-link',
        value: input.value,
        format: 'markdown-link',
        reason: 'Markdown link target is empty',
      };
    }

    const decodedTarget = safeDecodeURI(targetWithoutFragment);
    const normalizedSource = posix.normalize(input.sourceDocumentPath.replaceAll('\\', '/'));
    const sourceDir = posix.dirname(normalizedSource);
    let resolved: string;
    if (decodedTarget.startsWith('/')) {
      resolved = posix.normalize(decodedTarget.slice(1));
    } else {
      resolved = posix.normalize(posix.join(sourceDir, decodedTarget));
    }

    const doc = byPath.get(resolved);
    if (doc !== undefined) {
      return { kind: 'found', document: doc };
    }

    const failureReason = failedByPath.get(resolved);
    if (failureReason !== undefined) {
      return {
        kind: 'unavailable',
        value: input.value,
        format: 'markdown-link',
        reason: failureReason,
      };
    }

    return { kind: 'not-found', value: input.value, format: 'markdown-link' };
  };

  return (input: ResolveDocReferenceInput): ResolveDocReferenceResult => {
    const format = input.format ?? detectFormat(input.value);
    if (format === 'wiki-link') return resolveWikiLink(input);
    if (format === 'markdown-link') return resolveMarkdownLink(input);
    // Unknown format implies invalid shape; surface as invalid-link with a
    // best-effort default format for downstream display.
    return {
      kind: 'invalid-link',
      value: input.value,
      format: 'wiki-link',
      reason: 'Value is not a recognized document-reference syntax',
    };
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
          return lookupByName(nativeBasename(target));
        }
      }

      return { kind: 'invalid-declaration', value };
    },
  };
}

function stripFragment(target: string): string {
  const hash = target.indexOf('#');
  return hash === -1 ? target : target.slice(0, hash);
}

function safeDecodeURI(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
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

  return target;
}

function matchesPathQualifier(candidatePath: string, qualifier: string): boolean {
  const normalizedCandidate = posix
    .normalize(candidatePath.replaceAll('\\', '/'))
    .replace(/\.md$/i, '')
    .toLowerCase();
  const normalizedQualifier = posix
    .normalize(qualifier.replaceAll('\\', '/'))
    .replace(/\.md$/i, '')
    .toLowerCase();
  if (normalizedCandidate === normalizedQualifier) return true;
  return normalizedCandidate.endsWith(`/${normalizedQualifier}`);
}

function lowercaseBasename(relativePath: string): string {
  const ext = posix.extname(relativePath);
  const name = posix.basename(relativePath, ext);
  return name.toLowerCase();
}
