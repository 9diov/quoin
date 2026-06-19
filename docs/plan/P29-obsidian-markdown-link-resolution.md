---
_type: "[[plan-doc]]"
status: "done"
terms: ["Document", "Doc Reference", "Markdown Link", "Section", "Link Resolution", "Core", "Parser", "Resolver", "Integration", "Validation"]
---

# P29 — Obsidian Markdown-Link Resolution

## Goal

Implement `markdown-link` resolution inside the Obsidian Integration so the
`unavailable` stub left by [P28](P28-doc-reference-format-separation.md) is
gone, matching the resolver contract introduced by
[D9 — Doc Reference Format Separation](../design/D9-doc-ref-format-separation.md).

After this phase:

- The Obsidian resolver's `markdown-link` branch returns `found` /
  `not-found` / `invalid-link` results, not `unavailable`.
- Resolution defers to Obsidian's own link-resolution mechanism so users see
  the same target for `[X](path)` in Quoin diagnostics as Obsidian shows in
  the editor, link panel, and graph view.

## Inputs

- [D9 — Doc Reference Format Separation](../design/D9-doc-ref-format-separation.md)
  — runtime grammar and resolver contract.
- [P28 — Doc Reference Format Separation](P28-doc-reference-format-separation.md)
  — Node CLI's markdown-link implementation.
- [D8 — Obsidian Plugin Integration](../design/D8-obsidian-plugin-integration.md)
  — current Obsidian integration shape.

## Current State

`src/integration/obsidian/lookup.ts` returns `unavailable` for every
`markdown-link` input:

```typescript
const resolveMarkdownLink = (input) => ({
  kind: 'unavailable',
  value: input.value,
  format: 'markdown-link',
  reason: 'markdown-link resolution is not supported in the Obsidian integration',
});
```

The Obsidian `wiki-link` branch already routes through
`app.metadataCache.getFirstLinkpathDest(linkpath, sourcePath)`, so the
mechanism we need for markdown-link is already wired into the Integration.

## Decision

Delegate markdown-link resolution to Obsidian's own internal-link resolver,
not to a hand-rolled vault-path normalizer.

Obsidian's `app.metadataCache.getFirstLinkpathDest(linkpath, sourcePath)` is
the same resolver Obsidian uses for editor link previews, link suggestions,
and the graph. It already understands the user's "New link format" setting,
relative paths, root-relative paths, and shortest-path matching, and it
applies them consistently with what the user sees in the Obsidian UI.

### Why defer rather than reimplement

Considered alternative: hand-rolled vault-path resolution via
`app.vault.getAbstractFileByPath(normalizedPath)` after manually normalizing
`./`, `../`, and `/` segments against `sourceDocumentPath`. That mirrors the
Node CLI's strict path-precise behavior.

Rejected because:

- A markdown-link that resolves in the Obsidian editor but fails Quoin
  validation (or the reverse) would be a confusing inconsistency. The user
  has one mental model of "where this link points"; Quoin should match it.
- Obsidian already encodes the user's link-format preferences. Reimplementing
  resolution would silently diverge from those preferences.
- Maintenance: when Obsidian updates resolution rules, the Integration tracks
  automatically.

Cost accepted: behavioral asymmetry between Node CLI (strict path resolution)
and Obsidian (Obsidian-shaped resolution). This is a deliberate trade — each
Integration matches its host environment's user-facing semantics.

### Algorithm

1. Parse the runtime value with `parseMarkdownLink(value)` from
   `src/core/link-grammar.ts`. The Core grammar already rejects
   protocol-qualified targets at shape validation, so the resolver only sees
   internal targets.
2. Strip the URL fragment (`#section`) from `parts.target`. Resolution
   operates on the Document; the fragment carries no meaning for target
   identity.
3. Percent-decode the stripped target. Markdown link targets are URI-encoded
   by convention; Obsidian's resolver expects decoded paths.
4. Pass the decoded target to
   `app.metadataCache.getFirstLinkpathDest(target, input.sourceDocumentPath)`.
5. Map the result:
   - `TFile` with extension `md` → `found` (build the `Document` via
     `documentFromFileCache(app, file)`).
   - `TFile` with non-`md` extension → `not-found` (Quoin operates on Markdown
     Documents only).
   - `null` → `not-found`.

Do not return `ambiguous` for markdown-link. Obsidian's resolver returns at
most one destination per source; ambiguity is not part of its result model.

## Non-goals

- Reference-style Markdown links, autolinks, protocol-qualified links.
- Obsidian-specific schemes such as `obsidian://`.
- Strict path-precise behavior matching the Node CLI. P29 is explicit that
  Obsidian resolution follows Obsidian semantics.
- Changes to wiki-link resolution.

## Public Contract Changes

None at the Core or Integration boundary. The `Resolver` and
`ResolveDocReferenceInput` / `ResolveDocReferenceResult` shapes from D9 / P28
are already in place; P29 only fills in a branch that currently returns
`unavailable`.

## Code Changes

Touch points:

```text
src/integration/obsidian/lookup.ts
test/integration/obsidian/lookup.test.ts
```

Required changes in `lookup.ts`:

- Replace the `resolveMarkdownLink` stub with the implementation outlined
  above. The body should be small — most logic lives inside Obsidian's
  resolver.
- Reuse the existing `documentFromFileCache` for `Document` construction.
- Update the in-code comment to describe the delegation, not the deferral.

Required changes in `active-validation.ts` and `create-flow.ts`:

- None. They already construct the resolver without a `sourcePath`
  parameter; source paths flow through validation per call.

## Tests

Add coverage to `test/integration/obsidian/lookup.test.ts`:

- markdown-link target that the fake `getFirstLinkpathDest` resolves returns
  `found` with the destination's path
- markdown-link target the fake resolves to `null` returns `not-found`
- fragments are stripped before delegating (assert the linkpath passed to
  `getFirstLinkpathDest` carries no `#…`)
- percent-encoded targets are decoded before delegating
- regression: wiki-link branch still uses
  `metadataCache.getFirstLinkpathDest` with the wiki-link target

Extend `FakeApp` with the minimum API surface the implementation depends on:

- `metadataCache.getFirstLinkpathDest` already exists in the fake and works
  for the wiki-link branch; the same fake covers markdown-link with no
  additional API.
- Optional: a richer `__resolve` helper that records the `linkpath` argument
  so the fragment-stripping and percent-decoding tests can assert on it.

## Fixtures

Extend an Obsidian-style fixture vault to host mixed-format references:

- a documentation Document that uses
  `[Label](sources/example.md)` against a sibling target.
- a Document that links to a parent-relative target
  (`[Glossary](../shared/glossary.md)`).
- continued wiki-link coverage to prove the two formats coexist in one vault.

Prefer extending an existing fixture vault over inventing a new one, unless
existing fixtures encode assumptions that would be disturbed.

## Implementation Order

1. Replace the `resolveMarkdownLink` stub with the delegating implementation.
2. Add fake-vault tests for `found`, `not-found`, fragment stripping, and
   percent decoding.
3. Add a mixed-format Obsidian fixture and reference it from existing
   integration tests if relevant.
4. Update the `resolveMarkdownLink` code comment to describe the delegation
   strategy (it should no longer point at this plan as a deferral).

## Exit Criteria

P29 is complete when:

- The Obsidian Integration's `markdown-link` branch never returns
  `unavailable` for well-formed input.
- Resolution delegates to `app.metadataCache.getFirstLinkpathDest`, with
  fragment stripping and percent decoding handled before the call.
- Tests cover `found`, `not-found`, fragment stripping, and percent decoding.
- At least one Obsidian fixture vault contains both wiki-link and
  markdown-link references that validate successfully.
- The in-code comment in `resolveMarkdownLink` describes the delegation, not
  the deferral.

## Follow-on

After P29, the remaining D9 / P28 follow-ons stand:

- remove the temporary `type: wiki-link` parser alias.
- decide whether to rename resolution diagnostics from `...wiki-link` to
  format-neutral names.
- decide whether to support an Integration-defined extension for
  protocol-qualified Document references (e.g. `obsidian://`).
