# P22 — Obsidian Resolver And Bindings

## Goal

Build the Obsidian lookup layer required by validation, Types UI, and create flow.

After this phase, the plugin should be able to:

- resolve Wiki Links through Obsidian's own semantics
- conservatively detect ambiguous basename matches
- resolve type declarations through the TypeRegistry
- compute Effective Type Declarations from frontmatter plus D6 bindings

## Inputs

- [D4 — Integration Contracts](../../../design/D4-integration-contracts.md)
- [D6 — Path-Glob Type Bindings](../../../design/D6-path-glob-type-bindings.md)
- [D8 — Obsidian Plugin Integration](../../../design/D8-obsidian-plugin-integration.md)
- [ADR-0010 — Obsidian Resolver wraps Obsidian's metadataCache](../../../adr/0010-obsidian-resolver-wraps-metadatacache.md)
- [R3 — Obsidian Plugin API Surface for Quoin](../../../research/R3-obsidian-plugin-api-surface.md)
- [P21 — Vault discovery and TypeRegistry](P21-vault-discovery-and-type-registry.md)

## Deliverables

- Resolver factory that closes over each validation source path
- Resolver implementation backed by `metadataCache.getFirstLinkpathDest(linkpath, sourcePath)`
- basename ambiguity index over Markdown files in the vault
- TypeRegistry lookups for:
  - `getByName(typeName)`
  - `getByDeclaration(value)`
- binding validation and normalization in settings
- binding-aware Effective Type Declaration helper
- event updates for basename index and binding-dependent validation invalidation

Recommended dependencies for this phase:

- existing `micromatch` dependency for glob matching
- no new Resolver strategy package

## Lookup Rules

Resolver mapping:

- `getFirstLinkpathDest(...)` returns a `TFile` and basename index has one matching candidate -> `found`
- no destination -> `not-found`
- basename index has multiple matching candidates -> `ambiguous`
- metadata cache not ready -> `unavailable`

TypeRegistry rules:

- `getByName(typeName)` resolves by canonical lowercase basename.
- `getByDeclaration('type')` identifies Type Definition Document discovery.
- `getByDeclaration('[[Concept]]')` resolves through Obsidian link canonicalization into the same canonical name space.
- Duplicate canonical names produce `ambiguous`.

Binding dispatch rules:

1. Frontmatter Type Declaration wins when the configured key is present.
2. Otherwise collect matching path-glob bindings in declaration order.
3. Zero matches -> untyped.
4. One match -> binding-selected type.
5. Multiple matches for the same type -> first matching binding wins.
6. Multiple matches for different types -> ambiguous binding.
7. Type Definition Documents are excluded from binding dispatch.

## Steps

1. Build and maintain a lowercase basename index over `vault.getMarkdownFiles()`.
2. Update the index on vault create, rename, and delete events.
3. Implement a Resolver factory that receives the source `TFile.path`.
4. Delegate link resolution to `metadataCache.getFirstLinkpathDest(...)`.
5. Layer conservative basename ambiguity detection on top of Obsidian's selected destination.
6. Implement TypeRegistry lookup result variants for found, not found, ambiguous, and unavailable.
7. Validate binding settings:
   - `type` is non-empty and canonical
   - `match` is non-empty
   - duplicate `(type, match)` rows are blocking
   - matches cannot escape the vault root after normalization
   - unknown types are non-blocking warnings in the interactive settings UI
8. Implement the Effective Type Declaration helper used by validation.
9. Invalidate affected active-file and vault-wide validation state when bindings or lookup indexes change.

## Acceptance Criteria

- Link resolution follows Obsidian's user-visible resolution behaviour.
- Ambiguous basenames produce `ambiguous` rather than silently choosing Obsidian's first match.
- Aliases are honoured through Obsidian's metadata cache.
- Frontmatter Type Declarations override path-glob bindings.
- Ambiguous binding outcomes skip Core validation.
- Type Definition Documents are never typed by path-glob bindings.
- `npm run typecheck` succeeds.
