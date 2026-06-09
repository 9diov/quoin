import { describe, expect, it } from 'vitest';

import {
  parseTypeDefinitionDocument,
  scaffold,
  template,
  validate,
} from '../src/index.js';
import type {
  CollectionTypeName,
  Document,
  ParseError,
  ParseResult,
  ParsedTypeDefinitionDocument,
  ParserConfig,
  PrimitiveTypeName,
  PropertySchema,
  PropertyTypeName,
  ResolveWikiLinkResult,
  Resolver,
  ScaffoldingResult,
  Schema,
  Section,
  TemplateBlock,
  TemplatingResult,
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

describe('Core types', () => {
  it('accepts literal values matching D2/D3/D4 shapes', () => {
    const primitive: PrimitiveTypeName = 'text';
    const collection: CollectionTypeName = { kind: 'list', of: 'skill' };
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
    const templateBlock: TemplateBlock = { sections: [section] };
    const identity: TypeDefinitionDocumentIdentity = { id: 'types/Skill.md', name: 'skill' };
    const parserConfig: ParserConfig = { allowedUrlSchemes: ['https'] };
    const typeDef: ParsedTypeDefinitionDocument = {
      id: identity.id,
      name: identity.name,
      schema,
      templateBlock,
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
      allowedUrlSchemes: ['https'],
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
    const resolver: Resolver = (wikiLink) => ({ kind: 'not-found', wikiLink });
    const resolveResult: ResolveWikiLinkResult = resolver('[[Missing]]');

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

  it('exposes scaffold and template result shapes', () => {
    const scaffolding: ScaffoldingResult = { properties: { title: 'Untitled' } };
    const templating: TemplatingResult = { body: '## Definitions\n' };
    expect(scaffolding.properties['title']).toBe('Untitled');
    expect(templating.body).toContain('Definitions');
  });
});

describe('Core behavior', () => {
  // Parser landed in P3. Scaffolding in P6. Templating in P7.
  it.todo('scaffold returns missing defaults — P6');
  it.todo('template renders the Template Block body — P7');

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

  it('imports the stub functions without crashing at module load', () => {
    expect(typeof parseTypeDefinitionDocument).toBe('function');
    expect(typeof validate).toBe('function');
    expect(typeof scaffold).toBe('function');
    expect(typeof template).toBe('function');
  });
});
