# Core Implementation Plan

## Readiness

The design is ready for implementation.

The Core contracts are specified across:

- [D1 — Architecture](../design/D1-architecture.md)
- [D2 — Type and Schema Contracts](../design/D2-type-and-schema-contracts.md)
- [D3 — Validation Semantics](../design/D3-validation-semantics.md)
- [D4 — Integration Contracts](../design/D4-integration-contracts.md)

Specification fixtures are in:

- [Parser test cases](../test-cases/parser.md)
- [Validation test cases](../test-cases/validation.md)

Non-blocking choices to make during implementation:

- TypeScript package scaffold and test runner.
- Markdown/YAML parsing libraries.
- Whether the first Integration target is a tiny Node API or only Core unit tests.

## Implementation Order

### Phase 1 — Project scaffold

Goal: create a minimal TypeScript package that can run tests.

Detailed plan: [P1 — Project Scaffold](P1-project-scaffold.md).

Deliverables:

- `package.json`
- `tsconfig.json`
- test runner configuration
- `src/` layout
- exported public API surface

Recommended layout:

```text
src/
  index.ts
  core/
    types.ts
    parser.ts
    validation.ts
    scaffold.ts
    template.ts
    link-grammar.ts
    section-parser.ts
```

Acceptance:

- TypeScript compiles.
- Empty test suite runs.
- Public types are exported from `src/index.ts`.

### Phase 2 — Shared Core types

Goal: encode D2, D3, and D4 TypeScript contracts.

Detailed plan: [P2 — Shared Core Types](P2-shared-core-types.md).

Deliverables:

- `PrimitiveTypeName`
- `CollectionTypeName`
- `PropertyTypeName`
- `PropertySchema`
- `Schema`
- `Section`
- `TemplateBlock`
- `TypeDefinitionDocumentIdentity`
- `ParserConfig`
- `ParsedTypeDefinitionDocument`
- `ParseResult`
- `Document`
- `ValidationConfig`
- `ValidationResult`
- `Resolver`
- `TypeRegistry`
- `ScaffoldingResult`
- `TemplatingResult`

Acceptance:

- Type names and string literal unions match design docs.
- Section location includes heading level.
- Parser returns `ParseResult`, not a thrown authoring error.

### Phase 3 — Parser

Goal: parse Type Definition Documents strictly.

Detailed plan: [P3 — Parser](P3-parser.md).

Implement:

- exact level-2 `## Schema` detection
- exact optional level-2 `## Template` detection
- fenced YAML extraction for Schema
- fenced Markdown extraction for Template
- schema YAML parsing
- strict top-level schema validation
- strict Property schema validation
- canonical Property keys
- canonical Type Reference names
- canonical `TypeDefinitionDocumentIdentity.name`
- non-empty opaque identity `id`
- local default validation
- Template Section parsing

Acceptance:

- All parser test cases in [parser.md](../test-cases/parser.md) pass.
- Parser collects multiple independent authoring errors where cheap.
- Parser does not perform I/O, Resolver calls, or TypeRegistry calls.

### Phase 4 — Link and Section grammar helpers

Goal: isolate string grammar before full Validation.

Implement:

- Wiki Link shape validation
- External Link shape validation
- allowed URL scheme checking
- ATX heading parser
- fenced-code-aware heading extraction
- required Section marker extraction

Acceptance:

- Helpers are pure and unit-tested.
- Wiki Link grammar accepts Obsidian-compatible envelopes but does not resolve them.
- External Link grammar rejects titles, raw URL parentheses, whitespace targets, empty labels, and surrounding whitespace.
- Section identity is exact heading level plus exact heading text.

### Phase 5 — Validation

Goal: implement staged Document conformance checks.

Implement:

- open schemas by default
- `required` key presence
- `allow-empty` semantics
- primitive Property validation
- `list<X>` validation
- `choice<Y>` validation
- item-level list locations
- Link Resolution stage
- missing Resolver as `config:missing-dependency`
- Referential Validation stage
- missing TypeRegistry as `config:missing-dependency`
- Type Reference lookup mapping
- Type Declaration lookup mapping
- identity comparison by `ParsedTypeDefinitionDocument.id`
- reserved Property warnings
- Untyped Document warnings/skips
- required Section warnings

Acceptance:

- All validation test cases in [validation.md](../test-cases/validation.md) pass.
- Downstream stages do not run for a value after an upstream failure.
- Sibling list items continue validating after one item fails.
- Validation never mutates inputs.

### Phase 6 — Scaffolding

Goal: compute missing defaults.

Implement:

- return only absent Properties with declared defaults
- do not apply defaults directly
- do not validate, resolve, or mutate

Acceptance:

- Missing Property with default appears in `ScaffoldingResult.properties`.
- Present empty Property does not get overwritten.
- Required Property without default does not appear in Scaffolding Result.

### Phase 7 — Templating

Goal: generate new Document body content from parsed Template Block.

Implement:

- return fenced Markdown Template content as `TemplatingResult.body`
- return empty body when no Template Block exists
- do not inspect or mutate existing Documents

Acceptance:

- Template output preserves Markdown content.
- Existing Document body is never passed into or changed by `template()`.

### Phase 8 — Minimal Integration harness

Goal: prove Core can be used by an Integration without adding host complexity.

Recommended first Integration:

- small Node API or fixture harness
- in-memory Resolver
- in-memory TypeRegistry
- no filesystem write behavior beyond tests

Acceptance:

- Can parse Type Definition Documents.
- Can resolve a root Type Declaration outside Core.
- Can call `validate()`, `scaffold()`, and `template()`.
- Demonstrates Referential Validation with in-memory Documents and Type Definition Documents.

## Suggested Milestones

### Milestone 1 — Parser complete

Includes Phases 1 through 4.

This milestone gives confidence that Type Definition Documents can be parsed strictly before writing Validation logic.

### Milestone 2 — Validation complete

Includes Phase 5.

This milestone should satisfy the current Validation test-case suite.

### Milestone 3 — Core complete

Includes Phases 6 and 7.

This milestone completes the pure Core surface.

### Milestone 4 — First Integration proof

Includes Phase 8.

This milestone proves the Core/Integration split without committing to Obsidian plugin details yet.

## Implementation Principles

- Keep Core pure: no filesystem, vault, network, or runtime APIs.
- Prefer structured results over thrown authoring errors.
- Keep parser strict; do not silently ignore unknown schema syntax.
- Do not coerce user-authored values.
- Let Integration own identity, root Type Declaration dispatch, Resolver, TypeRegistry, and writes.
- Add implementation tests from `docs/test-cases/` before or alongside each feature.
