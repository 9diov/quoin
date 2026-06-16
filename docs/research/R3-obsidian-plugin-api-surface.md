# R3 — Obsidian Plugin API Surface for Quoin

## Goal

Validate the Obsidian API assumptions baked into [D8 — Obsidian Plugin Integration](../design/D8-obsidian-plugin-integration.md) and [ADR-0010](../adr/0010-obsidian-resolver-wraps-metadatacache.md) before implementation begins, so that load-bearing decisions either stand on verified ground or are revised while they are still cheap to change.

The doc serves two audiences:

1. The implementer of the plugin, who needs a concrete inventory of the APIs Quoin will consume, the patterns existing plugins use for similar surfaces, and the fallbacks for any API that does not behave as D8 assumes.
2. Reviewers of D8 and ADR-0010, who should be able to trace each design claim to either a confirmed API guarantee or an open question marked for verification.

## Scope

In scope:

- The Obsidian APIs explicitly named in D8.
- Behaviour and timing guarantees of `metadataCache`, `vault`, and `workspace` events relevant to validation triggers and discovery freshness.
- Patterns drawn from reference plugins for the UI surfaces D8 introduces (status bar item, tabbed sidebar view, reorderable settings table, fuzzy suggester + path modal flow).
- A minimum Obsidian version that supports the assumed surface.

Out of scope:

- Mobile API differences. v1 of the plugin is `isDesktopOnly: true`; mobile is Future Work.
- Theming, CSS variables, and visual polish.
- Plugin distribution (community plugin store, BRAT) — separate concern.
- Internationalization of plugin UI strings.

## Method

For each API surface D8 names, R3 records:

- **Claim**: what D8 assumes.
- **Status**: `confirmed` (commonly used pattern), `likely` (consistent with public docs but worth verifying against the current `obsidian.d.ts`), or `unknown` (needs explicit empirical check).
- **Fallback**: what the plugin does if the claim turns out to be wrong.

Verification against the current public `obsidian.d.ts` (https://github.com/obsidianmd/obsidian-api) is left to the implementer; this doc establishes the shape of the questions and the disposition of each, not a live test run.

## API Inventory

### 1. Link resolution — `metadataCache.getFirstLinkpathDest`

**Claim (D8, ADR-0010).** `metadataCache.getFirstLinkpathDest(linkpath: string, sourcePath: string): TFile | null` resolves a Wiki Link target the same way Obsidian itself does — honouring shortest-path resolution, frontmatter `aliases:`, case-insensitive match, and the user's *Files & Links → New link format* setting.

**Status.** `likely`. This API is the canonical resolution entry point used by Dataview, Templater, Linter, MetaBind, and most plugins that consume the link graph. Its behaviour is governed by Obsidian's link-format preferences and is therefore user-configurable — that is precisely the property ADR-0010 leans on.

**Fallback.** If `getFirstLinkpathDest` does not in fact honour aliases or the user's link-format preference in all cases, the plugin would either supplement with manual fallbacks (walk `metadataCache.getCache(...).frontmatter.aliases`) or revert to D4's strategy enum. Both are recoverable without redesigning the Resolver interface — `Resolver` remains a one-liner from Core's perspective.

### 2. Ambiguity detection

**Claim (D8).** The Resolver returns `ambiguous` when multiple files share the same basename. The plugin "walks `metadataCache.getFileCache(...).links` and the file index to detect this conservatively."

**Status.** `unknown`. There is no public `getAllLinkpathDests` API in current Obsidian; an internal equivalent has existed historically but was not promoted to the stable surface. The plugin must implement ambiguity detection itself.

**Concrete approach to verify.** Two viable strategies:

- **Basename index.** At startup and on `vault.on('create' | 'rename' | 'delete')`, build a `Map<basenameLowercase, TFile[]>` covering every Markdown file in the vault. When resolving `[[X]]`, look up `getFirstLinkpathDest(X, source)`; if the result is non-null *and* the basename index has more than one entry for `X`, return `ambiguous` rather than `found`. This stays conservative even when `getFirstLinkpathDest`'s first-match policy would have silently picked a winner.
- **Compare against `metadataCache.unresolvedLinks` / `resolvedLinks`.** These maps report the link graph but do not distinguish ambiguous from unique resolution; insufficient on their own.

Strategy 1 is the documented plan. It is O(N) at index time and O(1) per resolution.

**Fallback.** If the basename index proves too memory-hungry at very-large-vault scale (>50k files), defer construction until first ambiguity-relevant validation and cache lazily. Not a v1 concern.

### 3. Frontmatter access — `metadataCache.getFileCache(file).frontmatter`

**Claim (D8).** Obsidian has already parsed the frontmatter for every Markdown file; the plugin reads it directly from `metadataCache` rather than re-parsing YAML.

**Status.** `confirmed`. The `CachedMetadata.frontmatter` field is publicly documented and is the standard consumption pattern.

**Open question.** What does Obsidian return for malformed YAML? Three plausible behaviours, listed in increasing severity:

1. `frontmatter` is `undefined` and `metadataCache.on('changed')` does not fire successfully.
2. `frontmatter` is a partial object covering whichever keys parsed cleanly.
3. Obsidian throws or logs to console and the file becomes invisible to `metadataCache` consumers.

The plugin must handle whichever behaviour is real. The defensive position is to treat absent or partial frontmatter as if the file were untyped, surface an ingestion diagnostic in the sidebar Types tab, and avoid blocking unrelated validation.

**Fallback.** If Obsidian's parsed frontmatter proves unreliable on edge cases (e.g., YAML with embedded tabs), the plugin can re-parse the file's first frontmatter block itself using the same YAML library Quoin's Core depends on. This is the more expensive path; avoid unless needed.

### 4. Cache change events — `metadataCache.on('changed' | 'resolved')`

**Claim (D8).** The plugin debounces active-file revalidation on `metadataCache.on('changed', file, data, cache)`. Cascade revalidation (when a Type Definition Document changes) also keys off this event.

**Status.** `likely`. `changed` is the standard signal. The granularity question is the live one: does `changed` fire on body-only edits, or only when the cached structure (links, headings, frontmatter, tags) actually changes?

**Why it matters.** D8 sets `debounce.activeFile = 300ms`. If `changed` fires on every keystroke-grouped save, 300ms is a reasonable debounce window. If `changed` fires only when structural metadata changes, debouncing is mostly a no-op and validation is naturally event-sparse — the cascade cost concern shrinks.

**Verification path for the implementer.**

- Open a Document. Edit only its body. Observe whether `changed` fires.
- Edit its frontmatter. Observe whether `changed` fires with each save.
- Compare timing of `changed` against `vault.on('modify')` to understand the ordering Obsidian uses.

**Fallback.** If `changed` proves too noisy, the plugin can hash the `frontmatter` and `headings` portions of the new cache against the previous cache and short-circuit when nothing structurally changed.

### 5. Startup gating — `workspace.onLayoutReady` and `metadataCache.on('resolved')`

**Claim (D8).** The plugin activates after `workspace.onLayoutReady` and `metadataCache.on('resolved')` so the `unavailable` Resolver result is practically unreachable.

**Status.** `confirmed`. Both events are standard. `onLayoutReady` fires when the UI tree is ready; `resolved` fires once the link graph is fully indexed.

**Note.** `metadataCache.on('resolved')` fires *once* per session in current Obsidian, then `changed` takes over for incremental updates. The plugin should treat `resolved` as a one-shot activation signal, not a polling source.

### 6. Vault events — `vault.on('create' | 'modify' | 'rename' | 'delete')`

**Claim (D8).** The plugin updates TypeRegistry and Resolver indexes on these events. Renames update the Type Definition Document's `id` and `name`.

**Status.** `confirmed` API; `likely` on timing.

**Open question.** Does `vault.on('rename', file, oldPath)` fire *before* or *after* Obsidian's internal link-updater rewrites references in other Documents? The plugin relies on Obsidian rewriting `[[OldName]] → [[NewName]]` and on the plugin's basename index reflecting the new state by the time validation re-runs.

**Verification path.** Rename a Type Definition Document. Immediately after the rename event fires, inspect a Document that referenced the old name. If `metadataCache.getFileCache(referencing).frontmatter._type` still says `[[OldName]]`, the link-updater runs separately and the cascade debounce must be long enough to let it complete. D8's 1500ms cascade debounce is intentionally generous for this reason — it should absorb the link-updater latency.

**Fallback.** If the link-updater is meaningfully slower than 1.5s for large vaults, increase `debounce.typeDefCascade` default or trigger cascade revalidation off a second event (`metadataCache.on('changed')` on the referencing files) rather than off the rename itself.

### 7. Status bar — `addStatusBarItem`

**Claim (D8).** `addStatusBarItem()` returns an element on which the plugin sets text, an icon, a hover tooltip, and a click handler.

**Status.** `confirmed`. The API returns an `HTMLElement`; the plugin manipulates it with `setText`, class assignments, `addEventListener('click', …)`, and either `setAttribute('aria-label', …)` or Obsidian's `setTooltip(el, text)` utility for hover.

**Pattern from reference plugins.** Linter, Word Count, and Editing Toolbar all install status bar items with icon + numeric badge. The pattern is:

```typescript
const el = this.addStatusBarItem()
el.addClass('quoin-status')
setIcon(el, 'check-circle')           // Obsidian's setIcon helper
el.createSpan({ text: ' 3', cls: 'quoin-count' })
setTooltip(el, 'Conforms to skill')
el.onclick = () => this.openSidebar()
```

`setIcon` accepts Lucide icon names. Quoin's tri-state mapping (`check-circle` for green/amber, `x-circle` for red, `alert-triangle` for resolution failures, `circle` for dimmed untyped) is straightforward.

**Fallback.** If a status bar entry cannot natively show an icon, fall back to a unicode glyph (`✓ ✗ ⚠ ·`) plus a coloured CSS class.

### 8. Sidebar view with tabs — `ItemView`

**Claim (D8).** A single `ItemView` registered via `registerView(VIEW_TYPE_QUOIN, ...)` hosts two internal tabs (*Validation* and *Types*).

**Status.** `confirmed` (ItemView), `likely` (tab pattern). Obsidian has no native tab primitive inside an `ItemView`; plugins synthesize tabs from raw DOM.

**Pattern from reference plugins.**

- **Templater**'s settings panel renders a tab-like row of buttons that swap the visible section.
- **Dataview**'s query view is single-section but uses a similar header pattern.
- **Outline**'s view uses a single tree, no tabs.

The Quoin pattern:

```typescript
class QuoinView extends ItemView {
  getViewType() { return VIEW_TYPE_QUOIN }
  getDisplayText() { return 'Quoin' }
  getIcon() { return 'check-square' }

  async onOpen() {
    const tabs = this.contentEl.createDiv({ cls: 'quoin-tabs' })
    const validationBtn = tabs.createEl('button', { text: 'Validation' })
    const typesBtn = tabs.createEl('button', { text: 'Types' })
    const body = this.contentEl.createDiv({ cls: 'quoin-tab-body' })
    // swap body on click
  }
}
```

Persistence of the active tab across sessions is optional; v1 can default to *Validation* on every open. The status-bar click handler can specify a target tab.

### 9. Settings panel — `PluginSettingTab` with a reorderable table

**Claim (D8).** The settings panel renders a reorderable table of `{ type, match }` bindings with up/down/delete buttons and a type dropdown populated from the live TypeRegistry.

**Status.** `confirmed` API surface (`PluginSettingTab`, `Setting`, `DropdownComponent`, `TextComponent`), `likely` viable as a UX pattern. The `Setting` builder is row-oriented and serves rows well; reorder buttons are manually rendered.

**Pattern from reference plugins.**

- **Templater** lists user templates with delete buttons and reorder controls — closest analog.
- **Hotkeys for specific files** (community plugin) has add/remove rows with per-row dropdowns.
- **Style Settings** uses heavy custom DOM inside the settings tab — proves arbitrary UI is possible if needed.

The standard pattern for a reorderable list:

```typescript
this.plugin.settings.bindings.forEach((binding, index) => {
  new Setting(container)
    .addDropdown(d => d
      .addOptions(typeRegistryNames)
      .setValue(binding.type)
      .onChange(value => { binding.type = value; this.save() }))
    .addText(t => t
      .setValue(binding.match)
      .onChange(value => { binding.match = value; this.save() }))
    .addExtraButton(b => b
      .setIcon('arrow-up')
      .setDisabled(index === 0)
      .onClick(() => this.move(index, -1)))
    .addExtraButton(b => b
      .setIcon('arrow-down')
      .setDisabled(index === last)
      .onClick(() => this.move(index, +1)))
    .addExtraButton(b => b
      .setIcon('trash')
      .onClick(() => this.remove(index)))
})
```

Type-dropdown freshness depends on the panel listening for `metadataCache.on('changed')` on Type Definition Documents and re-rendering. Acceptable to skip in v1 — the panel can be closed and reopened to pick up new types.

**Fallback.** If reorder buttons feel clunky, fall back to a drag handle using HTML5 drag-and-drop. v1 ships with buttons.

### 10. Type selection — `FuzzySuggestModal`

**Claim (D8).** The create flow opens a fuzzy suggester listing every registered type.

**Status.** `confirmed`. `FuzzySuggestModal<T>` is the canonical type picker. Used by Templater (template selection), QuickAdd (action selection), Dataview (none — non-modal), and the core Switcher.

Pattern:

```typescript
class TypePicker extends FuzzySuggestModal<RegisteredType> {
  getItems() { return this.registry.allClean() }
  getItemText(t: RegisteredType) { return t.name }
  onChooseItem(t: RegisteredType) { this.next(t) }
}
```

### 11. Output path input — `Modal`

**Claim (D8).** A single-text-input modal opens with `<entry-folder>/Untitled.md` prefilled; the user edits and presses Enter to confirm.

**Status.** `confirmed`. `Modal` is the standard base class. A text input + two buttons is unremarkable.

**Note.** Obsidian provides no path autocomplete primitive comparable to its native file switcher. v1 can ship plain text input; folder autocomplete is Future Work.

### 12. Context menus — `workspace.on('file-menu')`

**Claim (D8).** The plugin registers entries on folder and file context menus. Folders get *New Quoin document…*; Type Definition Documents get *New document of this type*.

**Status.** `confirmed`. `workspace.on('file-menu', (menu, file, source) => ...)` fires for both files and folders. `file instanceof TFolder` distinguishes a folder; `file instanceof TFile` distinguishes a file. `workspace.on('files-menu', ...)` fires for multi-selection.

For Type Definition Document detection inside the handler, the plugin checks its own TypeRegistry rather than re-parsing — a constant-time lookup keyed on `TFile.path`.

### 13. Plugin manifest — `isDesktopOnly`

**Claim (D8).** The plugin's `manifest.json` declares `isDesktopOnly: true`.

**Status.** `confirmed`. Standard manifest field; Obsidian Mobile filters such plugins out of the install flow.

## Reference Plugin Survey

For each pattern Quoin will adopt, at least one reference plugin solves a similar problem:

| Pattern | Closest reference | What to study |
|---|---|---|
| Reactive validation on `metadataCache.changed` | Linter | event subscription, debounce, ignore-list |
| Status bar with icon + count | Linter, Word Count | icon rendering, tooltip, click-to-open-panel |
| Tabbed `ItemView` body | Templater settings, custom community views | DOM-based tab implementation |
| Reorderable settings list | Templater (templates), Hotkeys-for-specific-files | per-row Setting, reorder buttons |
| Type picker via FuzzySuggestModal | Templater (template picker) | item shape, onChooseItem semantics |
| `vault.create` + open in active leaf | QuickAdd, Templater | post-create leaf placement |
| Basename index for ambiguity | Dataview's indexer (advisory) | scope and update strategy |

None of these plugins exactly mirrors Quoin's combination of frontmatter-driven type system + Markdown-authored schemas + cross-document referential validation. The novelty is in the Core; the Integration uses unsurprising Obsidian patterns.

## Risk Register

Ordered by impact:

1. **Ambiguity detection without a public API** *(§2).* Highest risk. Mitigated by a basename index. The basename index is the only meaningful new data structure the plugin owns.
2. **`metadataCache.on('changed')` granularity** *(§4).* Medium risk. Mitigated by hash-based short-circuiting if the event proves too noisy.
3. **Rename event ordering vs link-updater** *(§6).* Medium risk. Mitigated by the long cascade debounce (1.5s). If the link-updater takes longer than 1.5s on real vaults, the default may need to rise to 3s.
4. **Malformed frontmatter handling** *(§3).* Low-to-medium risk. Mitigated by defensive treatment + ingestion diagnostic.
5. **`getFirstLinkpathDest` honouring user link-format settings** *(§1).* Low risk if the documented behaviour holds; a fallback to a strategy enum is recoverable.
6. **Performance at 10k+ files** *(D8 budget).* Unknown until benchmarked. The 200ms startup budget is a target, not a guarantee.

## Recommendations Back Into D8

If R3's verification phase confirms the assumptions above, D8 stands as written. The plausible adjustments are:

- **Spell out the basename index** in D8's TypeRegistry section as a concrete data structure, not just a behaviour.
- **Add a verification appendix** to D8 once the implementer has confirmed each `likely`/`unknown` claim against `obsidian.d.ts` and live behaviour.
- **Soften the performance budget** language from targets to "initial targets, to be confirmed once benchmarked." The current D8 wording is already cautious; this is a minor edit if needed.
- **Document the rename-vs-cascade-debounce relationship** in D8's Triggers section. The 1.5s default has a specific reason — making that reason visible helps future tuning.

## Minimum Obsidian Version

Pending verification. All APIs referenced are stable surface from Obsidian 1.0+. The implementer should pin the `minAppVersion` in `manifest.json` to the lowest version that exposes `setIcon`, `setTooltip`, and `addExtraButton` — likely 1.1 or 1.2, both several years old by 2026.

## Open Questions for Implementation

1. Does `metadataCache.on('changed')` fire on body-only edits in current Obsidian?
2. Does `vault.on('rename')` fire before or after Obsidian's link-updater completes?
3. What does `getFileCache(file).frontmatter` return for malformed YAML?
4. Is there any newer public API for "list all link resolution candidates," or does the basename index remain the standard approach?
5. What is the real startup cost of `metadataCache.getCache(file).frontmatter` reads over `vault.getMarkdownFiles()` on a 10k-file vault?

Answers will land in a follow-up note or as an appendix to this doc once the implementer runs the experiments.
