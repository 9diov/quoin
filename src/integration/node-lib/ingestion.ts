import { readFile } from 'node:fs/promises';
import { join, posix } from 'node:path';
import fg from 'fast-glob';
import { parse as parseYaml } from 'yaml';

import type { Document } from '../../core/types.js';

export type IngestedMarkdown =
  | {
      kind: 'document';
      path: string;
      raw: string;
      document: Document;
    }
  | {
      kind: 'ingest-failure';
      path: string;
      stage: 'read' | 'frontmatter';
      reason: string;
    };

export async function discoverMarkdownFiles(
  root: string,
  include: string[],
  exclude: string[],
): Promise<string[]> {
  const entries = await fg(include, {
    cwd: root,
    ignore: exclude,
    followSymbolicLinks: false,
    onlyFiles: true,
    dot: true,
  });

  return entries.map((p) => posix.normalize(p)).sort();
}

export async function ingestMarkdownFiles(
  root: string,
  paths: string[],
): Promise<IngestedMarkdown[]> {
  return Promise.all(paths.map((p) => ingestOne(root, p)));
}

export async function discoverAndIngest(
  root: string,
  include: string[],
  exclude: string[],
): Promise<IngestedMarkdown[]> {
  const paths = await discoverMarkdownFiles(root, include, exclude);
  return ingestMarkdownFiles(root, paths);
}

async function ingestOne(root: string, relativePath: string): Promise<IngestedMarkdown> {
  const absolutePath = join(root, relativePath);

  let raw: string;
  try {
    raw = await readFile(absolutePath, 'utf-8');
  } catch (err) {
    return {
      kind: 'ingest-failure',
      path: relativePath,
      stage: 'read',
      reason: err instanceof Error ? err.message : 'Unknown read error',
    };
  }

  let frontmatterRaw: string | null;
  let body: string;
  try {
    const split = splitFrontmatter(raw);
    frontmatterRaw = split.yaml;
    body = split.body;
  } catch (err) {
    return {
      kind: 'ingest-failure',
      path: relativePath,
      stage: 'frontmatter',
      reason: err instanceof Error ? err.message : 'Unknown frontmatter error',
    };
  }

  let frontmatter: Record<string, unknown>;

  if (frontmatterRaw === null) {
    frontmatter = {};
  } else {
    const trimmed = frontmatterRaw.trim();
    if (trimmed.length === 0) {
      frontmatter = {};
    } else {
      try {
        const parsed = parseYaml(trimmed);
        if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
          frontmatter = parsed as Record<string, unknown>;
        } else {
          return {
            kind: 'ingest-failure',
            path: relativePath,
            stage: 'frontmatter',
            reason:
              'Frontmatter must be a YAML mapping, got ' +
              (parsed === null ? 'null' : Array.isArray(parsed) ? 'array' : typeof parsed),
          };
        }
      } catch (err) {
        return {
          kind: 'ingest-failure',
          path: relativePath,
          stage: 'frontmatter',
          reason: err instanceof Error ? err.message : 'YAML parse error',
        };
      }
    }
  }

  const document: Document = {
    path: relativePath,
    frontmatter,
    body,
  };

  return {
    kind: 'document',
    path: relativePath,
    raw,
    document,
  };
}

const FRONTMATTER_FENCE = /^---\s*$/;

function splitFrontmatter(raw: string): {
  yaml: string | null;
  body: string;
} {
  const lines = raw.split(/\r?\n/);
  if (lines.length === 0 || !FRONTMATTER_FENCE.test(lines[0] ?? '')) {
    return { yaml: null, body: raw };
  }

  for (let i = 1; i < lines.length; i++) {
    if (FRONTMATTER_FENCE.test(lines[i] ?? '')) {
      const yaml = lines.slice(1, i).join('\n');

      let bodyStart = 0;
      for (let lineIdx = 0; lineIdx <= i; lineIdx++) {
        bodyStart += lines[lineIdx]!.length;
        if (bodyStart < raw.length) {
          if (raw[bodyStart] === '\r' && raw[bodyStart + 1] === '\n') {
            bodyStart += 2;
          } else if (raw[bodyStart] === '\n') {
            bodyStart += 1;
          }
        }
      }

      return { yaml, body: raw.slice(bodyStart) };
    }
  }

  throw new Error('No closing --- delimiter found for frontmatter');
}

export function isTypeDefinitionCandidate(document: Document, typeDeclarationKey: string): boolean {
  return document.frontmatter[typeDeclarationKey] === 'type';
}

export function filterTypeDefinitionCandidates(
  results: IngestedMarkdown[],
  typeDeclarationKey: string,
): { path: string; document: Document }[] {
  return results
    .filter(
      (r): r is Extract<IngestedMarkdown, { kind: 'document' }> =>
        r.kind === 'document' && isTypeDefinitionCandidate(r.document, typeDeclarationKey),
    )
    .map((r) => ({ path: r.path, document: r.document }));
}
