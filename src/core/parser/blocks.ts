import type { Code, Heading, Root, RootContent } from 'mdast';
import remarkParse from 'remark-parse';
import { unified } from 'unified';

import type { ParseError } from '../parser.js';
import { documentError, schemaBlockError, templateBlockError } from './errors.js';

export type BlockExtractionResult = {
  schemaYaml?: string;
  templateMarkdown?: string;
  errors: ParseError[];
};

const SCHEMA_LANG = new Set(['yaml', 'yml']);
const TEMPLATE_LANG = new Set(['markdown', 'md']);

const processor = unified().use(remarkParse);

function isExactHeading(node: RootContent, label: 'Schema' | 'Template'): node is Heading {
  if (node.type !== 'heading') return false;
  if (node.depth !== 2) return false;
  if (node.children.length !== 1) return false;
  const child = node.children[0];
  if (child?.type !== 'text') return false;
  return child.value === label;
}

function findBlockChildren(
  root: Root,
  label: 'Schema' | 'Template',
): { start: number; children: RootContent[] } | null {
  for (let i = 0; i < root.children.length; i++) {
    const node = root.children[i];
    if (node && isExactHeading(node, label)) {
      const children: RootContent[] = [];
      for (let j = i + 1; j < root.children.length; j++) {
        const next = root.children[j];
        if (!next) continue;
        if (next.type === 'heading' && next.depth <= 2) break;
        children.push(next);
      }
      return { start: i, children };
    }
  }
  return null;
}

function findDuplicateHeading(
  root: Root,
  label: 'Schema' | 'Template',
  firstIndex: number,
): boolean {
  for (let i = firstIndex + 1; i < root.children.length; i++) {
    const node = root.children[i];
    if (node && isExactHeading(node, label)) return true;
  }
  return false;
}

function extractSingleCodeBlock(
  children: RootContent[],
  allowedLangs: Set<string>,
): { code?: Code; codeCount: number; nonCodeBlocks: RootContent[] } {
  const codes: Code[] = [];
  const nonCodeBlocks: RootContent[] = [];
  for (const child of children) {
    if (child.type === 'code') {
      codes.push(child);
    } else {
      nonCodeBlocks.push(child);
    }
  }
  const result: { code?: Code; codeCount: number; nonCodeBlocks: RootContent[] } = {
    codeCount: codes.length,
    nonCodeBlocks,
  };
  if (codes.length === 1) {
    const first = codes[0];
    if (first && first.lang !== null && first.lang !== undefined && allowedLangs.has(first.lang)) {
      result.code = first;
    }
  }
  return result;
}

export function extractBlocks(body: string): BlockExtractionResult {
  const errors: ParseError[] = [];
  const tree = processor.parse(body) as Root;

  const schemaLocation = findBlockChildren(tree, 'Schema');
  const templateLocation = findBlockChildren(tree, 'Template');

  const result: BlockExtractionResult = { errors };

  if (schemaLocation === null) {
    errors.push(
      documentError(
        'parser:missing-schema-block',
        'Type Definition Document must contain exactly one `## Schema` block.',
      ),
    );
  } else {
    if (findDuplicateHeading(tree, 'Schema', schemaLocation.start)) {
      errors.push(
        schemaBlockError(
          'parser:duplicate-schema-block',
          'Type Definition Document must contain exactly one `## Schema` block.',
        ),
      );
    }
    const schema = extractSingleCodeBlock(schemaLocation.children, SCHEMA_LANG);
    if (schema.codeCount === 0) {
      errors.push(
        schemaBlockError(
          'parser:invalid-schema-block',
          '`## Schema` must contain exactly one fenced `yaml` code block.',
        ),
      );
    } else if (schema.codeCount > 1) {
      errors.push(
        schemaBlockError(
          'parser:invalid-schema-block',
          '`## Schema` must contain exactly one fenced code block.',
        ),
      );
    } else if (!schema.code) {
      errors.push(
        schemaBlockError(
          'parser:invalid-schema-block',
          '`## Schema` fence info string must be `yaml` or `yml`.',
        ),
      );
    } else if (schema.nonCodeBlocks.length > 0) {
      errors.push(
        schemaBlockError(
          'parser:invalid-schema-block',
          '`## Schema` must contain only one fenced YAML code block; remove surrounding prose.',
        ),
      );
    } else {
      result.schemaYaml = schema.code.value;
    }
  }

  if (templateLocation !== null) {
    if (findDuplicateHeading(tree, 'Template', templateLocation.start)) {
      errors.push(
        templateBlockError(
          'parser:duplicate-template-block',
          'Type Definition Document must contain at most one `## Template` block.',
        ),
      );
    }
    const template = extractSingleCodeBlock(templateLocation.children, TEMPLATE_LANG);
    if (template.codeCount === 0) {
      errors.push(
        templateBlockError(
          'parser:invalid-template-block',
          '`## Template` must contain exactly one fenced `markdown` code block.',
        ),
      );
    } else if (template.codeCount > 1) {
      errors.push(
        templateBlockError(
          'parser:invalid-template-block',
          '`## Template` must contain exactly one fenced code block.',
        ),
      );
    } else if (!template.code) {
      errors.push(
        templateBlockError(
          'parser:invalid-template-block',
          '`## Template` fence info string must be `markdown` or `md`.',
        ),
      );
    } else if (template.nonCodeBlocks.length > 0) {
      errors.push(
        templateBlockError(
          'parser:invalid-template-block',
          '`## Template` must contain only one fenced Markdown code block; remove surrounding prose.',
        ),
      );
    } else {
      result.templateMarkdown = template.code.value;
    }
  }

  return result;
}
