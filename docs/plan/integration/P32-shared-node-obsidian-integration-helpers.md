---
_type: "[[plan-doc]]"
status: "in-progress"
---

# P32 — Shared Node/Obsidian Integration Helpers

## Goal

Reduce duplicated integration-layer logic between `node-lib` and the Obsidian
plugin by extracting host-agnostic helpers into a shared integration module.

After this phase:

- duplicated logic between `src/integration/node-lib/` and
  `src/integration/obsidian/` is moved behind shared helpers where the behavior
  is materially the same
- host-specific behavior remains in the host integration folders
- `src/core/` stays focused on pure domain logic rather than integration
  orchestration

This phase is about boundary cleanup and duplication reduction. It does not
change external validation semantics or resolver policy.

## Why This Exists

The recent `node-lib` extraction clarified the Node integration boundary, but
it also made the overlap with the Obsidian integration easier to see.

There are now several places where `node-lib` and Obsidian each implement the
same integration-level decision logic:

- type-binding resolution
- type identity derivation and type-registry construction
- create-candidate synthesis
- effective-declaration validation branching
- frontmatter splitting and document serialization helpers

That duplication increases drift risk:

- one integration can silently diverge from the other
- bug fixes need to be applied in two places
- tests must re-prove equivalent behavior separately

The duplicated code does not belong in `src/core/`, because it is still
integration-layer orchestration. The right target is a shared integration layer
such as:

```text
src/integration/common/
```

## Inputs

- [ADR 0005 — Functional Core / Imperative Shell](../../adr/0005-functional-core-imperative-shell.md)
- [D4 — Integration Contracts](../../design/D4-integration-contracts.md)
- [D5 — Node CLI Integration](../../design/D5-node-cli-integration.md)
- [D8 — Obsidian Plugin Integration](../../design/D8-obsidian-plugin-integration.md)
- [P31 — Extract node-lib from node-cli](node-lib/P31-extract-node-lib-from-node-cli.md)
- `src/integration/node-lib/`
- `src/integration/obsidian/`

## Non-goals

This phase does not:

- move integration orchestration into `src/core/`
- unify Node and Obsidian resolver implementations into one resolver
- eliminate all differences between the two integrations
- redesign plugin settings UX or CLI UX
- change user-visible validation semantics as a side effect of refactoring

## Extraction target

Preferred target:

```text
src/integration/common/
```

Reasoning:

- the duplicated logic is not pure Core domain logic
- it depends on integration-owned path handling, declaration lookup, result
  shaping, and orchestration around Core calls
- sharing it inside `src/core/` would blur the architectural boundary

Rule:

- move logic to `src/core/` only if it is fully host-agnostic and conceptually
  a domain primitive
- otherwise move it to `src/integration/common/`

## Work items

### Priority 1 — Shared binding resolution

Source:

- `src/integration/node-lib/bindings.ts`
- `src/integration/obsidian/bindings.ts`

Target:

- `src/integration/common/bindings.ts`

What should move:

- `TypeBinding`
- `EffectiveTypeDeclaration`
- the shared `resolveEffectiveTypeDeclaration(...)` logic
- the shared `firstBindingPerType(...)` helper

What should stay host-specific:

- Node's `micromatch`-backed matching
- Obsidian's vault-specific glob matcher
- Obsidian's `bindingMatchEscapesVault(...)`

Recommended shape:

```typescript
resolveEffectiveTypeDeclaration(
  document,
  path,
  bindings,
  typeDeclarationKey,
  isMatch,
)
```

Reasoning:

- this is the cleanest duplication in the repo
- the branching logic is already effectively identical
- only the path-matching mechanism varies by host

### Priority 1 — Shared type identity and type-registry builder

Source:

- `src/integration/node-lib/lookup.ts`
- `src/integration/obsidian/discovery.ts`

Target:

- `src/integration/common/type-registry.ts`

What should move:

- path-to-type-identity derivation
- parse-failure-to-unavailable mapping
- shared `TypeRegistry` construction from parsed types and parse failures
- declaration lookup logic based on wiki-link type declarations

What should stay host-specific:

- Node file discovery and raw ingestion
- Obsidian event-driven indexing and metadata-cache interactions

Reasoning:

- both integrations derive the same `id` and lowercase basename `name`
- both construct materially equivalent `TypeRegistry` implementations
- this is high-value duplication with low conceptual risk

### Priority 1 — Shared create-candidate synthesis

Source:

- `src/integration/node-lib/create.ts`
- `src/integration/obsidian/create-flow.ts`

Target:

- `src/integration/common/create-candidate.ts`

What should move:

- derive type declaration from type id basename
- scaffold frontmatter defaults
- render template body
- build candidate `Document`
- validate candidate before write
- serialize document content

What should stay host-specific:

- output-path validation
- filesystem write vs vault create
- editor-opening behavior
- resolver construction inputs

Reasoning:

- the candidate-building flow is nearly the same already
- this logic is integration-layer reuse, not CLI- or plugin-specific behavior

### Priority 2 — Shared effective-declaration validation state machine

Source:

- `src/integration/node-lib/validate.ts`
- `src/integration/obsidian/active-validation.ts`

Target:

- `src/integration/common/validation-resolution.ts`

What should move:

- the branching from effective declaration to:
  - `untyped`
  - `ambiguous-binding`
  - declaration lookup
  - name lookup
  - validated result
  - not-found / ambiguous / unavailable outcomes

What should stay host-specific:

- CLI-oriented `ValidateResult` shaping
- Obsidian active-file UI state shaping
- whole-project discovery vs single-active-file setup

Reasoning:

- the integrations expose different result envelopes
- but the underlying decision tree is mostly the same
- extract the state machine, not the presentation layer

### Priority 2 — Shared type-candidate parsing helper

Source:

- `src/integration/node-lib/lookup.ts`
- `src/integration/obsidian/discovery.ts`

Target:

- `src/integration/common/type-candidates.ts`

What should move:

- loop over candidate raw documents
- derive identity
- call `parseTypeDefinitionDocument(...)`
- collect parsed types and parse failures

Reasoning:

- Node already has a helper for this
- Obsidian performs the same work inline
- this reduces drift in parse-failure handling

### Priority 3 — Shared frontmatter/body helpers

Source:

- `src/integration/node-lib/ingestion.ts`
- `src/integration/node-lib/create.ts`
- `src/integration/obsidian/create-flow.ts`
- `src/integration/obsidian/active-validation.ts`

Target:

- `src/integration/common/frontmatter.ts`

What should move:

- frontmatter splitting
- body extraction fallback behavior
- deterministic frontmatter + body serialization
- frontmatter block-length calculation if still needed

Reasoning:

- smaller payoff than the items above
- still useful to keep emitted file format and fallback parsing aligned

### Priority 3 — Shared doc-reference parsing helpers

Source:

- `src/integration/node-lib/lookup.ts`
- `src/integration/obsidian/lookup.ts`

Target:

- `src/integration/common/doc-ref.ts`

What should move:

- `detectFormat(...)`
- `stripFragment(...)`
- `safeDecodeURI(...)`
- `matchesPathQualifier(...)`
- `extractWikiLinkTarget(...)`

What should stay host-specific:

- actual resolver implementation and host lookup policy

Reasoning:

- the helper logic is repeated
- the final resolution policy intentionally differs by host

## Suggested rollout order

1. Extract shared bindings helpers.
2. Extract shared type identity and type-registry helpers.
3. Extract shared create-candidate synthesis and serialization.
4. Extract shared validation-resolution branching.
5. Extract shared frontmatter/body helpers.
6. Extract shared doc-reference parsing helpers.

This order attacks the highest-confidence duplication first and leaves the more
coupled helpers for later.

## File layout

Expected new files:

```text
docs/plan/integration/P32-shared-node-obsidian-integration-helpers.md
src/integration/common/bindings.ts
src/integration/common/type-registry.ts
src/integration/common/create-candidate.ts
src/integration/common/validation-resolution.ts
src/integration/common/type-candidates.ts
src/integration/common/frontmatter.ts
src/integration/common/doc-ref.ts
```

Expected modified files:

```text
src/integration/node-lib/**
src/integration/obsidian/**
test/integration/node-lib/**
test/integration/obsidian/**
```

Possible additional test touch points:

```text
test/integration/common/**
```

## Acceptance criteria

- duplicated binding resolution no longer exists in both integrations
- duplicated type-registry builder logic no longer exists in both integrations
- create-candidate synthesis is shared where behavior is materially identical
- host-specific resolver implementations remain separate
- `src/core/` does not absorb integration orchestration
- behavior stays unchanged under existing Node and Obsidian tests

## Risks and watchouts

- do not overfit a shared abstraction that hides important host differences
- do not move host-owned resolver policy into a pseudo-generic helper
- do not move integration orchestration into `src/core/`
- do not extract presentation-layer result types just to make files look smaller
- prefer a few concrete shared helpers over an abstract integration framework
