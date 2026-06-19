import { describe, expect, it } from 'vitest';
import type { ParsedTypeDefinitionDocument } from '../../src/index.js';
import { generateBody } from '../../src/index.js';

function makeTypeDef(
  overrides: Partial<ParsedTypeDefinitionDocument>,
): ParsedTypeDefinitionDocument {
  return {
    id: 'types/Concept.md',
    name: 'concept',
    schema: { properties: {} },
    ...overrides,
  };
}

describe('generateBody returns empty body when no body block', () => {
  it('returns empty body when bodyBlock is absent', () => {
    const typeDef = makeTypeDef({});
    const result = generateBody(typeDef);
    expect(result).toEqual({ body: '' });
  });
});

describe('generateBody returns exact stored Markdown body', () => {
  it('returns the body from bodyBlock', () => {
    const typeDef = makeTypeDef({
      bodyBlock: {
        body: '## Definitions\n\n## References\n',
        sections: [],
      },
    });

    const result = generateBody(typeDef);
    expect(result).toEqual({ body: '## Definitions\n\n## References\n' });
  });

  it('preserves blank lines between sections', () => {
    const typeDef = makeTypeDef({
      bodyBlock: {
        body: '## Header\n\n\n## Body\n',
        sections: [],
      },
    });

    expect(generateBody(typeDef).body).toBe('## Header\n\n\n## Body\n');
  });

  it('preserves <!-- required --> comments in heading lines', () => {
    const typeDef = makeTypeDef({
      bodyBlock: {
        body: '## Definitions <!-- required -->\n\ntext\n',
        sections: [],
      },
    });

    expect(generateBody(typeDef).body).toBe('## Definitions <!-- required -->\n\ntext\n');
  });

  it('preserves fenced code blocks and their contents', () => {
    const body = '## Example\n\n```ts\nconst x = 1;\n```\n';
    const typeDef = makeTypeDef({
      bodyBlock: { body, sections: [] },
    });

    expect(generateBody(typeDef).body).toBe(body);
  });

  it('returns empty body when bodyBlock body is empty', () => {
    const typeDef = makeTypeDef({
      bodyBlock: { body: '', sections: [] },
    });

    expect(generateBody(typeDef)).toEqual({ body: '' });
  });

  it('does not mutate typeDef', () => {
    const typeDef = makeTypeDef({
      bodyBlock: {
        body: '## Definitions\n',
        sections: [],
      },
    });

    const snapshot = JSON.stringify(typeDef);
    generateBody(typeDef);
    expect(JSON.stringify(typeDef)).toBe(snapshot);
  });
});
