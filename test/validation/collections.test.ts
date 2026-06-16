import { describe, expect, it } from 'vitest';
import { validate } from '../../src/index.js';
import { expectError, expectPassing, makeDocument, makeResolver, makeTypeDef } from './helpers.js';

describe('V030 list accumulates item-level errors', () => {
  it('returns per-item errors and only calls resolver on valid items', () => {
    const typeDef = makeTypeDef({
      properties: {
        skills: { type: { kind: 'list', of: { kind: 'type-ref', name: 'skill' } } },
      },
    });

    const document = makeDocument({
      _type: '[[Concept]]',
      skills: [123, 'not a wiki link', '[[Missing]]'],
    });

    const resolver = makeResolver({
      '[[Missing]]': { kind: 'not-found', wikiLink: '[[Missing]]' },
    });

    const result = validate(document, typeDef, {}, resolver);

    expect(result.passed).toBe(false);
    expect(result.errors).toHaveLength(3);

    expect(result.errors).toContainEqual(
      expect.objectContaining({
        kind: 'property:wrong-type',
        location: { scope: 'property', property: 'skills', index: 0 },
      }),
    );
    expect(result.errors).toContainEqual(
      expect.objectContaining({
        kind: 'property:wrong-type',
        location: { scope: 'property', property: 'skills', index: 1 },
      }),
    );
    expect(result.errors).toContainEqual(
      expect.objectContaining({
        kind: 'resolve:broken-wiki-link',
        location: { scope: 'property', property: 'skills', index: 2 },
      }),
    );

    expect(resolver.calls).toEqual(['[[Missing]]']);
  });
});

describe('V031 top-level [[name]] requires a single Wiki Link string', () => {
  it('returns property:wrong-type when value is an array', () => {
    const typeDef = makeTypeDef({
      properties: {
        level: { type: { kind: 'type-ref', name: 'level' } },
      },
    });

    const document = makeDocument({
      _type: '[[Concept]]',
      level: ['[[Beginner]]'],
    });

    const result = validate(document, typeDef, {});
    expectError(result, {
      kind: 'property:wrong-type',
      location: { scope: 'property', property: 'level' },
    });
  });
});

describe('V032 list does not use TypeRegistry when Referential Validation is off', () => {
  it('passes without calling typeRegistry when referentialValidation is false', () => {
    const typeDef = makeTypeDef({
      properties: {
        skills: { type: { kind: 'list', of: { kind: 'type-ref', name: 'skill' } } },
      },
    });

    const document = makeDocument({
      _type: '[[Concept]]',
      skills: ['[[TypeScript]]'],
    });

    const resolver = makeResolver({
      '[[TypeScript]]': {
        kind: 'found',
        document: {
          path: 'skills/TypeScript.md',
          frontmatter: { _type: '[[Skill]]' },
          body: '',
        },
      },
    });

    const result = validate(
      document,
      typeDef,
      { referentialValidation: false },
      resolver,
      undefined,
    );

    expectPassing(result);
  });
});
