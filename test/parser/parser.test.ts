import { describe, expect, it } from 'vitest';

import {
  parseTypeDefinitionDocument,
  type ParseError,
  type ParseResult,
  type TypeDefinitionDocumentIdentity,
} from '../../src/index.js';

const DEFAULT_IDENTITY: TypeDefinitionDocumentIdentity = {
  id: 'types/Concept.md',
  name: 'concept',
};

const FRONTMATTER = '---\n_type: type\n---\n';

function withFrontmatter(body: string): string {
  return FRONTMATTER + body;
}

function parse(
  body: string,
  identity: TypeDefinitionDocumentIdentity = DEFAULT_IDENTITY,
  config: Parameters<typeof parseTypeDefinitionDocument>[2] = {},
): ParseResult {
  return parseTypeDefinitionDocument(withFrontmatter(body), identity, config);
}

function parseRaw(
  raw: string,
  identity: TypeDefinitionDocumentIdentity = DEFAULT_IDENTITY,
  config: Parameters<typeof parseTypeDefinitionDocument>[2] = {},
): ParseResult {
  return parseTypeDefinitionDocument(raw, identity, config);
}

function expectErrors(result: ParseResult): ParseError[] {
  expect(result.kind).toBe('error');
  if (result.kind !== 'error') throw new Error('expected error');
  return result.errors;
}

function findError(errors: ParseError[], kind: ParseError['kind']): ParseError | undefined {
  return errors.find((e) => e.kind === kind);
}

describe('P000 — Frontmatter self-identification', () => {
  it('P000a: missing Type Declaration', () => {
    const raw = `# Concept\n\n## Schema\n\n\`\`\`yaml\nproperties: {}\n\`\`\`\n`;
    const errors = expectErrors(parseRaw(raw));
    const err = findError(errors, 'parser:missing-type-declaration');
    expect(err).toBeDefined();
    expect(err?.location).toEqual({ scope: 'document' });
  });

  it('P000b: Type Declaration value is not the literal `type`', () => {
    const raw = `---\n_type: "[[Concept]]"\n---\n\n## Schema\n\n\`\`\`yaml\nproperties: {}\n\`\`\`\n`;
    const errors = expectErrors(parseRaw(raw));
    const err = findError(errors, 'parser:invalid-type-declaration');
    expect(err).toBeDefined();
    expect(err?.location).toEqual({ scope: 'document' });
    expect(err?.details).toEqual({ value: '[[Concept]]' });
  });

  it('P000c: custom typeDeclarationKey honored', () => {
    const raw = `---\n_kind: type\n---\n\n## Schema\n\n\`\`\`yaml\nproperties: {}\n\`\`\`\n`;
    const result = parseRaw(raw, DEFAULT_IDENTITY, { typeDeclarationKey: '_kind' });
    expect(result.kind).toBe('ok');
  });
});

describe('P001–P005 — Blocks', () => {
  it('P001: valid Schema and Template fences', () => {
    const body = `# Concept

## Schema

\`\`\`yaml
properties:
  description:
    type: text
    required: true
\`\`\`

## Template

\`\`\`markdown
## Definitions <!-- required -->

## References
\`\`\`
`;
    const result = parse(body);
    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') return;
    expect(result.typeDef.id).toBe('types/Concept.md');
    expect(result.typeDef.name).toBe('concept');
    expect(result.typeDef.schema.properties['description']).toEqual({
      type: 'text',
      required: true,
    });
    expect(result.typeDef.templateBlock?.sections).toEqual([
      { level: 2, heading: 'Definitions', required: true, defaultContent: '' },
      { level: 2, heading: 'References', required: false, defaultContent: '' },
    ]);
  });

  it('P002: missing Schema block', () => {
    const body = `# Concept\n\n## Template\n\n\`\`\`markdown\n## Definitions\n\`\`\`\n`;
    const errors = expectErrors(parse(body));
    const err = findError(errors, 'parser:missing-schema-block');
    expect(err).toBeDefined();
    expect(err?.location).toEqual({ scope: 'document' });
  });

  it('P003: Schema heading is case-sensitive', () => {
    const body = `## schema\n\n\`\`\`yaml\nproperties: {}\n\`\`\`\n`;
    const errors = expectErrors(parse(body));
    expect(findError(errors, 'parser:missing-schema-block')).toBeDefined();
  });

  it('P004: Schema must contain exactly one YAML fence', () => {
    const body = `## Schema\n\nproperties:\n  description:\n    type: text\n`;
    const errors = expectErrors(parse(body));
    const err = findError(errors, 'parser:invalid-schema-block');
    expect(err).toBeDefined();
    expect(err?.location).toEqual({ scope: 'block', block: 'Schema' });
  });

  it('P005: Template must contain exactly one Markdown fence', () => {
    const body = `## Schema\n\n\`\`\`yaml\nproperties: {}\n\`\`\`\n\n## Template\n\n## Definitions\n`;
    const errors = expectErrors(parse(body));
    const err = findError(errors, 'parser:invalid-template-block');
    expect(err).toBeDefined();
    expect(err?.location).toEqual({ scope: 'block', block: 'Template' });
  });
});

describe('P010–P014 — Schema strictness', () => {
  it('P010: legacy fields key is rejected', () => {
    const body = `## Schema\n\n\`\`\`yaml\nfields:\n  description:\n    type: text\n\`\`\`\n`;
    const errors = expectErrors(parse(body));
    expect(findError(errors, 'parser:missing-properties')).toBeDefined();
  });

  it('P011: unknown top-level schema key', () => {
    const body = `## Schema\n\n\`\`\`yaml\nproperties: {}\nclosed: true\n\`\`\`\n`;
    const errors = expectErrors(parse(body));
    const err = findError(errors, 'parser:unknown-schema-key');
    expect(err).toBeDefined();
    expect(err?.location).toEqual({ scope: 'block', block: 'Schema' });
    expect(err?.details).toEqual({ key: 'closed' });
  });

  it('P012: unknown Property schema key', () => {
    const body = `## Schema\n\n\`\`\`yaml\nproperties:\n  description:\n    type: text\n    min-length: 20\n\`\`\`\n`;
    const errors = expectErrors(parse(body));
    const err = findError(errors, 'parser:invalid-property-schema');
    expect(err).toBeDefined();
    expect(err?.location).toEqual({ scope: 'property', property: 'description' });
    expect(err?.details).toEqual({ unknownKeys: ['min-length'] });
  });

  it('P013: schema flags are strict booleans', () => {
    const body = `## Schema\n\n\`\`\`yaml\nproperties:\n  description:\n    type: text\n    required: "true"\n\`\`\`\n`;
    const errors = expectErrors(parse(body));
    const err = findError(errors, 'parser:invalid-property-schema');
    expect(err).toBeDefined();
    expect(err?.location).toEqual({ scope: 'property', property: 'description' });
    expect(err?.details).toEqual({ key: 'required', expected: 'boolean' });
  });

  it('P014: Type Reference name must be canonical', () => {
    const body = `## Schema\n\n\`\`\`yaml\nproperties:\n  skills:\n    type: list<Skill>\n\`\`\`\n`;
    const errors = expectErrors(parse(body));
    const err = findError(errors, 'parser:invalid-type-reference');
    expect(err).toBeDefined();
    expect(err?.location).toEqual({ scope: 'property', property: 'skills' });
    expect(err?.details).toEqual({ value: 'Skill' });
  });
});

describe('P020–P022 — Defaults', () => {
  it('P020: default is locally type-checked', () => {
    const body = `## Schema\n\n\`\`\`yaml\nproperties:\n  level:\n    type: choice<level>\n    default: "Beginner"\n\`\`\`\n`;
    const errors = expectErrors(parse(body));
    const err = findError(errors, 'parser:invalid-default');
    expect(err).toBeDefined();
    expect(err?.location).toEqual({ scope: 'property', property: 'level' });
    expect(err?.details?.['expected']).toBe('wiki-link');
  });

  it('P021: empty default must obey allow-empty', () => {
    const body = `## Schema\n\n\`\`\`yaml\nproperties:\n  description:\n    type: text\n    default: ""\n\`\`\`\n`;
    const errors = expectErrors(parse(body));
    const err = findError(errors, 'parser:invalid-default');
    expect(err).toBeDefined();
    expect(err?.location).toEqual({ scope: 'property', property: 'description' });
    expect(err?.details?.['reason']).toBe('empty-not-allowed');
  });

  it('P022: empty default allowed when allow-empty is true', () => {
    const body = `## Schema\n\n\`\`\`yaml\nproperties:\n  description:\n    type: text\n    allow-empty: true\n    default: ""\n\`\`\`\n`;
    const result = parse(body);
    expect(result.kind).toBe('ok');
  });
});

describe('P030–P031 — Identity', () => {
  it('P030: identity name must be canonical', () => {
    const body = `## Schema\n\n\`\`\`yaml\nproperties: {}\n\`\`\`\n`;
    const errors = expectErrors(parse(body, { id: 'types/Skill.md', name: 'Skill' }));
    const err = findError(errors, 'parser:invalid-type-definition-identity');
    expect(err).toBeDefined();
    expect(err?.location).toEqual({ scope: 'document' });
    expect(err?.details).toEqual({ name: 'Skill' });
  });

  it('P031: identity id must be non-empty', () => {
    const body = `## Schema\n\n\`\`\`yaml\nproperties: {}\n\`\`\`\n`;
    const errors = expectErrors(parse(body, { id: '   ', name: 'skill' }));
    const err = findError(errors, 'parser:invalid-type-definition-identity');
    expect(err).toBeDefined();
    expect(err?.details).toEqual({ id: '   ' });
  });
});

describe('P040–P041 — Sections', () => {
  it('P040: required marker allows flexible whitespace', () => {
    const body = `## Schema\n\n\`\`\`yaml\nproperties: {}\n\`\`\`\n\n## Template\n\n\`\`\`markdown\n## Definitions <!--   required   -->\n\`\`\`\n`;
    const result = parse(body);
    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') return;
    const sections = result.typeDef.templateBlock?.sections ?? [];
    expect(sections).toEqual([
      { level: 2, heading: 'Definitions', required: true, defaultContent: '' },
    ]);
  });

  it('P041: duplicate required Section identity is rejected', () => {
    const body = `## Schema\n\n\`\`\`yaml\nproperties: {}\n\`\`\`\n\n## Template\n\n\`\`\`markdown\n## Definitions <!-- required -->\n\n## Definitions <!-- required -->\n\`\`\`\n`;
    const errors = expectErrors(parse(body));
    const err = findError(errors, 'parser:duplicate-required-section');
    expect(err).toBeDefined();
    expect(err?.location).toEqual({ scope: 'section', section: 'Definitions', level: 2 });
  });
});

describe('Setext headings are not Sections', () => {
  it('ignores Setext-style headings in Template body', () => {
    const body = `## Schema\n\n\`\`\`yaml\nproperties: {}\n\`\`\`\n\n## Template\n\n\`\`\`markdown\nDefinitions\n-----------\n\n## References\n\`\`\`\n`;
    const result = parse(body);
    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') return;
    const sections = result.typeDef.templateBlock?.sections ?? [];
    expect(sections).toEqual([
      { level: 2, heading: 'References', required: false, defaultContent: '' },
    ]);
  });
});

describe('defaultContent is not mutated', () => {
  it('preserves required-marker comments that appear in body content', () => {
    const body = `## Schema\n\n\`\`\`yaml\nproperties: {}\n\`\`\`\n\n## Template\n\n\`\`\`markdown\n## Notes\n<!-- required -->\nbody text\n\n## End\n\`\`\`\n`;
    const result = parse(body);
    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') return;
    const notes = result.typeDef.templateBlock?.sections[0];
    expect(notes?.heading).toBe('Notes');
    expect(notes?.required).toBe(false);
    expect(notes?.defaultContent).toContain('<!-- required -->');
    expect(notes?.defaultContent).toContain('body text');
  });
});

describe('URL defaults reject unparseable targets', () => {
  it('rejects malformed http URL', () => {
    const body = `## Schema\n\n\`\`\`yaml\nproperties:\n  docs:\n    type: url\n    default: "[docs](https://exa[mple.com)"\n\`\`\`\n`;
    const errors = expectErrors(parse(body));
    const err = findError(errors, 'parser:invalid-default');
    expect(err).toBeDefined();
    expect(err?.details?.['expected']).toBe('url');
  });

  it('accepts a well-formed https URL', () => {
    const body = `## Schema\n\n\`\`\`yaml\nproperties:\n  docs:\n    type: url\n    default: "[docs](https://example.com)"\n\`\`\`\n`;
    const result = parse(body);
    expect(result.kind).toBe('ok');
  });
});

describe('Multi-error accumulation', () => {
  it('reports multiple invalid Property schemas in a single parse', () => {
    const body = `## Schema

\`\`\`yaml
properties:
  description:
    type: text
    required: "true"
  level:
    type: choice<Level>
\`\`\`
`;
    const errors = expectErrors(parse(body));
    expect(findError(errors, 'parser:invalid-property-schema')).toBeDefined();
    expect(findError(errors, 'parser:invalid-type-reference')).toBeDefined();
  });

  it('skips Schema YAML parsing when Schema block is missing', () => {
    const body = `# Concept\n`;
    const errors = expectErrors(parse(body));
    expect(findError(errors, 'parser:missing-schema-block')).toBeDefined();
    expect(findError(errors, 'parser:invalid-schema-yaml')).toBeUndefined();
    expect(findError(errors, 'parser:invalid-property-schema')).toBeUndefined();
  });
});
