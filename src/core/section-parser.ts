/**
 * @quoin-terms Section, Template Block, Parser, Parse Result
 * @quoin-docs docs/design/D2-type-and-schema-contracts.md
 */

import type { Heading, Html, PhrasingContent, Root } from 'mdast';
import remarkParse from 'remark-parse';
import { unified } from 'unified';
import { sectionError } from './parser/errors.js';
import type { ParseError, Section } from './parser.js';

const REQUIRED_MARKER = /<!--\s*required\s*-->/;

const processor = unified().use(remarkParse);

export type AtxHeading = {
  level: number;
  heading: string;
  startOffset: number;
  endOffset: number;
};

function isHtmlNode(node: PhrasingContent): node is Html {
  return node.type === 'html';
}

function isAtxHeading(node: Heading, source: string): boolean {
  const offset = node.position?.start?.offset;
  if (typeof offset !== 'number') return false;
  // ATX headings start with `#` (allowing up to 3 leading spaces per CommonMark).
  // Setext headings start with the heading text on the first line.
  for (let i = offset; i < source.length; i++) {
    const ch = source[i];
    if (ch === ' ') continue;
    return ch === '#';
  }
  return false;
}

function extractHeadingText(node: Heading): string {
  const parts: string[] = [];
  for (const child of node.children) {
    if (isHtmlNode(child)) continue;
    if (child.type === 'text') parts.push(child.value);
    else if (child.type === 'inlineCode') parts.push(child.value);
    else if ('value' in child && typeof child.value === 'string') parts.push(child.value);
    else if ('children' in child) {
      for (const grand of child.children) {
        if ('value' in grand && typeof grand.value === 'string') parts.push(grand.value);
      }
    }
  }
  return parts.join('').trim();
}

export function extractAtxHeadings(markdown: string): AtxHeading[] {
  const tree = processor.parse(markdown) as Root;
  const headings: AtxHeading[] = [];
  for (const node of tree.children) {
    if (node.type !== 'heading') continue;
    if (!isAtxHeading(node, markdown)) continue;
    const startOffset = node.position?.start?.offset;
    const endOffset = node.position?.end?.offset;
    if (typeof startOffset !== 'number' || typeof endOffset !== 'number') continue;
    headings.push({
      level: node.depth,
      heading: extractHeadingText(node),
      startOffset,
      endOffset,
    });
  }
  return headings;
}

export type SectionParseResult = {
  sections: Section[];
  errors: ParseError[];
};

export function parseTemplateSections(markdown: string): SectionParseResult {
  const atx = extractAtxHeadings(markdown);
  const sections: Section[] = [];
  const errors: ParseError[] = [];
  const seenRequired = new Set<string>();

  for (let i = 0; i < atx.length; i++) {
    const current = atx[i];
    if (!current) continue;
    const next = atx[i + 1];

    const headingSource = markdown.slice(current.startOffset, current.endOffset);
    const required = REQUIRED_MARKER.test(headingSource);

    const bodyStart = current.endOffset;
    const bodyEnd = next ? next.startOffset : markdown.length;
    const defaultContent = markdown.slice(bodyStart, bodyEnd).replace(/^\n+|\n+$/g, '');

    const section: Section = {
      level: current.level,
      heading: current.heading,
      required,
      defaultContent,
    };

    if (required) {
      const identity = `${current.level} ${current.heading}`;
      if (seenRequired.has(identity)) {
        errors.push(
          sectionError(
            'parser:duplicate-required-section',
            current.heading,
            current.level,
            `Duplicate required Section \`${current.heading}\` at level ${current.level}.`,
          ),
        );
        continue;
      }
      seenRequired.add(identity);
    }

    sections.push(section);
  }

  return { sections, errors };
}
