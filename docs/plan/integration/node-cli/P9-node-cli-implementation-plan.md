---
_type: "[[plan-doc]]"
status: "done"
---

# P9 — Node CLI Implementation Plan

## Readiness

The design is ready for implementation.

The Node CLI contracts are specified across:

- [D1 — Architecture](../../../design/D1-architecture.md)
- [D3 — Validation Semantics](../../../design/D3-validation-semantics.md)
- [D4 — Integration Contracts](../../../design/D4-integration-contracts.md)
- [D5 — Node CLI Integration](../../../design/D5-node-cli-integration.md)
- [D6 — Path-Glob Type Bindings](../../../design/D6-path-glob-type-bindings.md)

The Core surface is already implemented through:

- [P8 — Minimal Integration harness](../../core/P8-minimal-integration-harness.md)

## Recommended External Dependencies

The Node CLI should prefer a small number of focused libraries over a framework-heavy stack.

Recommended runtime dependency set:

- [`commander`](https://github.com/tj/commander.js) for subcommands, flags, help text, and usage errors — MIT
- [`fast-glob`](https://github.com/mrmlnc/fast-glob) for root-scoped Markdown discovery with include/exclude patterns — MIT
- [`jsonc-parser`](https://www.npmjs.com/package/jsonc-parser) for `quoin.config.jsonc` — MIT
- existing [`yaml`](https://eemeli.org/yaml/) dependency for frontmatter parsing and deterministic YAML emission — ISC

Recommended standard-library usage:

- `node:fs/promises` for file I/O
- `node:path` for root resolution and normalization
- manual top-of-file frontmatter splitting rather than adding a separate frontmatter package

Why this set:

- it keeps command parsing, globbing, and JSONC parsing explicit
- it reuses the repo's existing YAML dependency
- it avoids a framework-heavy CLI runtime and avoids redundant frontmatter libraries

## License Constraint

The Node CLI must remain usable in commercial settings.

Dependency policy:

- direct runtime dependencies must use permissive licenses only
- acceptable default classes: MIT, ISC, BSD, Apache-2.0
- no GPL, AGPL, LGPL, SSPL, or other copyleft runtime dependencies

Current direct-license check for the recommended set:

- `commander` — MIT
- `fast-glob` — MIT
- `jsonc-parser` — MIT
- `yaml` — ISC

Implementation note:

- re-check the full transitive dependency closure before adding packages to `package.json`
- if a recommended library changes license, replace it rather than carving out an exception

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

### Phase 14 — Path-glob type bindings

Goal: extend the existing Node CLI runtime with config-sourced path-glob Type Bindings from D6.

Detailed plan: [P15 — Path-glob type bindings](P15-path-glob-type-bindings.md).

Acceptance:

- `bindings` is accepted and validated as config data.
- Root dispatch for regular Documents becomes binding-aware while keeping frontmatter authoritative.
- `validate` surfaces `ambiguous-binding` and `binding-type-not-found` outcomes.
- `types` and JSON outputs expose the effective binding list.

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

### Milestone 9 — D6 support complete

Includes Phase 14.

This milestone adds config-driven path-glob Type Bindings without changing the Core boundary.

## Implementation Principles

- Keep Core unchanged unless D5 reveals a concrete missing seam.
- Keep Node-specific I/O and path behavior out of `src/core/`.
- Prefer shared runtime helpers for discovery, ingestion, resolver, registry, and reporting.
- Keep binding dispatch logic in the Node integration layer beside existing root Type Declaration dispatch.
- Prefer focused libraries over framework-heavy abstractions.
- Prefer permissive-license dependencies only.
- Preserve deterministic output and path normalization across all commands.
- Treat expected failures as data, not thrown control flow.
