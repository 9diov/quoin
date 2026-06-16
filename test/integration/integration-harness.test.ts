import { describe, expect, it, vi } from 'vitest';

import { type Document, parseTypeDefinitionDocument } from '../../src/index.js';
import { createInMemoryHarness, type RawMarkdownFixture } from './harness.js';

function typeDocRaw(schemaYaml: string, templateBody?: string): string {
  const templateSection = templateBody
    ? `\n## Template\n\n\`\`\`markdown\n${templateBody}\n\`\`\`\n`
    : '\n';

  return `---\n_type: type\n---\n\n## Schema\n\n\`\`\`yaml\n${schemaYaml}\n\`\`\`${templateSection}`;
}

function conceptTypeFixture(): RawMarkdownFixture {
  return {
    path: 'types/Concept.md',
    raw: typeDocRaw(
      `properties:\n  skills:\n    type: "list<[[skill]]>"\n  level:\n    type: "[[level]]"\n  title:\n    type: text\n    default: Untitled`,
      '## Summary <!-- required -->\n\n## References',
    ),
  };
}

function skillTypeFixture(): RawMarkdownFixture {
  return {
    path: 'types/Skill.md',
    raw: typeDocRaw('properties:\n  description:\n    type: text\n    required: true'),
  };
}

function levelTypeFixture(): RawMarkdownFixture {
  return {
    path: 'types/Level.md',
    raw: typeDocRaw('properties:\n  rank:\n    type: number\n    required: true'),
  };
}

function authoredDocument(path: string, frontmatter: Record<string, unknown>, body = ''): Document {
  return { path, frontmatter, body };
}

describe('type discovery', () => {
  it('finds type definition documents by sentinel, ignores regular docs, and passes integration identities into the parser', () => {
    const parseCalls: Array<{ raw: string; identity: { id: string; name: string } }> = [];
    const fixtures: RawMarkdownFixture[] = [
      conceptTypeFixture(),
      skillTypeFixture(),
      {
        path: 'notes/Regular.md',
        raw: '---\n_type: "[[Concept]]"\n---\n\nbody',
      },
    ];

    const harness = createInMemoryHarness(fixtures, {
      identityForFixture(fixture) {
        return {
          id: `memory://${fixture.path}`,
          name: fixture.path.includes('Concept') ? 'concept' : 'skill',
        };
      },
      dependencies: {
        parseTypeDefinitionDocument(raw, identity, config) {
          parseCalls.push({ raw, identity });
          return parseTypeDefinitionDocument(raw, identity, config);
        },
      },
    });

    expect(harness.discoveredTypeDefPaths).toEqual(['types/Concept.md', 'types/Skill.md']);
    expect(parseCalls).toHaveLength(2);
    expect(parseCalls.map((call) => call.identity)).toEqual([
      { id: 'memory://types/Concept.md', name: 'concept' },
      { id: 'memory://types/Skill.md', name: 'skill' },
    ]);
    expect(harness.typeDefsById.get('memory://types/Concept.md')?.name).toBe('concept');
    expect(harness.typeDefsByName.get('skill')?.[0]?.id).toBe('memory://types/Skill.md');
  });

  it('surfaces parser failures as structured data instead of throwing', () => {
    const harness = createInMemoryHarness([
      {
        path: 'types/Broken.md',
        raw: '---\n_type: type\n---\n\n## Template\n\n```markdown\n## Summary\n```\n',
      },
    ]);

    expect(harness.parserFailures).toHaveLength(1);
    expect(harness.parserFailures[0]?.kind).toBe('parse-error');
    expect(harness.parserFailures[0]?.path).toBe('types/Broken.md');
    expect(harness.parserFailures[0]?.errors[0]?.kind).toBe('parser:missing-schema-block');
  });
});

describe('root type declaration dispatch', () => {
  it('resolves the authored document root type before calling validate', () => {
    const harness = createInMemoryHarness([conceptTypeFixture()]);
    const document = authoredDocument('notes/example.md', {
      _type: '[[Concept]]',
      title: 'Example',
    });
    const validateSpy = vi.fn((_document, _typeDef) => ({
      passed: true,
      errors: [],
      warnings: [],
    }));

    const result = harness.validateAuthoredDocument(document, {}, { validate: validateSpy });

    expect(result.kind).toBe('validated');
    expect(validateSpy).toHaveBeenCalledTimes(1);
    const [firstCall] = validateSpy.mock.calls;
    expect(firstCall?.[1]?.id).toBe('types/Concept.md');
  });

  it('skips untyped documents without calling validate when configured to skip', () => {
    const harness = createInMemoryHarness([conceptTypeFixture()]);
    const validateSpy = vi.fn();

    const result = harness.validateAuthoredDocument(
      authoredDocument('notes/untyped.md', {}, ''),
      { untypedDocumentBehavior: 'skip' },
      { validate: validateSpy },
    );

    expect(result).toEqual({ kind: 'skipped-untyped' });
    expect(validateSpy).not.toHaveBeenCalled();
  });

  it('warns on untyped documents without calling validate when configured to warn', () => {
    const harness = createInMemoryHarness([conceptTypeFixture()]);
    const validateSpy = vi.fn();

    const result = harness.validateAuthoredDocument(
      authoredDocument('notes/untyped.md', {}, ''),
      { untypedDocumentBehavior: 'warn' },
      { validate: validateSpy },
    );

    expect(result.kind).toBe('warn-untyped');
    if (result.kind !== 'warn-untyped') {
      throw new Error('expected warn-untyped');
    }
    expect(result.warning.kind).toBe('document:untyped');
    expect(validateSpy).not.toHaveBeenCalled();
  });

  it('returns a structured failure when the root type declaration is unknown', () => {
    const harness = createInMemoryHarness([skillTypeFixture()]);

    const result = harness.validateAuthoredDocument(
      authoredDocument('notes/example.md', { _type: '[[Concept]]' }),
      {},
    );

    expect(result).toEqual({
      kind: 'type-not-found',
      declaration: '[[Concept]]',
      typeName: 'concept',
    });
  });

  it('returns a structured failure when the root type declaration is ambiguous', () => {
    const fixtures: RawMarkdownFixture[] = [
      {
        path: 'types/Concept-A.md',
        raw: typeDocRaw('properties: {}'),
      },
      {
        path: 'types/Concept-B.md',
        raw: typeDocRaw('properties: {}'),
      },
    ];
    const harness = createInMemoryHarness(fixtures, {
      identityForFixture(fixture) {
        return { id: fixture.path, name: 'concept' };
      },
    });

    const result = harness.validateAuthoredDocument(
      authoredDocument('notes/example.md', { _type: '[[Concept]]' }),
      {},
    );

    expect(result.kind).toBe('type-ambiguous');
    if (result.kind !== 'type-ambiguous') {
      throw new Error('expected type-ambiguous');
    }
    expect(result.typeName).toBe('concept');
    expect(result.candidates.map((candidate) => candidate.id)).toEqual([
      'types/Concept-A.md',
      'types/Concept-B.md',
    ]);
  });
});

describe('integration flows', () => {
  it('creates a new document by combining scaffolded frontmatter with a templated body', () => {
    const harness = createInMemoryHarness([conceptTypeFixture()]);
    const typeDef = harness.typeDefsById.get('types/Concept.md');

    expect(typeDef).toBeDefined();
    if (!typeDef) {
      throw new Error('missing concept type');
    }

    const result = harness.createNewDocument(typeDef, {
      _type: '[[Concept]]',
      title: 'Custom Title',
    });

    expect(result.frontmatter).toEqual({
      _type: '[[Concept]]',
      title: 'Custom Title',
    });
    expect(result.scaffolded.properties).toEqual({});
    expect(result.templated.body).toContain('## Summary <!-- required -->');
    expect(result.templated.body).toContain('## References');
  });

  it('validates an authored document end-to-end with resolver and type registry wiring', () => {
    const harness = createInMemoryHarness(
      [conceptTypeFixture(), skillTypeFixture(), levelTypeFixture()],
      {
        documents: [
          authoredDocument(
            'skills/TypeScript.md',
            { _type: '[[Skill]]', description: 'Typed JavaScript' },
            '',
          ),
          authoredDocument('levels/Beginner.md', { _type: '[[Level]]', rank: 1 }, ''),
        ],
      },
    );

    const result = harness.validateAuthoredDocument(
      authoredDocument('notes/concept.md', {
        _type: '[[Concept]]',
        skills: ['[[TypeScript]]'],
        level: '[[Beginner]]',
        title: 'Concept note',
      }),
      { referentialValidation: true },
    );

    expect(result.kind).toBe('validated');
    if (result.kind !== 'validated') {
      throw new Error('expected validated');
    }
    expect(result.typeDef.name).toBe('concept');
    expect(result.result.passed).toBe(true);
    expect(result.result.errors).toEqual([]);
  });

  it('surfaces resolver non-success branches through real validation', () => {
    const harness = createInMemoryHarness([conceptTypeFixture(), skillTypeFixture()], {
      resolverOverrides: {
        '[[TypeScript]]': {
          kind: 'unavailable',
          wikiLink: '[[TypeScript]]',
          reason: 'index not ready',
        },
      },
    });

    const result = harness.validateAuthoredDocument(
      authoredDocument('notes/concept.md', {
        _type: '[[Concept]]',
        skills: ['[[TypeScript]]'],
      }),
      { referentialValidation: true },
    );

    expect(result.kind).toBe('validated');
    if (result.kind !== 'validated') {
      throw new Error('expected validated');
    }
    expect(result.result.passed).toBe(false);
    expect(result.result.errors[0]?.kind).toBe('resolve:unavailable');
  });
});
