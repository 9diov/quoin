---
_type: "[[plan-doc]]"
status: "done"
terms: ["Wiki Link", "Constraint", "Scaffolding", "Templating", "Link Resolution", "Type Declaration", "Core", "Parser", "Resolver", "TypeRegistry", "Integration", "Validation"]
---

# P19 — Obsidian Plugin Implementation Plan

## Readiness

The design is ready for implementation.

The Obsidian plugin contracts are specified across:

- [D1 — Architecture](../../../design/D1-architecture.md)
- [D2 — Type and Schema Contracts](../../../design/D2-type-and-schema-contracts.md)
- [D3 — Validation Semantics](../../../design/D3-validation-semantics.md)
- [D4 — Integration Contracts](../../../design/D4-integration-contracts.md)
- [D6 — Path-Glob Type Bindings](../../../design/D6-path-glob-type-bindings.md)
- [D8 — Obsidian Plugin Integration](../../../design/D8-obsidian-plugin-integration.md)
- [ADR-0010 — Obsidian Resolver wraps Obsidian's metadataCache](../../../adr/0010-obsidian-resolver-wraps-metadatacache.md)
- [R3 — Obsidian Plugin API Surface for Quoin](../../../research/R3-obsidian-plugin-api-surface.md)

The Core surface is already implemented through the existing parser, validation, scaffolding, templating, Resolver, and TypeRegistry contracts. The plugin should remain an Imperative Shell around that pure Core.

## Recommended External Dependencies

The plugin should prefer Obsidian's public API and the repo's existing runtime dependencies.

Recommended runtime dependency set:

- `obsidian` API types as a development/build dependency for plugin compilation
- existing `micromatch` dependency for D6 path-glob binding matches
- existing `yaml` dependency only if implementation verifies that Obsidian's parsed frontmatter is insufficient for malformed-frontmatter diagnostics or deterministic create output

No UI framework should be introduced for v1. Obsidian plugin UI surfaces can be built with `Plugin`, `PluginSettingTab`, `ItemView`, `FuzzySuggestModal`, `Modal`, `Notice`, `setIcon`, and DOM helpers.

## License Constraint

The Obsidian plugin must remain usable in commercial settings.

Dependency policy:

- direct runtime dependencies must use permissive licenses only
- acceptable default classes: MIT, ISC, BSD, Apache-2.0
- no GPL, AGPL, LGPL, SSPL, or other copyleft runtime dependencies

Implementation note:

- re-check direct and transitive licenses before adding any Obsidian-specific package
- prefer existing dependencies over new packages when the behaviour is already available

## Implementation Order

### Phase 19 — Plugin scaffold and settings

Goal: create the Obsidian plugin shell, settings model, and settings UI without discovery or Core calls.

Detailed plan: [P20 — Plugin scaffold and settings](P20-plugin-scaffold-and-settings.md).

Acceptance:

- Plugin loads in a desktop Obsidian test vault.
- Settings load, migrate, save, and render with D8 defaults.
- Commands and view registrations can be stubbed without performing validation.

### Phase 20 — Vault discovery and TypeRegistry

Goal: discover Type Definition Documents from the vault and maintain a live registry from Obsidian cache and vault events.

Detailed plan: [P21 — Vault discovery and TypeRegistry](P21-vault-discovery-and-type-registry.md).

Acceptance:

- Type Definition Documents are discovered by sentinel frontmatter.
- Successful parses and parse failures are preserved separately.
- Renames, deletes, and edits update the registry deterministically.

### Phase 21 — Obsidian Resolver and bindings

Goal: implement the metadataCache-backed Resolver, TypeRegistry lookups, basename ambiguity index, and D6 binding dispatch.

Detailed plan: [P22 — Obsidian Resolver and bindings](P22-obsidian-resolver-and-bindings.md).

Acceptance:

- Wiki Link resolution follows Obsidian through `metadataCache.getFirstLinkpathDest(...)`.
- Duplicate basenames and duplicate canonical type names report ambiguity.
- Effective Type Declaration computation honours frontmatter before bindings.

### Phase 22 — Active-file validation and status bar

Goal: validate the active Markdown file on demand and on relevant Obsidian events, then surface per-file state in the status bar.

Detailed plan: [P23 — Active-file validation and status bar](P23-active-file-validation-and-status-bar.md).

Acceptance:

- Active-file validation is debounced and read-only.
- Untyped, type-resolution failure, warning, error, clean, and Type Definition states render distinctly.
- Status-bar clicks open the appropriate sidebar tab.

### Phase 23 — Sidebar validation and types view

Goal: implement the single Quoin `ItemView` with Validation and Types tabs, including vault-wide validation.

Detailed plan: [P24 — Sidebar validation and types view](P24-sidebar-validation-and-types-view.md).

Acceptance:

- Current-file and vault-wide validation states are visible.
- Vault-wide validation is non-blocking, replaceable, and cancellable.
- Types tab lists discovered types, parse failures, and ambiguous canonical names.

### Phase 24 — Create flow and context menus

Goal: implement host-native create entry points on top of registry, scaffolding, templating, validation, and vault writes.

Detailed plan: [P25 — Create flow and context menus](P25-create-flow-and-context-menus.md).

Acceptance:

- Command palette and file-explorer menu entries open the create flow.
- Discovery health gates writes.
- Validation errors abort before write; warnings do not block.
- Created files are opened in Obsidian after a successful write.

## Suggested Milestones

### Milestone 10 — Plugin shell ready

Includes Phase 19.

This milestone makes the plugin loadable and configurable in Obsidian.

### Milestone 11 — Lookup layer ready

Includes Phases 20 and 21.

This milestone establishes Obsidian-specific discovery, registry, resolver, and binding dispatch.

### Milestone 12 — Validation UI ready

Includes Phases 22 and 23.

This milestone makes active-file and vault-wide validation usable from Obsidian surfaces.

### Milestone 13 — Obsidian v1 complete

Includes Phase 24.

This milestone completes the v1 user-facing plugin described in D8.

## Implementation Principles

- Keep Core unchanged unless D8 reveals a concrete missing contract.
- Keep Obsidian-specific APIs out of `src/core/`.
- Treat Obsidian `TFile.path` as the vault-relative POSIX identity.
- Prefer `metadataCache` for frontmatter and link semantics rather than reimplementing Obsidian behaviour.
- Preserve deterministic ordering for types, diagnostics, validation targets, and output paths.
- Treat expected discovery, parse, resolution, and validation failures as data.
- Keep plugin writes limited to the active vault.
- Keep v1 desktop-only as declared by the plugin manifest.
