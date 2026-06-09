import { describe, it } from 'vitest';
import { validate } from '../../src/index.js';
import { makeTypeDef, makeDocument, expectPassing, expectError } from './helpers.js';

describe('V010 text accepts non-empty string', () => {
  it('passes for a non-empty string', () => {
    const typeDef = makeTypeDef({
      properties: {
        description: { type: 'text' },
      },
    });

    const document = makeDocument({ _type: '[[Concept]]', description: 'A reusable idea' });

    const result = validate(document, typeDef, {});
    expectPassing(result);
  });
});

describe('V011 number rejects numeric string', () => {
  it('returns property:wrong-type for a numeric string', () => {
    const typeDef = makeTypeDef({
      properties: {
        priority: { type: 'number' },
      },
    });

    const document = makeDocument({ _type: '[[Concept]]', priority: '42' });

    const result = validate(document, typeDef, {});
    expectError(result, {
      kind: 'property:wrong-type',
      location: { scope: 'property', property: 'priority' },
    });
  });
});

describe('V012 boolean rejects string', () => {
  it('returns property:wrong-type for string "true"', () => {
    const typeDef = makeTypeDef({
      properties: {
        published: { type: 'boolean' },
      },
    });

    const document = makeDocument({ _type: '[[Concept]]', published: 'true' });

    const result = validate(document, typeDef, {});
    expectError(result, {
      kind: 'property:wrong-type',
      location: { scope: 'property', property: 'published' },
    });
  });
});

describe('V013 date accepts canonical date string', () => {
  it('passes for YYYY-MM-DD date', () => {
    const typeDef = makeTypeDef({
      properties: {
        'publish-date': { type: 'date' },
      },
    });

    const document = makeDocument({ _type: '[[Concept]]', 'publish-date': '2026-06-08' });

    const result = validate(document, typeDef, {});
    expectPassing(result);
  });
});

describe('V014 datetime requires timezone', () => {
  it('returns property:wrong-type for datetime without timezone', () => {
    const typeDef = makeTypeDef({
      properties: {
        'reviewed-at': { type: 'datetime' },
      },
    });

    const document = makeDocument({ _type: '[[Concept]]', 'reviewed-at': '2026-06-08T14:30:00' });

    const result = validate(document, typeDef, {});
    expectError(result, {
      kind: 'property:wrong-type',
      location: { scope: 'property', property: 'reviewed-at' },
    });
  });
});

describe('V015 URL accepts Markdown External Link with allowed scheme', () => {
  it('passes for valid markdown link', () => {
    const typeDef = makeTypeDef({
      properties: {
        homepage: { type: 'url' },
      },
    });

    const document = makeDocument({
      _type: '[[Concept]]',
      homepage: '[TypeScript](https://www.typescriptlang.org/)',
    });

    const result = validate(document, typeDef, {});
    expectPassing(result);
  });
});

describe('V016 URL rejects bare URL', () => {
  it('returns property:wrong-type for bare URL without markdown syntax', () => {
    const typeDef = makeTypeDef({
      properties: {
        homepage: { type: 'url' },
      },
    });

    const document = makeDocument({
      _type: '[[Concept]]',
      homepage: 'https://www.typescriptlang.org/',
    });

    const result = validate(document, typeDef, {});
    expectError(result, {
      kind: 'property:wrong-type',
      location: { scope: 'property', property: 'homepage' },
    });
  });
});

describe('V017 URL rejects disallowed configured scheme', () => {
  it('returns property:wrong-type when scheme is not in allowedUrlSchemes', () => {
    const typeDef = makeTypeDef({
      properties: {
        homepage: { type: 'url' },
      },
    });

    const document = makeDocument({
      _type: '[[Concept]]',
      homepage: '[Email](mailto:person@example.com)',
    });

    const result = validate(document, typeDef, { allowedUrlSchemes: ['https'] });
    expectError(result, {
      kind: 'property:wrong-type',
      location: { scope: 'property', property: 'homepage' },
    });
  });
});
