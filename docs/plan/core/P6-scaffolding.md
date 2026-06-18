---
_type: "[[plan-doc]]"
status: "done"
---

# P6 — Scaffolding

## Goal

Implement `scaffold` so the Core can compute missing Property defaults from a parsed Type Definition Document without performing Validation, Link Resolution, Referential Validation, or mutation. After this phase, Integrations can ask the Core which frontmatter Properties should be added, then decide whether and how to write them back.

## Inputs

- [D1 — Architecture](../../design/D1-architecture.md) — Core/Integration boundary for Scaffolding
- [D2 — Type and Schema Contracts](../../design/D2-type-and-schema-contracts.md) — `PropertySchema.default`, `ScaffoldingResult`, and local default validity rules
- [ADR-0004 — `default` belongs to Scaffolding, not Validation](../../adr/0004-default-is-scaffolding-not-validation.md)
- [ADR-0009 — Scaffolding and Templating are creation, not repair](../../adr/0009-scaffolding-is-creation-not-repair.md)
- [ADR-0005 — Functional Core / Imperative Shell](../../adr/0005-functional-core-imperative-shell.md)
- [P2 — Shared Core Types](P2-shared-core-types.md) — exported `ScaffoldingResult` and `ParsedTypeDefinitionDocument`
- [P3 — Parser](P3-parser.md) — parsed schemas already reject invalid defaults
- [P5 — Validation](P5-validation.md) — presence semantics to stay aligned with Validation while keeping Scaffolding read-only

## Deliverables

A working `scaffold` covering all of the following.

### Core behaviour

For each Property declared in `typeDef.schema.properties`:

1. Check whether the Property is absent from the input `frontmatter`.
2. If the Property is present, do nothing, even when the value is `null`, `''`, `'   '`, `[]`, `false`, or `0`.
3. If the Property is absent and the schema declares a `default`, include that Property in `ScaffoldingResult.properties`.
4. If the Property is absent and the schema does not declare a `default`, do nothing.

Returned shape:

```typescript
{
  properties: Record<string, unknown>
}
```

### Presence semantics

Scaffolding uses key presence only, not value truthiness and not Validation emptiness rules.

- Use own-property presence on `frontmatter`.
- `null` is present.
- Empty strings are present.
- Empty arrays are present.
- `false` and `0` are present.
- A required Property without a default does not appear in the result.

This keeps Scaffolding aligned with the rule that `required` is about key presence, while leaving emptiness enforcement to Validation.

### Default handling

Parser already guarantees that a parsed `default` is locally valid for its declared Property type and obeys `allow-empty`. `scaffold` therefore does not re-validate defaults.

Rules:

- Include primitive defaults as-is.
- Include top-level `[[name]]` defaults as a single Wiki Link string.
- Include `list<X>` defaults as arrays — items are Wiki Link strings when `X` is a Type Reference, or raw primitive values when `X` is a primitive.
- Include `choice<"a"|"b"|"c">` defaults as a single string equal to one of the declared literal members' `value`.
- Treat `default: null`, `default: ''`, and `default: []` as valid defaults when they survived Parser.
- Detect a declared default by schema key presence, not by truthiness.

### Purity and non-mutation

`scaffold` must stay a pure data transformer.

- Do not mutate `frontmatter`.
- Do not mutate `typeDef`.
- Do not call `validate`.
- Do not call `resolver` or `typeRegistry` equivalents.
- Do not inspect Document body content.
- Do not perform I/O.

To avoid aliasing parsed schema data into the result:

- Primitive defaults may be returned by value.
- Array defaults should be copied before being placed in `ScaffoldingResult.properties`.

Objects are not currently valid Property defaults, so no deep-cloning machinery is needed in this phase.

### Scope boundary

Scaffolding computes only missing frontmatter Properties. It does not:

- apply the result back onto a Document
- synthesize missing body Sections
- infer values from required Properties
- fill values by Link Resolution or Referential Validation
- merge with existing frontmatter beyond checking whether a key already exists

## File layout

Minimal implementation is acceptable:

```text
src/core/
  scaffold.ts              ScaffoldingResult type + scaffold() implementation
```

Optional internal split if the function grows:

```text
src/core/
  scaffold.ts
  scaffold/
    defaults.ts            helpers for own-property checks and safe default copying
```

Keep the public API unchanged. Only `scaffold` and `ScaffoldingResult` remain exported from `src/index.ts`.

## Steps

1. Replace the `throw new Error('not implemented')` stub in `src/core/scaffold.ts` with a pure implementation.
2. Iterate over `typeDef.schema.properties` and detect frontmatter presence with an own-property check rather than truthiness.
3. Detect declared defaults by schema key presence so falsy defaults such as `''`, `0`, `false`, `null`, and `[]` are preserved.
4. Copy array defaults before returning them in `ScaffoldingResult.properties`.
5. Add focused unit tests under `test/scaffold/` covering present-vs-absent behaviour and falsy defaults.
6. Remove the P2 smoke-test todo `it.todo('scaffold returns missing defaults — P6')` from `test/smoke.test.ts`.
7. Run `npm run typecheck` and `npm test`.

## Suggested tests

Add direct unit tests for at least these cases:

- Missing text Property with `default: 'Untitled'` is returned.
- Missing number Property with `default: 0` is returned.
- Missing boolean Property with `default: false` is returned.
- Missing scalar Property with `default: ''` and parsed `allow-empty: true` is returned.
- Missing list Property with `default: []` and parsed `allow-empty: true` is returned.
- Present Property with value `null` is not scaffolded over.
- Present Property with value `''` is not scaffolded over.
- Present Property with value `[]` is not scaffolded over.
- Required Property without a default is omitted from the result.
- Returned list defaults do not share the same array reference as `typeDef.schema.properties[key].default`.

Unlike Parser and Validation, there is no dedicated `docs/test-cases/scaffolding.md` fixture file yet. Plain Vitest unit coverage is sufficient for this phase.

## Acceptance Criteria

- `scaffold(frontmatter, typeDef)` returns only absent Properties whose schemas declare defaults.
- Present keys are never overwritten, regardless of whether their values are empty by Validation rules.
- Falsy defaults (`0`, `false`, `''`, `null`, `[]`) are preserved when declared.
- Required Properties without defaults do not appear in the result.
- The function performs no Validation, Resolution, Referential Validation, or I/O.
- `frontmatter` and `typeDef` are unchanged after the call.
- Array defaults in the result are detached copies.
- `npm run typecheck` succeeds.
- `npm test` succeeds.

## Non-goals

- Re-validating schema defaults at scaffold time.
- Applying the `ScaffoldingResult` back to a Document.
- Generating body content from Template Blocks.
- Introducing a new shared default-validation abstraction unless implementation duplication becomes a real maintenance problem.
- Adding Integration behavior for reading or writing files.

## Follow-up

After this phase, continue with Phase 7: Templating. Templating handles Markdown body generation for new Documents; Scaffolding remains frontmatter-only.
