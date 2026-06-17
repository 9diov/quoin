# P23 — Active-File Validation And Status Bar

## Goal

Implement live validation for the active Markdown file and surface the result in Obsidian's status bar.

After this phase, the plugin should validate the active regular Document on relevant events while keeping startup read-only and lightweight.

## Inputs

- [D3 — Validation Semantics](../../../design/D3-validation-semantics.md)
- [D8 — Obsidian Plugin Integration](../../../design/D8-obsidian-plugin-integration.md)
- [P21 — Vault discovery and TypeRegistry](P21-vault-discovery-and-type-registry.md)
- [P22 — Obsidian Resolver and bindings](P22-obsidian-resolver-and-bindings.md)

## Deliverables

- active-file validation target selection
- debounced active-file validation on Obsidian events
- integration-owned root type dispatch
- `validate(...)` calls with Obsidian validation config
- active-file validation result cache
- status bar item state rendering
- command implementation for `Quoin: Validate active file`

Recommended dependencies for this phase:

- Obsidian API only
- no new runtime dependency

## Validation Triggers

Implement D8 triggers for the active file:

- `workspace.on('active-leaf-change')`
- `workspace.on('file-open')`
- `metadataCache.on('changed', file)` when `file` is the active file
- command `Quoin: Validate active file`
- settings changes that affect root dispatch or validation config
- Type Definition Document changes that affect the active file's resolved type

Use `settings.debounce.activeFile` for normal active-file events. The explicit command bypasses debounce.

## Status Bar States

Render D8 states:

- no active file or non-Markdown file -> hidden
- untyped Document -> dimmed dot, tooltip `Untyped`
- Type Definition Document -> distinct type icon and tooltip
- root type resolution failure -> warning icon with failure tooltip
- validation errors -> error icon with numeric suffix
- no errors and warnings present -> amber success state
- no errors and no warnings -> green success state with type name tooltip

Click behaviour:

- untyped, resolution failures, warnings, and errors open the sidebar Validation tab
- Type Definition Document state opens the sidebar Types tab
- clean regular Document opens the sidebar Validation tab for the current file

## Steps

1. Add active Markdown file detection and Type Definition Document classification.
2. Convert Obsidian cache data into Core `Document` input.
3. Compute Effective Type Declaration through the P22 helper.
4. Produce Integration-owned outcomes for untyped, invalid declaration, not found, ambiguous, and unavailable type resolution.
5. Call Core `validate(...)` only after a unique type definition is selected.
6. Hardwire validation config `integration` to `'obsidian'`.
7. Apply settings for allowed URL schemes, referential validation, and untyped behaviour.
8. Cache the latest active-file state for status bar and sidebar consumers.
9. Render status bar icon, count, tooltip, CSS classes, and click handler.
10. Add focused tests with mocked Obsidian events and validation outcomes where practical.

## Acceptance Criteria

- The plugin does not validate all regular Documents at startup.
- Active-file validation is read-only.
- Explicit active-file validation bypasses debounce.
- Warnings alone render as conforming with warnings.
- Reserved Property collisions surface as warnings under the Obsidian integration config.
- Status bar item is hidden for non-Markdown active files.
- `npm run typecheck` succeeds.
