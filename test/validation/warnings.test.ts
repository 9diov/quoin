import { describe, expect, it } from 'vitest';
import { validate } from '../../src/index.js';
import {
  makeTypeDef,
  makeDocument,
  expectPassing,
  expectWarning,
} from './helpers.js';

describe('V050 unknown Document Property is allowed', () => {
  it('passes when document has properties not in schema', () => {
    const typeDef = makeTypeDef({
      properties: {
        description: { type: 'text' },
      },
    });

    const document = makeDocument({
      _type: '[[Concept]]',
      description: 'A reusable idea',
      extra: 'allowed',
    });

    const result = validate(document, typeDef, {});
    expectPassing(result);
  });
});

describe('V051 reserved Property collision is warning', () => {
  it('emits property:reserved-collision warning for obsidian tags', () => {
    const typeDef = makeTypeDef({
      properties: {
        tags: { type: { kind: 'list', of: 'skill' } },
      },
    });

    const document = makeDocument({ _type: '[[Concept]]', tags: [] });

    const result = validate(document, typeDef, { integration: 'obsidian' });

    expect(result.passed).toBe(true);
    expectWarning(result, {
      kind: 'property:reserved-collision',
      location: { scope: 'property', property: 'tags' },
    });
  });
});

describe('V052 missing required Section is warning', () => {
  it('emits section:missing-required warning when required heading is missing', () => {
    const typeDef = {
      id: 'types/Concept.md',
      name: 'concept',
      schema: { properties: {} },
      templateBlock: {
        sections: [
          { level: 2, heading: 'Definitions', required: true, defaultContent: '' },
          { level: 2, heading: 'References', required: false, defaultContent: '' },
        ],
      },
    };

    const document = makeDocument({ _type: '[[Concept]]' }, '## References');

    const result = validate(document, typeDef, {});

    expect(result.passed).toBe(true);
    expectWarning(result, {
      kind: 'section:missing-required',
      location: { scope: 'section', section: 'Definitions', level: 2 },
    });
  });
});
