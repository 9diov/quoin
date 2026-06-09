# P13 — Validate Command

## Goal

Implement the read-only `validate` command over real files.

After this phase, the CLI should be able to:

- discover the project universe
- build the Node Resolver and TypeRegistry
- select explicit or default validation targets
- perform Integration-owned root type dispatch
- call Core `validate(...)`
- emit structured and human-readable results

## Inputs

- [D3 — Validation Semantics](../../../design/D3-validation-semantics.md)
- [D5 — Node CLI Integration](../../../design/D5-node-cli-integration.md)
- [P11 — Filesystem discovery and ingestion](P11-filesystem-discovery-and-ingestion.md)
- [P12 — Node Resolver and TypeRegistry](P12-node-resolver-and-type-registry.md)

## Deliverables

- target selection for:
  - explicit file arguments
  - explicit directory arguments
  - whole-project default mode
- target diagnostics for unsupported, excluded, missing, and out-of-root targets
- Integration-owned untyped skip/warn handling
- root Type Declaration dispatch
- `validate(...)` calls with referential validation enabled by default
- human and JSON result emission
- exit-status computation

## Steps

1. Implement explicit target expansion and de-duplication.
2. Keep discovery project-wide even when targets are narrow.
3. Exclude Type Definition Documents from default regular-document validation targets.
4. Read each target Document's root Type Declaration via `typeDeclarationKey`.
5. Produce Integration-owned target outcomes for:
   - `skipped-untyped`
   - `warn-untyped`
   - `invalid-type-declaration`
   - `type-not-found`
   - `type-ambiguous`
   - `type-unavailable`
6. Call `validate(document, typeDef, config, resolver, typeRegistry)` only for resolved targets.
7. Aggregate per-target results plus discovery and target diagnostics.
8. Implement human output, JSON output, and exit-status rules from D5.

## Acceptance Criteria

- `validate` is read-only.
- Referential validation is enabled by default and can be disabled explicitly.
- Any discovery-universe ingest failure or type parse failure fails the command globally.
- Warnings alone do not fail exit status.
- `npm run typecheck` succeeds.

