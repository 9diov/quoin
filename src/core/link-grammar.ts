/**
 * @quoin-terms Doc Reference, Wiki Link, Markdown Link, External Link, Link Resolution
 * @quoin-docs docs/design/D9-doc-ref-format-separation.md
 */

import type { DocRefFormat } from './parser.js';

export function isValidWikiLinkShape(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  if (value !== value.trim()) return false;
  if (!value.startsWith('[[') || !value.endsWith(']]')) return false;
  const inner = value.slice(2, -2);
  if (inner.length === 0) return false;
  if (inner.includes('[[') || inner.includes(']]')) return false;

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
  return target.length > 0;
}

const MARKDOWN_LINK_RE = /^\[([^\]]+)\]\(([^)]+)\)$/;
const PROTOCOL_RE = /^[a-zA-Z][a-zA-Z0-9+\-.]*:/;

export type MarkdownLinkParts = {
  label: string;
  target: string;
};

export function parseMarkdownLink(value: unknown): MarkdownLinkParts | null {
  if (typeof value !== 'string') return null;
  if (value !== value.trim()) return null;
  const match = MARKDOWN_LINK_RE.exec(value);
  if (!match) return null;
  const label = match[1] ?? '';
  const target = match[2] ?? '';
  if (label.length === 0) return null;
  if (target.length === 0) return null;
  if (target !== target.trim()) return null;
  if (PROTOCOL_RE.test(target)) return null;
  return { label, target };
}

export function isValidMarkdownLinkShape(value: unknown): value is string {
  return parseMarkdownLink(value) !== null;
}

export function detectDocRefFormat(value: unknown): DocRefFormat | null {
  if (typeof value !== 'string') return null;
  if (isValidWikiLinkShape(value)) return 'wiki-link';
  if (isValidMarkdownLinkShape(value)) return 'markdown-link';
  return null;
}
