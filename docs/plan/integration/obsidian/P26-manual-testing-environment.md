---
_type: "[[plan-doc]]"
status: "done"
---

# P26 — Manual Testing Environment

## Goal

Make the Obsidian plugin easy to test manually during development.

After this phase, a contributor should be able to build the plugin, install it into a disposable Obsidian vault, reload it after changes, and exercise the main plugin surfaces without hand-copying files or risking a personal vault.

## Inputs

- [D8 — Obsidian Plugin Integration](../../../design/D8-obsidian-plugin-integration.md)
- [P20 — Plugin scaffold and settings](P20-plugin-scaffold-and-settings.md)
- [P21 — Vault discovery and TypeRegistry](P21-vault-discovery-and-type-registry.md)
- [P23 — Active-file validation and status bar](P23-active-file-validation-and-status-bar.md)
- [P24 — Sidebar validation and types view](P24-sidebar-validation-and-types-view.md)
- [P25 — Create flow and context menus](P25-create-flow-and-context-menus.md)

## Deliverables

- documented disposable test vault layout in [Obsidian Plugin Manual Testing](../../../manual/obsidian-plugin.md)
- script to build and install the plugin into that vault:
  - `scripts/setup-obsidian-manual-vault.mjs`
- repeatable fixture sync from `fixtures/vaults/manual-obsidian` into the manual vault
- Obsidian community-plugin folder setup:
  - `manifest.json`
  - `main.js`
  - optional generated assets if the build adds them later
- watch-mode workflow for rebuilding during manual testing:
  - `npm run manual:obsidian:watch`
- checklist for manually exercising:
  - settings tab
  - discovery and Types tab
  - active-file validation and status bar
  - vault-wide validation
  - create flow and context menus
- cleanup/reset instructions

Recommended dependencies for this phase:

- existing `npm run build:obsidian`
- small Node script under `scripts/`
- disposable vault under a gitignored path such as `.manual/obsidian-vault`

Implemented commands:

- `npm run manual:obsidian:setup`
- `npm run manual:obsidian:reset`
- `npm run manual:obsidian:watch`

## Manual Vault Shape

Use a generated local vault that is never committed:

```text
.manual/
  obsidian-vault/
    .obsidian/
      plugins/
        quoin/
          manifest.json
          main.js
    quoin.config.jsonc
    types/
    notes/
```

The vault should be populated from known fixtures rather than maintained by hand. The default fixture is `fixtures/vaults/manual-obsidian`, a curated vault that avoids duplicate canonical type names so create-flow testing is not blocked by discovery health.

The setup script also accepts `--fixture <path>` for targeted testing against another fixture vault.

## Workflow

The default happy path should be:

1. Run `npm run manual:obsidian:setup` from the repo root to build and install the plugin into the manual vault.
2. Open `.manual/obsidian-vault` in Obsidian.
3. Enable the Quoin community plugin.
4. Exercise the manual checklist.
5. Re-run the install command after code changes, then reload Obsidian plugins.

The install command should be idempotent:

- create missing directories
- replace the plugin build output
- preserve Obsidian's local plugin enablement files when possible
- avoid deleting user-created scratch notes unless the user explicitly requests a reset

## Steps

1. Add `.manual/` to `.gitignore`.
2. Add `scripts/setup-obsidian-manual-vault.mjs`.
3. Have the script run `npm run build:obsidian` by default.
4. Copy the built Obsidian plugin files into `.manual/obsidian-vault/.obsidian/plugins/quoin/`.
5. Seed the vault from `fixtures/vaults/manual-obsidian` by default.
6. Add package scripts:
   - `manual:obsidian:setup`
   - `manual:obsidian:reset`
   - `manual:obsidian:watch`
7. Document how to open the vault in Obsidian and enable the plugin.
8. Document how to reload after changes.
9. Add a manual smoke checklist that maps to P20-P25 surfaces.
10. Keep all generated vault content outside committed source.

## Manual Smoke Checklist

Settings:

- Quoin settings tab opens.
- Type Declaration key, URL schemes, debounce values, and bindings render.
- Saving settings causes active-file validation to refresh.

Types:

- `Quoin: Show types` opens the sidebar Types tab.
- Valid Type Definition Documents are listed.
- Parse failures and ingestion diagnostics are visible when fixture files are broken.
- Clicking a type row opens its Markdown file.

Active-file validation:

- Opening a valid typed note shows a clean status bar state.
- Opening an invalid typed note shows an error state.
- Opening an untyped note shows the untyped state.
- Opening a Type Definition Document shows the type-definition state.

Vault-wide validation:

- `Quoin: Validate vault` opens the Validation tab.
- Progress advances without freezing Obsidian.
- Type Definition Documents are excluded from regular document validation.
- Errors and warnings are grouped by file.

Create flow:

- `Quoin: Create document of type...` opens the type picker.
- Folder context menu shows `New Quoin document...`.
- Type Definition Document context menu shows `New document of this type`.
- Existing output paths are rejected.
- Created documents contain `_type: [[TypeBasename]]`, scaffold defaults, and template body.
- Created documents open in the active leaf with the cursor after frontmatter.

## Acceptance Criteria

- A fresh clone can create a disposable Obsidian test vault with one documented command.
- The generated vault can enable and run the local Quoin plugin build.
- Manual testers do not need to copy plugin files by hand.
- Resetting the manual vault is documented and does not affect source fixtures.
- The manual smoke checklist covers all user-facing Obsidian v1 surfaces from P20-P25.
- `npm run typecheck` succeeds.
