import { unified } from 'unified';
import remarkParse from 'remark-parse';
import type { Heading, Html, PhrasingContent, Root, RootContent } from 'mdast';

import type { ParseError, Section } from './parser.js';
import { sectionError } from './parser/errors.js';

const REQUIRED_COMMENT = /^<!--\s*required\s*-->$/;

const processor = unified().use(remarkParse);

function isHtmlNode(node: PhrasingContent): node is Html {
  return node.type === 'html';
}

function isAtxHeading(node: Heading, source: string): boolean {
  const offset = node.position?.start?.offset;
  if (typeof offset !== 'number') return false;
  // ATX headings start with `#` (possibly preceded by up to 3 spaces per CommonMark).
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

function hasRequiredMarker(node: Heading): boolean {
  for (const child of node.children) {
    if (isHtmlNode(child) && REQUIRED_COMMENT.test(child.value.trim())) return true;
  }
  return false;
}

export type SectionParseResult = {
  sections: Section[];
  errors: ParseError[];
};

export function parseTemplateSections(markdown: string): SectionParseResult {
  const tree = processor.parse(markdown) as Root;
  const headings: { node: Heading; index: number }[] = [];
  tree.children.forEach((node: RootContent, index: number) => {
    if (node.type === 'heading' && isAtxHeading(node, markdown)) {
      headings.push({ node, index });
    }
  });

  const sections: Section[] = [];
  const errors: ParseError[] = [];
  const seenRequired = new Set<string>();

  for (let i = 0; i < headings.length; i++) {
    const current = headings[i];
    if (!current) continue;
    const { node, index } = current;

    const heading = extractHeadingText(node);
    const required = hasRequiredMarker(node);
    const level = node.depth;

    const nextHeading = headings[i + 1];
    let defaultContent = '';
    if (
      node.position?.end &&
      typeof node.position.end.offset === 'number'
    ) {
      const startOffset = node.position.end.offset;
      let endOffset = markdown.length;
      if (
        nextHeading?.node.position?.start &&
        typeof nextHeading.node.position.start.offset === 'number'
      ) {
        endOffset = nextHeading.node.position.start.offset;
      }
      defaultContent = markdown.slice(startOffset, endOffset).replace(/^\n+|\n+$/g, '');
    }
    void index;

    const section: Section = { level, heading, required, defaultContent };

    if (required) {
      const identity = `${level} ${heading}`;
      if (seenRequired.has(identity)) {
        errors.push(
          sectionError(
            'parser:duplicate-required-section',
            heading,
            level,
            `Duplicate required Section \`${heading}\` at level ${level}.`,
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
