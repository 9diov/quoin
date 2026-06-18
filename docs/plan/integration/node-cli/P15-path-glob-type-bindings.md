---
_type: "[[plan-doc]]"
status: "done"
---

# P15 — Path-Glob Type Bindings

## Goal

Implement the Node CLI support for [D6 — Path-Glob Type Bindings](../../../design/D6-path-glob-type-bindings.md).

After this phase, the CLI should be able to:

- accept `bindings` in `NodeCliConfig`
- validate the binding list as config data
- compute an Effective Type Declaration for regular Documents from frontmatter plus path-glob bindings
- extend `validate` target outcomes with binding-specific failures
- surface the effective binding list in JSON output
- show configured bindings in `types`

This phase extends the existing Node CLI integration. It does not change Core APIs and does not introduce a sidecar bindings file.

## Inputs

- [D4 — Integration Contracts](../../../design/D4-integration-contracts.md) — Integration-owned root Type Declaration dispatch
- [D5 — Node CLI Integration](../../../design/D5-node-cli-integration.md) — existing CLI result shapes, config model, and command contracts
- [D6 — Path-Glob Type Bindings](../../../design/D6-path-glob-type-bindings.md)
- [P10 — CLI scaffold and config](P10-cli-scaffold-and-config.md)
- [P12 — Node Resolver and TypeRegistry](P12-node-resolver-and-type-registry.md)
- [P13 — Validate command](P13-validate-command.md)
- [P14 — Create and types commands](P14-create-and-types-commands.md)

## Deliverables

### Config model extension

Extend the Node CLI config model with:

```typescript
type TypeBinding = {
  type: string
  match: string
}

type NodeCliConfig = {
  // ...existing fields...
  bindings?: TypeBinding[]
}

type EffectiveConfig = {
  // ...existing fields...
  bindings: TypeBinding[]
}
```

Rules:

- `bindings` defaults to `[]`
- each entry must have exactly the keys `type` and `match`; unknown keys are errors; missing keys are errors
- `type` must be a canonical type name
- `match` must be a non-empty string
- duplicate bindings (`same type` + `same match`) are rejected during config loading
- declaration order in the source config is preserved through parsing, validation, and `EffectiveConfig` serialization — the resolution algorithm relies on it as the tiebreaker for same-type matches

Bindings are config data, not discovery data. Invalid bindings fail config resolution before discovery or validation begins.

This phase requires new **semantic config validation** in addition to existing JSONC parsing. The current config loader only throws for malformed JSONC syntax; binding validation must add explicit runtime checks and surface their failures as command-level config failures rather than silently ignoring bad values.

### Binding resolution helper

Add one small Node-owned helper that computes the Effective Type Declaration for a regular Document from:

- `document.frontmatter[typeDeclarationKey]`
- the Document's root-relative path
- `config.bindings`

Recommended private shape:

```typescript
type EffectiveTypeDeclaration =
  | { kind: 'frontmatter'; value: unknown }
  | { kind: 'binding'; typeName: string; matchedBinding: TypeBinding }
  | { kind: 'untyped' }
  | { kind: 'ambiguous-binding'; candidates: TypeBinding[] }
```

Resolution rules must match D6 exactly:

1. frontmatter Type Declaration wins whenever the configured key is present
2. otherwise collect matching bindings in declaration order
3. zero matches -> `untyped`
4. one match -> `binding`
5. multiple same-type matches -> `binding`, reporting the first matching binding as `matchedBinding`
6. multiple different-type matches -> `ambiguous-binding`, collapsing same-type duplicates to first occurrence and preserving declaration order
7. Type Definition Documents are excluded from binding dispatch entirely

### `validate` command extension

Extend `ValidationTargetResult` with:

```typescript
type ValidationTargetResult =
  // ...existing variants...
  | { kind: 'ambiguous-binding'; path: string; candidates: TypeBinding[] }
  | { kind: 'binding-type-not-found'; path: string; matchedBinding: TypeBinding; typeName: string }
  | { kind: 'binding-type-ambiguous'; path: string; matchedBinding: TypeBinding; typeName: string; candidateIds: string[] }
  | { kind: 'binding-type-unavailable'; path: string; matchedBinding: TypeBinding; reason: string }
```

Required `validate` behaviour:

- default regular-document target selection remains unchanged
- root dispatch uses the binding-aware Effective Type Declaration helper
- `frontmatter` and `binding` sources both resolve through the existing TypeRegistry
- binding-selected `typeName` resolves via `typeRegistry.getByName(...)`
- `binding-type-not-found` is emitted when a binding-selected `typeName` is absent from the registry
- `binding-type-ambiguous` is emitted when a binding-selected `typeName` resolves to multiple discovered Type Definition Documents
- `binding-type-unavailable` is emitted when the binding-selected type lookup cannot be completed
- `ambiguous-binding` skips Core `validate(...)`
- untyped skip/warn behaviour still applies only after both frontmatter and bindings have been considered
- all four new variants (`ambiguous-binding`, `binding-type-not-found`, `binding-type-ambiguous`, `binding-type-unavailable`) exit non-zero, following the same rule D5 already applies to `type-not-found`, `type-ambiguous`, and `type-unavailable`
- a `validated` outcome carries no `source` discriminator — frontmatter-sourced and binding-sourced successes are indistinguishable in the result shape (D6)

No Core change is required. The command still calls:

```typescript
validate(document, typeDef, config, resolver, typeRegistry)
```

only after a unique type definition has been selected.

### `types` command extension

Extend `types` so configured bindings are visible alongside discovered Type Definition Documents.

Recommended result-shape addition:

```typescript
type TypesResult = {
  // ...existing fields...
  bindings: TypeBinding[]
}
```

Minimum behaviour:

- include the effective binding list in JSON output
- print bindings in human output when non-empty
- group or label bindings by target type name so users can see:
  - which types are bound by config
  - which bindings point to types that were not discovered
- when the same type is bound by multiple overlapping bindings, list each binding individually in declaration order rather than collapsing to one entry per type — the declaration order is what determines tiebreaking at resolution time, and the user needs to see the order to debug ambiguity reports

This command remains read-only and continues to be driven by discovered type definitions plus config.

### Effective-config serialization

Extend the serialized config snapshot emitted by CLI JSON output:

```typescript
{
  // ...existing fields...
  bindings: TypeBinding[]
}
```

This keeps `validate`, `create`, and `types` outputs self-describing.

### Non-goals for this phase

This phase does not:

- add `bindings.yaml`
- add a `--bindings` CLI flag
- add binding support to `create`
- move root dispatch logic into Core
- add specificity-based glob precedence
- add load-time batching for unknown binding target names

## File layout

Expected touch points:

```text
src/integration/node-cli/
  config.ts
  validate.ts
  types.ts
  project.ts                  maybe, if shared project-universe state needs bindings exposure
  bindings.ts                 recommended internal helper for config validation + dispatch (not re-exported from any package entry point)
```

Tests:

```text
test/integration/
  node-cli-bindings.test.ts   or extend existing command/integration coverage
```

Exact filenames may vary. The important part is keeping binding logic Node-owned and out of `src/core/`.

## Steps

1. Extend `NodeCliConfig`, `EffectiveConfig`, defaults, and `serializeEffectiveConfig` to carry `bindings`.
2. Confirm how the existing JSONC config loader handles unknown top-level keys. P15 was drafted assuming the loader only throws on malformed JSONC syntax and silently ignores unknown keys; if that is still true, add parsing for the `bindings` key. If the loader has since gained strict-mode rejection of unknown keys, this step is a no-op and only registration of `bindings` as a known key is needed.
3. Add semantic config validation for `bindings`:
   - config value must be an array when present
   - each binding entry must be an object
   - each entry must have exactly `type` and `match`
   - `type` must be canonical
   - `match` must be a non-empty string
   - duplicate bindings are rejected
4. Surface binding semantic-validation failures as command-level config failures.
5. Add an internal (not re-exported) binding-resolution helper that returns `frontmatter`, `binding`, `untyped`, or `ambiguous-binding`.
6. Update `validate.ts` to use the binding-aware dispatch helper instead of reading only `frontmatter[typeDeclarationKey]`.
7. Add the new `ValidationTargetResult` variants:
   - `ambiguous-binding`
   - `binding-type-not-found`
   - `binding-type-ambiguous`
   - `binding-type-unavailable`
8. Keep existing untyped skip/warn behaviour intact for the `untyped` branch.
9. Update `types.ts` to include configured bindings in human and JSON output.
10. If shared project-universe helpers already centralize parsed types and registry state, thread `config.bindings` through them rather than rebuilding the binding list separately in each command.
11. Add focused tests for config validation, dispatch, result shapes, and reporting.
12. Run `npm run typecheck` and `npm test`.

## Suggested tests

Add coverage for at least these cases:

- `bindings` omitted -> effective config uses `[]`
- valid config with one binding parses and serializes correctly
- non-array `bindings` value fails config loading
- binding entry with unknown keys fails config loading
- binding entry with missing `type` or missing `match` fails config loading
- binding entry with non-string `type` or non-string `match` fails config loading
- duplicate binding entries fail config loading
- regular Document with frontmatter Type Declaration ignores matching bindings
- untyped regular Document with one matching binding validates against the bound type
- untyped regular Document with multiple same-type bindings uses the first matching binding as `matchedBinding`
- untyped regular Document with multiple different-type bindings returns `ambiguous-binding`
- binding-selected type name missing from registry returns `binding-type-not-found`
- binding-selected type name with multiple discovered type definitions returns `binding-type-ambiguous`
- binding-selected type lookup unavailable returns `binding-type-unavailable`
- Type Definition Documents are excluded from binding dispatch even when their path matches a binding
- `warn-untyped` still occurs when no frontmatter Type Declaration exists and no bindings match
- `types` JSON output includes the effective binding list
- `validate` JSON output includes the effective binding list
- `EffectiveConfig.bindings` in serialized JSON output preserves declaration order from the source config (input order `[A, B, C]` round-trips as `[A, B, C]`, never normalized or sorted)
- a frontmatter-typed Document and a binding-typed Document that both pass validation produce `ValidationTargetResult` entries with identical shape — no `source` field, no `matchedBinding` field on the success case — pinning the D6 invariant that successful outcomes carry no source discriminator

If existing `validate` command tests already exercise root dispatch, extend them instead of creating a second redundant harness.

## Acceptance Criteria

- The CLI accepts `bindings` in config and defaults it to `[]`.
- Invalid binding config fails before discovery/validation, including semantic binding errors after JSONC parse.
- Root dispatch for regular Documents is binding-aware and still frontmatter-first.
- Same-type binding overlaps are deterministic and report the first matching binding.
- Cross-type binding overlaps produce `ambiguous-binding`.
- Unknown binding target names produce `binding-type-not-found`.
- Binding-selected ambiguous type lookups produce `binding-type-ambiguous`.
- Binding-selected unavailable type lookups produce `binding-type-unavailable`.
- Existing untyped skip/warn behaviour is preserved for Documents with no frontmatter Type Declaration and no matching bindings.
- `types` and JSON command output surface the effective binding list.
- No Core API or Core implementation change is required.
- `npm run typecheck` succeeds.
- `npm test` succeeds.

## Follow-up

After this phase, the Node CLI supports D6 through config-only bindings. Any future promotion to a portable `bindings.yaml` or Integration-specific settings source should build on the same `TypeBinding` shape and the same dispatch semantics from this phase.
