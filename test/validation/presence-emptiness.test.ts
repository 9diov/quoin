import { describe, expect, it } from 'vitest';
import { validate } from '../../src/index.js';
import { expectError, expectPassing, makeDocument, makeTypeDef } from './helpers.js';

describe('V001 required Property missing', () => {
  it('returns property:missing-required when a required field is absent', () => {
    const typeDef = makeTypeDef({
      properties: {
        description: { type: 'text', required: true },
      },
    });

    const document = makeDocument({ _type: '[[Concept]]' });

    const result = validate(document, typeDef, {});
    expectError(result, {
      kind: 'property:missing-required',
      location: { scope: 'property', property: 'description' },
    });
    expect(result.warnings).toEqual([]);
  });
});

describe('V002 optional missing Property passes', () => {
  it('returns no errors when an optional field is absent', () => {
    const typeDef = makeTypeDef({
      properties: {
        mentor: { type: { kind: 'doc-ref', format: 'wiki-link' } },
      },
    });

    const document = makeDocument({ _type: '[[Concept]]' });

    const result = validate(document, typeDef, {});
    expectPassing(result);
    expect(result.warnings).toEqual([]);
  });
});

describe('V003 null is present but empty', () => {
  it('returns property:empty-not-allowed for null on required text', () => {
    const typeDef = makeTypeDef({
      properties: {
        description: { type: 'text', required: true },
      },
    });

    const document = makeDocument({ _type: '[[Concept]]', description: null });

    const result = validate(document, typeDef, {});
    expectError(result, {
      kind: 'property:empty-not-allowed',
      location: { scope: 'property', property: 'description' },
    });
    expect(result.warnings).toEqual([]);
  });
});

describe('V004 whitespace-only string is empty', () => {
  it('returns property:empty-not-allowed for whitespace-only string', () => {
    const typeDef = makeTypeDef({
      properties: {
        description: { type: 'text' },
      },
    });

    const document = makeDocument({ _type: '[[Concept]]', description: '   ' });

    const result = validate(document, typeDef, {});
    expectError(result, {
      kind: 'property:empty-not-allowed',
      location: { scope: 'property', property: 'description' },
    });
    expect(result.warnings).toEqual([]);
  });
});

describe('V005 empty scalar allowed with allow-empty true', () => {
  it('allows empty string when allow-empty is true', () => {
    const typeDef = makeTypeDef({
      properties: {
        description: { type: 'text', 'allow-empty': true },
      },
    });

    const document = makeDocument({ _type: '[[Concept]]', description: '' });

    const result = validate(document, typeDef, {});
    expectPassing(result);
    expect(result.warnings).toEqual([]);
  });
});

describe('V006 empty list passes by default', () => {
  it('allows empty list when allow-empty is not specified', () => {
    const typeDef = makeTypeDef({
      properties: {
        skills: {
          type: {
            kind: 'list',
            of: { kind: 'doc-ref', format: 'wiki-link', referencedType: 'skill' },
          },
        },
      },
    });

    const document = makeDocument({ _type: '[[Concept]]', skills: [] });

    const result = validate(document, typeDef, {});
    expectPassing(result);
    expect(result.warnings).toEqual([]);
  });
});

describe('V007 empty list fails with allow-empty false', () => {
  it('returns property:empty-not-allowed for empty list when allow-empty is false', () => {
    const typeDef = makeTypeDef({
      properties: {
        skills: {
          type: {
            kind: 'list',
            of: { kind: 'doc-ref', format: 'wiki-link', referencedType: 'skill' },
          },
          'allow-empty': false,
        },
      },
    });

    const document = makeDocument({ _type: '[[Concept]]', skills: [] });

    const result = validate(document, typeDef, {});
    expectError(result, {
      kind: 'property:empty-not-allowed',
      location: { scope: 'property', property: 'skills' },
    });
    expect(result.warnings).toEqual([]);
  });
});

describe('V008 choice rejects empty value by default', () => {
  it('returns property:empty-not-allowed for null choice without allow-empty', () => {
    const typeDef = makeTypeDef({
      properties: {
        level: { type: { kind: 'doc-ref', format: 'wiki-link', referencedType: 'level' } },
      },
    });

    const document = makeDocument({ _type: '[[Concept]]', level: null });

    const result = validate(document, typeDef, {});
    expectError(result, {
      kind: 'property:empty-not-allowed',
      location: { scope: 'property', property: 'level' },
    });
    expect(result.warnings).toEqual([]);
  });

  it('returns property:empty-not-allowed for empty string choice without allow-empty', () => {
    const typeDef = makeTypeDef({
      properties: {
        level: { type: { kind: 'doc-ref', format: 'wiki-link', referencedType: 'level' } },
      },
    });

    const document = makeDocument({ _type: '[[Concept]]', level: '' });

    const result = validate(document, typeDef, {});
    expectError(result, {
      kind: 'property:empty-not-allowed',
      location: { scope: 'property', property: 'level' },
    });
  });
});
