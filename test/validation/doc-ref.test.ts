import { describe, expect, it } from 'vitest';
import { validate } from '../../src/index.js';
import { expectError, expectPassing, makeDocument, makeResolver, makeTypeDef } from './helpers.js';

describe('doc-ref without format accepts either supported syntax', () => {
  it('accepts a wiki-link value', () => {
    const typeDef = makeTypeDef({
      properties: { source: { type: { kind: 'doc-ref' } } },
    });
    const document = makeDocument({ _type: '[[Concept]]', source: '[[X]]' });
    const resolver = makeResolver({
      '[[X]]': { kind: 'found', document: { path: 'x.md', frontmatter: {}, body: '' } },
    });
    expectPassing(validate(document, typeDef, {}, resolver));
  });

  it('accepts a markdown-link value', () => {
    const typeDef = makeTypeDef({
      properties: { source: { type: { kind: 'doc-ref' } } },
    });
    const document = makeDocument({ _type: '[[Concept]]', source: '[X](x.md)' });
    const resolver = makeResolver({
      '[X](x.md)': { kind: 'found', document: { path: 'x.md', frontmatter: {}, body: '' } },
    });
    expectPassing(validate(document, typeDef, {}, resolver));
  });
});

describe('doc-ref with format: wiki-link rejects markdown-link runtime values', () => {
  it('returns property:wrong-type for markdown-link value', () => {
    const typeDef = makeTypeDef({
      properties: { source: { type: { kind: 'doc-ref', format: 'wiki-link' } } },
    });
    const document = makeDocument({ _type: '[[Concept]]', source: '[X](x.md)' });
    const resolver = makeResolver({});
    const result = validate(document, typeDef, {}, resolver);
    expectError(result, {
      kind: 'property:wrong-type',
      location: { scope: 'property', property: 'source' },
    });
    expect(resolver.calls).toEqual([]);
  });
});

describe('doc-ref with format: markdown-link rejects wiki-link runtime values', () => {
  it('returns property:wrong-type for wiki-link value', () => {
    const typeDef = makeTypeDef({
      properties: { source: { type: { kind: 'doc-ref', format: 'markdown-link' } } },
    });
    const document = makeDocument({ _type: '[[Concept]]', source: '[[X]]' });
    const resolver = makeResolver({});
    expectError(validate(document, typeDef, {}, resolver), {
      kind: 'property:wrong-type',
      location: { scope: 'property', property: 'source' },
    });
  });
});

describe('markdown-link broken resolution', () => {
  it('returns resolve:broken-wiki-link when target is missing', () => {
    const typeDef = makeTypeDef({
      properties: { source: { type: { kind: 'doc-ref', format: 'markdown-link' } } },
    });
    const document = makeDocument({ _type: '[[Concept]]', source: '[X](missing.md)' });
    const resolver = makeResolver({
      '[X](missing.md)': { kind: 'not-found', value: '[X](missing.md)', format: 'markdown-link' },
    });
    expectError(validate(document, typeDef, {}, resolver), {
      kind: 'resolve:broken-wiki-link',
      location: { scope: 'property', property: 'source' },
    });
  });
});

describe('referential validation through referenced-type', () => {
  it('still uses TypeRegistry with referenced-type set', () => {
    const typeDef = makeTypeDef({
      properties: {
        author: {
          type: { kind: 'doc-ref', format: 'wiki-link', referencedType: 'person' },
        },
      },
    });
    const document = makeDocument({ _type: '[[Concept]]', author: '[[Alice]]' });
    const resolver = makeResolver({
      '[[Alice]]': {
        kind: 'found',
        document: { path: 'people/Alice.md', frontmatter: { _type: '[[Person]]' }, body: '' },
      },
    });
    const result = validate(document, typeDef, { referentialValidation: true }, resolver);
    // referential validation needs a TypeRegistry; absent it should produce config:missing-dependency.
    expectError(result, {
      kind: 'config:missing-dependency',
      location: { scope: 'property', property: 'author' },
    });
  });
});

describe('list<doc-ref> validation', () => {
  it('accumulates errors per item', () => {
    const typeDef = makeTypeDef({
      properties: {
        sources: {
          type: { kind: 'list', of: { kind: 'doc-ref', format: 'markdown-link' } },
        },
      },
    });
    const document = makeDocument({
      _type: '[[Concept]]',
      sources: ['[A](a.md)', 'not-a-link', '[[wiki]]'],
    });
    const resolver = makeResolver({
      '[A](a.md)': { kind: 'found', document: { path: 'a.md', frontmatter: {}, body: '' } },
    });
    const result = validate(document, typeDef, {}, resolver);
    expect(result.errors).toHaveLength(2);
    expect(result.errors).toContainEqual(
      expect.objectContaining({
        kind: 'property:wrong-type',
        location: { scope: 'property', property: 'sources', index: 1 },
      }),
    );
    expect(result.errors).toContainEqual(
      expect.objectContaining({
        kind: 'property:wrong-type',
        location: { scope: 'property', property: 'sources', index: 2 },
      }),
    );
  });
});

describe('missing resolver after shape success still produces config:missing-dependency', () => {
  it('returns config:missing-dependency when shape passes but resolver is undefined', () => {
    const typeDef = makeTypeDef({
      properties: { source: { type: { kind: 'doc-ref', format: 'markdown-link' } } },
    });
    const document = makeDocument({ _type: '[[Concept]]', source: '[X](x.md)' });
    const result = validate(document, typeDef, {});
    expectError(result, {
      kind: 'config:missing-dependency',
      location: { scope: 'property', property: 'source' },
    });
  });
});
