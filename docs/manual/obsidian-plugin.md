# Obsidian Plugin Manual Testing

Use a disposable local vault for manual plugin testing:

```bash
npm run manual:obsidian:setup
```

The command builds the Obsidian plugin, creates `.manual/obsidian-vault`, seeds it from `fixtures/vaults/manual-obsidian`, installs the plugin into `.obsidian/plugins/quoin`, and adds `quoin` to `.obsidian/community-plugins.json`.

Open `.manual/obsidian-vault` in Obsidian. If Obsidian still asks for confirmation, enable community plugins and enable Quoin from Community plugins.

## Rebuild Loop

After code changes:

```bash
npm run manual:obsidian:setup
```

Then reload community plugins in Obsidian. The command preserves existing local notes and Obsidian settings while refreshing fixture files and plugin build files.

For a clean vault:

```bash
npm run manual:obsidian:reset
```

To install an already-built plugin without rebuilding:

```bash
node scripts/setup-obsidian-manual-vault.mjs --no-build
```

To test a different fixture vault:

```bash
node scripts/setup-obsidian-manual-vault.mjs --fixture fixtures/vaults/obsidian-style
```

## Smoke Checklist

Settings:

- Quoin settings tab opens.
- Type Declaration key, URL schemes, debounce values, and bindings render.
- Add a binding from `concept` to `bound/**/*.md`, then open `bound/bound-concept.md`.

Types:

- `Quoin: Show types` opens the sidebar Types tab.
- `concept` and `source` are listed.
- Clicking a type row opens its Markdown file.

Active-file validation:

- `notes/valid-concept.md` shows a clean status bar state.
- `notes/invalid-concept.md` shows validation errors.
- `notes/untyped.md` shows the untyped state.
- `types/Concept.md` shows the type-definition state.

Vault-wide validation:

- `Quoin: Validate vault` opens the Validation tab.
- Progress advances and results are grouped by file.
- Type Definition Documents are excluded from regular document validation.

Create flow:

- `Quoin: Create document of type...` opens the type picker.
- Folder context menu shows `New Quoin document...`.
- Type Definition Document context menu shows `New document of this type`.
- Existing output paths are rejected.
- Created documents contain `_type: [[TypeBasename]]`, scaffold defaults, and template body.
- Created documents open in the active leaf with the cursor after frontmatter.
