---
_type: "[[plan-doc]]"
status: "done"
terms: ["Document", "Type Definition Document", "Property", "Wiki Link", "Scaffolding", "Body Generation", "Untyped Document", "Meta-Type Definition Document", "Referential Validation", "Type Declaration", "Core", "Parser", "Resolver", "TypeRegistry", "Integration", "Validation"]
---

# P8 — Minimal Integration Harness

> **Note:** [P28](../P28-doc-reference-format-separation.md) supersedes the harness's Resolver wiring. The harness Resolver now accepts `{ value, format?, sourceDocumentPath }` and returns `{ kind, value, format, … }` results.

## Goal

Implement a tiny in-memory Integration harness that proves the Core can be used end-to-end without introducing host-specific complexity. After this phase, the repo should demonstrate the full Integration-owned flow: discover and parse Type Definition Documents, resolve a regular Document's root Type Declaration outside Core, wire Resolver and TypeRegistry, and call `validate()`, `scaffold()`, and `generateBody()` against realistic in-memory fixtures.

This phase is a proof harness, not a product Integration.

## Inputs

- [D1 — Architecture](../../design/D1-architecture.md) — Core/Integration split and responsibility table
- [D3 — Validation Semantics](../../design/D3-validation-semantics.md) — root Type Declaration dispatch and Integration-owned untyped handling
- [D4 — Integration Contracts](../../design/D4-integration-contracts.md) — Resolver, TypeRegistry, parser identity, and discovery flow
- [ADR-0005 — Functional Core / Imperative Shell](../../adr/0005-functional-core-imperative-shell.md)
- [ADR-0008 — Type Definition Document self-identifies via frontmatter](../../adr/0008-type-definition-document-self-identifies-via-frontmatter.md)
- [ADR-0009 — Scaffolding and Body Generation are creation, not repair](../../adr/0009-scaffolding-is-creation-not-repair.md)
- [P3 — Parser](P3-parser.md) — raw Type Definition Document parsing is already complete
- [P5 — Validation](P5-validation.md) — Integration-owned untyped dispatch is explicitly deferred to this phase
- [P6 — Scaffolding](P6-scaffolding.md)
- [P7 — Body Generation](P7-body-generation.md)

## Deliverables

A working in-memory harness covering all of the following.

### Harness scope

The harness should be deliberately small:

- in-memory only
- fixture-driven
- no filesystem reads or writes outside tests
- no network
- no Obsidian API
- no public CLI surface unless one becomes necessary to simplify tests

Recommended form:

- private test helper module under `test/integration/`
- optional private runtime helper under `src/integration/` only if sharing code meaningfully reduces duplication

The default should be test-only.

### Integration-owned flows to prove

The harness must prove each responsibility that belongs to Integration rather than Core.

#### 1. Type Definition Document discovery

Given a set of raw Markdown fixtures:

- identify Type Definition Document candidates by frontmatter sentinel `_type: type` or the configured `typeDeclarationKey`
- ignore regular Documents during discovery
- call `parseTypeDefinitionDocument(raw, identity, parserConfig)` only for discovered candidates
- cache successful `ParsedTypeDefinitionDocument`s by both stable `id` and `name`

This can be implemented with a minimal frontmatter reader that splits `---` fences and parses the YAML body with the `yaml` library already in `package.json`. It does not need to become a reusable Markdown parser for all Documents, nor does it need to reuse the internal parser's structured frontmatter module.

#### 2. Root Type Declaration dispatch

Given a regular in-memory `Document`:

- read `document.frontmatter[typeDeclarationKey]`
- if missing, treat the Document as untyped at the Integration layer
- if `untypedDocumentBehavior === 'skip'`, do not call `validate`
- if `untypedDocumentBehavior === 'warn'`, return a `document:untyped` warning from the harness result without calling `validate`
- if present, resolve that declaration to a `ParsedTypeDefinitionDocument` via TypeRegistry before calling `validate`

Core does not do this dispatch. The harness must.

#### 3. Resolver wiring

Provide an in-memory `Resolver` that:

- accepts the raw Wiki Link string the Core passes through
- resolves linked Documents from an in-memory map
- can return `found`, `not-found`, and at least one non-success branch such as `ambiguous` or `unavailable` in tests

The goal is not to model full Obsidian path semantics; it is to prove the Core/Integration seam is executable.

#### 4. TypeRegistry wiring

Provide an in-memory `TypeRegistry` that:

- resolves Type References by `TypeDefinitionDocumentIdentity.name`
- resolves Document Type Declarations such as `[[Skill]]`
- compares through `ParsedTypeDefinitionDocument.id` indirectly by returning the correct parsed type defs to Core
- optionally handles the bare literal `type` when tests cover a meta-Type Definition Document case

Again, keep lookup rules minimal and explicit.

#### 5. Create-new-Document flow

Demonstrate Integration behaviour for new Document creation:

1. choose a parsed Type Definition Document
2. call `scaffold(frontmatter, typeDef)`
3. call `generateBody(typeDef)`
4. combine the caller-supplied frontmatter plus `ScaffoldingResult.properties`
5. keep body creation separate from frontmatter creation

This phase only proves the data flow. It does not need to write a file.

#### 6. Existing-Document validation flow

Demonstrate Integration behaviour for an authored Document:

1. root Type Declaration dispatch
2. pass the selected `typeDef` plus `resolver`, `typeRegistry`, and `ValidationConfig` into `validate`
3. surface the resulting `ValidationResult`

This should include at least one referential-validation case using real harness wiring rather than direct unit-test stubs.

### Output shape

The harness may define small private result shapes for tests, for example:

```typescript
type HarnessValidationResult =
  | { kind: 'validated'; result: ValidationResult; typeDef: ParsedTypeDefinitionDocument }
  | { kind: 'skipped-untyped' }
  | { kind: 'warn-untyped'; warning: ValidationWarning }
  | { kind: 'type-not-found'; declaration: unknown }
  | { kind: 'type-ambiguous'; declaration: unknown }
```

Exact names are flexible. What matters is that expected Integration outcomes are represented as data, not hidden in test setup.

### Untyped Document handling

P5 explicitly deferred `document:untyped` coverage to Integration tests. P8 must add that coverage here.

Required behaviours:

- no root Type Declaration and `untypedDocumentBehavior: 'skip'` → skip result, no `validate()` call
- no root Type Declaration and `untypedDocumentBehavior: 'warn'` → warning result with kind `document:untyped`, no `validate()` call

The warning is Integration-produced, not Core-produced.

### Error boundary

The harness should treat expected failures as data:

- parser errors from discovered Type Definition Documents
- missing root type lookup
- ambiguous root type lookup
- untyped skip/warn outcomes

Do not hide them behind thrown exceptions unless an invariant is violated inside the harness itself.

## File layout

Recommended minimal layout:

```text
test/
  integration/
    harness.ts                     in-memory discovery + dispatch + resolver + registry helpers
    integration-harness.test.ts    end-to-end proof cases
```

Optional shared runtime extraction only if tests become noisy:

```text
src/
  integration/
    in-memory-harness.ts           private helper, not exported from src/index.ts
```

Keep the package public API unchanged unless a concrete consumer need appears. `src/index.ts` should not export an integration harness by default.

## Steps

1. Add `test/integration/harness.ts` with a minimal in-memory model for:
   - raw Type Definition Document fixtures
   - regular `Document` fixtures
   - discovery by type sentinel
   - `parseTypeDefinitionDocument` caching
   - in-memory Resolver
   - in-memory TypeRegistry
   - root Type Declaration dispatch
2. Decide on one tiny private result model for dispatch outcomes so tests can assert untyped skip/warn and root-type lookup failures clearly.
3. Add end-to-end tests in `test/integration/integration-harness.test.ts`.
4. Cover a creation flow that uses `scaffold()` and `generateBody()` together for a new Document without writing a file.
5. Cover a validation flow that uses root dispatch plus real harness Resolver/TypeRegistry wiring.
6. Add Integration-level coverage for `document:untyped` warn/skip behaviour that P5 deferred.
7. If helper duplication with `test/validation/helpers.ts` is modest, keep them separate. If it becomes noisy, extract only the truly shared pieces.
8. Run `npm run typecheck` and `npm test`.

## Suggested tests

Add end-to-end tests for at least these cases:

- Discovery finds raw Type Definition Documents by `_type: type` and ignores regular Documents.
- Discovery passes Integration-supplied identity into `parseTypeDefinitionDocument`.
- Root dispatch resolves a regular Document with `_type: '[[Concept]]'` to the parsed `concept` type definition before calling `validate`.
- Untyped Document with `untypedDocumentBehavior: 'skip'` is skipped without calling `validate`.
- Untyped Document with `untypedDocumentBehavior: 'warn'` returns a `document:untyped` warning without calling `validate`.
- New-Document creation flow returns scaffolded frontmatter plus templated body.
- Existing-Document validation flow succeeds with an in-memory Resolver and TypeRegistry.
- Referential Validation succeeds end-to-end for a `list<[[skill]]>` property using discovered type defs and resolved target Documents.
- Referential Validation succeeds end-to-end for a top-level `[[level]]` property using discovered type defs and resolved target Documents.
- Root Type Declaration that resolves to no type definition returns a structured harness failure.
- Ambiguous root Type Declaration returns a structured harness failure.
- Parser failure in a discovered Type Definition Document surfaces as structured harness data rather than crashing the test.

Unlike Parser and Validation, there is no dedicated `docs/test-cases/integration.md` fixture file yet. Plain Vitest integration-style tests are sufficient for this phase.

## Acceptance Criteria

- The repo contains an in-memory harness that exercises the Core through real Integration seams.
- Type Definition Document discovery happens outside Core and is covered by tests.
- Root Type Declaration dispatch happens outside Core and is covered by tests.
- The harness supplies working in-memory Resolver and TypeRegistry implementations.
- At least one end-to-end test proves `validate()` with referential validation using discovered type defs and resolved Documents.
- At least one end-to-end test proves a creation flow using both `scaffold()` and `generateBody()`.
- Integration-level `document:untyped` warn/skip behaviour is covered by tests.
- No filesystem or host-runtime complexity is introduced beyond tests.
- `src/index.ts` public API remains unchanged unless a concrete need is discovered during implementation.
- `npm run typecheck` succeeds.
- `npm test` succeeds.

## Non-goals

- Building an Obsidian plugin.
- Building a production CLI.
- Designing a general-purpose Markdown frontmatter parser for regular Documents.
- Adding filesystem-backed caching, watch mode, or startup indexing.
- Defining the future repair feature.
- Implementing meta-Type Definition Document enforcement unless it is needed for a minimal proof.

## Follow-up

After this phase, the initial implementation plan is complete. Any next phase should be driven by a new design choice: a real host Integration, a repair feature, or stronger fixture/spec coverage for Integration behaviour.
