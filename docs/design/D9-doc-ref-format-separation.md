# D9 — Doc Reference Format Separation

## Status

Draft.

## Problem

Quoin currently uses `wiki-link` for two different concepts:

- The semantic concept: an internal reference to another Document.
- The concrete syntax: a `[[Target]]` Wiki Link string.

That coupling works for Obsidian-style vaults, but it is too narrow for Markdown documentation repositories that use ordinary Markdown links for internal references. A repo should be able to say "this property is an internal document reference" without also saying "the value must be written in double-bracket syntax".

The schema language should separate reference semantics from link syntax.

## Decision

Introduce `doc-ref` as the semantic Property type for internal document references.

`doc-ref` accepts a `format` option that selects the concrete syntax:

```yaml
properties:
  source:
    type: doc-ref
    format: wiki-link
```

```yaml
properties:
  source:
    type: doc-ref
    format: markdown-link
```

Supported formats:

- `wiki-link` — double-bracket internal reference syntax, e.g. `[[Source]]`.
- `markdown-link` — inline Markdown link syntax, e.g. `[Source](sources/source.md)`.

When a `doc-ref` is constrained to reference a Document of a specific type, the schema uses `referenced-type`:

```yaml
properties:
  author:
    type: doc-ref
    format: wiki-link
    referenced-type: person
```

```yaml
properties:
  author:
    type: doc-ref
    format: markdown-link
    referenced-type: person
```

`referenced-type` is optional. A `doc-ref` without `referenced-type` validates link shape and target existence, but does not run Referential Validation.

## Canonical Parsed Shape

Parser normalizes every document reference schema to one internal shape:

```typescript
type DocRefFormat = 'wiki-link' | 'markdown-link'

type DocReference = {
  kind: 'doc-ref'
  format: DocRefFormat
  referencedType?: string
}
```

`PropertyTypeName` becomes:

```typescript
type PrimitiveTypeName =
  | 'text'
  | 'number'
  | 'boolean'
  | 'date'
  | 'datetime'

type ListItemType =
  | { kind: 'primitive'; name: PrimitiveTypeName }
  | DocReference

type PropertyTypeName =
  | PrimitiveTypeName
  | DocReference
  | CollectionTypeName
```

`wiki-link` is no longer a primitive type. It is a `doc-ref` format.

## Schema Grammar

The explicit object form is canonical:

```yaml
properties:
  source:
    type: doc-ref
    format: wiki-link
```

```yaml
properties:
  source:
    type: doc-ref
    format: markdown-link
    referenced-type: source
```

Allowed Property schema keys become:

- `type`
- `format`
- `referenced-type`
- `required`
- `allow-empty`
- `default`

`format` is valid only when `type: doc-ref`.

`referenced-type` is valid only when `type: doc-ref`.

`referenced-type` must be a canonical Type Reference name, using the same identifier rule as existing `[[name]]` type references.

When `type: doc-ref` omits `format`, Parser should reject the schema. The syntax is intentionally explicit because docs repositories differ in their preferred internal-link form.

## Syntactic Sugar

Existing type-reference shorthand remains supported and normalizes to `doc-ref`.

```yaml
properties:
  author:
    type: "[[person]]"
```

Normalizes to:

```yaml
properties:
  author:
    type: doc-ref
    format: wiki-link
    referenced-type: person
```

Markdown-link shorthand is also supported:

```yaml
properties:
  author:
    type: "[](person)"
```

Normalizes to:

```yaml
properties:
  author:
    type: doc-ref
    format: markdown-link
    referenced-type: person
```

The shorthand label is intentionally empty. In schema position it is not an example runtime value; it is a compact type-reference literal. `[](person)` means "a Markdown-link-shaped document reference whose target Document must declare type `person`".

The target inside shorthand must be a canonical Type Reference name. It is not a path.

## Lists

Lists may contain `doc-ref` items.

Explicit form:

```yaml
properties:
  sources:
    type: list<doc-ref>
    format: markdown-link
```

Typed explicit form:

```yaml
properties:
  sources:
    type: list<doc-ref>
    format: markdown-link
    referenced-type: source
```

Sugar forms remain available:

```yaml
properties:
  skills:
    type: "list<[[skill]]>"
```

```yaml
properties:
  skills:
    type: "list<[](skill)>"
```

Both normalize to `list` whose item type is `DocReference`.

`format` and `referenced-type` apply to the `doc-ref` item when `type: list<doc-ref>`. They are invalid for lists of other item types.

## Runtime Value Syntax

For `format: wiki-link`, runtime values must be valid Wiki Link strings:

```yaml
source: "[[Pattern of Enterprise Application Architecture]]"
```

For `format: markdown-link`, runtime values must be valid inline Markdown links to internal targets:

```yaml
source: "[PoEAA](sources/poeaa.md)"
```

The initial `markdown-link` grammar should be deliberately narrow:

- Inline links only: `[label](target)`.
- Non-empty label.
- Non-empty target.
- No external URLs.
- No bare autolinks.
- No reference-style Markdown links.

Fragment support is format-specific. It may be allowed for shape validation and target extraction, but Referential Validation compares the resolved Document, not the fragment.

## Validation Semantics

`doc-ref` validation replaces primitive `wiki-link` validation.

For any present non-empty `doc-ref` value:

1. Validate that the value is a string in the declared `format`.
2. Resolve the reference with Resolver.
3. If `referenced-type` is present and `referentialValidation: true`, validate that the resolved target Document declares the expected type through TypeRegistry.

Shape failures return `property:wrong-type`.

Missing Resolver after shape validation returns `config:missing-dependency`.

Resolver failures keep the existing resolution error categories for now:

- `resolve:broken-wiki-link`
- `resolve:invalid-wiki-link`
- `resolve:ambiguous-wiki-link`
- `resolve:unavailable`

These names are historically wiki-link-specific. A future diagnostics cleanup may rename them to format-neutral names such as `resolve:broken-doc-ref`, but that is a separate compatibility decision.

`doc-ref` without `referenced-type` never invokes TypeRegistry.

`doc-ref` with `referenced-type` invokes TypeRegistry only when Referential Validation is enabled and Resolver has found a target Document.

## Integration Contract Impact

Resolver should move from a wiki-link-specific input to a format-aware document reference input.

Target contract:

```typescript
type ResolveDocReferenceInput = {
  value: string
  format: DocRefFormat
}

type ResolveDocReferenceResult =
  | { kind: 'found'; document: Document }
  | { kind: 'not-found'; value: string; format: DocRefFormat }
  | { kind: 'invalid-link'; value: string; format: DocRefFormat; reason: string }
  | { kind: 'ambiguous'; value: string; format: DocRefFormat; candidates: Document[] }
  | { kind: 'unavailable'; value: string; format: DocRefFormat; reason: string }

type Resolver = (input: ResolveDocReferenceInput) => ResolveDocReferenceResult
```

Integrations own target interpretation:

- Obsidian can resolve `wiki-link` through its metadata cache.
- Node CLI can resolve `wiki-link` by basename, preserving current behavior.
- Node CLI can resolve `markdown-link` by relative path first, then optionally by basename if the target has no path separator.

TypeRegistry still resolves Type Definition Documents by canonical type name. `referenced-type` is already a type name, so it does not depend on the reference format.

Type Declarations have two separable meanings:

1. The Document conforms to a named type.
2. That named type is backed by a Type Definition Document that can be resolved by TypeRegistry.

In the current model, reference-shaped Type Declarations carry both meanings.

`TypeRegistry.getByDeclaration(value)` must accept type declarations in both canonical formats:

```yaml
_type: "[[article]]"
```

```yaml
_type: "[](article)"
```

Both declarations mean:

- This Document conforms to type `article`.
- Type `article` is declared by a resolvable Type Definition Document.

That second meaning is what enables Referential Validation to compare the target Document's resolved Type Definition Document with the `referenced-type` declared in the source schema.

Future work may add bare Type Declarations:

```yaml
_type: article
```

A bare declaration would mean only that the Document conforms to type `article`. It would not, by itself, assert that `article` is declared by a Type Definition Document. That leaves room for alternate type-definition mechanisms, external registries, generated schemas, or integration-specific type catalogs.

Bare Type Declarations are not part of this change. Until such a mechanism exists, `TypeRegistry.getByDeclaration('article')` should continue to return `invalid-declaration`.

The bare sentinel remains unchanged:

```yaml
_type: type
```

It still identifies Type Definition Documents during discovery.

## Compatibility

Existing schema shorthand remains valid:

```yaml
type: "[[level]]"
type: "list<[[skill]]>"
```

Existing runtime wiki-link values remain valid when the normalized format is `wiki-link`.

The old primitive spelling should be deprecated:

```yaml
type: wiki-link
```

Recommended replacement:

```yaml
type: doc-ref
format: wiki-link
```

The first implementation may keep `type: wiki-link` as a parser alias for:

```yaml
type: doc-ref
format: wiki-link
```

That alias should produce the same canonical parsed shape as explicit `doc-ref`. New docs and generated scaffolds should emit `doc-ref`, not `wiki-link`.

## Open Questions

1. Should `format` default to `wiki-link` for compatibility, or be required for all explicit `doc-ref` schemas?

   Recommendation: require it for `type: doc-ref`, but keep `type: wiki-link` as a compatibility alias.

2. Should `markdown-link` runtime values resolve relative to the containing Document path?

   Recommendation: yes for Node CLI and static-site integrations. Obsidian support can be format-specific and may initially reject `markdown-link` if host APIs cannot resolve it reliably.

3. Should `[](person)` be called Markdown-link shorthand even though empty-label Markdown links are not useful runtime links?

   Recommendation: yes, because this syntax appears only in schema type position. Runtime `markdown-link` values should require non-empty labels.

4. Should resolution error kinds be renamed from `wiki-link` to `doc-ref`?

   Recommendation: defer. Add format-neutral errors only when making a deliberate diagnostics compatibility pass.

## Consequences

Positive:

- Schema semantics no longer depend on one internal-link syntax.
- Markdown documentation repos can model internal document references without adopting Wiki Link syntax.
- Referential Validation becomes independent of document-reference spelling.
- Future formats can be added behind `format` without inventing new semantic types.

Costs:

- Parser schema validation becomes slightly more contextual because `format` and `referenced-type` are valid only for `doc-ref`.
- Resolver contract needs a format-aware migration.
- Existing docs and tests that treat `wiki-link` as a primitive need updating or compatibility aliases.
