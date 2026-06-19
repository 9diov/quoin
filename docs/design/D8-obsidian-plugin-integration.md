---
_type: "[[design-doc]]"
status: "active"
terms: ["Core", "Document", "Integration", "Markdown Link", "Parser", "Referential Validation", "Reserved Property", "Resolver", "Scaffolding", "Body Generation", "Type Declaration", "Type Definition Document", "TypeRegistry", "Untyped Document", "Validation", "Validation Config", "Validation Result", "Wiki Link"]
---

# D8 — Obsidian Plugin Integration

> **Note:** [D9 — Doc Reference Format Separation](D9-doc-ref-format-separation.md) supersedes the Obsidian Resolver contract. The Resolver now accepts `{ value, format?, sourceDocumentPath }`. Wiki-link resolution continues to use the metadata cache. `markdown-link` resolution currently returns `unavailable` from the Obsidian Integration until reliable vault-path mapping is implemented.

## Overview

This document defines the Obsidian plugin Integration for Quoin.

It is the **primary user-facing Integration**:

- Obsidian vault as the Document universe
- live validation tied to the user's active file
- a dedicated sidebar view for vault-wide validation and Type Definition Document introspection
- a status bar indicator that surfaces per-file validation state at a glance
- a `create` flow exposed through the command palette and file-explorer context menus

It remains aligned with [D1 — Architecture](D1-architecture.md): Core stays pure, and the plugin owns discovery, ingestion, root type dispatch, lookup strategy, config, reporting, and writes.

It treats [D5 — Node CLI Integration](D5-node-cli-integration.md) as the reference Integration where reasonable, diverging only where Obsidian's interactive, host-native model demands it.

## Goals

V1 goals:

1. Discover and parse Type Definition Documents from the vault using Obsidian's `metadataCache`.
2. Validate the active Document live as the user edits its frontmatter.
3. Validate the entire vault on demand and surface results in a sidebar view.
4. Introspect the TypeRegistry — list discovered Type Definition Documents, parse failures, and canonical-name ambiguities — from the same sidebar view.
5. Create a new Document from a discovered Type Definition Document using Scaffolding and Body Generation.
6. Expose a status bar item that reflects the active file's validation state.

V1 surfaces:

- Status bar item
- Sidebar view (single `ItemView`, two tabs: *Validation* and *Types*)
- Command palette commands
- File-explorer context menus

## Non-goals

The Obsidian plugin v1 does not:

- repair or mutate existing authored Documents during validation (no `repair()` Core exists yet — see [ADR-0009](../adr/0009-scaffolding-is-creation-not-repair.md))
- apply defaults to existing Documents (Scaffolding runs only during `create`)
- offer inline editor decorations such as red squigglies on the offending frontmatter line
- offer a "Infer type from selection" command (see [D7](D7-type-inference-from-documents.md); deferred to a later doc)
- support Obsidian Mobile (the plugin's `manifest.json` declares `isDesktopOnly: true`)
- support multi-vault sessions beyond what Obsidian itself provides
- accept arbitrary caller-supplied frontmatter for `create`
- read or write outside the active vault

## Vault Model

The plugin is **vault-scoped**. Every plugin instance is bound to exactly one vault — the one Obsidian opened. All discovery, validation targets, resolver indexing, output paths, and Type Definition identities are interpreted relative to the vault root.

Obsidian plugin parser identity:

```typescript
type ObsidianTypeIdentity = {
  id: string   // TFile.path — vault-relative POSIX, e.g. "types/Skill.md"
  name: string // lowercase basename without extension, e.g. "skill"
}
```

Derivation rules:

- `id =` the `TFile.path` of the Type Definition Document — already vault-relative POSIX in Obsidian.
- `name =` lowercase basename without extension.

Aliases declared in a Type Definition Document's frontmatter (`aliases:`) do not extend the canonical type name space. The Resolver still honours aliases when resolving Wiki Link Properties (because `metadataCache` honours them), but `TypeRegistry.getByName(...)` looks up by canonical basename only. This matches D5's basename-only model and keeps Referential Validation comparison deterministic.

File renames are observable: when `vault.on('rename', file, oldPath)` fires, the plugin removes the Type Definition Document entry at `oldPath` from TypeRegistry and re-indexes under `file.path`. Cached validation results that referenced the old `id` are invalidated.

## Surfaces

### Status bar

The plugin registers one status bar item via `addStatusBarItem()`. It reflects the **active file's** validation state. States:

| Active file state | Indicator |
|---|---|
| No active file or active file is non-Markdown | Hidden |
| Untyped Document (no `_type` and no D6 binding) | Dimmed dot, hover "Untyped", click opens sidebar Validation tab |
| Type Definition Document | Distinct tag/gear icon, hover "Type definition: <name>", click opens sidebar Types tab |
| Regular Document, root type resolution failed (`not-found`, `ambiguous`, `invalid-declaration`) | ⚠ icon, hover reports the failure mode, click opens sidebar |
| Regular Document, validation has errors | ✗ icon with numeric suffix `✗ 3`, click opens sidebar scrolled to this file |
| Regular Document, no errors and >0 warnings | ✓ rendered amber, hover "Conforms with N warnings", click opens sidebar |
| Regular Document, no errors and no warnings | ✓ rendered green, hover shows type name |

The amber state means *conforms but with non-fatal issues* — Reserved Property collisions, missing required Sections, disallowed URL schemes, and similar Validation Warnings.

Per-type icons are a **future affordance**: once delivered, the indicator on a clean Document will render the type's icon instead of a generic ✓. v1 ships generic icons.

### Sidebar view

The plugin registers one `ItemView` with two internal tabs.

#### Validation tab

```
┌─ Quoin ───────────────────┐
│ [ Validation ] [ Types ]  │
├───────────────────────────┤
│  ▸ Current file           │
│    notes/Onboarding.md    │
│    ✓ Conforms to skill    │
│                           │
│  ▸ Vault-wide             │
│    [ Validate vault ▷ ]   │
│    (last run: never)      │
└───────────────────────────┘
```

- *Current file* always renders if a regular Markdown Document is active. Status mirrors the status bar; expanded view shows each Validation Error and Warning with the offending Property or Section.
- *Vault-wide* is empty until the user clicks **Validate vault**. The button triggers a non-blocking scan; progress and cancellation are surfaced inline. Subsequent runs replace previous results.

#### Types tab

```
┌─ Quoin ───────────────────┐
│ [ Validation ] [ Types ]  │
├───────────────────────────┤
│  ▸ Discovered types (12)  │
│    skill    types/Skill.md│
│    concept  types/…       │
│  ▸ Parse failures (1)     │
│    types/Broken.md        │
│  ▸ Ambiguous names        │
│    "skill" (2 candidates) │
└───────────────────────────┘
```

Clicking a type row opens the underlying Type Definition Document in the active leaf.

### Commands

- `Quoin: Create document of type…` — opens the type suggester for `create`.
- `Quoin: Validate active file` — re-runs validation immediately (bypasses debounce).
- `Quoin: Validate vault` — runs vault-wide validation and switches the sidebar to the Validation tab.
- `Quoin: Show types` — opens the sidebar Types tab.
- `Quoin: Open Quoin view` — opens the sidebar (default tab: Validation).

### File-explorer context menus

Registered via `workspace.on('file-menu', ...)`:

- On a **folder** in the explorer: `New Quoin document…` — opens the create flow prefilled to that folder.
- On a **Type Definition Document**: `New document of this type` — opens the create flow with the type preselected and the path prefilled to the active folder.

No ribbon icon is registered.

## Validation Triggers

| Event | Action |
|---|---|
| `workspace.onLayoutReady` + `metadataCache.on('resolved')` | Plugin activates; scans vault for `_type: type` candidates and populates TypeRegistry only. **Does not** validate any regular Documents at startup. |
| `workspace.on('active-leaf-change')` / `workspace.on('file-open')` | Validate the active file; update status bar and sidebar's *Current file* section. |
| `metadataCache.on('changed', file)` for the active file | Re-validate that file. Debounced — see `debounce.activeFile`. |
| `metadataCache.on('changed', file)` for a Type Definition Document | Re-parse it into TypeRegistry; eagerly re-validate any Documents that referenced the old parse. Debounced — see `debounce.typeDefCascade`. |
| `metadataCache.on('changed', file)` for a non-active Document already present in the *Vault-wide* sidebar list | Update its row. |
| `vault.on('create')` / `vault.on('rename')` / `vault.on('delete')` | Update TypeRegistry, Resolver indexes, and the sidebar Types tab. |
| Command `Quoin: Validate vault` | Validate every regular Document in the discovery universe; results populate the sidebar's *Vault-wide* section. |

The debounce values are configurable (see Settings). Defaults: 300 ms for active-file validation, 1500 ms for type-definition cascade. The longer cascade debounce is deliberate — a heavily-referenced Type Definition Document being edited should not retrigger N Document validations on every keystroke.

## Discovery and Ingestion

Discovery is vault-wide and read-only. The plugin treats every Markdown file Obsidian indexes as a candidate.

Pipeline (mirrors D5 conceptually, but delegates parsing to Obsidian):

1. Enumerate `vault.getMarkdownFiles()`.
2. Read frontmatter through `metadataCache.getFileCache(file).frontmatter`. Obsidian has already parsed it; the plugin does not re-parse YAML.
3. Treat any file whose `frontmatter[typeDeclarationKey] === 'type'` as a Type Definition Document candidate.
4. Pass candidate raw contents to `parseTypeDefinitionDocument(...)` with Integration-supplied `ObsidianTypeIdentity` and the configured `ParserConfig`.
5. Cache successful parses in TypeRegistry; keep parse failures visible in the sidebar Types tab.

A no-frontmatter Markdown file is a valid regular Document (`frontmatter = {}`, `body = full file contents`). Obsidian's cache exposes `frontmatter` as `undefined` in that case — the plugin normalizes to `{}` before handing the Document to Core.

Malformed frontmatter — the rare case where Obsidian's parser fails — is reported as an ingestion diagnostic in the sidebar, never as a Core validation result.

## Resolver

The plugin's Resolver wraps `metadataCache.getFirstLinkpathDest(linkpath, sourcePath)`.

Rationale:

- Fidelity. A Wiki Link `[[skill]]` in a Document resolves in Quoin to the same target Obsidian would resolve it to. No second mental model.
- Correctness for free. Obsidian handles shortest-path, aliases, case-insensitive match, and the user's *Files & Links → New link format* setting.
- Forward-compat. As Obsidian evolves its resolution behaviour, the plugin tracks it without code change.

This is a deliberate divergence from D4's sketched `ObsidianResolverOptions = { strategy: 'shortest-path' | 'full-path' | 'exact' }`. The plugin exposes no strategy setting in v1. See *Open ADR* below.

The Resolver factory closes over the source path for each validation pass. For Wiki Links inside a Type Definition Document's `## Schema` block (top-level Type References, `list<[[name]]>` items), the source path is the Type Definition Document itself — the natural Obsidian semantics for "this file references `[[skill]]`."

Result mapping to D4's `ResolveWikiLinkResult`:

- `getFirstLinkpathDest` returns a `TFile` → `found`.
- Returns `null` → `not-found`. The plugin does not surface `metadataCache.unresolvedLinks` separately in v1; missing is missing.
- Multiple files with the same basename → `ambiguous`. The plugin walks `metadataCache.getFileCache(...).links` and the file index to detect this conservatively.
- Plugin not yet ready (before `workspace.onLayoutReady`) → `unavailable`. The plugin gates activation on layout-ready to make this practically unreachable.

## TypeRegistry

The plugin supplies a TypeRegistry backed by successfully parsed Type Definition Documents.

Lookup rules:

- `getByName(typeName)` resolves by canonical `name` (lowercase basename without extension).
- `getByDeclaration(value)`:
  - accepts the bare literal `type` (used during Type Definition Document discovery).
  - accepts Wiki Links such as `[[Concept]]`; canonicalizes the link target into the same lowercase name space as `getByName`.

Duplicate canonical names remain discoverable but ambiguous:

- discovery retains all candidates.
- `getByName` returns `ambiguous`.
- `validate` reports `type-ambiguous` for affected target Documents.
- the sidebar Types tab surfaces the ambiguous canonical name and lists every candidate.

The plugin does not use last-write-wins behaviour.

## Reserved Properties

The plugin hardwires the Validation Config's `integration` to `'obsidian'`. There is no setting to change this. Reserved Properties (`tags`, `aliases`, `cssclasses`, `publish`) generate Validation Warnings when a Type Definition Document declares a schema entry under those keys, per [ADR-0001](../adr/0001-reserved-property-collision-is-a-warning.md).

Reserved Property warnings surface in the sidebar's *Current file* and *Vault-wide* sections like any other Validation Warning. The status bar shows amber ✓ when a Document has warnings without errors.

## Settings

Settings are persisted through `plugin.saveData(...)` (Obsidian's standard `data.json` mechanism, which syncs with the vault). Schema:

```typescript
type ObsidianPluginSettings = {
  typeDeclarationKey: string                  // default '_type'
  untypedDocumentBehavior: 'skip' | 'warn'    // default 'skip'
  referentialValidation: boolean              // default true — matches D5
  debounce: {
    activeFile: number                        // default 300 (ms)
    typeDefCascade: number                    // default 1500 (ms)
  }
  bindings: TypeBinding[]                     // D6 path-glob bindings; see below
}
```

The settings tab (`PluginSettingTab`) renders every knob flat — no Advanced disclosure in v1. The `integration: 'obsidian'` value is hardwired and not surfaced.

The plugin intentionally overrides Core's `referentialValidation` default of `false` and ships `true`, matching D5's policy.

Settings changes apply eagerly — bindings re-evaluate, the active file re-validates, and cascade re-validation runs subject to the configured debounce.

## Path-Glob Bindings (D6)

The plugin sources bindings only from its own settings, per D6. The settings tab renders a table editor:

```
Path-glob bindings (D6)
┌──────────┬────────────────────────┬────┬────┐
│ Type ▾   │ Match                  │    │    │
├──────────┼────────────────────────┼────┼────┤
│ skill ▾  │ skills/**/*.md         │ ↕  │ ×  │
│ concept ▾│ concepts/**/*.md       │ ↕  │ ×  │
└──────────┴────────────────────────┴────┴────┘
[ + Add binding ]
```

Editor behaviour:

- The Type column is a dropdown populated from TypeRegistry. Typos are impossible; deletion of a type leaves the binding with an unknown reference (handled below).
- Order is significant. The ↕ handle moves rows up and down; insertion order maps directly onto D6's "declaration order" semantics.
- Empty `match` → row blocked (red border), settings save disabled.
- Duplicate `(type, match)` pair → both rows highlighted red.
- A `match` whose normalized form escapes the vault root → red.
- A Type that is no longer registered (e.g., its Type Definition Document was deleted) → amber border, hover `Unknown type 'skill'`. Non-blocking: Obsidian is interactive and transient missing-type states are common during editing.

Bindings drive **Effective Type Declaration** computation in the plugin's root type dispatch path, per D6's resolution algorithm: frontmatter Type Declaration wins; otherwise the first binding match in declaration order; otherwise the Document is untyped.

## Create Flow

The flow:

1. User invokes a `create` entry point (command palette / folder context menu / Type Definition Document context menu).
2. **Discovery health gate.** If discovery has any unresolved diagnostics — ingestion failures, Type Definition Document parse failures, ambiguous canonical names — the create command aborts with a Notice pointing the user to the sidebar. This mirrors D5's strict gate; the plugin does not loosen it. The user must fix the registry before creating.
3. **Type selection.** Unless preselected from the right-click entry point, a fuzzy suggester (`FuzzySuggestModal`) lists every registered type by canonical name.
4. **Output path.** A single text input modal opens, prefilled with `<entry-point folder>/Untitled.md`. The user edits, presses Enter. If the path already exists, the modal stays open with an inline error.
5. **Plugin synthesizes the initial frontmatter**: just the configured Type Declaration key set to `[[<TypeDefinitionDocument basename>]]`.
6. The plugin calls `scaffold(frontmatter, typeDef)` and merges defaults.
7. The plugin calls `generateBody(typeDef)`.
8. The plugin builds a candidate `Document` and calls `validate(...)`.
9. **Errors abort** before any file is written. The plugin displays a Notice and surfaces the errors in the sidebar.
10. **Warnings do not block.** The plugin writes the file via `vault.create(path, contents)`, opens it in the active leaf, and places the cursor at the end of frontmatter.

If the selected type has no Body Block, the plugin writes a frontmatter-only file.

## Determinism

Observable plugin behaviour is deterministic in the same dimensions as D5:

- Stable normalized vault-relative POSIX paths everywhere (`TFile.path` already satisfies this).
- Stable lexical ordering of targets, diagnostics, and Types tab entries.
- Stable ambiguity behaviour — duplicate canonical names always report `ambiguous`.
- Stable write formatting in `create`.

The plugin may parallelize work internally; observable results must not depend on traversal order.

## Performance Budget

Stated targets (not enforced by automated tests in v1):

- **Startup TypeRegistry scan**: <200 ms on a 10k-file vault. Achieved by reading frontmatter from `metadataCache` rather than re-parsing files, and by filtering `getMarkdownFiles()` on the sentinel before any further work.
- **Active-file validation**: <50 ms cold, <10 ms warm. The active-file path runs synchronously after debounce.
- **Vault-wide validation**: no hard budget. The sidebar surfaces progress and supports cancellation.

If real-world numbers diverge, the debounce settings give power users an escape hatch.

## Future Work

- **Per-type icons** in the status bar and Types tab, declared in Type Definition Document frontmatter (e.g. an `icon:` Property).
- **Type usage counts** in the Types tab: clicking a type row expands a list of Documents conforming to that type.
- **Repair** command (`Quoin: Apply scaffolding to active file`, `Quoin: Insert missing required sections`) once Core's `repair()` lands — see [ADR-0009](../adr/0009-scaffolding-is-creation-not-repair.md).
- **Inline editor decorations** on offending frontmatter lines and missing required Sections.
- **Type inference** entry points per [D7](D7-type-inference-from-documents.md).
- **Mobile support** — requires reviewing the plugin's API surface against Obsidian Mobile's stricter runtime profile.

## Related ADR

[ADR-0010 — Obsidian Resolver wraps Obsidian's metadataCache](../adr/0010-obsidian-resolver-wraps-metadatacache.md) records the trade-off behind not implementing D4's sketched strategy enum, and the user-visible consequences (resolution depends on the user's *Files & Links → New link format* setting).

## Relationship to Existing Design Docs

- [D1 — Architecture](D1-architecture.md): the plugin is an Imperative Shell around the Core.
- [D2 — Type and Schema Contracts](D2-type-and-schema-contracts.md): the plugin consumes `Document`, `ParsedTypeDefinitionDocument`, Scaffolding, and Body Generation contracts.
- [D3 — Validation Semantics](D3-validation-semantics.md): the plugin owns root-type dispatch and reporting around Core validation.
- [D4 — Integration Contracts](D4-integration-contracts.md): the plugin provides the concrete Obsidian Resolver, TypeRegistry, parser identity, and discovery behaviour.
- [D5 — Node CLI Integration](D5-node-cli-integration.md): D5 is the reference Integration; D8 mirrors its structure and diverges only where Obsidian's interactive model requires.
- [D6 — Path-Glob Type Bindings](D6-path-glob-type-bindings.md): the plugin sources bindings from its settings and applies them during Effective Type Declaration computation.
- [D7 — Type Inference From Documents](D7-type-inference-from-documents.md): out of scope for v1; sketched as Future Work.
