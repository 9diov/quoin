import { describe, expect, it } from 'vitest';
import type { ParsedTypeDefinitionDocument } from '../../src/index.js';
import { template } from '../../src/index.js';

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

describe('template returns empty body when no template block', () => {
  it('returns empty body when templateBlock is absent', () => {
    const typeDef = makeTypeDef({});
    const result = template(typeDef);
    expect(result).toEqual({ body: '' });
  });
});

describe('template returns exact stored Markdown body', () => {
  it('returns the body from templateBlock', () => {
    const typeDef = makeTypeDef({
      templateBlock: {
        body: '## Definitions\n\n## References\n',
        sections: [],
      },
    });

    const result = template(typeDef);
    expect(result).toEqual({ body: '## Definitions\n\n## References\n' });
  });

  it('preserves blank lines between sections', () => {
    const typeDef = makeTypeDef({
      templateBlock: {
        body: '## Header\n\n\n## Body\n',
        sections: [],
      },
    });

    expect(template(typeDef).body).toBe('## Header\n\n\n## Body\n');
  });

  it('preserves <!-- required --> comments in heading lines', () => {
    const typeDef = makeTypeDef({
      templateBlock: {
        body: '## Definitions <!-- required -->\n\ntext\n',
        sections: [],
      },
    });

    expect(template(typeDef).body).toBe('## Definitions <!-- required -->\n\ntext\n');
  });

  it('preserves fenced code blocks and their contents', () => {
    const body = '## Example\n\n```ts\nconst x = 1;\n```\n';
    const typeDef = makeTypeDef({
      templateBlock: { body, sections: [] },
    });

    expect(template(typeDef).body).toBe(body);
  });

  it('returns empty body when templateBlock body is empty', () => {
    const typeDef = makeTypeDef({
      templateBlock: { body: '', sections: [] },
    });

    expect(template(typeDef)).toEqual({ body: '' });
  });

  it('does not mutate typeDef', () => {
    const typeDef = makeTypeDef({
      templateBlock: {
        body: '## Definitions\n',
        sections: [],
      },
    });

    const snapshot = JSON.stringify(typeDef);
    template(typeDef);
    expect(JSON.stringify(typeDef)).toBe(snapshot);
  });
});
