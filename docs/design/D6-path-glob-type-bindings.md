---
_type: "[[design-doc]]"
status: "active"
terms: ["Core", "Document", "Integration", "Type Declaration", "Type Definition Document", "TypeRegistry", "Untyped Document", "Validation", "Validation Config"]
---

# D6 — Path-Glob Type Bindings

## Overview

A **Type Binding** declares that every Document under a path glob conforms to a named type — without a per-Document frontmatter Type Declaration. Bindings are an opt-in, Integration-owned mechanism that runs alongside frontmatter Type Declaration; they do not replace it.

Motivating use cases:

- Read-only or vendored Markdown repositories where editing every Document to add a Type Declaration is not possible.
- Convention-heavy vaults where directory layout already implies type (e.g. `skills/**/*.md` are all skills).
- Centralized policy: a team wants type assignment governed by one file, not scattered across thousands of headers.

This design only addresses **Type Declaration**, not Type Definition. Type Definition Documents continue to live in Markdown and self-identify via the literal `type` value under the configured Type Declaration key (ADR-0008). YAML-defined type definitions are out of scope; see Future work.

## Goals

1. Allow Integrations to assign a type to a Document based on its path.
2. Keep the frontmatter Type Declaration (under the configured key) authoritative when both mechanisms apply.
3. Detect ambiguous bindings (two bindings claim the same Document with different types) deterministically.
4. Keep the Core pure: the Integration resolves the effective Type Declaration before calling `validate(...)`. No change to `validate`'s signature.

## Non-goals

- Inferring a type from filename alone (no `kebab-name => type` heuristics).
- Globbing into Type Definition discovery — bindings target regular Documents only.
- Per-Document property overrides via the bindings mechanism.
- Replacing the `type` sentinel value (under the configured Type Declaration key) for Type Definition Documents.
- Defining Type Definitions in YAML.
- Sourcing bindings from a sidecar file. v1 sources bindings only from Integration config. See Future work for the promotion path.

## Language additions

**Type Binding**:
A pair of a path glob and a target type name, declared by an Integration. When a Document's root-relative path matches the glob and the Document has no frontmatter Type Declaration, the Integration treats the Document as conforming to the named type.
_Avoid_: Type rule, type assignment, glob binding

**Effective Type Declaration**:
The Type Declaration the Integration uses for a Document after applying both frontmatter and binding rules. Computed by the Integration before Root Type Dispatch.
_Avoid_: Resolved type, declared type

## Binding shape

A binding is a `{ type, match }` pair. Integrations supply an **ordered list** of these through their own configuration channel. Declaration order is semantically significant — see the resolution algorithm below.

Rules:

1. Each entry has exactly the keys `type` and `match`. Unknown keys are errors; missing keys are errors.
2. `type` must be a canonical type name (lowercase, `[a-z0-9_-]`, no leading/trailing `-` or `_`) — the same identifier rules as `TypeDefinitionDocumentIdentity.name` (D2).
3. `match` must be a non-empty string interpreted as a glob anchored at the project root.
4. Duplicate entries (same `type` + same `match`) are errors.

Glob semantics:

- POSIX-style separators.
- `**` matches any number of path segments including zero.
- `*` matches within a single segment.
- Globs do not match files outside the project root.
- Globs match regular Documents only — Type Definition Documents are excluded from binding regardless of path.

## Resolution algorithm

For each ingested regular Document, the Integration computes the Effective Type Declaration in this order:

1. **Frontmatter wins.** If `document.frontmatter[typeDeclarationKey]` is present, use it. Bindings are not consulted. This preserves the explicit-over-implicit convention and lets authors override the central policy on individual files.
2. **Bindings.** Otherwise, collect every binding whose `match` glob matches the Document's root-relative path, preserving declaration order.
   - Zero matches → the Document is untyped; existing `untypedDocumentBehavior` config applies.
   - Exactly one match → the Document conforms to that binding's `type`. The matched binding is reported as `matchedBinding`.
   - Two or more matches all naming the **same** `type` → the Document conforms to that type. The **first** matching binding in declaration order is reported as `matchedBinding`; later same-type matches are not reported.
   - Two or more matches naming **different** types → ambiguous binding; surface as a target diagnostic with every distinct-typed candidate (in declaration order), do not call Core `validate`. Same-type duplicates within the candidate set are collapsed to their first occurrence.
3. **Type Definition Documents are excluded.** A Document whose frontmatter holds the literal `type` under the configured Type Declaration key is a Type Definition Document and is not subject to bindings regardless of path.

The cross-type ambiguity error is the only conflict policy in v1. Within a single target type, declaration order is the tiebreaker — predictable and reversible later if a need for specificity-based ordering emerges.

## Integration contract

The Integration constructs an Effective Type Declaration resolver and uses it during Root Type Dispatch (D4):

```typescript
type TypeBinding = {
  type: string
  match: string
}

type EffectiveTypeDeclaration =
  | { kind: 'frontmatter'; value: unknown }
  | { kind: 'binding';     typeName: string; matchedBinding: TypeBinding }
  | { kind: 'untyped' }
  | { kind: 'ambiguous-binding'; candidates: TypeBinding[] }

// Pure function — no I/O. Integration owns the glob matcher.
declare function resolveEffectiveTypeDeclaration(
  document: Document,
  rootRelativePath: string,
  bindings: TypeBinding[],
  typeDeclarationKey: string,
): EffectiveTypeDeclaration
```

The Core API is unchanged. The Integration:

1. Reads the binding list from its own configuration channel.
2. Computes the Effective Type Declaration for each regular Document.
3. Resolves the resulting type name through TypeRegistry exactly as today.
4. Reports `ambiguous-binding` as a new validation target diagnostic and skips Core validation for that Document.

A binding-selected type name is resolved through `typeRegistry.getByName(...)` exactly like a frontmatter-sourced declaration. `TypeReferenceLookupResult` (D4) has three failure modes — `not-found`, `ambiguous`, `unavailable` — and each one needs a binding-sourced sibling because the existing D5 variants all require a `declaration: unknown` value the binding case does not have. D6 adds three sibling variants — `binding-type-not-found`, `binding-type-ambiguous`, and `binding-type-unavailable`; see [Additions to D5 result shapes](#additions-to-d5-result-shapes). When multiple bindings naming the same missing or ambiguous type match a Document, the first matching binding in declaration order is reported as `matchedBinding`, consistent with the resolution algorithm. Detecting unknown binding targets once at load time, rather than once per matched Document, is a Future work item.

## Node CLI integration

The Node CLI (D5) gains:

- **Config field.** `NodeCliConfig` adds `bindings?: TypeBinding[]`. This is the only source of bindings in v1 — there is no sidecar file and no CLI flag for bindings. The field defaults to an empty list, matching today's behavior where every regular Document is dispatched via frontmatter.
- **Validation of `bindings`.** Invalid entries (non-canonical `type` name, missing `match`, unknown keys, duplicates) are reported by the existing config-loading machinery as command-level config failures, the same way an invalid `include` glob is handled today. No new discovery diagnostic variant is needed.
- **Per-target diagnostics.** `ambiguous-binding`, `binding-type-not-found`, `binding-type-ambiguous`, and `binding-type-unavailable` are new `ValidationTargetResult` variants. See [Additions to D5 result shapes](#additions-to-d5-result-shapes).
- **`types` command.** When `bindings` is non-empty, `types` lists each binding under its target type alongside the discovered Type Definition Document.
- **Exit status.** All four new per-target variants exit non-zero, following the same rule as other per-target failures. Invalid `bindings` in config exits non-zero under the existing "command-level config failure" exit clause.

The `create` command is unaffected — it always writes an explicit Wiki Link under the configured Type Declaration key into the generated frontmatter (D5). Bindings are a read-side feature.

### Additions to D5 result shapes

D5's `ValidationTargetResult` discriminated union (D5:412) gains:

```typescript
type ValidationTargetResult =
  // ...existing variants...
  | { kind: 'ambiguous-binding';         path: string; candidates: TypeBinding[] }
  | { kind: 'binding-type-not-found';    path: string; matchedBinding: TypeBinding; typeName: string }
  | { kind: 'binding-type-ambiguous';    path: string; matchedBinding: TypeBinding; typeName: string; candidateIds: string[] }
  | { kind: 'binding-type-unavailable';  path: string; matchedBinding: TypeBinding; reason: string }
```

The three `binding-type-*` variants are siblings of D5's `type-not-found`, `type-ambiguous`, and `type-unavailable`. Same semantics — the binding-selected type name was absent, multiply-defined, or temporarily unresolvable in the TypeRegistry — but the binding-sourced variants carry `matchedBinding` instead of `declaration`, since there is no frontmatter declaration value when dispatch came from a binding. The frontmatter-sourced variants `type-not-found`, `type-ambiguous`, and `type-unavailable` continue to apply exclusively to frontmatter-sourced declarations.

`ambiguous-binding` is distinct from the three `binding-type-*` variants: it fires *before* TypeRegistry lookup, when multiple bindings naming **different** types match the same Document and the Integration cannot pick a single type name to look up. The `binding-type-*` variants fire *after* a single type name has been selected and the lookup against the TypeRegistry has failed.

D5's `EffectiveConfig` snapshot grows a `bindings: TypeBinding[]` field so the JSON output records the effective binding list for the run.

A `validated` outcome carries no marker indicating whether the type came from frontmatter or a binding. If that becomes useful (e.g. for output filtering), a future revision can add an optional `source: 'frontmatter' | 'binding'` field.

## Edge cases

- **Document moved out of its binding glob.** No frontmatter Type Declaration, no longer matches any binding → untyped. Same behavior as removing the Type Declaration from frontmatter. By design.
- **Bindings overlap intentionally.** Two bindings naming the same type for overlapping subtrees is allowed and not flagged.
- **Glob matches a Type Definition Document.** Type Definition Documents are excluded from binding resolution; the glob match is silently ignored for that file. A future lint may warn.
- **Frontmatter Type Declaration present but malformed.** Continues to surface as `invalid-type-declaration` (D5); bindings are not consulted as a fallback. Malformed-and-then-falling-back-to-bindings would mask author intent.
- **Empty `bindings` list.** Valid. Equivalent to omitting the field.

## Open questions

1. **Per-binding overrides.** Should a binding be able to declare additional per-Document properties (e.g. `defaults:`)? Deferred until a concrete need arises.
2. **Negative globs.** `match: '!drafts/**'` to exclude a subtree from a broader binding. Deferred — composability is unclear and `exclude` at CLI level may already cover the common case.
3. **Validation of binding targets at load time.** Reporting `binding-type-not-found` once per unknown type rather than once per matched Document. Cosmetic — defer.
4. **Specificity-based conflict resolution.** If users hit the ambiguity error often, consider longest-glob-wins or declaration-order. Wait for evidence.

## Future work

- **Sidecar Bindings File.** A vault-portable `bindings.yaml` (or similar) becomes worthwhile only once a second Integration consumes the same binding list. At that point: spec the file format, the discovery rule, and a documented merge policy between file-sourced and inline-config-sourced bindings. The shape of a `TypeBinding` will not change — only the source.
- **YAML-defined Type Definitions.** A separate proposal can introduce YAML-defined type schemas for fully read-only repositories where even `types/*.md` cannot be authored. This loses the ADR-0008 "meta-type validation falls out for free" property and is intentionally not pursued in v1.
- **Per-Integration binding sources.** Obsidian could read bindings from a plugin settings panel; GitBook could read them from `book.json`. The TypeBinding shape stays the same; only the source varies.

## Relationship to existing design docs

- [D1 — Architecture](D1-architecture.md): bindings live entirely in the Imperative Shell. The Core does not learn about globs.
- [D2 — Type and Schema Contracts](D2-type-and-schema-contracts.md): canonical type-name rules used by bindings come from here.
- [D3 — Validation Semantics](D3-validation-semantics.md): unchanged. Bindings affect which Type Definition Document is selected, not how validation runs.
- [D4 — Integration Contracts](D4-integration-contracts.md): bindings extend Root Type Dispatch with a new pre-resolution step.
- [D5 — Node CLI Integration](D5-node-cli-integration.md): the Node CLI gains a `bindings` config field and two new per-target diagnostics.

## Design Principle Violation

**DP8 — Silent ignore of glob match on a Type Definition Document** (binding resolution, exclusion rule)

When a glob matches a Type Definition Document, the match is silently discarded: "the glob match is silently ignored for that file. A future lint may warn." DP8 requires that every operation produce fully explainable output and that ambiguity be reported rather than silently resolved. An ignored match is invisible to the author and provides no basis for diagnosing a misconfigured binding.
- ADR-0008: bindings do not change Type Definition discovery; the literal `type` value under the configured Type Declaration key remains the only Type Definition identifier.
