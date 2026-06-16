import { describe, expect, it } from 'vitest';
import { validate } from '../../src/index.js';
import { expectError, expectPassing, makeDocument, makeResolver, makeTypeDef } from './helpers.js';

describe('V020 wiki-link shape failure happens before Resolver', () => {
  it('returns property:wrong-type and never calls resolver', () => {
    const typeDef = makeTypeDef({
      properties: {
        mentor: { type: 'wiki-link' },
      },
    });

    const document = makeDocument({ _type: '[[Concept]]', mentor: 'Alice' });
    const resolver = makeResolver({});

    const result = validate(document, typeDef, {}, resolver);
    expectError(result, {
      kind: 'property:wrong-type',
      location: { scope: 'property', property: 'mentor' },
    });
    expect(resolver.calls).toEqual([]);
  });
});

describe('V021 valid wiki-link calls Resolver and passes when found', () => {
  it('passes when resolver returns found', () => {
    const typeDef = makeTypeDef({
      properties: {
        mentor: { type: 'wiki-link' },
      },
    });

    const document = makeDocument({ _type: '[[Concept]]', mentor: '[[Alice]]' });
    const resolver = makeResolver({
      '[[Alice]]': {
        kind: 'found',
        document: { path: 'people/Alice.md', frontmatter: {}, body: '' },
      },
    });

    const result = validate(document, typeDef, {}, resolver);
    expectPassing(result);
    expect(resolver.calls).toEqual(['[[Alice]]']);
  });
});

describe('V022 broken wiki-link returns resolve error', () => {
  it('returns resolve:broken-wiki-link when resolver returns not-found', () => {
    const typeDef = makeTypeDef({
      properties: {
        mentor: { type: 'wiki-link' },
      },
    });

    const document = makeDocument({ _type: '[[Concept]]', mentor: '[[Missing]]' });
    const resolver = makeResolver({
      '[[Missing]]': { kind: 'not-found', wikiLink: '[[Missing]]' },
    });

    const result = validate(document, typeDef, {}, resolver);
    expectError(result, {
      kind: 'resolve:broken-wiki-link',
      location: { scope: 'property', property: 'mentor' },
    });
  });
});

describe('V023 ambiguous wiki-link returns resolve error', () => {
  it('returns resolve:ambiguous-wiki-link when resolver returns ambiguous', () => {
    const typeDef = makeTypeDef({
      properties: {
        mentor: { type: 'wiki-link' },
      },
    });

    const document = makeDocument({ _type: '[[Concept]]', mentor: '[[Alice]]' });
    const resolver = makeResolver({
      '[[Alice]]': {
        kind: 'ambiguous',
        wikiLink: '[[Alice]]',
        candidates: [
          { path: 'people/Alice.md', frontmatter: {}, body: '' },
          { path: 'archive/Alice.md', frontmatter: {}, body: '' },
        ],
      },
    });

    const result = validate(document, typeDef, {}, resolver);
    expectError(result, {
      kind: 'resolve:ambiguous-wiki-link',
      location: { scope: 'property', property: 'mentor' },
    });
  });
});

describe('V024 missing Resolver is a config error only after shape passes', () => {
  it('returns config:missing-dependency when resolver is undefined', () => {
    const typeDef = makeTypeDef({
      properties: {
        mentor: { type: 'wiki-link' },
      },
    });

    const document = makeDocument({ _type: '[[Concept]]', mentor: '[[Alice]]' });

    const result = validate(document, typeDef, {});
    expectError(result, {
      kind: 'config:missing-dependency',
      location: { scope: 'property', property: 'mentor' },
    });
  });
});

describe('V025 resolve:invalid-wiki-link from resolver', () => {
  it('returns resolve:invalid-wiki-link when resolver returns invalid-link', () => {
    const typeDef = makeTypeDef({
      properties: {
        mentor: { type: 'wiki-link' },
      },
    });

    const document = makeDocument({ _type: '[[Concept]]', mentor: '[[Alice]]' });
    const resolver = makeResolver({
      '[[Alice]]': {
        kind: 'invalid-link',
        wikiLink: '[[Alice]]',
        reason: 'bad target',
      },
    });

    const result = validate(document, typeDef, {}, resolver);
    expectError(result, {
      kind: 'resolve:invalid-wiki-link',
      location: { scope: 'property', property: 'mentor' },
    });
  });
});

describe('V026 resolve:unavailable from resolver', () => {
  it('returns resolve:unavailable when resolver returns unavailable', () => {
    const typeDef = makeTypeDef({
      properties: {
        mentor: { type: 'wiki-link' },
      },
    });

    const document = makeDocument({ _type: '[[Concept]]', mentor: '[[Alice]]' });
    const resolver = makeResolver({
      '[[Alice]]': {
        kind: 'unavailable',
        wikiLink: '[[Alice]]',
        reason: 'vault offline',
      },
    });

    const result = validate(document, typeDef, {}, resolver);
    expectError(result, {
      kind: 'resolve:unavailable',
      location: { scope: 'property', property: 'mentor' },
    });
  });
});
