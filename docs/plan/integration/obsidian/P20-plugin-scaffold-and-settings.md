# P20 — Plugin Scaffold And Settings

## Goal

Create the minimal Obsidian plugin shell that can:

- load and unload cleanly
- register commands, settings, status bar, and sidebar view placeholders
- persist D8 settings through Obsidian's `saveData(...)`
- render the flat settings tab, including D6 path-glob bindings

This phase does not need to scan Markdown files or call Core.

## Inputs

- [D8 — Obsidian Plugin Integration](../../../design/D8-obsidian-plugin-integration.md)
- [D6 — Path-Glob Type Bindings](../../../design/D6-path-glob-type-bindings.md)
- [R3 — Obsidian Plugin API Surface for Quoin](../../../research/R3-obsidian-plugin-api-surface.md)
- [P19 — Obsidian Plugin Implementation Plan](P19-obsidian-plugin-implementation-plan.md)

## Deliverables

- Obsidian plugin entrypoint under an integration-owned location
- Obsidian `manifest.json` with `isDesktopOnly: true`
- build output suitable for loading in a test vault
- default settings and settings migration/loading
- settings save path through `plugin.saveData(...)`
- flat `PluginSettingTab` for:
  - `typeDeclarationKey`
  - `untypedDocumentBehavior`
  - `referentialValidation`
  - `debounce.activeFile`
  - `debounce.typeDefCascade`
  - `bindings`
- placeholder registrations for:
  - status bar item
  - Quoin sidebar `ItemView`
  - command palette commands from D8

Recommended dependencies for this phase:

- Obsidian API types
- no UI framework
- no new runtime dependency unless the plugin build requires one

## Settings Model

Implement the D8 settings shape:

```typescript
type ObsidianPluginSettings = {
  typeDeclarationKey: string
  untypedDocumentBehavior: 'skip' | 'warn'
  referentialValidation: boolean
  debounce: {
    activeFile: number
    typeDefCascade: number
  }
  bindings: TypeBinding[]
}
```

Defaults:

- `typeDeclarationKey = '_type'`
- `untypedDocumentBehavior = 'skip'`
- `referentialValidation = true`
- `debounce.activeFile = 300`
- `debounce.typeDefCascade = 1500`
- `bindings = []`

The Core validation `integration` value is hardwired to `'obsidian'` later during validation and is not surfaced in settings.

## Steps

1. Choose a plugin source and build layout that keeps Obsidian-specific code separate from Core and the Node CLI.
2. Add the Obsidian manifest with desktop-only v1 support.
3. Add plugin load/unload lifecycle wiring.
4. Implement default settings and tolerant merge-based loading from saved data.
5. Implement settings persistence through `saveData(...)`.
6. Render every setting in one flat `PluginSettingTab`.
7. Render `bindings` as an ordered editable list with type, match, move up, move down, and delete controls.
8. In this phase, let the type dropdown render from an empty or placeholder type list; live TypeRegistry population arrives in P21.
9. Register placeholder commands and view/status-bar surfaces so later phases can attach real behaviour.
10. Add focused tests for settings defaults, merge loading, and validation of basic settings values where testable outside Obsidian.

## Acceptance Criteria

- Plugin can be loaded manually in a desktop Obsidian vault.
- Settings survive reload through Obsidian data storage.
- The settings tab renders every D8 setting without an Advanced section.
- Empty binding `match` values and duplicate binding rows are visibly blocked before save.
- The implementation does not introduce Core changes.
- `npm run typecheck` succeeds.
