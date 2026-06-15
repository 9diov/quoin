# P18 — Property-Based Testing First Iteration

## Goal

Introduce property-based testing (PBT) to Quoin's Core via the minimal first
iteration recommended in
[R2 — Property-Based Testing](../research/R2-property-based-testing.md), without
altering any Core semantics or existing example-based tests.

After this phase:

- `fast-check` and `@fast-check/vitest` are available as dev dependencies.
- a `test/property/` suite exists with roughly five properties spanning Tiers
  1–3 of R2.
- generators that mirror the grammar live in one reviewed, colocated file.
- two of the properties directly encode design principles (grammar
  disjointness, scaffold-then-validate) that are otherwise enforced only by
  review.
- `npm test` runs the property suite alongside the existing example-based
  suites, and the whole run stays fast.

This phase is an experiment with an explicit kill switch (see
[R2 — Suggested First Iteration](../research/R2-property-based-testing.md)): if
it surfaces no defect and no useful counterexample after a few months, it can
be removed without disturbing the rest of the suite.

## Inputs

- [R2 — Property-Based Testing](../research/R2-property-based-testing.md) — the
  research note this plan executes; "Suggested First Iteration" is the scope.
- [PRINCIPLES.md](../design/PRINCIPLES.md) — principles 2, 5, 6, and 8, which
  the chosen properties encode.
- [D2 — Type and Schema Contracts](../design/D2-type-and-schema-contracts.md),
  [D3 — Validation Semantics](../design/D3-validation-semantics.md) — the
  contracts the properties assert.
- Current Core implementation under test:
  - [link-grammar.ts](../../src/core/link-grammar.ts) — `isValidWikiLinkShape`,
    `isValidExternalLinkShape`, `parseExternalLink`.
  - [primitive-grammar.ts](../../src/core/primitive-grammar.ts) —
    `isCanonicalDate`.
  - [parser.ts](../../src/core/parser.ts) and
    [parser/property-schema.ts](../../src/core/parser/property-schema.ts) —
    canonical property-key validation (`CANONICAL_KEY`, `_type` exception).
  - [scaffold.ts](../../src/core/scaffold.ts) and
    [validation.ts](../../src/core/validation.ts) — the scaffold-then-validate
    cross-layer guarantee.

## Deliverables

### Tooling

Add `fast-check` and `@fast-check/vitest` to `devDependencies` only. Neither
ships in the published package (no change to `dependencies` or the `files`
allowlist from P17).

Vitest is already the runner; `@fast-check/vitest` integrates without changing
it.

### Generators

Add `test/property/generators.ts` holding the arbitraries shared by the
property files. For this iteration the set is intentionally small:

- an arbitrary for valid Wiki Link strings (`[[name]]` shape).
- an arbitrary for valid external link strings (scheme + remainder), and a
  scheme allowlist arbitrary.
- an arbitrary for canonical and non-canonical date strings, including
  calendar edge cases (Feb 29 in leap and non-leap years, April 31, month 0,
  month 13).
- an arbitrary for property-key strings spanning the canonical grammar
  (`/^[a-z0-9]([a-z0-9_-]*[a-z0-9])?$/`), the `_type` exception, and nearby
  invalid strings (leading/trailing `-`/`_`, uppercase, empty).
- an `arbitrarySchema` / `arbitraryConformingFrontmatter` pair limited to what
  the scaffold-then-validate property needs: a schema with at least one
  property that declares a `default`.

Generators must **mirror the grammar, not invert it** (R2, "Design
Considerations"). They are part of the grammar contract and must be reviewed
alongside any grammar change.

### Tier 1 — `test/property/grammar.property.test.ts`

Properties over the grammar predicates:

- **Wiki/external link disjointness.** No string satisfies both
  `isValidWikiLinkShape` and `isValidExternalLinkShape`.
- **Trim invariance.** Both shape checks return `false` whenever
  `s !== s.trim()`.
- **`parseExternalLink` determinism.** Same `(s, schemes)` returns equal
  results across two runs (run-twice equality), locking down Principle 8 at the
  unit level.
- **`isCanonicalDate` calendar edge cases.** Feb 29 accepted iff the year is a
  Gregorian leap year; April 31, month 0, and month 13 always rejected.

### Tier 2 — `test/property/parser.property.test.ts`

One property:

- **Property-key validation matches the documented grammar.** For any string
  `k`, the canonical-key check accepts `k` iff it matches the documented
  pattern (lowercase, `[a-z0-9_-]`, no leading/trailing `-`/`_`), with `_type`
  as the sole exception.

### Tier 3 — `test/property/cross-layer.property.test.ts`

One property:

- **Scaffold-then-validate is clean.** For any Document conforming partially to
  a type `T`, applying the `ScaffoldingResult` from `scaffold(...)` and then
  running `validate(...)` produces no `property:missing-required` errors for
  properties with declared defaults. (R2 names this `missing-required`; the
  implemented discriminant is `property:missing-required` — assert the actual
  kind.)

This is the central guarantee of Scaffolding stated as a property, and the one
most likely to catch a real cross-layer regression.

## Non-goals for this phase

This phase does not:

- implement Tier 4 (diagnostic determinism) or Tier 5 (path-glob bindings)
  properties.
- build the full `arbitraryNonConformingFrontmatter` negative-space generator
  or `arbitraryTypeExpression` — deferred until the first iteration produces
  evidence (R2 "Decision").
- add a serialization round-trip property (no printer exists yet).
- delete, replace, or weaken any existing example-based test — PBT augments,
  never replaces.
- change any Core function, error kind, or public export.
- add PBT for Integration code (filesystem, CLI plumbing) — explicitly out of
  R2's scope.
- add `fast-check` to the published package surface.

## File layout

Expected touch points:

```text
package.json                              (devDependencies only)
package-lock.json
test/property/generators.ts               (new)
test/property/grammar.property.test.ts    (new)
test/property/parser.property.test.ts     (new)
test/property/cross-layer.property.test.ts (new)
```

No `src/` changes are expected. If a property fails because of a real defect,
the fix belongs in a separate change, not folded into this plan silently — the
counterexample should be recorded.

## Steps

1. Add `fast-check` and `@fast-check/vitest` to `devDependencies`; run
   `npm install` and confirm the lockfile updates without touching runtime
   `dependencies`.
2. Write `test/property/generators.ts` with the arbitraries listed above. Keep
   each generator narrow enough that property files complete in well under a
   second.
3. Add `test/property/grammar.property.test.ts` with the four Tier 1
   properties. Set explicit, modest `numRuns` per property.
4. Add `test/property/parser.property.test.ts` with the property-key property,
   asserting agreement with the documented grammar rather than restating the
   regex.
5. Add `test/property/cross-layer.property.test.ts` with the
   scaffold-then-validate property, asserting absence of
   `property:missing-required` for defaulted properties.
6. Run `npm test` and confirm the property suite runs and passes alongside the
   existing suites.
7. Run `npm run typecheck` to confirm the new test files and generators are
   type-clean.
8. If any property fails, capture the minimal counterexample fast-check
   reports, decide whether it is a generator bug or a real Core defect, and —
   if real — record it for a follow-up fix rather than masking it.

## Acceptance Criteria

- `fast-check` and `@fast-check/vitest` appear in `devDependencies` only;
  `dependencies` and the published `files` allowlist are unchanged.
- `test/property/` contains the generators file and the three property files.
- `npm test` runs the property suite and passes; total test wall-clock does not
  regress noticeably (each property file completes in under ~1s).
- `npm run typecheck` succeeds.
- The five properties are present and assert the behaviors above, including the
  two principle-encoding properties (link disjointness, scaffold-then-validate).
- The scaffold-then-validate property asserts the actual implemented error kind
  (`property:missing-required`).
- No `src/` file, error kind, or public export changes.
- No existing example-based test is deleted or weakened.

## Follow-up

Out of scope for P18 but worth tracking (gated on this iteration producing a
real defect or a caught refactor, per R2's Decision):

- the full negative-space generator (`arbitraryNonConformingFrontmatter`) with
  declared `expectedErrorKind`.
- `arbitraryTypeExpression` and the type-expression disjointness property
  (Tier 2).
- Tier 3 remainder: template-then-validate, validation idempotence on key
  order, resolver-independence for primitive properties, referential
  validation opt-in, no silent coercion.
- Tier 4 (diagnostic ordering and discriminant preservation) and Tier 5
  (path-glob binding precedence and conflict determinism).
- a serialization round-trip property once a Schema printer exists.
- the kill-switch review: if no counterexample or defect after a few months,
  remove `test/property/` and the two dev dependencies.
