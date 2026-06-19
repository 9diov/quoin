import { describe, expect, it } from 'vitest';
import type {
  BodyBlock,
  BodyGenerationResult,
  CollectionTypeName,
  Document,
  ParsedTypeDefinitionDocument,
  ParseError,
  ParseResult,
  ParserConfig,
  PrimitiveTypeName,
  PropertySchema,
  PropertyTypeName,
  ResolveDocReferenceInput,
  ResolveDocReferenceResult,
  Resolver,
  ScaffoldingResult,
  Schema,
  Section,
  TypeDeclarationLookupResult,
  TypeDefinitionDocumentIdentity,
  TypeReferenceLookupResult,
  TypeRegistry,
  ValidationConfig,
  ValidationError,
  ValidationLocation,
  ValidationResult,
  ValidationWarning,
} from '../src/index.js';
import { generateBody, parseTypeDefinitionDocument, scaffold, validate } from '../src/index.js';

describe('Core types', () => {
  it('accepts literal values matching D2/D3/D4 shapes', () => {
    const primitive: PrimitiveTypeName = 'text';
    const collection: CollectionTypeName = {
      kind: 'list',
      of: { kind: 'doc-ref', format: 'wiki-link', referencedType: 'skill' },
    };
    const propertyType: PropertyTypeName = collection;
    const propertySchema: PropertySchema = {
      type: primitive,
      required: true,
      'allow-empty': false,
      default: 'hello',
    };
    const schema: Schema = { properties: { title: propertySchema } };
    const section: Section = {
      level: 2,
      heading: 'Definitions',
      required: true,
      defaultContent: '',
    };
    const bodyBlock: BodyBlock = { body: '## Definitions\n', sections: [section] };
    const identity: TypeDefinitionDocumentIdentity = { id: 'types/Skill.md', name: 'skill' };
    const parserConfig: ParserConfig = { typeDeclarationKey: '_type' };
    const typeDef: ParsedTypeDefinitionDocument = {
      id: identity.id,
      name: identity.name,
      schema,
      bodyBlock,
    };
    const parseError: ParseError = {
      kind: 'parser:missing-schema-block',
      message: 'no schema',
      location: { scope: 'document' },
    };
    const parseOk: ParseResult = { kind: 'ok', typeDef };
    const parseErr: ParseResult = { kind: 'error', errors: [parseError] };
    const document: Document = {
      path: 'notes/example.md',
      frontmatter: { _type: '[[Skill]]' },
      body: '## Definitions\n',
    };

    expect(propertyType).toBeTruthy();
    expect(propertyType).not.toBe(parserConfig);
    expect(parseOk.kind).toBe('ok');
    expect(parseErr.kind).toBe('error');
    expect(document.path).toContain('example');
  });

  it('accepts validation shapes including section level and list index', () => {
    const config: ValidationConfig = {
      typeDeclarationKey: '_type',
      untypedDocumentBehavior: 'warn',
      referentialValidation: true,
      integration: 'obsidian',
    };
    const propertyLocation: ValidationLocation = {
      scope: 'property',
      property: 'skills',
      index: 0,
    };
    const sectionLocation: ValidationLocation = {
      scope: 'section',
      section: 'Definitions',
      level: 2,
    };
    const error: ValidationError = {
      kind: 'resolve:broken-wiki-link',
      message: 'no target',
      location: propertyLocation,
    };
    const warning: ValidationWarning = {
      kind: 'section:missing-required',
      message: 'missing heading',
      location: sectionLocation,
    };
    const result: ValidationResult = {
      passed: false,
      errors: [error],
      warnings: [warning],
    };

    expect(config.integration).toBe('obsidian');
    expect(result.errors[0]?.location.scope).toBe('property');
    expect(result.warnings[0]?.location.scope).toBe('section');
  });

  it('accepts Resolver and TypeRegistry shapes', () => {
    const resolver: Resolver = (input: ResolveDocReferenceInput) => ({
      kind: 'not-found',
      value: input.value,
      format: input.format ?? 'wiki-link',
    });
    const resolveResult: ResolveDocReferenceResult = resolver({
      value: '[[Missing]]',
      sourceDocumentPath: 'notes/example.md',
    });

    const refLookup: TypeReferenceLookupResult = { kind: 'not-found', typeName: 'skill' };
    const declLookup: TypeDeclarationLookupResult = { kind: 'missing-declaration' };

    const registry: TypeRegistry = {
      getByName: (name) => ({ kind: 'not-found', typeName: name }),
      getByDeclaration: () => ({ kind: 'missing-declaration' }),
    };

    expect(resolveResult.kind).toBe('not-found');
    expect(refLookup.kind).toBe('not-found');
    expect(declLookup.kind).toBe('missing-declaration');
    expect(registry.getByName('skill').kind).toBe('not-found');
  });

  it('exposes scaffold and body-generation result shapes', () => {
    const scaffolding: ScaffoldingResult = { properties: { title: 'Untitled' } };
    const bodyGeneration: BodyGenerationResult = { body: '## Definitions\n' };
    expect(scaffolding.properties.title).toBe('Untitled');
    expect(bodyGeneration.body).toContain('Definitions');
  });
});

describe('Core behavior', () => {
  it('validate produces a ValidationResult', () => {
    const typeDef: ParsedTypeDefinitionDocument = {
      id: 'types/Concept.md',
      name: 'concept',
      schema: {
        properties: {
          description: { type: 'text', required: true },
        },
      },
    };

    const doc: Document = {
      path: 'notes/example.md',
      frontmatter: { description: 'hello' },
      body: '',
    };

    const result = validate(doc, typeDef, {});
    expect(result.passed).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('scaffold returns missing defaults', () => {
    const typeDef: ParsedTypeDefinitionDocument = {
      id: 'types/Concept.md',
      name: 'concept',
      schema: {
        properties: {
          title: { type: 'text' as const, default: 'Untitled' },
          description: { type: 'text' as const },
        },
      },
    };

    const result = scaffold({}, typeDef);
    expect(result.properties).toEqual({ title: 'Untitled' });
  });

  it('generateBody returns the body block body', () => {
    const typeDef: ParsedTypeDefinitionDocument = {
      id: 'types/Concept.md',
      name: 'concept',
      schema: { properties: {} },
      bodyBlock: {
        body: '## Definitions\n\n## References\n',
        sections: [
          { level: 2, heading: 'Definitions', required: true, defaultContent: '' },
          { level: 2, heading: 'References', required: false, defaultContent: '' },
        ],
      },
    };

    expect(generateBody(typeDef)).toEqual({ body: '## Definitions\n\n## References\n' });
  });

  it('generateBody returns empty body when no body block', () => {
    const typeDef: ParsedTypeDefinitionDocument = {
      id: 'types/Concept.md',
      name: 'concept',
      schema: { properties: {} },
    };

    expect(generateBody(typeDef)).toEqual({ body: '' });
  });

  it('imports the stub functions without crashing at module load', () => {
    expect(typeof parseTypeDefinitionDocument).toBe('function');
    expect(typeof validate).toBe('function');
    expect(typeof scaffold).toBe('function');
    expect(typeof generateBody).toBe('function');
  });
});
