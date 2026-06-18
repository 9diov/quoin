---
_type: "[[plan-doc]]"
status: "done"
---

# P24 — Sidebar Validation And Types View

## Goal

Implement the Quoin sidebar as a single Obsidian `ItemView` with two internal tabs:

- Validation
- Types

After this phase, users should be able to inspect the current file, run vault-wide validation, and inspect TypeRegistry health from one view.

## Inputs

- [D8 — Obsidian Plugin Integration](../../../design/D8-obsidian-plugin-integration.md)
- [R3 — Obsidian Plugin API Surface for Quoin](../../../research/R3-obsidian-plugin-api-surface.md)
- [P21 — Vault discovery and TypeRegistry](P21-vault-discovery-and-type-registry.md)
- [P23 — Active-file validation and status bar](P23-active-file-validation-and-status-bar.md)

## Deliverables

- registered Quoin `ItemView`
- internal tab controls for Validation and Types
- command implementation for:
  - `Quoin: Validate vault`
  - `Quoin: Show types`
  - `Quoin: Open Quoin view`
- current-file validation section
- vault-wide validation section
- non-blocking vault-wide validation runner
- progress and cancellation state
- Types tab listing:
  - discovered types
  - parse failures
  - ambiguous canonical names
  - ingestion diagnostics

Recommended dependencies for this phase:

- Obsidian API only
- no new UI framework

## Validation Tab

The current-file section mirrors the active-file validation state from P23.

The vault-wide section:

- starts empty with `last run: never`
- validates every regular Markdown Document in the discovery universe on demand
- excludes Type Definition Documents from regular target validation
- updates rows for changed files already present in the vault-wide result set
- replaces previous results on each new run
- supports cancellation from the sidebar

Vault-wide validation should be internally chunked or yielded so large vaults do not freeze the UI.

## Types Tab

Render deterministic sections for:

- discovered type definitions, sorted by canonical name then path
- parse failures, sorted by path
- ambiguous canonical names, including all candidate paths
- ingestion diagnostics that affect type discovery

Clicking a successful type row opens the Type Definition Document in the active leaf.

## Steps

1. Register one `ItemView` and default it to the Validation tab.
2. Implement open helpers that can select a target tab and optional file row.
3. Render tab controls with active-state CSS classes.
4. Connect the current-file section to the P23 active-file cache.
5. Implement vault-wide target enumeration from the current discovery universe.
6. Reuse the same root dispatch and validation path as active-file validation.
7. Add progress, cancellation, last-run timestamp, and replacement semantics.
8. Render grouped errors and warnings for each validated file.
9. Connect Types tab data to the P21 registry state.
10. Re-render affected sidebar sections when registry, active-file, settings, or vault-wide state changes.
11. Add tests for view state reducers or render helpers where practical; cover end-to-end UI behaviour manually in Obsidian.

## Acceptance Criteria

- One sidebar view contains both tabs.
- Vault-wide validation is not started automatically at plugin startup.
- Starting a new vault-wide run replaces the previous run.
- Cancellation stops future work and leaves a clear cancelled state.
- Types tab exposes broken and ambiguous type candidates rather than hiding them.
- Type rows open their source Markdown files.
- `npm run typecheck` succeeds.
