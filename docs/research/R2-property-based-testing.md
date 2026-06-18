---
_type: "[[research-note]]"
status: "active"
---

# R2 — Property-Based Testing for Quoin

## Goal

Evaluate whether property-based testing (PBT) would meaningfully improve Quoin's reliability, identify where it fits the existing design, and recommend a minimal first iteration.

This note is scoped to Quoin's Core. PBT against Integration code (filesystem I/O, CLI plumbing) is out of scope — example-based tests already serve those layers well.

## Why Quoin Is a Good Fit For PBT

Several properties of Quoin's design make it unusually amenable to PBT, beyond the typical "we have some pure functions" justification:

1. **Pure Core (Principle 2).** Validation, Scaffolding, Templating, and the Parser are pure transformations: `(inputs) → result`. PBT's value scales with the share of a system that is referentially transparent — for Quoin's Core, that share is essentially 100%.
2. **Deterministic, inspectable results (Principle 8).** Stability of output is already an explicit design goal. PBT is the most economical way to assert it across the input space rather than at hand-picked points.
3. **Strict contracts at the boundary (Principle 6).** The schema syntax, type-expression grammar, and block structure are designed to be unambiguous. Unambiguous grammars yield clean structural invariants — exactly what PBT consumes.
4. **Disjoint type-expression forms (Principle 6).** `primitive`, `list<X>`, `choice<...>`, `[[name]]`, and `list<[[name]]>` are syntactically disjoint. This means each form has a tight, separately testable shape, and the *disjointness itself* is a property worth checking.
5. **Composable types.** `list<X>` and `choice<...>` compose with primitives and type references. Composition is where example-based suites silently underspecify behavior; PBT exercises the cross-product.
6. **Diagnostic-rich, not boolean.** Validation produces structured `ValidationResult` values with discriminated error kinds, not just pass/fail. Properties can assert *which* error fires, not merely whether one does — making PBT useful for negative-space coverage.

The existing example-based suite (`test/parser`, `test/validation`, `test/scaffold`, `test/template`) is good at covering known shapes. PBT complements it by hitting the gaps between shapes — odd whitespace, boundary lengths, Unicode, combinatorial composition.

## Where PBT Would Pay Back

The candidates below are ordered by expected return: highest signal and lowest setup cost first.

### Tier 1 — Grammar predicates

`src/core/link-grammar.ts` and `src/core/primitive-grammar.ts` are the highest-value targets. They are small, total, side-effect-free, and shared by both Parser and Validation. Mismatches between them are exactly the class of bug the comment in `primitive-grammar.ts` warns about ("a default that parses cannot be rejected by Validation, and vice versa") — that warning is itself a property.

Candidate properties:

- **Cross-layer agreement.** For every string `s` and every primitive type `T`, the Parser's acceptance of `s` as a default of type `T` equals Validation's acceptance of `s` as a runtime value of type `T`. The two functions must never disagree.
- **Date totality.** `isCanonicalDate(s)` returns `false` for any `s` not matching `^\d{4}-\d{2}-\d{2}$`; for matching `s`, it agrees with a reference implementation (e.g., the date is constructable and round-trips through formatting).
- **Calendar edge cases.** Properties over `(year, month, day)` triples: Feb 29 accepted iff the year is a leap year by the Gregorian rule; April 31 always rejected; month 0 and month 13 always rejected.
- **Wiki Link trim rejection.** `isValidWikiLinkShape` rejects values with surrounding whitespace.
- **Superseded external-link properties.** Earlier versions of this note proposed properties for `isValidExternalLinkShape`, `parseExternalLink`, and URL scheme allowlists. P27 removed the `url` primitive and the External Link grammar helpers, so those properties are no longer part of the first iteration.
- **Trim invariance.** Both shape checks reject inputs with surrounding whitespace. Property: `isValid*(s) === false` whenever `s !== s.trim()`.

These functions are also where a single regression has outsized blast radius — they're shared by every primitive-typed property in every Document.

### Tier 2 — Parser round-trips and structural invariants

The Parser converts a Type Definition Document's YAML schema block into a structured `Schema`. Round-trip properties are the natural fit.

Candidate properties:

- **Schema serialization round-trip.** For any well-formed `Schema` produced by a generator, serializing it back to YAML and re-parsing produces an equal `Schema`. This locks down both the printer (if/when one is added) and the parser against silent type-expression drift.
- **Type-expression disjointness.** For every type expression string produced by a generator constrained to the grammar, exactly one of the form-recognizers fires (`primitive` vs `list<...>` vs `choice<...>` vs `[[name]]` vs `list<[[name]]>`). The Parser must never classify a single expression under two forms — a direct check of Principle 6's disjointness claim.
- **Unknown-key strictness.** For any schema with an extra top-level key not in the known set, the Parser reports a `ParseError` with the expected kind. Generating "almost valid" inputs is much cheaper than hand-curating them.
- **Property-key validation.** For any string `k`, the Parser accepts `k` as a property key iff `k` matches `[a-z0-9_-]`, is lowercase, and has no leading/trailing `-`/`_` (except the reserved `_type`). A direct property reading of CONTEXT.md.
- **Section parsing idempotence.** Parsing a Markdown body, serializing the recognized sections back, and re-parsing produces the same `Section[]`. Useful as Template parsing matures.

### Tier 3 — Cross-operation invariants

These properties tie Core operations together — the place where example-based tests are weakest because each suite tends to live in its own file.

Candidate properties:

- **Scaffold-then-validate is clean.** For any Document `D` conforming partially to type `T`, applying the `ScaffoldingResult` from `scaffold(D, T)` produces a Document whose `validate(...)` result has no `missing-required` errors for properties with declared defaults. This is the central guarantee of Scaffolding stated as a property.
- **Template-then-validate has no missing required sections.** For any type `T` with a Template Block, the Document produced by `template(T)` passes Validation's "required section present" check. Required sections must never be absent in fresh Documents.
- **Validation idempotence on output.** `validate(D, T)` does not depend on the order of properties in `D`'s frontmatter — only on values. Shuffling key order produces equal results. (Tests Principle 8 across a class of trivially-equivalent inputs.)
- **Resolver-independence for primitive properties.** For any Document `D` whose schema has no Wiki Link or Type Reference properties, `validate(D, T, resolverA)` and `validate(D, T, resolverB)` return equal results for any two resolvers. The Resolver must never affect primitive validation.
- **Referential Validation is opt-in.** With Referential Validation disabled, no `ValidationError` of kind `referential-*` is ever produced, regardless of input. (Principle 5: opt-in, not transitive.)
- **No silent coercion.** For any value `v` of one primitive type and target schema of another, Validation either accepts `v` because it independently satisfies the target type's grammar, or reports a type-mismatch error — never a "coerced" outcome. (Principle 5.)

These are the properties most likely to catch real bugs introduced by future refactors — they encode the design principles directly.

### Tier 4 — Diagnostic determinism

Quoin's machine-readable contract depends on stable ordering and stable discriminants. PBT is well-suited here.

Candidate properties:

- **Diagnostic ordering is a total function of input.** For any Document, the ordering of `ValidationError[]` and `ValidationWarning[]` depends only on input, not on iteration order of internal data structures. Two runs over the same input produce identical arrays.
- **Discriminants are preserved.** For every error path, the JSON-shaped `ValidationError.kind` is a member of the documented union — no `undefined`, no ad-hoc strings. (A weak property, but catches accidental drift during refactors.)

### Tier 5 — Path-glob bindings (D6)

Bindings are an Integration channel, but the matching logic is pure and worth PBT coverage even though it lives at the boundary.

- **Frontmatter precedence.** For any Document `D` with a frontmatter `_type` and any Binding `B` whose glob matches `D`'s path, the resolved type comes from frontmatter, never from `B`. (Principle 4.)
- **Specificity-free matching.** With specificity-based resolution explicitly deferred (Principle 9), a Document matched by two bindings produces a deterministic conflict diagnostic — never a silent winner.

## What PBT Is Not Likely To Help With

Setting expectations honestly:

- **CLI output formatting.** The output strings are taste-driven and example-based tests are the right tool. PBT here would mostly produce brittle string-equality assertions.
- **Filesystem behavior.** The Integration touches the world; properties over I/O require either fakes or randomized FS scenarios, and the cost-benefit is poor for a project this size.
- **YAML library quirks.** Quoin delegates to `yaml`; properties asserting `yaml`'s behavior belong in `yaml`'s test suite, not Quoin's.
- **Performance.** PBT can detect crashes on pathological inputs but is not a substitute for benchmarks or fuzzing harnesses tuned for throughput.

A useful rule: if the assertion is "the output looks like X," prefer examples. If it is "for all inputs satisfying P, the output satisfies Q," prefer PBT.

## Tooling

The pragmatic choice is **`fast-check`**:

- The mainstream PBT library for the JS/TS ecosystem.
- First-class Vitest integration via `@fast-check/vitest`, which Quoin can adopt without changing its test runner.
- Comprehensive shrinker — when a property fails, fast-check reports a minimal counterexample, which matters more for diagnostic ergonomics than the size of the arbitrary library.
- TypeScript types are well-maintained.

Alternatives considered:

- **`jsverify`** — effectively unmaintained.
- **Hand-rolled generators** — viable for one or two properties, but the shrinker is what makes failures actionable. Re-implementing a shrinker is not worth it.

Adding fast-check is a single `devDependencies` entry; it does not affect the published package.

## Design Considerations

A few non-obvious points worth surfacing before adoption:

### Generators must mirror the grammar, not invert it

The temptation with PBT is to write a generator that produces "any string" and assert that the Parser handles it gracefully. That tests robustness, but most of Quoin's value is in the *positive* grammar — strings that *should* parse to a specific structured value. The high-leverage generators are:

- `arbitrarySchema` — produces a `Schema` value directly, which is then serialized to YAML for the Parser to consume.
- `arbitraryTypeExpression` — produces a structured type-expression node, then serializes it.
- `arbitraryConformingFrontmatter` — given a schema, produces frontmatter that should validate.
- `arbitraryNonConformingFrontmatter` — given a schema, produces frontmatter that should fail validation for a specific declared reason.

The last one is the most valuable and the most work — it requires understanding which mutations break which constraints. It is also the one that catches real bugs.

### Negative-space generators need declared intent

A generator that produces "frontmatter that fails validation" is only useful if the property asserts *which* error fires. "Some error fires" is a weak property that hides bugs where the wrong error path is reached. The shape that pays back is:

```ts
fc.assert(fc.property(
  arbitraryMutation(),
  (m) => {
    const result = validate(m.doc, m.typeDef, /* ... */);
    return result.errors.some(e => e.kind === m.expectedErrorKind);
  }
));
```

This is more work per property but is what justifies the framework over example-based tests.

### Determinism is a property worth its own property

Several Quoin design principles reduce to "the same input produces the same output." PBT can assert this directly with a "run twice, compare" property over every Core function. This is a near-free way to catch nondeterminism introduced by `Map` iteration, `Set` ordering, or `Object.keys` assumptions — all easy to introduce by accident in TypeScript.

### Property tests should be fast

Default shrinking and 100-run defaults can balloon test time if generators are heavy. Realistic budget: each PBT-driven test file should still complete in under a second. If a property becomes slow, the generator is usually too broad — shrink the input space rather than reducing the run count.

## Suggested First Iteration

A minimal first PR that demonstrates value without committing the project to a broader rewrite:

1. Add `fast-check` and `@fast-check/vitest` to `devDependencies`.
2. Add `test/property/grammar.property.test.ts` covering Tier 1:
   - Wiki/external link disjointness.
   - Trim invariance for both link shape checks.
   - Wiki Link trim rejection.
   - `isCanonicalDate` calendar edge cases.
3. Add `test/property/parser.property.test.ts` covering one Tier 2 property:
   - Property-key validation matches the documented grammar.
4. Add `test/property/cross-layer.property.test.ts` covering one Tier 3 property:
   - Scaffold-then-validate has no `missing-required` errors for defaulted properties.

This is roughly five properties. Two of them (grammar disjointness, scaffold-then-validate) directly encode design principles that are otherwise only enforced by code review. None of them require generators sophisticated enough to be a maintenance burden.

If the first iteration produces zero failures and zero useful counterexamples after a few months, the experiment fails and PBT can be removed without disturbing the rest of the suite. If it surfaces even one bug in the grammar layer, the cost has paid for itself.

## Risks and Mitigations

- **Risk: properties become decorative.** A property that restates the implementation as an assertion catches nothing. *Mitigation:* prefer cross-layer properties (Parser vs Validation, Scaffold vs Validation) over single-function properties.
- **Risk: flaky shrinkers slow down CI.** *Mitigation:* fast-check defaults are conservative; set explicit `numRuns` per property and keep it modest.
- **Risk: generators drift from the grammar.** When the grammar changes (e.g., the deferred `choice<text|[[tag]]>` union), generators must change too. *Mitigation:* keep generators in `test/property/generators.ts` colocated and reviewed alongside grammar changes — treat them as part of the grammar contract.
- **Risk: false sense of coverage.** PBT is not a substitute for example-based tests of known-tricky inputs. *Mitigation:* never delete existing example-based tests in favor of properties; PBT augments, never replaces.

## Decision

Adopt property-based testing for Quoin's Core, starting with the minimal first iteration above. The design's principled separation between Core and Integration, its explicit determinism goals, and its disjoint grammar forms make Quoin one of the cleanest possible fits for PBT in a TypeScript codebase. The marginal cost is low (one library, a handful of properties); the marginal value is direct enforcement of design principles that are otherwise only enforced by review.

Defer broader PBT investment (Tiers 4–5, exhaustive generator coverage) until the first iteration has produced concrete evidence — either a real defect surfaced or a refactor caught — that justifies the additional generator engineering.

## References

- Quoin design: [PRINCIPLES.md](../design/PRINCIPLES.md), in particular principles 2, 5, 6, and 8.
- Quoin contracts: [D2 — Type and Schema Contracts](../design/D2-type-and-schema-contracts.md), [D3 — Validation Semantics](../design/D3-validation-semantics.md), [D6 — Path-Glob Type Bindings](../design/D6-path-glob-type-bindings.md).
- Quoin current implementation:
  - [primitive-grammar.ts](../../src/core/primitive-grammar.ts)
  - [link-grammar.ts](../../src/core/link-grammar.ts)
  - [parser.ts](../../src/core/parser.ts)
  - [validation.ts](../../src/core/validation.ts)
  - [scaffold.ts](../../src/core/scaffold.ts)
  - [template.ts](../../src/core/template.ts)
- fast-check: https://fast-check.dev/
- fast-check + Vitest integration: https://fast-check.dev/docs/ecosystem/#vitest
