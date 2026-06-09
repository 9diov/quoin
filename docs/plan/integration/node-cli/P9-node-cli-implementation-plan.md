# P9 — Node CLI Implementation Plan

## Readiness

The design is ready for implementation.

The Node CLI contracts are specified across:

- [D1 — Architecture](../../../design/D1-architecture.md)
- [D3 — Validation Semantics](../../../design/D3-validation-semantics.md)
- [D4 — Integration Contracts](../../../design/D4-integration-contracts.md)
- [D5 — Node CLI Integration](../../../design/D5-node-cli-integration.md)

The Core surface is already implemented through:

- [P8 — Minimal Integration harness](../../core/P8-minimal-integration-harness.md)

## Implementation Order

### Phase 9 — CLI scaffold and config loading

Goal: create a private Node CLI runtime shell with argument parsing, config loading, effective-root resolution, and output-mode plumbing.

Detailed plan: [P10 — CLI scaffold and config](P10-cli-scaffold-and-config.md).

Acceptance:

- CLI entrypoint runs under Node.
- Config loading precedence matches D5.
- Effective root, include/exclude, and format selection are resolved before command execution.
- JSON and human output modes can be selected consistently.

### Phase 10 — Filesystem discovery and ingestion

Goal: ingest real Markdown files from disk into stable project-scoped document artifacts and discovery diagnostics.

Detailed plan: [P11 — Filesystem discovery and ingestion](P11-filesystem-discovery-and-ingestion.md).

Acceptance:

- Discovery enumerates Markdown files under the effective root.
- Frontmatter parsing distinguishes successful `Document` ingestion from ingest failures.
- Type Definition Document candidates are discovered by sentinel frontmatter.
- Project-relative path normalization and deterministic ordering are enforced.

### Phase 11 — Node Resolver and TypeRegistry

Goal: build the real filesystem-backed lookup layer required by `validate`, `create`, and `types`.

Detailed plan: [P12 — Node Resolver and TypeRegistry](P12-node-resolver-and-type-registry.md).

Acceptance:

- Type Definition Documents parse into a registry keyed by root-relative `id` and canonical `name`.
- Basename-based Wiki Link resolution works over the ingested document universe.
- Ambiguous and unavailable lookup branches are preserved as data.
- Registry lookup by declaration and by name follows D4 and D5.

### Phase 12 — `validate` command

Goal: implement the read-only validation command over real files, with full-scope discovery and integration-owned root dispatch.

Detailed plan: [P13 — Validate command](P13-validate-command.md).

Acceptance:

- `validate` supports explicit file and directory targets plus whole-project default behavior.
- Untyped skip/warn handling happens outside Core.
- Referential validation is enabled by default and can be disabled explicitly.
- Exit status and reporting match D5.

### Phase 13 — `create` and `types` commands

Goal: implement the remaining Node CLI user-facing commands on top of the shared discovery and lookup runtime.

Detailed plan: [P14 — Create and types commands](P14-create-and-types-commands.md).

Acceptance:

- `create` resolves a type by canonical name, scaffolds and templates a candidate Document, validates it, and writes deterministically.
- `create` refuses overwrite and any out-of-root output path.
- `types` reports discovered successful and broken Type Definition Documents.
- Command result shapes and exit status match D5.

## Suggested Milestones

### Milestone 5 — CLI runtime ready

Includes Phases 9 and 10.

This milestone establishes the real Node integration shell and file ingestion pipeline.

### Milestone 6 — Lookup layer ready

Includes Phase 11.

This milestone establishes the Node-specific Resolver and TypeRegistry behavior over real files.

### Milestone 7 — Validation CLI ready

Includes Phase 12.

This milestone makes the first real end-user integration command usable in CI and local workflows.

### Milestone 8 — Node CLI v1 complete

Includes Phase 13.

This milestone completes the narrow Node CLI reference integration described in D5.

## Implementation Principles

- Keep Core unchanged unless D5 reveals a concrete missing seam.
- Keep Node-specific I/O and path behavior out of `src/core/`.
- Prefer shared runtime helpers for discovery, ingestion, resolver, registry, and reporting.
- Preserve deterministic output and path normalization across all commands.
- Treat expected failures as data, not thrown control flow.
