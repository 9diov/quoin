---
_type: "[[design-doc]]"
status: "draft"
terms: ["Collection Type", "Doc Reference", "Document", "External Link", "Integration", "Link Resolution", "Markdown Link", "Parser", "Property", "Referential Validation", "Resolve Doc Reference Result", "Resolver", "Type Declaration", "Type Definition Document", "Type Reference", "TypeRegistry", "Validation", "Wiki Link"]
---

# D9 — Doc Reference Format Separation

## Problem

Quoin currently uses `wiki-link` for two different concepts:

- The semantic concept: an internal reference to another Document.
- The concrete syntax: a `[[Target]]` Wiki Link string.

That coupling works for Obsidian-style vaults, but it is too narrow for Markdown documentation repositories that use ordinary Markdown links for internal references. A repo should be able to say "this property is an internal document reference" without also saying "the value must be written in double-bracket syntax".

The schema language should separate reference semantics from link syntax.

## Decision

Introduce `doc-ref` as the semantic Property type for internal document references.

`doc-ref` may accept a `format` option that narrows the allowed concrete syntax:

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

Without a `format`, `doc-ref` accepts either supported internal-reference
syntax.

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
  format?: DocRefFormat
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

Normalization note:

- `format` and `referenced-type` are parser input keys only.
- In the parsed schema, they are represented inside `PropertySchema.type` as the
  `DocReference` object.
- Parsed `PropertySchema` does not gain sibling `format` or `referenced-type`
  fields.

This new shape intentionally absorbs two existing cases:

- `DocReference` without `referencedType` replaces today's primitive
  `wiki-link` semantics: shape validation plus resolution, but no Referential
  Validation.
- `DocReference` with `referencedType` replaces today's `TypeReference`
  / `type-ref` semantics: shape validation, resolution, and optional
  Referential Validation against the expected type.

Canonical display spellings for diagnostics, defaults, and test snapshots
should be:

- unconstrained scalar: `doc-ref`
- constrained scalar with `format: wiki-link`: `doc-ref<wiki-link>`
- constrained scalar with `format: markdown-link`: `doc-ref<markdown-link>`
- constrained scalar with `referenced-type: person`: `doc-ref<person>` when
  `format` is omitted, `doc-ref<wiki-link, person>` or
  `doc-ref<markdown-link, person>` when `format` is present
- unconstrained list item: `list<doc-ref>`
- constrained list item: `list<doc-ref<...>>`

## Schema Grammar

The explicit object form is canonical:

```yaml
properties:
  source:
    type: doc-ref
```

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

`format` is valid only when the declared Property type is `doc-ref`, either as
`type: doc-ref` or `type: list<doc-ref>`.

`referenced-type` is valid only when the declared Property type is `doc-ref`,
either as `type: doc-ref` or `type: list<doc-ref>`.

`referenced-type` must be a canonical Type Reference name, using the same identifier rule as existing `[[name]]` type references.

When `type: doc-ref` or `type: list<doc-ref>` omits `format`, the schema means
"accept any supported internal document-reference format." When `format` is
present, it narrows the accepted value syntax to that one format.

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

`format` and `referenced-type` apply to the `doc-ref` item when
`type: list<doc-ref>`. They are invalid for lists of other item types.

## Runtime Value Syntax

When `format: wiki-link`, runtime values must be valid Wiki Link strings:

```yaml
source: "[[Pattern of Enterprise Application Architecture]]"
```

When `format: markdown-link`, runtime values must be valid inline Markdown links to internal targets:

```yaml
source: "[PoEAA](sources/poeaa.md)"
```

The initial `markdown-link` grammar should be deliberately narrow:

- Inline links only: `[label](target)`.
- Non-empty label.
- Non-empty target.
- No explicit protocol links such as `https://`, `http://`, `mailto:`, `ftp://`
  in the core grammar.
- No bare autolinks.
- No reference-style Markdown links.

`markdown-link` target interpretation is source-document-relative:

- The target path is resolved relative to the containing Document's path.
- `./chapter.md` and `../shared/glossary.md` use ordinary relative-path
  semantics after path normalization.
- A target beginning with `/` is project-root-relative or vault-root-relative,
  according to the Integration's existing document-root model.
- A target without `./`, `../`, or `/` is still treated as a relative path from
  the containing Document's directory.
- Fragments such as `#section` may be preserved during parsing, but resolution
  and Referential Validation compare the target Document, not the fragment.

Protocol-qualified links are intentionally out of scope for the core
`doc-ref` grammar.

- `[My Doc](https://example.com/my-doc.md)` is not a document reference in
  Quoin terms; it is an external link, even if it happens to point to a Markdown
  file.
- Allowing protocol links would collapse the distinction between "internal
  document identity" and "arbitrary URL string", which D9 is trying to make
  explicit.
- External resources should remain `text` until Quoin gains a separate
  text-refinement or external-link mechanism.

This remains an extension point for future Integrations.

- A future Integration may define custom protocol-aware document references such
  as `obsidian://`, `app://`, or another workspace-local scheme.
- That extension is not part of the core `markdown-link` contract in D9.
- If introduced later, it should be a deliberate Integration capability with
  explicit parsing and resolution rules, rather than an accidental consequence
  of accepting arbitrary protocol targets in the core grammar.

## Validation Semantics

`doc-ref` validation replaces primitive `wiki-link` validation.

For any present non-empty `doc-ref` value:

1. Validate that the value is a string in one supported document-reference
   syntax.
2. When `format` is omitted, core shape matching is deterministic:
   - try `wiki-link` shape first
   - then try core `markdown-link` shape
   - otherwise fail with `property:wrong-type`
3. If `format` is present, validate that the matched syntax is the declared
   `format`.
4. Otherwise, accept either supported syntax.
5. Resolve the reference with Resolver.
6. If `referenced-type` is present and `referentialValidation: true`, validate that the resolved target Document declares the expected type through TypeRegistry.

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
  format?: DocRefFormat
  sourceDocumentPath: string
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
- When `format` is omitted, the Integration must first detect which supported
  syntax the value uses according to the core matching order, then resolve
  according to that syntax.
- `markdown-link` is resolved relative to `sourceDocumentPath`.
- Node CLI should normalize the link target against `sourceDocumentPath` and
  then resolve the resulting in-project path.
- Obsidian may support `markdown-link` by translating the relative target plus
  `sourceDocumentPath` into the vault path model, or may reject the format
  until that mapping is reliable.
- By default, a protocol-qualified target must be rejected during shape
  validation before Resolver is invoked.
- A future Integration-defined extension may override that default for specific,
  explicitly supported schemes.

TypeRegistry still resolves Type Definition Documents by canonical type name. `referenced-type` is already a type name, so it does not depend on the reference format.

Type Declarations have two separable meanings:

1. The Document conforms to a named type.
2. That named type is backed by a Type Definition Document that can be resolved by TypeRegistry.

In the current model, Wiki-Link-shaped Type Declarations carry both meanings.

`TypeRegistry.getByDeclaration(value)` continues to accept the current
declaration form:

```yaml
_type: "[[article]]"
```

That declaration means:

- This Document conforms to type `article`.
- Type `article` is declared by a resolvable Type Definition Document.

That second meaning is what enables Referential Validation to compare the
target Document's resolved Type Definition Document with the
`referenced-type` declared in the source schema.

Future work may add bare Type Declarations:

```yaml
_type: article
```

A bare declaration would mean only that the Document conforms to type `article`. It would not, by itself, assert that `article` is declared by a Type Definition Document. That leaves room for alternate type-definition mechanisms, external registries, generated schemas, or integration-specific type catalogs.

Bare Type Declarations are not part of this change. Until such a mechanism
exists, `TypeRegistry.getByDeclaration('article')` should continue to return
`invalid-declaration`.

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

Existing runtime wiki-link values remain valid when the normalized format is
`wiki-link`, and also when `format` is omitted and the value matches wiki-link
shape.

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

1. Should `[](person)` be called Markdown-link shorthand even though empty-label Markdown links are not useful runtime links?

   Recommendation: yes, because this syntax appears only in schema type position. Runtime `markdown-link` values should require non-empty labels.

2. Should resolution error kinds be renamed from `wiki-link` to `doc-ref`?

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
