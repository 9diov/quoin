# D3 — Validation Semantics

> **Note:** [D9 — Doc Reference Format Separation](D9-doc-ref-format-separation.md) supersedes this document's validation paths for internal references. Validation routes scalar and list-item `doc-ref` values through a format-aware branch (not the primitive switch), passes the source `document.path` to the Resolver, and invokes the TypeRegistry only when `referencedType` is present. Resolution error kinds keep their current names (`resolve:broken-wiki-link`, etc.) for this phase.

## Type definitions

```typescript
type IntegrationName =
  | 'obsidian'
  | 'hugo'
  | 'jekyll'
  | 'gitbook'
  | 'docusaurus'
  | 'vitepress'

type UntypedDocumentBehavior = 'skip' | 'warn'

type ValidationConfig = {
  typeDeclarationKey?: string           // default: '_type'
  untypedDocumentBehavior?: UntypedDocumentBehavior  // default: 'skip'
  referentialValidation?: boolean       // default: false
  integration?: IntegrationName         // enables Reserved Property checks
}

type ValidationErrorKind =
  | 'config:missing-dependency'
  | 'property:missing-required'
  | 'property:wrong-type'
  | 'property:empty-not-allowed'
  | 'property:invalid-enum-value'        // value not in choice<"a"|"b"|"c"> allowed set
  | 'resolve:broken-wiki-link'          // Wiki Link target was not found
  | 'resolve:invalid-wiki-link'         // Wiki Link value was malformed
  | 'resolve:ambiguous-wiki-link'       // Wiki Link matched multiple Documents
  | 'resolve:unavailable'               // Resolver could not complete lookup
  | 'type:unknown-reference'            // Type Reference in schema could not be resolved
  | 'type:missing-declaration'          // Target Document has no Type Declaration
  | 'type:invalid-declaration'          // Target Document has malformed Type Declaration
  | 'type:ambiguous-reference'          // Type Reference matched multiple Type Definition Documents
  | 'type:unknown-declaration'          // Target Document declares an unknown type
  | 'type:ambiguous-declaration'        // Target Document Type Declaration matched multiple Type Definition Documents
  | 'type:unavailable'                  // TypeRegistry could not complete lookup
  | 'type:referential-mismatch'         // Referential Validation failed

type ValidationLocation =
  | { scope: 'config' }
  | { scope: 'property'; property: string; index?: number }
  | { scope: 'section'; section: string; level: number }

type ValidationError = {
  kind: ValidationErrorKind
  message: string
  location: ValidationLocation
  details?: Record<string, unknown>
}

type ValidationWarningKind =
  | 'document:untyped'
  | 'property:reserved-collision'
  | 'section:missing-required'

type ValidationWarning = {
  kind: ValidationWarningKind
  message: string
  location: ValidationLocation
  details?: Record<string, unknown>
}

type ValidationResult = {
  passed: boolean     // true iff errors is empty
  errors: ValidationError[]
  warnings: ValidationWarning[]
}
```

---

## Core API

```typescript
declare function validate(
  document: Document,
  typeDef: ParsedTypeDefinitionDocument,
  config: ValidationConfig,
  resolver?: Resolver,
  typeRegistry?: TypeRegistry
): ValidationResult
```

`Document` and `ParsedTypeDefinitionDocument` are defined in [D2 — Type and Schema Contracts](D2-type-and-schema-contracts.md). `Resolver` and `TypeRegistry` are defined in [D4 — Integration Contracts](D4-integration-contracts.md).

---

## Pipeline boundary

Integrations own root Type Declaration dispatch. They resolve a Document's Type Declaration to a Type Definition Document, then call `validate(document, typeDef, ...)`.

Core does not verify that the root Document's Type Declaration matches the `typeDef` argument.

Parser validates Type Definition Document syntax once. Validation assumes the parsed Type Definition Document is valid and checks only Document conformance.

Schemas are open by default. Frontmatter Properties not declared in the Type Definition Document are allowed.

---

## Property presence and emptiness

`required` controls only key presence. `allow-empty` controls present-but-empty values.

Missing Property:

- Valid when `required` is false or absent.
- Produces `property:missing-required` when `required: true`.

Empty Property:

- `null` is present but empty.
- Whitespace-only strings are empty.
- Empty scalar strings fail by default with `property:empty-not-allowed`.
- Empty lists pass by default.
- `allow-empty: false` makes empty lists fail with `property:empty-not-allowed`.
- `allow-empty: true` permits empty scalar values and empty lists.

---

## Primitive Property validation

`text` accepts non-empty strings.

`number` accepts only finite JavaScript numbers. Numeric strings are not coerced.

`boolean` accepts only booleans. String values such as `"true"` are not coerced.

`date` accepts only strings in `YYYY-MM-DD` format. Integrations should avoid YAML date coercion or normalize date-like values to strings before calling Core.

`datetime` accepts only ISO 8601 datetime strings with timezone. Integrations should avoid YAML date coercion or normalize date-like values to strings before calling Core.

`wiki-link` accepts only non-empty strings in canonical Wiki Link syntax. Core performs the syntax check before calling Resolver.

External links and bare URLs are ordinary `text` values in this phase. Core does not validate URL or Markdown link syntax until a future text-refinement mechanism exists.

---

## Typed reference validation

A top-level `type: "[[name]]"` declares the Property holds a Wiki Link to a Document of type *name*.

1. Value must be a non-empty string with valid Wiki Link syntax. Failures → `property:wrong-type`.
2. Value is resolved with Resolver.
3. If `referentialValidation: true`, the resolved target Document is referentially validated against Type Reference *name* via TypeRegistry.

This is the same pipeline used per-item by `list<[[name]]>`, lifted to the single-value case.

---

## Collection Type validation

`list<X>`:

1. Value must be a YAML array. Non-array → `property:wrong-type`.
2. Per-item validation depends on `X`:
   - **X is a primitive** (`{ kind: 'primitive'; name: P }`): each item is validated as primitive `P` using the same rules as a top-level primitive Property (text, number, boolean, date, datetime, or `wiki-link` shape). Item-level failures → `property:wrong-type` at `{ scope: 'property', property, index }`. No Link Resolution. No Referential Validation, even when `referentialValidation: true`.
   - **X is a Type Reference** (`{ kind: 'type-ref'; name: N }`): each item must be a non-empty string with valid Wiki Link syntax, then resolved with Resolver, then (when `referentialValidation: true`) referentially validated against Type Reference `N` via TypeRegistry.

`choice<"a"|"b"|"c">` (literal-enum in v1):

1. Value must be a string. Non-string → `property:wrong-type`.
2. Value must equal one of the declared literal members' `value` exactly (case-sensitive). Non-match → `property:invalid-enum-value` with `details.value` and `details.allowed: string[]` (the list of allowed literal values, in declaration order).
3. No Link Resolution. No Referential Validation.

`list<[[name]]>` is the only collection form that invokes Resolver and TypeRegistry. `list<primitive>` and `choice<...>` never invoke either. Referential Validation does not apply to primitive `wiki-link`, `list<wiki-link>`, or `choice<...>`, because none of them declare a Type Reference.

List validation accumulates item-level errors. When one item fails, Validation stops downstream stages for that item but continues checking sibling items.

---

## Link Resolution

Link Resolution is part of standard Validation for `wiki-link`, top-level `[[name]]`, and `list<X>` (both primitive `wiki-link` items and `[[name]]` items). Resolver is required for any present, non-empty value that passes Wiki Link shape validation. `list<other-primitive>` and `choice<"a"|"b"|"c">` skip Link Resolution entirely.

If Resolver is missing when a value reaches Link Resolution, Validation returns `config:missing-dependency` at that value's location. It does not throw.

Resolver result mapping:

- `found` continues Validation.
- `not-found` produces `resolve:broken-wiki-link`.
- `invalid-link` produces `resolve:invalid-wiki-link`.
- `ambiguous` produces `resolve:ambiguous-wiki-link`.
- `unavailable` produces `resolve:unavailable`.

---

## Referential Validation

Referential Validation applies only when `referentialValidation: true`, and only to top-level `[[name]]` and `list<[[name]]>`. Primitive `wiki-link`, primitive-item lists (`list<text>`, `list<wiki-link>`, …), and enums (`choice<"a"|"b"|"c">`) carry no Type Reference and are never referentially validated.

TypeRegistry is required after a Collection Type value resolves successfully. If TypeRegistry is missing at that point, Validation returns `config:missing-dependency` at that value's location.

Per resolved Collection Type value:

1. Resolve expected Type Reference with `typeRegistry.getByName(...)`.
2. Resolve target Document Type Declaration with `typeRegistry.getByDeclaration(target.frontmatter[typeDeclarationKey])`.
3. Compare resolved Type Definition Document identity by `ParsedTypeDefinitionDocument.id`.

Type Reference lookup mapping:

- `not-found` produces `type:unknown-reference`.
- `ambiguous` produces `type:ambiguous-reference`.
- `unavailable` produces `type:unavailable`.

Type Declaration lookup mapping:

- `missing-declaration` produces `type:missing-declaration`.
- `invalid-declaration` produces `type:invalid-declaration`.
- `not-found` produces `type:unknown-declaration`.
- `ambiguous` produces `type:ambiguous-declaration`.
- `unavailable` produces `type:unavailable`.

When both lookups resolve but their `id` values differ, Validation returns `type:referential-mismatch` with details such as expected type id, actual type id, Wiki Link, and target path.

`typeRegistry.getByDeclaration` may receive the bare literal `type` when the target is itself a Type Definition Document (ADR-0008). If the Integration registers a user-extensible meta-Type Definition Document under the name `type`, the lookup should resolve to it; otherwise the Integration returns `not-found` and Validation surfaces `type:unknown-declaration`. The bare literal is the only non-Wiki-Link value `getByDeclaration` is expected to handle.

---

## Section validation

Section validation checks required Sections parsed from the Type Definition Document's Template Block against headings in the existing Document body.

Section identity is exact heading level plus exact heading text. Matching is case-sensitive.

Template required Section:

```markdown
## Definitions <!-- required -->
```

Document body passes:

```markdown
## Definitions
```

Document body fails:

```markdown
# Definitions
### Definitions
## definitions
## Definitions:
```

Rules:

- ATX headings only.
- Setext headings do not count.
- Headings inside fenced code blocks do not count.
- Content under the heading is not required.
- Duplicate headings in Document bodies are allowed.
- Validation emits one `section:missing-required` warning per missing required Section identity.
- Near misses do not produce additional warnings.

Warning location includes both heading text and level:

```typescript
{
  kind: 'section:missing-required',
  location: { scope: 'section', section: 'Definitions', level: 2 }
}
```
