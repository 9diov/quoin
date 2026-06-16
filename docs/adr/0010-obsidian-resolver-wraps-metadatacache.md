# Obsidian Resolver wraps Obsidian's metadataCache

The Obsidian plugin Integration's Resolver wraps `metadataCache.getFirstLinkpathDest(linkpath, sourcePath)` rather than supplying its own configurable resolution strategy.

[D4 — Integration Contracts](../design/D4-integration-contracts.md) sketches a strategy-driven factory:

```typescript
type ObsidianResolverOptions = {
  strategy: 'shortest-path' | 'full-path' | 'exact'
}
```

The Obsidian plugin intentionally does not implement this surface. There is no plugin setting for resolution strategy. There is exactly one resolution behaviour: whatever Obsidian itself does for the same Wiki Link in the same Document.

## Rationale

**Fidelity.** A Wiki Link `[[skill]]` in a Document resolves in Quoin to the same target the user would land on by Cmd-clicking the link. The plugin is embedded inside Obsidian; introducing a second resolution model would create a class of user-visible discrepancies that are exhausting to explain and impossible to debug from outside.

**Correctness for free.** `metadataCache` handles shortest-path resolution, frontmatter `aliases:`, case-insensitive match, and the user's *Files & Links → New link format* setting. Re-implementing this surface inside the plugin would either lag Obsidian's behaviour as it evolves or drift from it on edge cases the plugin's authors haven't encountered.

**Forward compatibility.** Obsidian periodically refines link resolution. Wrapping the native API means the plugin tracks those refinements without code changes.

**Surface minimization.** A resolution strategy setting would multiply the plugin's QA surface: every validation interaction would have to be reasoned about under three different strategies. v1 of the plugin already carries enough integration surface — status bar, sidebar, settings, create flow, path-glob bindings, debounced cascade.

## Trade-off accepted

The plugin's resolution behaviour now depends on **user-specific Obsidian settings** (`Files & Links → New link format`). Two users with the same vault and the same schema can see different validation results for the same Document if their link-format settings differ.

This trade-off is accepted, with two reasons:

1. The resolution that drives validation matches the resolution the user already sees when interacting with their vault. The user's notion of "where does `[[skill]]` go?" is the source of truth Quoin observes, not the reverse.
2. The discrepancy across users is bounded — it can only change *which* Document a link resolves to, never produce a result outside the set of Documents present in the vault.

The Node CLI Integration ([D5](../design/D5-node-cli-integration.md)) deliberately exposes a configurable resolver strategy because it has no host to defer to and must own its own policy. The two Integrations are not expected to converge on identical resolution behaviour, and that is consistent with [DP7](../design/PRINCIPLES.md): host-specific conventions are permitted at the Integration layer.

## What the plugin still owns

Wrapping `metadataCache` does not eliminate the plugin's responsibility for the Resolver contract:

- Mapping `null` returns to D4's `not-found`.
- Detecting basename collisions and reporting `ambiguous` rather than silently picking one.
- Gating activation on `workspace.onLayoutReady` so `unavailable` is practically unreachable.
- Closing over the source path for each validation pass, including using a Type Definition Document's own path as the source when resolving Wiki Links from within its `## Schema` block.

These are integration-layer concerns and remain the plugin's job; they are not delegated to Obsidian.

## When this decision might be revisited

A future need that would justify reopening this decision:

- A user-reported case where Obsidian's resolution and Quoin's validation produce *intuitively* divergent results that fidelity-to-Obsidian no longer explains away.
- A Quoin feature that requires resolution behaviour Obsidian cannot express — for example, a deliberately stricter "exact-path" mode for CI-style validation runs inside Obsidian.

Both are speculative as of this ADR. Until then, the plugin ships one mode and no setting.
