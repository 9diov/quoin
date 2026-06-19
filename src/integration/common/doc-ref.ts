/**
 * @quoin-terms Doc Reference, Wiki Link, Markdown Link, Link Resolution, Resolver
 * @quoin-docs docs/design/D9-doc-ref-format-separation.md
 */

import { parseMarkdownLink } from '../../core/link-grammar.js';
import type { DocRefFormat } from '../../core/parser.js';

export function detectDocRefFormat(value: string): DocRefFormat | null {
  if (value.startsWith('[[') && value.endsWith(']]')) return 'wiki-link';
  if (parseMarkdownLink(value) !== null) return 'markdown-link';
  return null;
}

export function stripDocRefFragment(target: string): string {
  const hash = target.indexOf('#');
  return hash === -1 ? target : target.slice(0, hash);
}

export function safeDecodeDocRefTarget(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function matchesDocRefPathQualifier(candidatePath: string, qualifier: string): boolean {
  const normalizedCandidate = normalizeComparablePath(candidatePath);
  const normalizedQualifier = normalizeComparablePath(qualifier);
  if (normalizedCandidate === normalizedQualifier) return true;
  return normalizedCandidate.endsWith(`/${normalizedQualifier}`);
}

export function extractWikiLinkTarget(wikiLink: string): string | null {
  if (!wikiLink.startsWith('[[') || !wikiLink.endsWith(']]')) return null;

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
  if (target.length === 0 || target.includes('[') || target.includes(']')) return null;

  return target;
}

function normalizeComparablePath(value: string): string {
  return normalizeSlashes(value).replace(/\.md$/i, '').toLowerCase();
}

function normalizeSlashes(value: string): string {
  const absolute = value.trim().startsWith('/');
  const segments: string[] = [];

  for (const segment of value.trim().replaceAll('\\', '/').split('/')) {
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
