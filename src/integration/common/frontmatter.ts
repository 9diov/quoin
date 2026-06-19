/**
 * @quoin-terms Document, Property, Type Declaration
 * @quoin-docs docs/design/D2-type-and-schema-contracts.md
 */

import { stringify as stringifyYaml } from 'yaml';

export function serializeFrontmatter(frontmatter: Record<string, unknown>): string {
  const yaml = stringifyYaml(frontmatter, {
    lineWidth: 0,
    sortMapEntries: false,
  });
  return `---\n${yaml}---\n`;
}

export function frontmatterBlockLength(frontmatter: Record<string, unknown>): number {
  return serializeFrontmatter(frontmatter).length;
}

export function serializeDocument(frontmatter: Record<string, unknown>, body: string): string {
  const frontmatterBlock = serializeFrontmatter(frontmatter);
  if (body.length === 0) return frontmatterBlock;

  let content = `${frontmatterBlock}\n${body}`;
  if (!content.endsWith('\n')) {
    content += '\n';
  }
  return content;
}

export function extractDocumentBody(raw: string, frontmatterEndOffset?: number): string {
  if (
    typeof frontmatterEndOffset === 'number' &&
    frontmatterEndOffset >= 0 &&
    frontmatterEndOffset <= raw.length
  ) {
    return raw.slice(skipLineEnding(raw, frontmatterEndOffset));
  }

  return splitFrontmatter(raw).body;
}

export function extractDocumentBodyBestEffort(raw: string, frontmatterEndOffset?: number): string {
  if (
    typeof frontmatterEndOffset === 'number' &&
    frontmatterEndOffset >= 0 &&
    frontmatterEndOffset <= raw.length
  ) {
    return raw.slice(skipLineEnding(raw, frontmatterEndOffset));
  }

  try {
    return splitFrontmatter(raw).body;
  } catch {
    return raw;
  }
}

export function splitFrontmatter(raw: string): {
  yaml: string | null;
  body: string;
} {
  const lines = raw.split(/\r?\n/);
  if (lines.length === 0 || !/^---\s*$/.test(lines[0] ?? '')) {
    return { yaml: null, body: raw };
  }

  for (let index = 1; index < lines.length; index += 1) {
    if (/^(---|\.\.\.)\s*$/.test(lines[index] ?? '')) {
      const yaml = lines.slice(1, index).join('\n');

      let bodyStart = 0;
      for (let lineIdx = 0; lineIdx <= index; lineIdx += 1) {
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

function skipLineEnding(raw: string, offset: number): number {
  if (raw[offset] === '\r' && raw[offset + 1] === '\n') return offset + 2;
  if (raw[offset] === '\n') return offset + 1;
  return offset;
}
