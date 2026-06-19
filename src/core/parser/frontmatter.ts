/**
 * @quoin-terms Document, Parser, Type Declaration, Type Definition Document
 * @quoin-docs docs/design/D2-type-and-schema-contracts.md
 */

import { parse as parseYaml } from 'yaml';

import type { ParseError } from '../parser.js';
import { documentError } from './errors.js';

export type FrontmatterResult =
  | { kind: 'ok'; body: string; frontmatter: Record<string, unknown> }
  | { kind: 'error'; errors: ParseError[] };

const FRONTMATTER_FENCE = /^---\s*$/;

function splitFrontmatter(raw: string): { yaml: string; body: string } | null {
  const lines = raw.split(/\r?\n/);
  if (lines.length === 0 || !FRONTMATTER_FENCE.test(lines[0] ?? '')) {
    return null;
  }
  for (let i = 1; i < lines.length; i++) {
    if (FRONTMATTER_FENCE.test(lines[i] ?? '')) {
      const yaml = lines.slice(1, i).join('\n');
      const body = lines.slice(i + 1).join('\n');
      return { yaml, body };
    }
  }
  return null;
}

export function extractAndValidateFrontmatter(
  raw: string,
  typeDeclarationKey: string,
): FrontmatterResult {
  const split = splitFrontmatter(raw);
  if (split === null) {
    return {
      kind: 'error',
      errors: [
        documentError(
          'parser:missing-type-declaration',
          `Type Definition Document must declare \`${typeDeclarationKey}: type\` in frontmatter.`,
        ),
      ],
    };
  }

  let parsed: unknown;
  try {
    parsed = parseYaml(split.yaml);
  } catch (e) {
    return {
      kind: 'error',
      errors: [
        documentError(
          'parser:missing-type-declaration',
          `Frontmatter is not valid YAML: ${(e as Error).message}`,
        ),
      ],
    };
  }

  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return {
      kind: 'error',
      errors: [
        documentError(
          'parser:missing-type-declaration',
          `Frontmatter must be a YAML mapping containing \`${typeDeclarationKey}: type\`.`,
        ),
      ],
    };
  }

  const frontmatter = parsed as Record<string, unknown>;
  if (!(typeDeclarationKey in frontmatter)) {
    return {
      kind: 'error',
      errors: [
        documentError(
          'parser:missing-type-declaration',
          `Frontmatter does not contain the Type Declaration key \`${typeDeclarationKey}\`.`,
          { key: typeDeclarationKey },
        ),
      ],
    };
  }

  const value = frontmatter[typeDeclarationKey];
  if (value !== 'type') {
    return {
      kind: 'error',
      errors: [
        documentError(
          'parser:invalid-type-declaration',
          `Type Definition Documents must declare \`${typeDeclarationKey}: type\`; got ${JSON.stringify(value)}.`,
          { value },
        ),
      ],
    };
  }

  return { kind: 'ok', body: split.body, frontmatter };
}
