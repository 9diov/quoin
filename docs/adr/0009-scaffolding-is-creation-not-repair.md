# Scaffolding and Body Generation are creation, not repair

Scaffolding and Body Generation are initialization operations applied to **new** Documents. They never modify existing content.

## Scaffolding: fills absent Properties only

Scaffolding fills only Properties that are **absent** from the frontmatter. A Property that is present but empty — `null`, `""`, `"   "`, `[]` when `allow-empty: false` — is left untouched, even when Validation would report it as `property:empty-not-allowed`.

**Absent** and **empty** are distinct authorial states:

- **Absent**: the author never touched this key. Scaffolding fills it — this is document creation.
- **Empty but present**: the author wrote `description:` or `description: ""`. That was an intentional act. Scaffolding should not second-guess it.

Collapsing these states — having Scaffolding overwrite empty values — creates a repair engine whose stopping point is unclear. If an empty string gets replaced with the default, what about a wrong-type value (`description: 42` on `type: text`)? What about a broken wiki link (`[[Missing]]`)? Each is a Validation failure too. The "repair" boundary expands without a principled limit.

## Body Generation: generates body for new Documents only

Body Generation generates the Markdown body from a Type Definition Document's `## Body` block. It is applied only when creating a new Document.

On existing Documents, Validation warns if required Sections are missing — Body Generation never overwrites existing body content. Just as Scaffolding does not repair empty Properties, Body Generation does not inject missing Sections into an already-authored Document body. The author may have deliberately chosen a different structure, and overwriting it would be destructive.

## Relation to ADR-0004

This is related to [ADR-0004](./0004-default-is-scaffolding-not-validation.md) but goes further: `default` belongs to Scaffolding *because* Scaffolding is scoped to creation. The principle extends symmetrically to Body Generation — the Body Block content belongs to creation, not to repair.

## A repair feature is a separate concern

A repair operation would consume a `ValidationResult` plus a `ParsedTypeDefinitionDocument` and compute patches for specific error kinds (`property:empty-not-allowed` → apply default, `property:missing-required` → apply default, `section:missing-required` → inject Section, `property:wrong-type` → no automatic fix). That feature would have its own semantics, its own scope boundary, and its own name — it is not Scaffolding, nor Body Generation.

Such a feature is not in scope for the Core's v1 phases. It belongs in a future ADR and implementation phase.
