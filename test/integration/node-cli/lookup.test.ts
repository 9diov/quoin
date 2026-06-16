import { describe, expect, it } from 'vitest';
import type { ParsedTypeDefinitionDocument, ParserConfig } from '../../../src/core/parser.js';
import type { Document } from '../../../src/core/types.js';
import type { IngestedMarkdown } from '../../../src/integration/node-cli/ingestion.js';
import {
  createResolver,
  createTypeRegistry,
  deriveIdentity,
  parseTypeCandidates,
} from '../../../src/integration/node-cli/lookup.js';

function makeDocument(
  path: string,
  frontmatter: Record<string, unknown> = {},
  body = '',
): Document {
  return { path, frontmatter, body };
}

function typeDocRaw(schemaYaml: string): string {
  return `---\n_type: type\n---\n\n## Schema\n\n\`\`\`yaml\n${schemaYaml}\n\`\`\`\n`;
}

function ingestionDoc(
  path: string,
  frontmatter: Record<string, unknown> = {},
  body = '',
): IngestedMarkdown {
  return {
    kind: 'document',
    path,
    raw: `---\n${JSON.stringify(frontmatter)}\n---\n\n${body}`,
    document: makeDocument(path, frontmatter, body),
  };
}

function ingestionFailure(path: string, reason: string): IngestedMarkdown {
  return {
    kind: 'ingest-failure',
    path,
    stage: 'frontmatter',
    reason,
  };
}

const parserConfig: ParserConfig = {
  typeDeclarationKey: '_type',
};

describe('deriveIdentity', () => {
  it('derives id as normalized POSIX path and name as lowercase basename', () => {
    const result = deriveIdentity('types/Concept.md');
    expect(result.id).toBe('types/Concept.md');
    expect(result.name).toBe('concept');
  });

  it('handles deeply nested paths', () => {
    const result = deriveIdentity('a/b/c/Skill.md');
    expect(result.id).toBe('a/b/c/Skill.md');
    expect(result.name).toBe('skill');
  });

  it('normalizes path separators', () => {
    const result = deriveIdentity('types\\Concept.md');
    expect(result.id).toBe('types/Concept.md');
  });

  it('lowercases the name', () => {
    const result = deriveIdentity('TypeScript.md');
    expect(result.name).toBe('typescript');
  });

  it('handles no extension', () => {
    const result = deriveIdentity('README');
    expect(result.name).toBe('readme');
  });
});

describe('parseTypeCandidates', () => {
  it('parses valid type definition candidates', () => {
    const candidates = [
      {
        path: 'types/Concept.md',
        raw: typeDocRaw(`
properties:
  title:
    type: text
`),
      },
    ];

    const result = parseTypeCandidates(candidates, parserConfig);
    expect(result.parsed).toHaveLength(1);
    expect(result.failures).toHaveLength(0);
    expect(result.parsed[0]!.id).toBe('types/Concept.md');
    expect(result.parsed[0]!.name).toBe('concept');
  });

  it('separates parse failures from successes', () => {
    const candidates = [
      {
        path: 'types/Good.md',
        raw: typeDocRaw('properties:\n  title:\n    type: text'),
      },
      {
        path: 'types/Bad.md',
        raw: '# Not a type doc',
      },
    ];

    const result = parseTypeCandidates(candidates, parserConfig);
    expect(result.parsed).toHaveLength(1);
    expect(result.parsed[0]!.id).toBe('types/Good.md');
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0]!.path).toBe('types/Bad.md');
  });

  it('returns empty arrays for no candidates', () => {
    const result = parseTypeCandidates([], parserConfig);
    expect(result.parsed).toHaveLength(0);
    expect(result.failures).toHaveLength(0);
  });
});

describe('createResolver', () => {
  it('resolves a Wiki Link to a found document by basename', () => {
    const ingested: IngestedMarkdown[] = [ingestionDoc('notes/Concept.md', { title: 'Concept' })];
    const resolver = createResolver(ingested);

    const result = resolver('[[Concept]]');
    expect(result.kind).toBe('found');
    if (result.kind === 'found') {
      expect(result.document.path).toBe('notes/Concept.md');
    }
  });

  it('returns not-found when no document matches basename', () => {
    const resolver = createResolver([]);
    const result = resolver('[[Concept]]');
    expect(result.kind).toBe('not-found');
    if (result.kind === 'not-found') {
      expect(result.wikiLink).toBe('[[Concept]]');
    }
  });

  it('returns invalid-link for malformed Wiki Links', () => {
    const resolver = createResolver([]);
    const result = resolver('not-a-wikilink');
    expect(result.kind).toBe('invalid-link');
  });

  it('returns ambiguous for duplicate basenames (case-insensitive)', () => {
    const ingested: IngestedMarkdown[] = [
      ingestionDoc('notes/Concept.md'),
      ingestionDoc('docs/concept.md'),
    ];
    const resolver = createResolver(ingested);

    const result = resolver('[[Concept]]');
    expect(result.kind).toBe('ambiguous');
    if (result.kind === 'ambiguous') {
      expect(result.candidates).toHaveLength(2);
    }
  });

  it('returns unavailable when only match failed ingestion', () => {
    const ingested: IngestedMarkdown[] = [ingestionFailure('notes/Concept.md', 'YAML parse error')];
    const resolver = createResolver(ingested);

    const result = resolver('[[Concept]]');
    expect(result.kind).toBe('unavailable');
    if (result.kind === 'unavailable') {
      expect(result.reason).toBe('YAML parse error');
    }
  });

  it('resolves by basename ignoring path prefixes', () => {
    const ingested: IngestedMarkdown[] = [ingestionDoc('skills/typescript/cool/TypeScript.md')];
    const resolver = createResolver(ingested);

    const result = resolver('[[skills/TypeScript]]');
    expect(result.kind).toBe('found');
  });

  it('ignores fragments for lookup', () => {
    const ingested: IngestedMarkdown[] = [ingestionDoc('Concept.md')];
    const resolver = createResolver(ingested);

    const result = resolver('[[Concept#section]]');
    expect(result.kind).toBe('found');
  });

  it('ignores display text for lookup', () => {
    const ingested: IngestedMarkdown[] = [ingestionDoc('Concept.md')];
    const resolver = createResolver(ingested);

    const result = resolver('[[Concept|My Concept]]');
    expect(result.kind).toBe('found');
  });

  it('returns ambiguous even when some matches are unavailable', () => {
    const ingested: IngestedMarkdown[] = [
      ingestionDoc('one/Concept.md'),
      ingestionFailure('two/concept.md', 'bad yaml'),
    ];
    const resolver = createResolver(ingested);

    const result = resolver('[[Concept]]');
    expect(result.kind).toBe('ambiguous');
    if (result.kind === 'ambiguous') {
      expect(result.candidates).toHaveLength(1);
    }
  });
});

describe('createTypeRegistry', () => {
  function parseTypeDoc(path: string, schemaYaml: string): ParsedTypeDefinitionDocument {
    const candidates = [{ path, raw: typeDocRaw(schemaYaml) }];
    const result = parseTypeCandidates(candidates, parserConfig);
    if (result.parsed.length !== 1) {
      throw new Error(`Failed to parse type doc: ${path}`);
    }
    return result.parsed[0]!;
  }

  it('getByName resolves a type by canonical name', () => {
    const concept = parseTypeDoc('types/Concept.md', 'properties:\n  title:\n    type: text');
    const registry = createTypeRegistry([concept]);

    const result = registry.getByName('concept');
    expect(result.kind).toBe('found');
    if (result.kind === 'found') {
      expect(result.typeDef.id).toBe('types/Concept.md');
    }
  });

  it('getByName returns not-found for unknown type', () => {
    const registry = createTypeRegistry([]);
    const result = registry.getByName('unknown');
    expect(result.kind).toBe('not-found');
  });

  it('getByName returns ambiguous for duplicate names', () => {
    const a = parseTypeDoc('a/Concept.md', 'properties:\n  a:\n    type: text');
    const b = parseTypeDoc('b/Concept.md', 'properties:\n  b:\n    type: text');
    const registry = createTypeRegistry([a, b]);

    const result = registry.getByName('concept');
    expect(result.kind).toBe('ambiguous');
    if (result.kind === 'ambiguous') {
      expect(result.candidates).toHaveLength(2);
    }
  });

  it('getByName is case-insensitive', () => {
    const typeDef = parseTypeDoc('types/Concept.md', 'properties:\n  title:\n    type: text');
    const registry = createTypeRegistry([typeDef]);

    const result = registry.getByName('Concept');
    expect(result.kind).toBe('found');
  });

  it('getByDeclaration resolves Wiki Link declaration', () => {
    const skill = parseTypeDoc('types/Skill.md', 'properties:\n  description:\n    type: text');
    const registry = createTypeRegistry([skill]);

    const result = registry.getByDeclaration('[[Skill]]');
    expect(result.kind).toBe('found');
    if (result.kind === 'found') {
      expect(result.typeDef.id).toBe('types/Skill.md');
    }
  });

  it('getByDeclaration resolves bare type literal', () => {
    const typeType = parseTypeDoc('types/Type.md', 'properties:\n  category:\n    type: text');
    const registry = createTypeRegistry([typeType]);

    const result = registry.getByDeclaration('type');
    expect(result.kind).toBe('found');
    if (result.kind === 'found') {
      expect(result.typeDef.name).toBe('type');
    }
  });

  it('getByDeclaration returns not-found for bare type when no such type exists', () => {
    const registry = createTypeRegistry([]);
    const result = registry.getByDeclaration('type');
    expect(result.kind).toBe('not-found');
  });

  it('getByDeclaration returns invalid-declaration for non-string', () => {
    const registry = createTypeRegistry([]);
    const result = registry.getByDeclaration(42);
    expect(result.kind).toBe('invalid-declaration');
    if (result.kind === 'invalid-declaration') {
      expect(result.value).toBe(42);
    }
  });

  it('getByDeclaration returns invalid-declaration for invalid Wiki Link', () => {
    const registry = createTypeRegistry([]);
    const result = registry.getByDeclaration('not a wiki link');
    expect(result.kind).toBe('invalid-declaration');
  });

  it('getByDeclaration returns ambiguous for duplicate canonical names', () => {
    const a = parseTypeDoc('a/Skill.md', 'properties:\n  a:\n    type: text');
    const b = parseTypeDoc('b/skill.md', 'properties:\n  b:\n    type: text');
    const registry = createTypeRegistry([a, b]);

    const result = registry.getByDeclaration('[[Skill]]');
    expect(result.kind).toBe('ambiguous');
    if (result.kind === 'ambiguous') {
      expect(result.candidates).toHaveLength(2);
    }
  });

  it('getByDeclaration resolves Wiki Link ignoring path prefix', () => {
    const skill = parseTypeDoc('types/Skill.md', 'properties:\n  description:\n    type: text');
    const registry = createTypeRegistry([skill]);

    const result = registry.getByDeclaration('[[foo/bar/Skill]]');
    expect(result.kind).toBe('found');
    if (result.kind === 'found') {
      expect(result.typeDef.id).toBe('types/Skill.md');
    }
  });

  it('getByDeclaration returns missing-declaration for undefined', () => {
    const registry = createTypeRegistry([]);
    const result = registry.getByDeclaration(undefined);
    expect(result.kind).toBe('missing-declaration');
  });

  it('getByDeclaration returns missing-declaration for null', () => {
    const registry = createTypeRegistry([]);
    const result = registry.getByDeclaration(null);
    expect(result.kind).toBe('missing-declaration');
  });

  it('getByName returns unavailable for broken type candidate', () => {
    const registry = createTypeRegistry([], [{ path: 'types/Broken.md', errors: [] }]);

    const result = registry.getByName('broken');
    expect(result.kind).toBe('unavailable');
  });

  it('getByDeclaration returns unavailable for broken type candidate', () => {
    const registry = createTypeRegistry([], [{ path: 'types/Skill.md', errors: [] }]);

    const result = registry.getByDeclaration('[[Skill]]');
    expect(result.kind).toBe('unavailable');
  });
});
