import { describe, expect, it } from 'vitest';

import {
  type ParseResult,
  parseTypeDefinitionDocument,
  type TypeDefinitionDocumentIdentity,
} from '../../src/index.js';

const DEFAULT_IDENTITY: TypeDefinitionDocumentIdentity = {
  id: 'types/Concept.md',
  name: 'concept',
};

const FRONTMATTER = '---\n_type: type\n---\n';

function parse(body: string): ParseResult {
  return parseTypeDefinitionDocument(FRONTMATTER + body, DEFAULT_IDENTITY, {});
}

function schema(body: string) {
  const result = parse(`## Schema\n\n\`\`\`yaml\n${body}\n\`\`\`\n`);
  if (result.kind !== 'ok') {
    throw new Error(`Expected ok parse, got ${JSON.stringify(result.errors)}`);
  }
  return result.typeDef.schema;
}

function expectParseErrorKind(body: string, kind: string) {
  const result = parse(`## Schema\n\n\`\`\`yaml\n${body}\n\`\`\`\n`);
  expect(result.kind).toBe('error');
  if (result.kind === 'error') {
    const e = result.errors.find((err) => err.kind === kind);
    expect(e, `Expected error kind ${kind} in ${JSON.stringify(result.errors)}`).toBeDefined();
  }
}

describe('doc-ref parser surface', () => {
  it('parses type: doc-ref to canonical DocReference', () => {
    const s = schema('properties:\n  source:\n    type: doc-ref');
    expect(s.properties.source?.type).toEqual({ kind: 'doc-ref' });
  });

  it('parses type: doc-ref with format: wiki-link', () => {
    const s = schema(`properties:\n  source:\n    type: doc-ref\n    format: wiki-link`);
    expect(s.properties.source?.type).toEqual({ kind: 'doc-ref', format: 'wiki-link' });
  });

  it('parses type: doc-ref with format: markdown-link', () => {
    const s = schema(`properties:\n  source:\n    type: doc-ref\n    format: markdown-link`);
    expect(s.properties.source?.type).toEqual({ kind: 'doc-ref', format: 'markdown-link' });
  });

  it('parses type: doc-ref with referenced-type', () => {
    const s = schema(`properties:\n  author:\n    type: doc-ref\n    referenced-type: person`);
    expect(s.properties.author?.type).toEqual({ kind: 'doc-ref', referencedType: 'person' });
  });

  it('parses type: doc-ref with format and referenced-type', () => {
    const s = schema(
      `properties:\n  author:\n    type: doc-ref\n    format: wiki-link\n    referenced-type: person`,
    );
    expect(s.properties.author?.type).toEqual({
      kind: 'doc-ref',
      format: 'wiki-link',
      referencedType: 'person',
    });
  });

  it('parses type: list<doc-ref> with format and referenced-type', () => {
    const s = schema(
      `properties:\n  sources:\n    type: list<doc-ref>\n    format: markdown-link\n    referenced-type: source`,
    );
    expect(s.properties.sources?.type).toEqual({
      kind: 'list',
      of: { kind: 'doc-ref', format: 'markdown-link', referencedType: 'source' },
    });
  });

  it('normalizes [[name]] shorthand to doc-ref + wiki-link + referenced-type', () => {
    const s = schema(`properties:\n  author:\n    type: "[[person]]"`);
    expect(s.properties.author?.type).toEqual({
      kind: 'doc-ref',
      format: 'wiki-link',
      referencedType: 'person',
    });
  });

  it('normalizes [](name) shorthand to doc-ref + markdown-link + referenced-type', () => {
    const s = schema(`properties:\n  author:\n    type: "[](person)"`);
    expect(s.properties.author?.type).toEqual({
      kind: 'doc-ref',
      format: 'markdown-link',
      referencedType: 'person',
    });
  });

  it('normalizes list<[[name]]> shorthand', () => {
    const s = schema(`properties:\n  skills:\n    type: "list<[[skill]]>"`);
    expect(s.properties.skills?.type).toEqual({
      kind: 'list',
      of: { kind: 'doc-ref', format: 'wiki-link', referencedType: 'skill' },
    });
  });

  it('normalizes list<[](name)> shorthand', () => {
    const s = schema(`properties:\n  skills:\n    type: "list<[](skill)>"`);
    expect(s.properties.skills?.type).toEqual({
      kind: 'list',
      of: { kind: 'doc-ref', format: 'markdown-link', referencedType: 'skill' },
    });
  });

  it('accepts compatibility alias type: wiki-link', () => {
    const s = schema(`properties:\n  source:\n    type: wiki-link`);
    expect(s.properties.source?.type).toEqual({ kind: 'doc-ref', format: 'wiki-link' });
  });

  it('rejects format on non-doc-ref properties', () => {
    expectParseErrorKind(
      `properties:\n  title:\n    type: text\n    format: wiki-link`,
      'parser:invalid-property-schema',
    );
  });

  it('rejects referenced-type on list<text>', () => {
    expectParseErrorKind(
      `properties:\n  tags:\n    type: list<text>\n    referenced-type: tag`,
      'parser:invalid-property-schema',
    );
  });

  it('rejects non-canonical referenced-type', () => {
    expectParseErrorKind(
      `properties:\n  author:\n    type: doc-ref\n    referenced-type: "Bad Name"`,
      'parser:invalid-type-reference',
    );
  });

  it('rejects unknown format', () => {
    expectParseErrorKind(
      `properties:\n  source:\n    type: doc-ref\n    format: "weird"`,
      'parser:invalid-property-schema',
    );
  });
});
