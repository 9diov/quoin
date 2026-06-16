import { describe, it } from 'vitest';
import { validate } from '../../src/index.js';
import {
  expectError,
  expectPassing,
  makeDocument,
  makeResolver,
  makeTypeDef,
  makeTypeRegistry,
} from './helpers.js';

const skillTypeDef = {
  id: 'types/Skill.md',
  name: 'skill',
  schema: { properties: { description: { type: 'text' as const, required: true } } },
};

const levelTypeDef = {
  id: 'types/Level.md',
  name: 'level',
  schema: { properties: { rank: { type: 'number' as const, required: true } } },
};

describe('V040 referential match passes', () => {
  it('passes when target document conforms to expected type', () => {
    const typeDef = makeTypeDef({
      properties: {
        skills: { type: { kind: 'list', of: { kind: 'type-ref', name: 'skill' } } },
      },
    });

    const document = makeDocument({
      _type: '[[Concept]]',
      skills: ['[[TypeScript]]'],
    });

    const resolver = makeResolver({
      '[[TypeScript]]': {
        kind: 'found',
        document: {
          path: 'skills/TypeScript.md',
          frontmatter: { _type: '[[Skill]]' },
          body: '',
        },
      },
    });

    const typeRegistry = makeTypeRegistry(
      { skill: { kind: 'found', typeDef: skillTypeDef } },
      { '[[Skill]]': { kind: 'found', typeDef: skillTypeDef } },
    );

    const result = validate(
      document,
      typeDef,
      { referentialValidation: true },
      resolver,
      typeRegistry,
    );

    expectPassing(result);
  });
});

describe('V041 missing TypeRegistry is config error after link resolves', () => {
  it('returns config:missing-dependency when typeRegistry is undefined', () => {
    const typeDef = makeTypeDef({
      properties: {
        skills: { type: { kind: 'list', of: { kind: 'type-ref', name: 'skill' } } },
      },
    });

    const document = makeDocument({
      _type: '[[Concept]]',
      skills: ['[[TypeScript]]'],
    });

    const resolver = makeResolver({
      '[[TypeScript]]': {
        kind: 'found',
        document: {
          path: 'skills/TypeScript.md',
          frontmatter: { _type: '[[Skill]]' },
          body: '',
        },
      },
    });

    const result = validate(
      document,
      typeDef,
      { referentialValidation: true },
      resolver,
      undefined,
    );

    expectError(result, {
      kind: 'config:missing-dependency',
      location: { scope: 'property', property: 'skills', index: 0 },
    });
  });
});

describe('V042 unknown Type Reference', () => {
  it('returns type:unknown-reference when getByName returns not-found', () => {
    const typeDef = makeTypeDef({
      properties: {
        skills: { type: { kind: 'list', of: { kind: 'type-ref', name: 'skill' } } },
      },
    });

    const document = makeDocument({
      _type: '[[Concept]]',
      skills: ['[[TypeScript]]'],
    });

    const resolver = makeResolver({
      '[[TypeScript]]': {
        kind: 'found',
        document: {
          path: 'skills/TypeScript.md',
          frontmatter: { _type: '[[Skill]]' },
          body: '',
        },
      },
    });

    const typeRegistry = makeTypeRegistry({ skill: { kind: 'not-found', typeName: 'skill' } }, {});

    const result = validate(
      document,
      typeDef,
      { referentialValidation: true },
      resolver,
      typeRegistry,
    );

    expectError(result, {
      kind: 'type:unknown-reference',
      location: { scope: 'property', property: 'skills', index: 0 },
    });
  });
});

describe('V043 target Document missing Type Declaration', () => {
  it('returns type:missing-declaration when target has no _type', () => {
    const typeDef = makeTypeDef({
      properties: {
        skills: { type: { kind: 'list', of: { kind: 'type-ref', name: 'skill' } } },
      },
    });

    const document = makeDocument({
      _type: '[[Concept]]',
      skills: ['[[TypeScript]]'],
    });

    const resolver = makeResolver({
      '[[TypeScript]]': {
        kind: 'found',
        document: {
          path: 'skills/TypeScript.md',
          frontmatter: {},
          body: '',
        },
      },
    });

    const typeRegistry = makeTypeRegistry(
      { skill: { kind: 'found', typeDef: skillTypeDef } },
      { undefined: { kind: 'missing-declaration' } },
    );

    const result = validate(
      document,
      typeDef,
      { referentialValidation: true },
      resolver,
      typeRegistry,
    );

    expectError(result, {
      kind: 'type:missing-declaration',
      location: { scope: 'property', property: 'skills', index: 0 },
    });
  });
});

describe('V044 target Document referential mismatch', () => {
  it('returns type:referential-mismatch when target is different type', () => {
    const typeDef = makeTypeDef({
      properties: {
        skills: { type: { kind: 'list', of: { kind: 'type-ref', name: 'skill' } } },
      },
    });

    const document = makeDocument({
      _type: '[[Concept]]',
      skills: ['[[Beginner]]'],
    });

    const resolver = makeResolver({
      '[[Beginner]]': {
        kind: 'found',
        document: {
          path: 'levels/Beginner.md',
          frontmatter: { _type: '[[Level]]' },
          body: '',
        },
      },
    });

    const typeRegistry = makeTypeRegistry(
      { skill: { kind: 'found', typeDef: skillTypeDef } },
      { '[[Level]]': { kind: 'found', typeDef: levelTypeDef } },
    );

    const result = validate(
      document,
      typeDef,
      { referentialValidation: true },
      resolver,
      typeRegistry,
    );

    expectError(result, {
      kind: 'type:referential-mismatch',
      location: { scope: 'property', property: 'skills', index: 0 },
    });
  });
});

describe('V045 type:ambiguous-reference from getByName', () => {
  it('returns type:ambiguous-reference when getByName returns ambiguous', () => {
    const typeDef = makeTypeDef({
      properties: {
        skills: { type: { kind: 'list', of: { kind: 'type-ref', name: 'skill' } } },
      },
    });

    const document = makeDocument({
      _type: '[[Concept]]',
      skills: ['[[TypeScript]]'],
    });

    const resolver = makeResolver({
      '[[TypeScript]]': {
        kind: 'found',
        document: {
          path: 'skills/TypeScript.md',
          frontmatter: { _type: '[[Skill]]' },
          body: '',
        },
      },
    });

    const typeRegistry = makeTypeRegistry(
      { skill: { kind: 'ambiguous', typeName: 'skill', candidates: [skillTypeDef, levelTypeDef] } },
      {},
    );

    const result = validate(
      document,
      typeDef,
      { referentialValidation: true },
      resolver,
      typeRegistry,
    );

    expectError(result, {
      kind: 'type:ambiguous-reference',
      location: { scope: 'property', property: 'skills', index: 0 },
    });
  });
});

describe('V046 type:unavailable from getByName', () => {
  it('returns type:unavailable when getByName returns unavailable', () => {
    const typeDef = makeTypeDef({
      properties: {
        skills: { type: { kind: 'list', of: { kind: 'type-ref', name: 'skill' } } },
      },
    });

    const document = makeDocument({
      _type: '[[Concept]]',
      skills: ['[[TypeScript]]'],
    });

    const resolver = makeResolver({
      '[[TypeScript]]': {
        kind: 'found',
        document: {
          path: 'skills/TypeScript.md',
          frontmatter: { _type: '[[Skill]]' },
          body: '',
        },
      },
    });

    const typeRegistry = makeTypeRegistry(
      { skill: { kind: 'unavailable', reason: 'index not loaded' } },
      {},
    );

    const result = validate(
      document,
      typeDef,
      { referentialValidation: true },
      resolver,
      typeRegistry,
    );

    expectError(result, {
      kind: 'type:unavailable',
      location: { scope: 'property', property: 'skills', index: 0 },
    });
  });
});

describe('V047 type:invalid-declaration from getByDeclaration', () => {
  it('returns type:invalid-declaration when getByDeclaration returns invalid-declaration', () => {
    const typeDef = makeTypeDef({
      properties: {
        skills: { type: { kind: 'list', of: { kind: 'type-ref', name: 'skill' } } },
      },
    });

    const document = makeDocument({
      _type: '[[Concept]]',
      skills: ['[[TypeScript]]'],
    });

    const resolver = makeResolver({
      '[[TypeScript]]': {
        kind: 'found',
        document: {
          path: 'skills/TypeScript.md',
          frontmatter: { _type: 123 },
          body: '',
        },
      },
    });

    const typeRegistry = makeTypeRegistry(
      { skill: { kind: 'found', typeDef: skillTypeDef } },
      { '123': { kind: 'invalid-declaration', value: 123 } },
    );

    const result = validate(
      document,
      typeDef,
      { referentialValidation: true },
      resolver,
      typeRegistry,
    );

    expectError(result, {
      kind: 'type:invalid-declaration',
      location: { scope: 'property', property: 'skills', index: 0 },
    });
  });
});

describe('V048 type:unknown-declaration from getByDeclaration', () => {
  it('returns type:unknown-declaration when getByDeclaration returns not-found', () => {
    const typeDef = makeTypeDef({
      properties: {
        skills: { type: { kind: 'list', of: { kind: 'type-ref', name: 'skill' } } },
      },
    });

    const document = makeDocument({
      _type: '[[Concept]]',
      skills: ['[[TypeScript]]'],
    });

    const resolver = makeResolver({
      '[[TypeScript]]': {
        kind: 'found',
        document: {
          path: 'skills/TypeScript.md',
          frontmatter: { _type: '[[Skill]]' },
          body: '',
        },
      },
    });

    const typeRegistry = makeTypeRegistry(
      { skill: { kind: 'found', typeDef: skillTypeDef } },
      { '[[Skill]]': { kind: 'not-found', typeName: 'skill-type' } },
    );

    const result = validate(
      document,
      typeDef,
      { referentialValidation: true },
      resolver,
      typeRegistry,
    );

    expectError(result, {
      kind: 'type:unknown-declaration',
      location: { scope: 'property', property: 'skills', index: 0 },
    });
  });
});

describe('V049 type:ambiguous-declaration from getByDeclaration', () => {
  it('returns type:ambiguous-declaration when getByDeclaration returns ambiguous', () => {
    const typeDef = makeTypeDef({
      properties: {
        skills: { type: { kind: 'list', of: { kind: 'type-ref', name: 'skill' } } },
      },
    });

    const document = makeDocument({
      _type: '[[Concept]]',
      skills: ['[[TypeScript]]'],
    });

    const resolver = makeResolver({
      '[[TypeScript]]': {
        kind: 'found',
        document: {
          path: 'skills/TypeScript.md',
          frontmatter: { _type: '[[Skill]]' },
          body: '',
        },
      },
    });

    const typeRegistry = makeTypeRegistry(
      { skill: { kind: 'found', typeDef: skillTypeDef } },
      {
        '[[Skill]]': {
          kind: 'ambiguous',
          typeName: 'skill',
          candidates: [skillTypeDef, levelTypeDef],
        },
      },
    );

    const result = validate(
      document,
      typeDef,
      { referentialValidation: true },
      resolver,
      typeRegistry,
    );

    expectError(result, {
      kind: 'type:ambiguous-declaration',
      location: { scope: 'property', property: 'skills', index: 0 },
    });
  });
});
