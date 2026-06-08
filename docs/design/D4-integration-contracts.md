# D4 — Integration Contracts

## Resolver

```typescript
type ResolveWikiLinkResult =
  | { kind: 'found'; document: Document }
  | { kind: 'not-found'; wikiLink: string }
  | { kind: 'invalid-link'; wikiLink: string; reason: string }
  | { kind: 'ambiguous'; wikiLink: string; candidates: Document[] }
  | { kind: 'unavailable'; wikiLink: string; reason: string }

// The Core passes a raw Wiki Link string; resolution strategy is opaque to it.
type Resolver = (wikiLink: string) => ResolveWikiLinkResult
```

Resolver is the Core's only mechanism for accessing Documents outside the Document being validated. Integrations construct a Resolver via a factory that bakes in host-specific matching behavior.

Example:

```typescript
type ObsidianResolverOptions = {
  strategy: 'shortest-path' | 'full-path' | 'exact'
}

declare function createObsidianResolver(
  vault: ObsidianVault,
  options: ObsidianResolverOptions
): Resolver
```

---

## TypeRegistry

```typescript
type TypeReferenceLookupResult =
  | { kind: 'found'; typeDef: ParsedTypeDefinitionDocument }
  | { kind: 'not-found'; typeName: string }
  | { kind: 'ambiguous'; typeName: string; candidates: ParsedTypeDefinitionDocument[] }
  | { kind: 'unavailable'; reason: string }

type TypeDeclarationLookupResult =
  | { kind: 'found'; typeDef: ParsedTypeDefinitionDocument }
  | { kind: 'missing-declaration' }
  | { kind: 'invalid-declaration'; value: unknown }
  | { kind: 'not-found'; typeName: string }
  | { kind: 'ambiguous'; typeName: string; candidates: ParsedTypeDefinitionDocument[] }
  | { kind: 'unavailable'; reason: string }

type TypeRegistry = {
  // Resolves a Type Reference from a Collection Type, e.g. "skill" in list<skill>.
  getByName(typeName: string): TypeReferenceLookupResult

  // Resolves a Document's Type Declaration, e.g. _type: "[[Skill]]".
  getByDeclaration(value: unknown): TypeDeclarationLookupResult
}
```

TypeRegistry is Integration-supplied and used by Core only during Referential Validation. It resolves Type References and target Document Type Declarations to parsed Type Definition Documents.

Referential Validation compares resolved Type Definition Document identity, not raw Type Reference or Type Declaration strings.

---

## Root Type Declaration dispatch

Integrations resolve a Document's own Type Declaration before calling Validation. Core receives the already-selected Type Definition Document:

```typescript
validate(document, typeDef, config, resolver, typeRegistry)
```

Core does not verify that `document.frontmatter[typeDeclarationKey]` resolves to the same `typeDef`.

---

## Parser identity

Integrations supply identity and ParserConfig when parsing a Type Definition Document:

```typescript
type TypeDefinitionDocumentIdentity = {
  id: string
  name: string
}

type ParserConfig = {
  allowedUrlSchemes?: string[]
}
```

`id` is the Integration-stable identity used for Referential Validation comparison. `name` is the Type Reference name used in Collection Types.

Raw Markdown alone is not enough to derive stable identity because path, URI, host-specific aliases, and matching behavior belong to the Integration.

ParserConfig lets Parser validate URL defaults against the same URL scheme policy the Integration will later use during Validation. If omitted, `allowedUrlSchemes` defaults to `['http', 'https', 'mailto']`.
