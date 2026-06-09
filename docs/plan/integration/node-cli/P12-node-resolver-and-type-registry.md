# P12 — Node Resolver And TypeRegistry

## Goal

Build the Node CLI lookup layer over the ingested project universe.

After this phase, the CLI should be able to:

- parse discovered Type Definition Documents into a registry
- resolve Type References and root Type Declarations
- resolve Wiki Links against the project document universe
- preserve ambiguous and unavailable lookup branches as structured results

## Inputs

- [D4 — Integration Contracts](../../../design/D4-integration-contracts.md)
- [D5 — Node CLI Integration](../../../design/D5-node-cli-integration.md)
- [P11 — Filesystem discovery and ingestion](P11-filesystem-discovery-and-ingestion.md)
- [P8 — Minimal Integration harness](../../core/P8-minimal-integration-harness.md)

## Deliverables

- parser identity derivation:
  - `id =` root-relative POSIX path
  - `name =` lowercase basename without extension
- Type Definition Document parsing over discovered candidates
- type parse failure diagnostics
- in-memory Node `TypeRegistry`
- basename-based Node `Resolver`
- ambiguity/unavailability handling for both lookup layers

Recommended dependencies for this phase:

- existing `yaml` dependency remains the parser input source from ingestion
- `node:path` for basename extraction and path normalization

No new third-party dependency should be required beyond the libraries already introduced in P10 and P11.

## Steps

1. Derive Node parser identity for each discovered type candidate.
2. Call `parseTypeDefinitionDocument(raw, identity, parserConfig)` for discovered candidates only.
3. Cache successful parsed type definitions by `id` and `name`.
4. Preserve broken type candidates as parse-failure diagnostics.
5. Build a basename index over all ingested Markdown `Document`s, including Type Definition Documents.
6. Implement Node `Resolver` semantics from D5:
   - basename strategy only
   - ignore path prefixes, fragments, and display text for lookup
   - preserve `found`, `not-found`, `ambiguous`, `unavailable`
7. Implement Node `TypeRegistry` semantics from D5:
   - `getByName`
   - `getByDeclaration`
   - ambiguity through duplicate canonical names

## Acceptance Criteria

- Registry lookup by declaration resolves `[[Concept]]` through canonical name `concept`.
- The bare literal `type` is accepted by `getByDeclaration`.
- Duplicate canonical names produce `ambiguous`, not last-write-wins.
- Resolver ambiguity is conservative when multiple basename matches exist.
- `npm run typecheck` succeeds.
