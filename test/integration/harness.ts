import { parse as parseYaml } from 'yaml';

import {
  type Document,
  type ParsedTypeDefinitionDocument,
  type ParseError,
  type ParserConfig,
  parseTypeDefinitionDocument,
  type Resolver,
  type ResolveWikiLinkResult,
  type ScaffoldingResult,
  scaffold,
  type TemplatingResult,
  type TypeDeclarationLookupResult,
  type TypeDefinitionDocumentIdentity,
  type TypeReferenceLookupResult,
  type TypeRegistry,
  template,
  type ValidationConfig,
  type ValidationResult,
  type ValidationWarning,
  validate,
} from '../../src/index.js';

export type RawMarkdownFixture = {
  path: string;
  raw: string;
};

export type HarnessParserFailure = {
  kind: 'parse-error';
  path: string;
  identity: TypeDefinitionDocumentIdentity;
  errors: ParseError[];
};

export type HarnessValidationResult =
  | { kind: 'validated'; result: ValidationResult; typeDef: ParsedTypeDefinitionDocument }
  | { kind: 'skipped-untyped' }
  | { kind: 'warn-untyped'; warning: ValidationWarning }
  | { kind: 'invalid-type-declaration'; value: unknown }
  | { kind: 'type-not-found'; declaration: unknown; typeName: string }
  | {
      kind: 'type-ambiguous';
      declaration: unknown;
      typeName: string;
      candidates: ParsedTypeDefinitionDocument[];
    }
  | { kind: 'type-unavailable'; declaration: unknown; reason: string };

export type HarnessCreationResult = {
  typeDef: ParsedTypeDefinitionDocument;
  frontmatter: Record<string, unknown>;
  scaffolded: ScaffoldingResult;
  templated: TemplatingResult;
};

type HarnessDependencies = {
  parseTypeDefinitionDocument?: typeof parseTypeDefinitionDocument;
  validate?: typeof validate;
  scaffold?: typeof scaffold;
  template?: typeof template;
};

type FrontmatterLookup = {
  kind: 'found';
  value: unknown;
};

type TypeDefCache = {
  byId: Map<string, ParsedTypeDefinitionDocument>;
  byName: Map<string, ParsedTypeDefinitionDocument[]>;
};

export type InMemoryHarness = {
  readonly parserFailures: HarnessParserFailure[];
  readonly discoveredTypeDefPaths: string[];
  readonly resolver: Resolver;
  readonly typeRegistry: TypeRegistry;
  readonly typeDefsById: ReadonlyMap<string, ParsedTypeDefinitionDocument>;
  readonly typeDefsByName: ReadonlyMap<string, ParsedTypeDefinitionDocument[]>;
  readonly documentsByPath: ReadonlyMap<string, Document>;
  validateAuthoredDocument(
    document: Document,
    config: ValidationConfig,
    dependencies?: Pick<HarnessDependencies, 'validate'>,
  ): HarnessValidationResult;
  createNewDocument(
    typeDef: ParsedTypeDefinitionDocument,
    frontmatter: Record<string, unknown>,
    dependencies?: Pick<HarnessDependencies, 'scaffold' | 'template'>,
  ): HarnessCreationResult;
};

export type CreateHarnessOptions = {
  parserConfig?: ParserConfig;
  identityForFixture?: (fixture: RawMarkdownFixture) => TypeDefinitionDocumentIdentity;
  documents?: Document[];
  resolverOverrides?: Record<string, ResolveWikiLinkResult>;
  dependencies?: HarnessDependencies;
};

export function createInMemoryHarness(
  fixtures: RawMarkdownFixture[],
  options: CreateHarnessOptions = {},
): InMemoryHarness {
  const parserConfig = options.parserConfig ?? {};
  const parseFn = options.dependencies?.parseTypeDefinitionDocument ?? parseTypeDefinitionDocument;
  const identityForFixture = options.identityForFixture ?? defaultIdentityForFixture;
  const parserFailures: HarnessParserFailure[] = [];
  const discoveredTypeDefPaths: string[] = [];
  const typeDefs = createTypeDefCache();

  for (const fixture of fixtures) {
    if (!isTypeDefinitionCandidate(fixture.raw, parserConfig.typeDeclarationKey)) {
      continue;
    }

    discoveredTypeDefPaths.push(fixture.path);
    const identity = identityForFixture(fixture);
    const parseResult = parseFn(fixture.raw, identity, parserConfig);

    if (parseResult.kind === 'error') {
      parserFailures.push({
        kind: 'parse-error',
        path: fixture.path,
        identity,
        errors: parseResult.errors,
      });
      continue;
    }

    cacheTypeDefinition(typeDefs, parseResult.typeDef);
  }

  const documents = new Map<string, Document>();
  for (const document of options.documents ?? []) {
    documents.set(document.path, document);
  }

  const resolver = createResolver(documents, options.resolverOverrides ?? {});
  const typeRegistry = createTypeRegistry(typeDefs);

  return {
    parserFailures,
    discoveredTypeDefPaths,
    resolver,
    typeRegistry,
    typeDefsById: typeDefs.byId,
    typeDefsByName: typeDefs.byName,
    documentsByPath: documents,
    validateAuthoredDocument(document, config, dependencies) {
      const typeDeclarationKey = config.typeDeclarationKey ?? '_type';
      const declarationLookup = readTypeDeclaration(document, typeDeclarationKey);

      if (declarationLookup.kind !== 'found') {
        const behavior = config.untypedDocumentBehavior ?? 'skip';
        if (behavior === 'warn') {
          return {
            kind: 'warn-untyped',
            warning: {
              kind: 'document:untyped',
              message: `Document "${document.path}" has no Type Declaration at "${typeDeclarationKey}".`,
              location: { scope: 'config' },
              details: { path: document.path, key: typeDeclarationKey },
            },
          };
        }
        return { kind: 'skipped-untyped' };
      }

      const typeDefResult = typeRegistry.getByDeclaration(declarationLookup.value);

      switch (typeDefResult.kind) {
        case 'found':
          break;
        case 'invalid-declaration':
          return {
            kind: 'invalid-type-declaration',
            value: typeDefResult.value,
          };
        case 'not-found':
          return {
            kind: 'type-not-found',
            declaration: declarationLookup.value,
            typeName: typeDefResult.typeName,
          };
        case 'ambiguous':
          return {
            kind: 'type-ambiguous',
            declaration: declarationLookup.value,
            typeName: typeDefResult.typeName,
            candidates: typeDefResult.candidates,
          };
        case 'unavailable':
          return {
            kind: 'type-unavailable',
            declaration: declarationLookup.value,
            reason: typeDefResult.reason,
          };
        case 'missing-declaration':
          return { kind: 'skipped-untyped' };
      }

      const validateFn = dependencies?.validate ?? options.dependencies?.validate ?? validate;
      return {
        kind: 'validated',
        typeDef: typeDefResult.typeDef,
        result: validateFn(document, typeDefResult.typeDef, config, resolver, typeRegistry),
      };
    },
    createNewDocument(typeDef, frontmatter, dependencies) {
      const scaffoldFn = dependencies?.scaffold ?? options.dependencies?.scaffold ?? scaffold;
      const templateFn = dependencies?.template ?? options.dependencies?.template ?? template;
      const scaffolded = scaffoldFn(frontmatter, typeDef);
      const templated = templateFn(typeDef);

      return {
        typeDef,
        scaffolded,
        templated,
        frontmatter: {
          ...frontmatter,
          ...scaffolded.properties,
        },
      };
    },
  };
}

function createTypeDefCache(): TypeDefCache {
  return {
    byId: new Map<string, ParsedTypeDefinitionDocument>(),
    byName: new Map<string, ParsedTypeDefinitionDocument[]>(),
  };
}

function cacheTypeDefinition(cache: TypeDefCache, typeDef: ParsedTypeDefinitionDocument): void {
  cache.byId.set(typeDef.id, typeDef);

  const existing = cache.byName.get(typeDef.name) ?? [];
  cache.byName.set(typeDef.name, [...existing, typeDef]);
}

function createResolver(
  documentsByPath: ReadonlyMap<string, Document>,
  overrides: Record<string, ResolveWikiLinkResult>,
): Resolver {
  const documentsByTitle = new Map<string, Document[]>();

  for (const document of documentsByPath.values()) {
    const title = canonicalizeWikiLinkTarget(titleFromPath(document.path));
    const existing = documentsByTitle.get(title) ?? [];
    documentsByTitle.set(title, [...existing, document]);
  }

  return (wikiLink: string): ResolveWikiLinkResult => {
    const overridden = overrides[wikiLink];
    if (overridden) {
      return overridden;
    }

    const title = parseWikiLinkTitle(wikiLink);
    if (!title) {
      return {
        kind: 'invalid-link',
        wikiLink,
        reason: 'Expected a Wiki Link like [[Target]].',
      };
    }

    const candidates = documentsByTitle.get(canonicalizeWikiLinkTarget(title)) ?? [];
    if (candidates.length === 0) {
      return { kind: 'not-found', wikiLink };
    }
    if (candidates.length > 1) {
      return { kind: 'ambiguous', wikiLink, candidates };
    }
    const [document] = candidates;
    if (!document) {
      return { kind: 'not-found', wikiLink };
    }
    return { kind: 'found', document };
  };
}

function createTypeRegistry(cache: TypeDefCache): TypeRegistry {
  return {
    getByName(typeName: string): TypeReferenceLookupResult {
      const candidates = cache.byName.get(typeName) ?? [];
      if (candidates.length === 0) {
        return { kind: 'not-found', typeName };
      }
      if (candidates.length > 1) {
        return { kind: 'ambiguous', typeName, candidates };
      }
      const [typeDef] = candidates;
      if (!typeDef) {
        return { kind: 'not-found', typeName };
      }
      return { kind: 'found', typeDef };
    },
    getByDeclaration(value: unknown): TypeDeclarationLookupResult {
      if (value === undefined) {
        return { kind: 'missing-declaration' };
      }
      if (typeof value !== 'string') {
        return { kind: 'invalid-declaration', value };
      }

      const typeName = declarationToTypeName(value);
      if (!typeName) {
        return { kind: 'invalid-declaration', value };
      }

      const lookup = this.getByName(typeName);
      switch (lookup.kind) {
        case 'found':
          return lookup;
        case 'not-found':
          return { kind: 'not-found', typeName };
        case 'ambiguous':
          return { kind: 'ambiguous', typeName, candidates: lookup.candidates };
        case 'unavailable':
          return lookup;
      }
    },
  };
}

function isTypeDefinitionCandidate(raw: string, typeDeclarationKey = '_type'): boolean {
  const frontmatter = parseFrontmatter(raw);
  return frontmatter?.[typeDeclarationKey] === 'type';
}

function parseFrontmatter(raw: string): Record<string, unknown> | null {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!match) {
    return null;
  }

  const [, yamlBody] = match;
  if (!yamlBody) {
    return null;
  }

  const parsed = parseYaml(yamlBody);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return null;
  }

  return parsed as Record<string, unknown>;
}

function defaultIdentityForFixture(fixture: RawMarkdownFixture): TypeDefinitionDocumentIdentity {
  const name = canonicalizeWikiLinkTarget(titleFromPath(fixture.path));
  return { id: fixture.path, name };
}

function readTypeDeclaration(
  document: Document,
  typeDeclarationKey: string,
): FrontmatterLookup | { kind: 'missing' } {
  if (!Object.hasOwn(document.frontmatter, typeDeclarationKey)) {
    return { kind: 'missing' };
  }
  return { kind: 'found', value: document.frontmatter[typeDeclarationKey] };
}

function titleFromPath(path: string): string {
  const normalized = path.replace(/\\/g, '/');
  const lastSegment = normalized.slice(normalized.lastIndexOf('/') + 1);
  const extensionIndex = lastSegment.lastIndexOf('.');
  if (extensionIndex <= 0) {
    return lastSegment;
  }
  return lastSegment.slice(0, extensionIndex);
}

function declarationToTypeName(value: string): string | null {
  if (value === 'type') {
    return 'type';
  }

  const wikiLinkTitle = parseWikiLinkTitle(value);
  if (!wikiLinkTitle) {
    return null;
  }

  return canonicalizeWikiLinkTarget(wikiLinkTitle);
}

function parseWikiLinkTitle(value: string): string | null {
  const match = value.match(/^\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|[^\]]+)?\]\]$/);
  if (!match) {
    return null;
  }

  const [, title] = match;
  return title?.trim() ? title.trim() : null;
}

function canonicalizeWikiLinkTarget(value: string): string {
  return value.trim().toLowerCase();
}
