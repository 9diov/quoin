import { describe, expect, it } from 'vitest';
import type { ParsedTypeDefinitionDocument, Schema } from '../../src/index.js';
import { scaffold } from '../../src/index.js';

function makeTypeDef(
  overrides: Partial<ParsedTypeDefinitionDocument> & { schema: Schema },
): ParsedTypeDefinitionDocument {
  return {
    id: 'types/Concept.md',
    name: 'concept',
    ...overrides,
  };
}

describe('unconditional defaults', () => {
  it('returns missing text Property with default', () => {
    const typeDef = makeTypeDef({
      schema: {
        properties: {
          title: { type: 'text', default: 'Untitled' },
        },
      },
    });

    const result = scaffold({}, typeDef);
    expect(result.properties).toEqual({ title: 'Untitled' });
  });

  it('returns missing number Property with default 0', () => {
    const typeDef = makeTypeDef({
      schema: {
        properties: {
          priority: { type: 'number', default: 0 },
        },
      },
    });

    const result = scaffold({}, typeDef);
    expect(result.properties).toEqual({ priority: 0 });
  });

  it('returns missing boolean Property with default false', () => {
    const typeDef = makeTypeDef({
      schema: {
        properties: {
          published: { type: 'boolean', default: false },
        },
      },
    });

    const result = scaffold({}, typeDef);
    expect(result.properties).toEqual({ published: false });
  });
});

describe('present values are not overwritten', () => {
  it('does not scaffold over present non-empty value', () => {
    const typeDef = makeTypeDef({
      schema: {
        properties: {
          title: { type: 'text', default: 'Untitled' },
        },
      },
    });

    const result = scaffold({ title: 'My Document' }, typeDef);
    expect(result.properties).toEqual({});
  });

  it('does not scaffold over null value', () => {
    const typeDef = makeTypeDef({
      schema: {
        properties: {
          title: { type: 'text', default: 'Untitled' },
        },
      },
    });

    const result = scaffold({ title: null }, typeDef);
    expect(result.properties).toEqual({});
  });

  it('does not scaffold over empty string value', () => {
    const typeDef = makeTypeDef({
      schema: {
        properties: {
          title: { type: 'text', 'allow-empty': true, default: 'Untitled' },
        },
      },
    });

    const result = scaffold({ title: '' }, typeDef);
    expect(result.properties).toEqual({});
  });

  it('does not scaffold over empty array value', () => {
    const typeDef = makeTypeDef({
      schema: {
        properties: {
          skills: {
            type: { kind: 'list', of: { kind: 'type-ref', name: 'skill' } },
            'allow-empty': true,
            default: ['[[TypeScript]]'],
          },
        },
      },
    });

    const result = scaffold({ skills: [] }, typeDef);
    expect(result.properties).toEqual({});
  });

  it('does not scaffold over false', () => {
    const typeDef = makeTypeDef({
      schema: {
        properties: {
          published: { type: 'boolean', default: true },
        },
      },
    });

    const result = scaffold({ published: false }, typeDef);
    expect(result.properties).toEqual({});
  });

  it('does not scaffold over 0', () => {
    const typeDef = makeTypeDef({
      schema: {
        properties: {
          priority: { type: 'number', default: 42 },
        },
      },
    });

    const result = scaffold({ priority: 0 }, typeDef);
    expect(result.properties).toEqual({});
  });
});

describe('required Property without default', () => {
  it('is omitted from the result', () => {
    const typeDef = makeTypeDef({
      schema: {
        properties: {
          description: { type: 'text', required: true },
        },
      },
    });

    const result = scaffold({}, typeDef);
    expect(result.properties).toEqual({});
  });
});

describe('falsy defaults', () => {
  it('returns empty string default with allow-empty', () => {
    const typeDef = makeTypeDef({
      schema: {
        properties: {
          notes: { type: 'text', 'allow-empty': true, default: '' },
        },
      },
    });

    const result = scaffold({}, typeDef);
    expect(result.properties).toEqual({ notes: '' });
  });

  it('returns empty array default for list type', () => {
    const typeDef = makeTypeDef({
      schema: {
        properties: {
          skills: {
            type: { kind: 'list', of: { kind: 'type-ref', name: 'skill' } },
            default: [],
          },
        },
      },
    });

    const result = scaffold({}, typeDef);
    expect(result.properties).toEqual({ skills: [] });
  });

  it('returns null default when declared', () => {
    const typeDef = makeTypeDef({
      schema: {
        properties: {
          rating: { type: 'number', 'allow-empty': true, default: null },
        },
      },
    });

    const result = scaffold({}, typeDef);
    expect(result.properties).toEqual({ rating: null });
  });
});

describe('array reference isolation', () => {
  it('returns a detached copy of list defaults', () => {
    const defaultList = ['[[TypeScript]]'];
    const typeDef = makeTypeDef({
      schema: {
        properties: {
          skills: {
            type: { kind: 'list', of: { kind: 'type-ref', name: 'skill' } },
            default: defaultList,
          },
        },
      },
    });

    const result = scaffold({}, typeDef);
    expect(result.properties.skills).toEqual(defaultList);

    // Mutate the result
    if (Array.isArray(result.properties.skills)) {
      (result.properties.skills as unknown[]).push('[[Rust]]');
    }

    // Original default is untouched
    expect(defaultList).toEqual(['[[TypeScript]]']);

    // Schema reference is untouched
    const schemaDefault = typeDef.schema.properties.skills?.default;
    expect(schemaDefault).toEqual(['[[TypeScript]]']);
  });
});

describe('multiple properties', () => {
  it('returns only absent properties with defaults', () => {
    const typeDef = makeTypeDef({
      schema: {
        properties: {
          title: { type: 'text', default: 'Untitled' },
          description: { type: 'text', required: true },
          tags: {
            type: { kind: 'list', of: { kind: 'type-ref', name: 'skill' } },
            default: ['[[Tag]]'],
          },
        },
      },
    });

    const result = scaffold({ title: 'My Doc' }, typeDef);
    expect(result.properties).toEqual({ tags: ['[[Tag]]'] });
  });
});

describe('purity', () => {
  it('does not mutate input frontmatter', () => {
    const frontmatter = { title: 'Original' };
    const originalKeys = Object.keys(frontmatter);

    const typeDef = makeTypeDef({
      schema: {
        properties: {
          description: { type: 'text', default: 'Default desc' },
        },
      },
    });

    scaffold(frontmatter, typeDef);

    expect(frontmatter).toEqual({ title: 'Original' });
    expect(Object.keys(frontmatter)).toEqual(originalKeys);
  });

  it('does not mutate typeDef', () => {
    const typeDef = makeTypeDef({
      schema: {
        properties: {
          title: { type: 'text', default: 'Untitled' },
        },
      },
    });

    const snapshot = JSON.stringify(typeDef);
    scaffold({}, typeDef);
    expect(JSON.stringify(typeDef)).toBe(snapshot);
  });
});
