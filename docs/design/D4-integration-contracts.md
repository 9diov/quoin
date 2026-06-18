---
_type: "[[design-doc]]"
status: "active"
---

# D4 — Integration Contracts

> **Note:** [D9 — Doc Reference Format Separation](D9-doc-ref-format-separation.md) supersedes the Resolver contract below. The current Resolver is format-aware: it takes a `{ value, format?, sourceDocumentPath }` input and returns `{ kind, value, format, … }` results. Wiki-link-specific names (`wikiLink`, `ResolveWikiLinkResult`) are gone from the contract.

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
  // Resolves a Type Reference declared by a Property schema,
  // e.g. "skill" in [[skill]] or list<[[skill]]>. Not called for list<primitive>
  // (e.g. list<text>) or enums (e.g. choice<"draft"|"published">) — those forms
  // declare no Type Reference and bypass TypeRegistry entirely.
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
  typeDeclarationKey?: string
}
```

`id` is the Integration-stable identity used for Referential Validation comparison. `name` is the Type Reference name used in Collection Types.

Raw Markdown alone is not enough to derive stable identity because path, URI, host-specific aliases, and matching behavior belong to the Integration.

`typeDeclarationKey` defaults to `'_type'` and should match the value passed in ValidationConfig so Parser and Validation agree on which frontmatter key carries the Type Declaration.

---

## Type Definition Document discovery

Integrations discover Type Definition Documents by scanning frontmatter for the system Type Declaration `_type: type` (ADR-0008, D2). The Core does not specify a directory layout — `types/`, `_types/`, `schema/`, or scattered files are all valid as long as the sentinel is present.

A typical Obsidian integration walks the vault once at startup:

1. For each Markdown file, read its frontmatter.
2. If `frontmatter[typeDeclarationKey] === 'type'`, treat the file as a Type Definition Document candidate and pass its raw contents to `parseTypeDefinitionDocument` with Integration-supplied identity.
3. Cache the resulting `ParsedTypeDefinitionDocument` in the Integration's TypeRegistry.

A regular Document's `_type` is a Wiki Link (`"[[Skill]]"`) and is resolved through TypeRegistry, not used for discovery. The discovery sentinel (the bare literal `type`) and the conformance value space (Wiki Links) share the same frontmatter key but are syntactically disjoint — Parser dispatches on shape alone.

---

## Meta-Type Definition Document (optional)

If exactly one discovered Type Definition Document has `TypeDefinitionDocumentIdentity.name === 'type'`, the Integration MAY register it as the meta-Type Definition Document and validate every other Type Definition Document against it via ordinary `validate(typeDefDocument, metaTypeDef, ...)` calls. This is how vault-wide constraints on Type Definition Documents are expressed — extra required Properties (e.g., `category`, `owner`) or extra required Sections (e.g., `## Rationale`) — without inventing a parallel schema-of-schemas mechanism (ADR-0008).

The Core has no concept of the meta-Type Definition Document; this is purely an Integration convention. When the Integration calls `typeRegistry.getByDeclaration('type')` during Referential Validation, it should resolve to the meta-Type Definition Document if one is registered.

The meta-Type Definition Document validates against itself like any other Type Definition Document — its own frontmatter must satisfy its own schema, and its own body must contain its own required Sections.
