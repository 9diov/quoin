---
_type: "[[design-doc]]"
status: "active"
---

# Design Principles

These principles govern Quoin's design. New features, ADRs, and integration contracts should conform to them. When a principle and a specific design decision conflict, the conflict is a signal to revisit one of them explicitly.

## 1. Markdown stays the source of truth

Markdown Documents must remain the sole user-authored source of truth. Derived formats, indexes, and caches are permitted as implementation details, but no design may require them to exist or treat them as authoritative. A Type Definition Document is itself a normal Document, identified by `_type: type` and a `## Schema` block — not by a special file format or mandatory directory.

## 2. Keep the Core pure and the Integration responsible for the world

Core must be a pure transformation layer: it takes data in and returns results, with no access to environment-specific resources. Everything that touches the environment belongs to the Integration. This means Core functions never read files, write files, call runtime APIs, or inspect the filesystem — and that Resolvers, TypeRegistry, and root Type Declaration dispatch are injected by Integrations rather than embedded in Core.

## 3. Separate operations by mutation intent and target

Each operation is defined by a single mutation intent (observe, initialize, or repair) applied to a single class of target. Validation observes existing Documents. Scaffolding and Templating initialize new ones. Type Inference observes existing Documents to produce a new Type Definition Document. Repair — mutating existing Documents — is a future concern with its own boundary. A proposed operation that would cross these axes must be split or deferred. User-facing features can compose these operations, but are not allowed to weaken the sepration.

## 4. Use explicit channels for type identity and assignment

Type identity and type assignment must come from named channels with defined syntax and precedence. Filename guesses, directory conventions hidden in Core, and content classification are not valid channels. Regular Documents declare conformance through `_type`; Type Definition Documents declare identity through `_type: type`; Path-glob Bindings are an opt-in Integration channel where frontmatter always takes precedence.

## 5. Prefer precise, local validation over clever global behavior

Validation must be fully explainable from three inputs: the Document, its Type Definition Document, and the explicitly supplied Integration lookups. Any behavior that requires inspecting other Documents, applying heuristics, or traversing implicit context is out of scope. Referential Validation is opt-in and not transitive; coercions and defaults are not applied.

## 6. Be strict at contract boundaries

Quoin accepts loose, human-authored Markdown, but its authoring contracts — schema syntax, block structure, type expressions — must be strict enough that violations are unambiguous errors. Loose input at the document level is a feature; loose input at the contract level is a bug. Unknown schema keys are Parser errors, not warnings. Type expression forms are syntactically disjoint so no form is ambiguous.

## 7. Preserve host flexibility without hiding host risks

Host-specific conventions are permitted at the Integration layer but must never be silently normalized into Core behavior. Integrations may choose their own Resolver and Binding strategies; Core must not absorb those choices. Where host conventions collide or produce ambiguity — duplicate type names, reserved property conflicts — the result must be surfaced explicitly rather than resolved by a hidden default.

## 8. Favor deterministic, inspectable results

Every Core operation and CLI command must produce stable, fully explainable output. Ambiguity is not resolved silently — it is reported with enough information to act on. Ordering of targets, diagnostics, and candidates is deterministic. Machine-readable output preserves discriminants; human-readable output names what failed, where, why, and what to inspect next.

## 9. Defer "smart" heuristics until there is evidence

Features that require judgment, thresholds, or host-specific taste must either expose their policy explicitly or be deferred until there is evidence they are needed. Baking in a heuristic is not the same as implementing a feature. `choice<...>` inference, type-reference inference, and specificity-based conflict resolution are deferred for this reason — the policy is not yet known, so the mechanism is not yet built.
