---
_type: "[[plan-doc]]"
status: "done"
---

# P28 — Doc Reference Format Separation

## Goal

Implement [D9 — Doc Reference Format Separation](../design/D9-doc-ref-format-separation.md).

Quoin currently conflates:

- the semantic idea "this Property points at another Document", and
- the concrete syntax `[[Target]]`.

P28 introduces `doc-ref` as the semantic schema type for internal document
references, adds `format` and `referenced-type` as `doc-ref`-only schema keys,
and migrates the Core and Integrations away from a wiki-link-specific resolver
contract.

After this phase:

- `wiki-link` is no longer the canonical internal-reference property type.
- `doc-ref` is the canonical type for scalar and list-based document
  references.
- `format: wiki-link` and `format: markdown-link` constrain concrete runtime
  syntax when needed.
- `referenced-type` replaces the semantic role currently carried by type-ref
  property shapes such as `type: "[[person]]"`.
- Resolver input becomes source-document-aware and format-aware.
- Parser output normalizes explicit and sugar forms onto one canonical
  `DocReference` shape.
- docs, fixtures, and generated examples emit `doc-ref`, not `wiki-link`.

## Inputs

- [D9 — Doc Reference Format Separation](../design/D9-doc-ref-format-separation.md)
- [D2 — Type and Schema Contracts](../design/D2-type-and-schema-contracts.md)
- [D3 — Validation Semantics](../design/D3-validation-semantics.md)
- [D4 — Integration Contracts](../design/D4-integration-contracts.md)
- [D5 — Node CLI Integration](../design/D5-node-cli-integration.md)
- [D7 — Type Inference From Documents](../design/D7-type-inference-from-documents.md)
- [D8 — Obsidian Plugin Integration](../design/D8-obsidian-plugin-integration.md)
- [P27 — Remove `url` Primitive Type](P27-remove-url-primitive.md)

## Decision

Adopt D9's normalized document-reference model directly.

Canonical parsed shape:

```typescript
type DocRefFormat = 'wiki-link' | 'markdown-link';

type DocReference = {
  kind: 'doc-ref';
  format?: DocRefFormat;
  referencedType?: string;
};
```

This shape replaces two current concepts:

- primitive `wiki-link`
- property-level `TypeReference` values used to mean "must resolve to a
  Document of this type"

Parser keeps the existing shorthand surface for compatibility:

```yaml
type: "[[person]]"
type: "list<[[skill]]>"
type: "[](person)"
type: "list<[](skill)>"
```

But each form normalizes to a `doc-ref` shape in the parsed schema.

## Non-goals

This phase does not:

- rename existing resolution error kinds such as `resolve:broken-wiki-link`
- add bare type declarations such as `_type: person`
- add protocol-qualified document references to the core grammar
- add reference-style Markdown link support
- add autolink support
- add external-link or text-refinement validation beyond D9
- remove compatibility parsing for `type: wiki-link` immediately

## Public Contract Changes

### Property type model

`PrimitiveTypeName` loses `wiki-link`.

`PropertyTypeName` gains `DocReference` directly:

```typescript
type PrimitiveTypeName =
  | 'text'
  | 'number'
  | 'boolean'
  | 'date'
  | 'datetime';

type DocReference = {
  kind: 'doc-ref';
  format?: 'wiki-link' | 'markdown-link';
  referencedType?: string;
};

type ListItemType =
  | { kind: 'primitive'; name: PrimitiveTypeName }
  | DocReference;

type PropertyTypeName =
  | PrimitiveTypeName
  | DocReference
  | CollectionTypeName;
```

`TypeReference` remains valid as a concept only where Quoin still needs a
type-definition name, not as a property-value schema shape.

### Schema surface

Allowed property schema keys become:

- `type`
- `format`
- `referenced-type`
- `required`
- `allow-empty`
- `default`

Rules:

- `format` is valid only for `type: doc-ref` or `type: list<doc-ref>`.
- `referenced-type` is valid only for `type: doc-ref` or
  `type: list<doc-ref>`.
- `referenced-type` must be a canonical type name.
- `type: wiki-link` is accepted only as a compatibility alias for
  `type: doc-ref` + `format: wiki-link`.
- new docs and examples must not emit `type: wiki-link`.

### Validation

For present, non-empty `doc-ref` values:

1. validate string shape
2. determine format when omitted
3. invoke Resolver with `value`, `format`, and `sourceDocumentPath`
4. if `referenced-type` is present and referential validation is enabled,
   validate the resolved target's declared type through `TypeRegistry`

Error-kind behavior stays stable for this phase:

- shape mismatch still returns `property:wrong-type`
- resolution failures still map to `resolve:broken-wiki-link`,
  `resolve:invalid-wiki-link`, `resolve:ambiguous-wiki-link`, and
  `resolve:unavailable`

### Resolver contract

Move from:

```typescript
type Resolver = (wikiLink: string) => ResolveWikiLinkResult;
```

To:

```typescript
type ResolveDocReferenceInput = {
  value: string;
  format?: 'wiki-link' | 'markdown-link';
  sourceDocumentPath: string;
};

type ResolveDocReferenceResult =
  | { kind: 'found'; document: Document }
  | { kind: 'not-found'; value: string; format: 'wiki-link' | 'markdown-link' }
  | { kind: 'invalid-link'; value: string; format: 'wiki-link' | 'markdown-link'; reason: string }
  | { kind: 'ambiguous'; value: string; format: 'wiki-link' | 'markdown-link'; candidates: Document[] }
  | { kind: 'unavailable'; value: string; format: 'wiki-link' | 'markdown-link'; reason: string };

type Resolver = (input: ResolveDocReferenceInput) => ResolveDocReferenceResult;
```

This is the largest compatibility change in P28 and should drive the
implementation order.

## Docs Changes

Update user-facing docs:

- [README.md](../../README.md)
  - replace `type: wiki-link` examples with `type: doc-ref`
  - document `format` and `referenced-type`
  - explain default behavior when `format` is omitted
- [docs/public/index.md](../public/index.md)
  - replace the primitive-table row for `wiki-link`
  - add `doc-ref` examples for scalar and list properties

Update domain language:

- [CONTEXT.md](../../CONTEXT.md)
  - change **Wiki Link** from "the internal-reference type" to one allowed
    concrete syntax for `doc-ref`
  - add or revise **Doc Reference**
  - update **Type Reference** to mean schema/type-definition lookup only, not
    a runtime property type
  - update **Resolver** terminology to be format-aware

Update design docs:

- [D2](../design/D2-type-and-schema-contracts.md)
- [D3](../design/D3-validation-semantics.md)
- [D4](../design/D4-integration-contracts.md)
- [D5](../design/D5-node-cli-integration.md)
- [D7](../design/D7-type-inference-from-documents.md)
- [D8](../design/D8-obsidian-plugin-integration.md)

Update tests/docs/plans that describe the old contract as current:

- [docs/test-cases/parser.md](../test-cases/parser.md)
- [docs/test-cases/validation.md](../test-cases/validation.md)
- [docs/plan/core/P2-shared-core-types.md](core/P2-shared-core-types.md)
- [docs/plan/core/P3-parser.md](core/P3-parser.md)
- [docs/plan/core/P5-validation.md](core/P5-validation.md)
- [docs/plan/core/P8-minimal-integration-harness.md](core/P8-minimal-integration-harness.md)

## Code Changes

### Core types and public exports

Touch points:

```text
src/core/parser.ts
src/core/integration.ts
src/index.ts
```

Required changes:

- add exported `DocRefFormat` and `DocReference` types
- remove `wiki-link` from `PrimitiveTypeName`
- redefine `ListItemType` and `PropertyTypeName` around `DocReference`
- replace `ResolveWikiLinkResult` with a format-aware result type
- update any exported type aliases and snapshots that expose the old shape

### Core parser

Touch points:

```text
src/core/parser/property-schema.ts
src/core/parser/defaults.ts
src/core/parser/schema-yaml.ts
src/core/parser/errors.ts
```

Required changes:

- extend allowed schema keys to include `format` and `referenced-type`
- parse `type: doc-ref` and `type: list<doc-ref>`
- normalize compatibility alias `type: wiki-link` to canonical `DocReference`
- normalize shorthand `[[name]]`, `list<[[name]]>`, `[](name)`, and
  `list<[](name)>` to canonical `DocReference`
- reject `format` and `referenced-type` on non-`doc-ref` properties
- validate `referenced-type` with the canonical identifier rule
- update default validation so `doc-ref` defaults validate against the declared
  format rules
- keep diagnostics stable where possible; only add new parser errors when D9
  truly needs new distinguishable failures

### Core link grammar

Touch points:

```text
src/core/link-grammar.ts
src/core/primitive-grammar.ts
```

Required changes:

- keep existing Wiki Link helpers
- add a narrow internal `markdown-link` shape validator/parser
- reject explicit protocols in the core `markdown-link` grammar
- expose helpers that let validation and integrations deterministically detect
  `wiki-link` first, then `markdown-link`
- keep grammar utilities format-focused, not integration-path-aware

### Core validation

Touch points:

```text
src/core/validation.ts
src/core/validation/property.ts
src/core/validation/primitives.ts
src/core/validation/collections.ts
src/core/validation/referential.ts
```

Required changes:

- route scalar `doc-ref` validation through a dedicated branch rather than the
  primitive switch
- route list item `doc-ref` validation through collection validation
- pass `document.path` into any validation path that may invoke Resolver
- infer the runtime format when schema `format` is omitted
- use `referencedType` rather than `TypeReference` object shape when deciding
  whether to invoke `TypeRegistry`
- preserve current empty-value semantics from P5

### Core integration contracts

Touch points:

```text
src/core/integration.ts
src/core/types.ts
```

Required changes:

- replace the wiki-link-specific resolver input/output types
- make source-document path part of the contract
- keep `TypeRegistry.getByDeclaration(value)` unchanged in this phase
- keep `_type: type` sentinel behavior unchanged

### Node CLI integration

Touch points:

```text
src/integration/node-cli/lookup.ts
src/integration/node-cli/validate.ts
src/integration/node-cli/create.ts
src/integration/node-cli/types.ts
test/integration/node-cli/**
```

Required changes:

- update `createResolver(...)` to accept `ResolveDocReferenceInput`
- preserve current basename resolution for `wiki-link`
- add relative-path resolution for `markdown-link` based on
  `sourceDocumentPath`
- normalize root-relative and directory-relative targets according to D9
- keep type-registry behavior unchanged except where new parsed schema shapes
  require new branching
- update CLI snapshots and fixture expectations to show canonical `doc-ref`
  parsed shapes

### Obsidian integration

Touch points:

```text
src/integration/obsidian/lookup.ts
src/integration/obsidian/active-validation.ts
src/integration/obsidian/vault-validation.ts
src/integration/obsidian/create-flow.ts
test/integration/obsidian/**
```

Required changes:

- update `createObsidianResolver(...)` to the format-aware contract
- preserve current metadata-cache-backed `wiki-link` resolution
- add `markdown-link` resolution relative to the active file path when reliable
- if full `markdown-link` resolution is not yet trustworthy in Obsidian, return
  `unavailable` rather than silently misresolving
- update any create-flow scaffolds or examples to emit canonical `doc-ref`

## Fixtures and Tests

### Parser coverage

Add or update coverage for:

- `type: doc-ref`
- `type: doc-ref` + `format: wiki-link`
- `type: doc-ref` + `format: markdown-link`
- `type: doc-ref` + `referenced-type: person`
- `type: list<doc-ref>` variants
- shorthand `[[person]]` normalization
- shorthand `[](person)` normalization
- compatibility alias `type: wiki-link`
- invalid `format` on `type: text`
- invalid `referenced-type` on `type: list<text>`
- invalid protocol-qualified markdown-link defaults

### Validation coverage

Add or update coverage for:

- unconstrained `doc-ref` accepting either supported syntax
- `format: wiki-link` rejecting markdown-link runtime values
- `format: markdown-link` rejecting wiki-link runtime values
- broken markdown-link resolution
- ambiguous markdown-link resolution where multiple normalized paths collide
- referential validation through `referenced-type`
- list-of-`doc-ref` validation
- missing resolver after shape success still producing
  `config:missing-dependency`

### Integration coverage

Add or update fixtures under:

- `fixtures/scenarios/**`
- `fixtures/vaults/**`

Include cases for:

- relative markdown-link doc refs in Node CLI fixtures
- root-relative markdown-link doc refs if supported by the integration model
- Obsidian vault docs that mix wiki-link and markdown-link references
- continued support for existing wiki-link-authored documents

## Implementation Order

1. Change the exported Core types so the target model is explicit.
2. Teach the parser to emit canonical `DocReference` shapes while keeping
   compatibility aliases.
3. Add core markdown-link grammar helpers and unit tests.
4. Migrate validation to the new `doc-ref` model and resolver input.
5. Migrate Node CLI resolver behavior, then its integration tests.
6. Migrate Obsidian resolver behavior, then its integration tests.
7. Update docs, fixtures, and examples to use canonical `doc-ref`.
8. Clean up any remaining `wiki-link`-as-primitive assumptions in plans and
   test-case docs.

This order minimizes churn: parser normalization lands before downstream code
starts depending on the new shape, and resolver contract changes happen before
integration-specific behavior is adjusted.

## Exit Criteria

P28 is complete when:

- canonical parsed schemas use `DocReference` for every document-reference
  property form
- `type: doc-ref` and `type: list<doc-ref>` are fully supported
- `format` and `referenced-type` obey D9's contextual schema rules
- validation supports both wiki-link and markdown-link doc refs
- resolver input is format-aware and source-path-aware in Core, CLI, and
  Obsidian
- existing wiki-link-authored schemas still parse through compatibility
  normalization
- docs and generated examples present `doc-ref` as the canonical surface

## Follow-on

After P28, likely next cleanups are:

- [P29 — Obsidian Markdown-Link Resolution](P29-obsidian-markdown-link-resolution.md):
  replace the Obsidian `markdown-link` `unavailable` stub with real vault-path
  resolution
- remove the temporary `type: wiki-link` parser alias in a later compatibility
  phase
- decide whether to rename resolution diagnostics from `...wiki-link` to
  format-neutral names
- design bare type declarations if D9's deferred `_type: person` direction
  becomes important
