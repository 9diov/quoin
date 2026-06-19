---
_type: "[[plan-doc]]"
status: "done"
terms: ["Template Block", "Resolver", "TypeRegistry", "Integration", "Validation"]
---

# P14 — Create And Types Commands

## Goal

Implement the remaining Node CLI v1 commands:

- `create`
- `types`

After this phase, the Node CLI reference integration described by D5 is complete.

## Inputs

- [D5 — Node CLI Integration](../../../design/D5-node-cli-integration.md)
- [P12 — Node Resolver and TypeRegistry](P12-node-resolver-and-type-registry.md)
- [P13 — Validate command](P13-validate-command.md)

## Deliverables

### `create`

- type selection by canonical name
- strict discovery-health gating
- root declaration synthesis
- `scaffold(...)` + `template(...)` flow
- pre-write `validate(...)` pass
- deterministic YAML/frontmatter and body writing
- parent-directory creation
- overwrite refusal

### `types`

- list discovered type summaries
- list type parse failures
- optional single-type detail mode
- ambiguity reporting
- command-specific exit-status behavior

Recommended dependencies for this phase:

- existing `yaml` dependency for deterministic YAML emission during `create`
- no new third-party runtime dependencies beyond P10 and P11 unless implementation reveals a concrete gap

## Steps

1. Implement `create --type <name> --output <path>`.
2. Reject out-of-root and existing output paths.
3. Require discovery health to be clean before writing.
4. Synthesize the root declaration from the selected type file basename.
5. Call `scaffold(...)`, `template(...)`, and a pre-write `validate(...)`.
6. Abort on validation errors; write on warnings.
7. Serialize frontmatter deterministically.
8. Implement `types` list and detail modes using the shared registry/discovery state.
9. Add command-specific JSON and human outputs.
10. Implement exit status for `create` and `types`.

## Acceptance Criteria

- `create` can produce frontmatter-only files when a type has no Template Block.
- `create` never overwrites existing files.
- `types` surfaces discovered broken type candidates rather than hiding them.
- Command results remain structured and deterministic.
- `npm run typecheck` succeeds.
