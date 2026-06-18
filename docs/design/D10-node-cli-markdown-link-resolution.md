---
_type: "[[design-doc]]"
status: "draft"
---

# D10 — Node CLI Markdown-Link Resolution

## Problem

[D9](D9-doc-ref-format-separation.md) introduces `markdown-link` as a
supported `doc-ref` format. Each Integration owns target interpretation:

- The Obsidian Integration delegates to `app.metadataCache.getFirstLinkpathDest`,
  matching the editor's own resolution behavior so Quoin diagnostics agree
  with what users see in Obsidian's UI (see
  [P29](../plan/P29-obsidian-markdown-link-resolution.md)).
- The Node CLI resolves `markdown-link` strictly: targets are normalized
  against `sourceDocumentPath`, leading `/` is treated as project-root, and a
  lookup against the in-project path map either succeeds or returns
  `not-found`. It already strips fragments and percent-decodes targets before
  path lookup.

That asymmetry is intentional — each Integration matches its host
environment. But it creates a concrete problem for users whose vault is
**both** edited in Obsidian and validated in CI through the Node CLI: links
that resolve in the editor can fail in CI, and vice versa. The cases that
bite hardest are the ones Obsidian users write by reflex:

- `[X](foo)` (no `.md` extension) — Obsidian appends `.md` and resolves;
  Node CLI does not.
- `[X](foo)` for a uniquely-named bare target — Obsidian shortest-path
  matches; Node CLI requires the full path.

We need a way for Node CLI users to opt into Obsidian-shaped behavior without
forcing it on non-Obsidian users (Hugo, Docusaurus, generic Markdown repos)
who depend on strict path semantics.

## Goals

- Let users opt the Node CLI into the specific Obsidian-shaped resolution
  behaviors they need.
- Keep strict path-precise resolution as the default for users not
  authoring against Obsidian semantics.
- Make each behavior independently toggleable so individual quirks can be
  enabled without buying the whole package.
- Surface a convenience preset for the common case of "validate an Obsidian
  vault in CI."

## Non-goals

- Lockstep parity with Obsidian's algorithm across all versions. Obsidian's
  resolution rules can change; Quoin documents the behaviors it supports and
  does not promise to track future Obsidian releases.
- Adding the same knobs to the Obsidian Integration. Obsidian already
  defers to its own resolver; the knobs would be no-ops there.
- Changing wiki-link resolution semantics. Wiki-link basename matching in
  Node CLI is already loose by design and unaffected here.
- Adding resolution knobs at the Core layer. These are Integration
  concerns — the Core's `Resolver` contract is unchanged.

## Decision

Add two composable resolver behaviors to the Node CLI configuration,
each individually toggleable, all defaulting to off. Group them under a
new `resolver` config object:

```jsonc
{
  "resolver": {
    "markdownLinkExtensionFallback": false,
    "markdownLinkShortestPathFallback": false
  }
}
```

Each knob narrows or relaxes one specific step of markdown-link resolution.
The current shipped behavior is recovered when all knobs are off: strict
path-based lookup, plus unconditional fragment stripping and percent-decoding.

### `markdownLinkExtensionFallback`

When on: after computing the resolved path, the resolver first looks up the
target as-is. If that fails and the target has no extension, it retries
with `.md` appended.

Rationale: Obsidian and most Markdown editors let users write `[X](foo)`
expecting the obvious `foo.md` resolution. Without this knob, those links
always fail Node CLI validation.

Scope: applies only after the path has been normalized against
`sourceDocumentPath`. Does not change how `/`-prefixed or `../`-prefixed
targets are normalized.

### `markdownLinkShortestPathFallback`

When on: if the normalized path lookup fails, the resolver falls back to a
shortest-path basename match across the whole project. A bare-name target
like `[X](foo.md)` will match `notes/sub/foo.md` if `foo.md` appears only
once in the project.

Rationale: Obsidian's resolver treats bare names this way under its
"shortest-path" link-format setting. Vault users habitually write bare names.

Scope: only triggers when the strict lookup fails. When multiple candidates
share the same basename, the resolver returns `ambiguous` with all
candidates rather than picking arbitrarily — Quoin does not silently choose
between equal matches. This is one of two semantic differences from
Obsidian (Obsidian picks one deterministically).

## Presets

Preset handling, if added, lives at the configuration-shell layer, not inside
the resolver. See [D11 — Node CLI Config Preset](D11-node-cli-config-preset.md) for a
possible top-level preset mechanism. If such a preset ships, it should expand
to the knobs defined here, not to fragment stripping or percent-decoding,
because those are already unconditional Node CLI behaviors.

D10 only contributes the knobs themselves. No `resolver.preset` field exists
in this design.

## Configuration shape

The Node CLI's existing configuration object gains an optional `resolver`
property:

```typescript
type ResolverConfig = {
  markdownLinkExtensionFallback?: boolean;
  markdownLinkShortestPathFallback?: boolean;
};

type NodeCliConfig = {
  // ... existing fields ...
  resolver?: ResolverConfig;
};
```

Resolution precedence, if these knobs ship, should follow the standard config
layering used by the CLI. D11 proposes one possible cross-subsystem preset
model; D10 does not depend on D11 being implemented first.

CLI flags map one-to-one to the booleans:

- `--resolver-markdown-link-extension-fallback` /
  `--no-resolver-markdown-link-extension-fallback`
- `--resolver-markdown-link-shortest-path-fallback` /
  `--no-resolver-markdown-link-shortest-path-fallback`

## Diagnostics

A `markdown-link` target resolved via a fallback knob produces the normal
`found` result; no diagnostic distinguishes "resolved strictly" from
"resolved via extension fallback." This keeps the surface narrow — the user
opted in, the link resolved, nothing more to say.

A target that resolves only because of `markdownLinkShortestPathFallback`
to multiple candidates returns `ambiguous`, surfaced as
`resolve:ambiguous-wiki-link` per current diagnostic naming. The error
details carry the candidate paths. (Renaming the error kind to a
format-neutral form is a separate follow-on from D9 / P28.)

## Wiki-Link Interaction

These knobs apply only to `markdown-link` resolution. Wiki-link resolution
in the Node CLI already uses lowercase basename matching across the project
and is unaffected by every knob in this document.

A user who wants strict path-precise wiki-link behavior in the Node CLI is
out of scope here; that would be a separate design exercise.

## Compatibility

- Default behavior is unchanged from P28: strict path-precise resolution,
  all knobs off, with fragment stripping and percent-decoding already built in.
- Existing fixtures and tests continue to pass with no configuration
  changes.
- A new `resolver` configuration field with all sub-fields optional is
  additive.
- The CLI flags are new and additive; no existing flag changes meaning.

## Open Questions

1. Should `markdownLinkExtensionFallback` also try other configured
   extensions (`.mdx`, `.markdown`)?

   Recommendation: defer. Quoin currently treats `.md` as the canonical
   Markdown Document extension across the system. Extending that is its
   own design decision.

2. Should `markdownLinkShortestPathFallback` distinguish "resolved via
   shortest-path fallback" in the result, so downstream tools can warn?

   Recommendation: defer. If the demand appears, add a structured detail
   field rather than a new result kind.

3. Should a future Obsidian-compatible preset also encode wiki-link
   behaviors that diverge today (e.g. case sensitivity in some vault
   setups)?

   Recommendation: track only when a concrete user-facing discrepancy is
   reported. Speculation invites scope creep.

## Consequences

Positive:

- Users who validate Obsidian vaults in CI can do so without rewriting every
  bare-name link.
- Composable knobs let users adopt one behavior at a time, easing migration
  and limiting blast radius.
- Strict behavior remains the default — non-Obsidian users see no change.
- The Integration boundary stays clean: knobs live in the Node CLI; the
  Core's `Resolver` contract is unchanged; the Obsidian Integration is
  unaffected.

Costs:

- Two more configuration knobs to document and test, plus any future preset.
- The "obsidian-compatible" preset can drift from Obsidian's actual
  resolution as Obsidian evolves. The `compatible` framing in the name and
  in the docs is intentional but real users may still file
  "Obsidian behaves differently" issues — those become design decisions to
  add new knobs or hold the line.
- `markdownLinkShortestPathFallback` introduces an `ambiguous` failure
  mode for `markdown-link` that does not exist today and is not part of the
  Obsidian Integration's result model. Users enabling that knob need to be
  prepared for it.
