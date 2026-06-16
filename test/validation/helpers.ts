import { expect } from 'vitest';
import type {
  Document,
  ParsedTypeDefinitionDocument,
  Resolver,
  Schema,
  TypeRegistry,
  ValidationError,
  ValidationWarning,
} from '../../src/index.js';

export function makeTypeDef(schema: Schema): ParsedTypeDefinitionDocument {
  return {
    id: 'types/Concept.md',
    name: 'concept',
    schema,
  };
}

export function makeDocument(frontmatter: Record<string, unknown>, body?: string): Document {
  return {
    path: 'notes/concept.md',
    frontmatter,
    body: body ?? '',
  };
}

export function expectPassing(result: {
  passed: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}) {
  expect(result.passed).toBe(true);
  expect(result.errors).toEqual([]);
}

export function expectError(
  result: {
    passed: boolean;
    errors: ValidationError[];
    warnings: ValidationWarning[];
  },
  expected: Partial<ValidationError> & { kind: string },
) {
  expect(result.passed).toBe(false);
  const match = result.errors.find((e) => e.kind === expected.kind);
  if (!match) {
    expect.fail(
      `Expected error kind "${expected.kind}" not found in: ${JSON.stringify(result.errors)}`,
    );
  }
  if (expected.location) {
    expect(match.location).toEqual(expected.location);
  }
  if (expected.details) {
    for (const [key, value] of Object.entries(expected.details)) {
      expect((match.details as Record<string, unknown>)[key]).toEqual(value);
    }
  }
  if (expected.message) {
    expect(match.message).toContain(expected.message);
  }
}

export function expectWarning(
  result: {
    passed: boolean;
    errors: ValidationError[];
    warnings: ValidationWarning[];
  },
  expected: Partial<ValidationWarning> & { kind: string },
) {
  const match = result.warnings.find((w) => w.kind === expected.kind);
  if (!match) {
    expect.fail(
      `Expected warning kind "${expected.kind}" not found in: ${JSON.stringify(result.warnings)}`,
    );
  }
  if (expected.location) {
    expect(match.location).toEqual(expected.location);
  }
  if (expected.details) {
    for (const [key, value] of Object.entries(expected.details)) {
      expect((match.details as Record<string, unknown>)[key]).toEqual(value);
    }
  }
}

export function makeResolver(
  results: Record<
    string,
    {
      kind: string;
      document?: Document;
      wikiLink?: string;
      reason?: string;
      candidates?: Document[];
    }
  >,
): Resolver & { calls: string[] } {
  const calls: string[] = [];
  const fn = ((wikiLink: string) => {
    calls.push(wikiLink);
    const entry = results[wikiLink];
    if (!entry) return { kind: 'not-found' as const, wikiLink };
    return entry;
  }) as Resolver & { calls: string[] };
  fn.calls = calls;
  return fn;
}

export function makeTypeRegistry(
  getByNameResults: Record<
    string,
    {
      kind: string;
      typeDef?: ParsedTypeDefinitionDocument;
      typeName?: string;
      candidates?: ParsedTypeDefinitionDocument[];
      reason?: string;
    }
  >,
  getByDeclarationResults: Record<
    string,
    {
      kind: string;
      typeDef?: ParsedTypeDefinitionDocument;
      typeName?: string;
      value?: unknown;
      candidates?: ParsedTypeDefinitionDocument[];
      reason?: string;
    }
  >,
): TypeRegistry & { getByNameCalls: unknown[]; getByDeclarationCalls: unknown[] } {
  const getByNameCalls: unknown[] = [];
  const getByDeclarationCalls: unknown[] = [];
  return {
    getByName(typeName: string) {
      getByNameCalls.push(typeName);
      const entry = getByNameResults[typeName];
      if (!entry) return { kind: 'not-found' as const, typeName };
      return entry;
    },
    getByDeclaration(value: unknown) {
      getByDeclarationCalls.push(value);
      const key = typeof value === 'string' ? value : String(value);
      const entry = getByDeclarationResults[key];
      if (!entry) return { kind: 'missing-declaration' as const };
      return entry;
    },
    getByNameCalls,
    getByDeclarationCalls,
  } as TypeRegistry & { getByNameCalls: unknown[]; getByDeclarationCalls: unknown[] };
}
