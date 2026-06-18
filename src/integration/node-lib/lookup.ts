import { basename as nativeBasename, posix } from 'node:path';
import type {
  ResolveDocReferenceInput,
  ResolveDocReferenceResult,
  Resolver,
} from '../../core/integration.js';
import { parseMarkdownLink } from '../../core/link-grammar.js';
import type { ParserConfig } from '../../core/parser.js';
import type { Document } from '../../core/types.js';
import {
  detectDocRefFormat,
  extractWikiLinkTarget,
  matchesDocRefPathQualifier,
  safeDecodeDocRefTarget,
  stripDocRefFragment,
} from '../common/doc-ref.js';
import type { ParseFailure } from '../common/type-candidates.js';
import { parseTypeCandidates as parseSharedTypeCandidates } from '../common/type-candidates.js';
import {
  createTypeRegistry as createSharedTypeRegistry,
  deriveTypeIdentity,
} from '../common/type-registry.js';

import type { IngestedMarkdown } from './ingestion.js';

export type { ParseFailure } from '../common/type-candidates.js';

export function parseTypeCandidates(
  candidates: { path: string; raw: string }[],
  parserConfig: ParserConfig,
) {
  return parseSharedTypeCandidates(candidates, parserConfig);
}

export function deriveIdentity(relativePath: string): {
  id: string;
  name: string;
} {
  return deriveTypeIdentity(relativePath);
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
      const narrowedDocs = documents.filter((doc) => matchesDocRefPathQualifier(doc.path, target));
      const narrowedFailures = failures.filter((f) => matchesDocRefPathQualifier(f.path, target));
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

    const targetWithoutFragment = stripDocRefFragment(parts.target);
    if (targetWithoutFragment.length === 0) {
      return {
        kind: 'invalid-link',
        value: input.value,
        format: 'markdown-link',
        reason: 'Markdown link target is empty',
      };
    }

    const decodedTarget = safeDecodeDocRefTarget(targetWithoutFragment);
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
    const format = input.format ?? detectDocRefFormat(input.value);
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
  parsedTypeDefs: Parameters<typeof createSharedTypeRegistry>[0],
  parseFailures: ParseFailure[] = [],
) {
  return createSharedTypeRegistry(parsedTypeDefs, parseFailures, nativeBasename);
}

function lowercaseBasename(relativePath: string): string {
  const ext = posix.extname(relativePath);
  const name = posix.basename(relativePath, ext);
  return name.toLowerCase();
}
