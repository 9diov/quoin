---
_type: "[[plan-doc]]"
status: "done"
terms: ["Document", "Type Definition Document", "Type Declaration", "Core", "Parser", "TypeRegistry", "Integration", "Validation"]
---

# P21 — Vault Discovery And TypeRegistry

## Goal

Implement Obsidian-backed discovery and Type Definition Document ingestion.

After this phase, the plugin should be able to turn the active vault into:

- a deterministic set of Markdown files
- discovered Type Definition Document candidates
- parsed type definitions
- parse and ingestion diagnostics
- a live TypeRegistry updated by Obsidian events

This phase does not need final validation UI or create flow behaviour.

## Inputs

- [D2 — Type and Schema Contracts](../../../design/D2-type-and-schema-contracts.md)
- [D4 — Integration Contracts](../../../design/D4-integration-contracts.md)
- [D8 — Obsidian Plugin Integration](../../../design/D8-obsidian-plugin-integration.md)
- [R3 — Obsidian Plugin API Surface for Quoin](../../../research/R3-obsidian-plugin-api-surface.md)
- [P20 — Plugin scaffold and settings](P20-plugin-scaffold-and-settings.md)

## Deliverables

- vault Markdown enumeration through `vault.getMarkdownFiles()`
- frontmatter access through `metadataCache.getFileCache(file).frontmatter`
- no-frontmatter normalization to `{}`
- Type Definition Document candidate discovery by `frontmatter[typeDeclarationKey] === 'type'`
- parser identity derivation:
  - `id = TFile.path`
  - `name = lowercase basename without extension`
- calls to `parseTypeDefinitionDocument(...)`
- successful type cache keyed by `id` and canonical `name`
- parse-failure diagnostics for broken type candidates
- canonical-name ambiguity tracking
- event handling for create, change, rename, and delete

Recommended dependencies for this phase:

- Obsidian public API
- existing Core parser utilities
- no new third-party runtime dependency

## Steps

1. Gate initial discovery on `workspace.onLayoutReady` and `metadataCache.on('resolved')`.
2. Enumerate `vault.getMarkdownFiles()` and sort by `TFile.path`.
3. Read Obsidian-parsed frontmatter from `metadataCache`.
4. Normalize `undefined` frontmatter to `{}`.
5. Classify Type Definition Document candidates by the configured type declaration key.
6. Read raw file contents only for discovered type candidates.
7. Derive `ObsidianTypeIdentity` from `TFile.path`.
8. Parse each candidate with Core's Type Definition parser and the configured parser config.
9. Store successful parsed types separately from parse failures.
10. Track duplicate canonical names as ambiguous rather than last-write-wins.
11. Update registry state on `metadataCache.on('changed')` for Type Definition Documents.
12. Update registry state on `vault.on('create' | 'rename' | 'delete')`.
13. On rename, remove the old `id`, re-index the new path, and invalidate validation state that referenced the old `id`.
14. Surface malformed or unavailable frontmatter as ingestion diagnostics without converting them into Core validation results.

## Acceptance Criteria

- Discovery is sentinel-based, not directory-based.
- Type Definition identity is vault-relative and deterministic.
- Duplicate canonical names remain visible and ambiguous.
- Broken Type Definition Documents are retained as diagnostics.
- Renames and deletes remove stale registry entries.
- Initial plugin load does not validate regular Documents.
- `npm run typecheck` succeeds.
