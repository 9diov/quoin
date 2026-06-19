---
_type: "[[plan-doc]]"
status: "done"
terms: ["Document", "Type Definition Document", "Body Block", "Type Declaration", "Core", "Resolver", "TypeRegistry", "Integration", "Validation"]
---

# P25 — Create Flow And Context Menus

## Goal

Implement Obsidian-native document creation from discovered Type Definition Documents.

After this phase, the Obsidian plugin v1 should support all user-facing surfaces described by D8.

## Inputs

- [D2 — Type and Schema Contracts](../../../design/D2-type-and-schema-contracts.md)
- [D8 — Obsidian Plugin Integration](../../../design/D8-obsidian-plugin-integration.md)
- [P21 — Vault discovery and TypeRegistry](P21-vault-discovery-and-type-registry.md)
- [P22 — Obsidian Resolver and bindings](P22-obsidian-resolver-and-bindings.md)
- [P23 — Active-file validation and status bar](P23-active-file-validation-and-status-bar.md)
- [P24 — Sidebar validation and types view](P24-sidebar-validation-and-types-view.md)

## Deliverables

- command implementation for `Quoin: Create document of type...`
- fuzzy type picker backed by the clean TypeRegistry
- output path modal with inline validation
- file-explorer folder context menu entry:
  - `New Quoin document...`
- Type Definition Document context menu entry:
  - `New document of this type`
- discovery-health gate before writes
- scaffold, template, validate, and write sequence
- post-write file open and cursor placement

Recommended dependencies for this phase:

- Obsidian `FuzzySuggestModal`, `Modal`, `Notice`, and vault APIs
- existing Core `scaffold(...)`, `generateBody(...)`, and `validate(...)`
- existing `yaml` dependency or existing deterministic frontmatter emission helper if one is available

## Create Flow

Implement the D8 flow exactly:

1. User invokes create from command palette or file explorer.
2. Abort with a `Notice` if discovery health has unresolved ingestion failures, type parse failures, or ambiguous canonical names.
3. Select type through a fuzzy suggester unless the context menu preselected it.
4. Prompt for output path, prefilled with `<entry-point folder>/Untitled.md`.
5. Keep the modal open on existing path, out-of-vault path, non-Markdown path, or invalid path errors.
6. Synthesize initial frontmatter with only the configured Type Declaration key set to `[[<TypeDefinitionDocument basename>]]`.
7. Call `scaffold(frontmatter, typeDef)` and merge defaults.
8. Call `generateBody(typeDef)`.
9. Build a candidate `Document` and call `validate(...)`.
10. Abort before write on validation errors and surface the errors in the sidebar.
11. Write on warnings, then open the new file in the active leaf.
12. Place the cursor at the end of frontmatter.

If the selected type has no Body Block, write a frontmatter-only file.

## Steps

1. Implement discovery health evaluation over registry, parse failures, ambiguous names, and ingestion diagnostics.
2. Implement type picker items from uniquely registered types.
3. Implement command palette create flow with no preselected folder or type.
4. Implement folder context menu flow with folder-prefilled output path.
5. Implement Type Definition Document context menu flow with type preselected and output path prefilled to the active folder.
6. Validate output paths as vault-relative Markdown paths and reject overwrites.
7. Serialize frontmatter deterministically.
8. Run pre-write validation with the same Obsidian Resolver and TypeRegistry semantics as normal validation.
9. Record pre-write validation errors in sidebar state before showing the abort Notice.
10. Write through `vault.create(path, contents)` only after all gates pass.
11. Open the created file in the active leaf and place the cursor after frontmatter.
12. Add tests for create flow state and path validation where practical; manually verify Obsidian modal and menu behaviour.

## Acceptance Criteria

- Create never writes when discovery health is dirty.
- Create never overwrites an existing file.
- Create never writes outside the active vault.
- Validation errors abort before any file is written.
- Validation warnings do not block the write.
- Frontmatter-only output works for types without Body Blocks.
- Context menus appear only for supported folder and Type Definition Document targets.
- `npm run typecheck` succeeds.
