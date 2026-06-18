# D2 — Type and Schema Contracts

> **Note:** [D9 — Doc Reference Format Separation](D9-doc-ref-format-separation.md) supersedes this document's treatment of internal references. `wiki-link` is no longer a Primitive Type; internal Document references are modeled by `doc-ref` with an optional `format` (`wiki-link` or `markdown-link`) and optional `referenced-type`. The schema shorthands `type: "[[name]]"` and `type: "[](name)"` normalize to `doc-ref`. Below, `type: wiki-link` is accepted only as a compatibility alias for `type: doc-ref` + `format: wiki-link`.

## Type definitions

```typescript
// ── Primitive types ──────────────────────────────────────────────────

type PrimitiveTypeName =
  | 'text'
  | 'number'
  | 'boolean'
  | 'date'
  | 'datetime'
  | 'wiki-link'

type TypeReference = { kind: 'type-ref'; name: string }   // [[name]] usage

type ListItemType =
  | { kind: 'primitive'; name: PrimitiveTypeName }
  | TypeReference

// Union member of a choice<...> type. v1 supports literal members only;
// primitive and type-ref members are reserved for a future union extension
// (e.g. `choice<text|[[tag]]>`). The Parser rejects non-literal members today.
type ChoiceMember =
  | { kind: 'literal';   value: string }
  // | { kind: 'primitive'; name: PrimitiveTypeName }   // reserved (future)
  // | TypeReference                                    // reserved (future)

type CollectionTypeName =
  | { kind: 'list';   of: ListItemType }
  | { kind: 'choice'; members: ChoiceMember[] }   // non-empty, members unique

type PropertyTypeName = PrimitiveTypeName | TypeReference | CollectionTypeName


// ── Schema ───────────────────────────────────────────────────────────

type PropertySchema = {
  type: PropertyTypeName
  required?: boolean
  'allow-empty'?: boolean
  default?: unknown           // used by Scaffolding only, not Validation
}

type Schema = {
  properties: Record<string, PropertySchema>
}


// ── Template Block ───────────────────────────────────────────────────

type Section = {
  level: number               // ATX heading level, 1 through 6
  heading: string
  required: boolean           // true when annotated with <!-- required -->
  defaultContent: string      // body content from Template Block, may be empty
}

type TemplateBlock = {
  sections: Section[]
}


// ── Parsed Type Definition Document ──────────────────────────────────

type TypeDefinitionDocumentIdentity = {
  id: string     // Integration-stable identity, often a path or URI
  name: string   // Type Reference name used in Collection Types
}

type ParserConfig = {
  typeDeclarationKey?: string   // default: '_type'
}

type ParsedTypeDefinitionDocument = {
  id: string
  name: string
  schema: Schema
  templateBlock?: TemplateBlock
}


// ── Parser Result ────────────────────────────────────────────────────

type ParseErrorKind =
  | 'parser:missing-type-declaration'      // frontmatter has no Type Declaration key
  | 'parser:invalid-type-declaration'      // Type Declaration value is not the literal `type`
  | 'parser:missing-schema-block'
  | 'parser:duplicate-schema-block'
  | 'parser:invalid-schema-block'
  | 'parser:invalid-schema-yaml'
  | 'parser:missing-properties'
  | 'parser:unknown-schema-key'
  | 'parser:invalid-property-key'
  | 'parser:unknown-property-type'
  | 'parser:invalid-type-reference'
  | 'parser:invalid-enum'
  | 'parser:invalid-property-schema'
  | 'parser:invalid-default'
  | 'parser:duplicate-template-block'
  | 'parser:invalid-template-block'
  | 'parser:duplicate-required-section'
  | 'parser:invalid-type-definition-identity'

type ParseLocation =
  | { scope: 'document' }
  | { scope: 'block'; block: 'Schema' | 'Template' }
  | { scope: 'property'; property: string }
  | { scope: 'section'; section: string; level: number }

type ParseError = {
  kind: ParseErrorKind
  message: string
  location: ParseLocation
  details?: Record<string, unknown>
}

type ParseResult =
  | { kind: 'ok'; typeDef: ParsedTypeDefinitionDocument }
  | { kind: 'error'; errors: ParseError[] }


// ── Document ─────────────────────────────────────────────────────────

type Document = {
  path: string
  frontmatter: Record<string, unknown>
  body: string
}


// ── Scaffolding ───────────────────────────────────────────────────────

type ScaffoldingResult = {
  // only Properties that were absent and have a declared default
  properties: Record<string, unknown>
}


// ── Templating ────────────────────────────────────────────────────────

type TemplatingResult = {
  body: string
}
```

---

## Core API

```typescript
// Parser
declare function parseTypeDefinitionDocument(
  raw: string,  // full Markdown content of the Type Definition Document
  identity: TypeDefinitionDocumentIdentity,
  config?: ParserConfig
): ParseResult

// Scaffolding
declare function scaffold(
  frontmatter: Record<string, unknown>,
  typeDef: ParsedTypeDefinitionDocument
): ScaffoldingResult

// Templating
declare function template(
  typeDef: ParsedTypeDefinitionDocument
): TemplatingResult
```

Validation API is defined in [D3 — Validation Semantics](D3-validation-semantics.md). Resolver and TypeRegistry contracts are defined in [D4 — Integration Contracts](D4-integration-contracts.md).

---

## Property key constraints

The Core enforces a strict canonical format for Property keys declared in Type Definition Documents:

- Lowercase only
- Characters: `[a-z0-9_-]` — alphanumeric, hyphens, underscores
- No leading or trailing hyphens or underscores (except the reserved `_type` system key)
- No spaces

Rationale: Obsidian (primary Integration target) silently lowercases all Property keys on save. Allowing mixed-case keys in schemas would cause phantom Validation Errors on Obsidian.

The Parser rejects a Type Definition Document that declares a Property key violating these rules.

The same canonical identifier rule applies to:

- Type Reference names inside `type: "[[name]]"` and `list<[[name]]>`
- `TypeDefinitionDocumentIdentity.name`

Quoted literal values inside `choice<...>` (`"draft"`, `'In Progress'`) are NOT subject to the canonical identifier rule — they may contain spaces, mixed case, and most punctuation.

`TypeDefinitionDocumentIdentity.id` is opaque to the Core, but must be a non-empty string after trimming.

Primitive type names and Type Reference names are syntactically disjoint — primitives appear bare (`list<text>`) and Type References appear as Wiki Links (`list<[[skill]]>`) — so the Core does not reserve primitive names as `TypeDefinitionDocumentIdentity.name`. A user MAY name a Type Definition Document `text`, `number`, etc.; usage of that type in another schema is always spelled `[[text]]` and never collides with the primitive.

### Possible future relaxations

In priority order — do not implement until the need arises:

1. **Case normalisation** — allow uppercase keys, normalise to lowercase internally. Most likely relaxation when Hugo/Jekyll Integration is built (`Title`, `Date` are common there).
2. **Dot-notation namespacing** — allow `og.title`, `twitter.card` for OpenGraph/meta schemas in static-site contexts.
3. **Broader leading-underscore allowance** — allow any `_`-prefixed key (not just `_type`) as a vault-owner convention for private/system fields.
4. **Quoted keys with spaces** — YAML supports `"my field": value` but almost no tool handles it well. Unlikely to ever be needed.

### Possible future constraints

In priority order — do not implement until the need arises:

1. **Vault-wide required-on-declared lint** — a lint rule, optionally enforced via a meta-Type Definition Document (ADR-0008), that flags every Property declared in a Type Definition Document that omits `required: true`. This gives teams that want "every declared Property must be present" the safety net without changing the default that `required` is opt-in.

---

## Type Definition Document self-identification

A Type Definition Document declares itself via the system Type Declaration in its frontmatter (ADR-0008):

```markdown
---
_type: type
---

## Schema
...
```

Parser rules:

1. Parser reads the Type Definition Document's frontmatter and looks up the key named by `ParserConfig.typeDeclarationKey` (default `_type`).
2. If the key is absent or the frontmatter block itself is missing, Parser returns `parser:missing-type-declaration` with `location: { scope: 'document' }`.
3. If the key is present but its value is not the literal string `type`, Parser returns `parser:invalid-type-declaration` with `location: { scope: 'document' }` and `details.value`.
4. Wiki Link values such as `"[[Something]]"` under the Type Declaration key produce `parser:invalid-type-declaration` — Type Definition Documents do not conform to another type; they identify themselves with the bare `type` sentinel.
5. `parser:missing-type-declaration` is a structural failure. Parser does not attempt Schema or Template parsing after it.

The bare literal `type` is reserved as a *value* under the Type Declaration key — regular Documents cannot use it as a Type Declaration; their `_type` value is a Wiki Link.

The name `type` is **not** reserved as a Type Reference name. A user may author a Type Definition Document whose `TypeDefinitionDocumentIdentity.name === 'type'`; by convention this is the **user-extensible meta-Type Definition Document** (ADR-0008). The Parser does not treat it specially. When an Integration loads such a Document, it may validate other Type Definition Documents against it through ordinary Validation to enforce extra Properties or required Sections on every Type Definition Document in the vault. The Parser's baseline contract (`_type: type` + `## Schema`) is the entire requirement when no meta-Type Definition Document is present.

Integrations discover Type Definition Documents by scanning frontmatter for the sentinel; path conventions are not part of the Core contract.

---

## Parser block rules

Parser heading matching is exact, case-sensitive, and level-2 only.

Accepted structural headings:

```markdown
## Schema
## Template
```

Rejected structural headings:

```markdown
# Schema
### Schema
## schema
## SCHEMA
## Template:
## Schema <!-- metadata -->
```

### Schema block

`## Schema` is required.

Rules:

1. A Type Definition Document must contain exactly one `## Schema` block.
2. The Schema block must contain exactly one fenced code block.
3. The Schema fence info string must be `yaml` or `yml`.
4. Parser parses only that fenced block as YAML.
5. Non-whitespace prose outside the fenced block inside `## Schema` is a Parser error.
6. Multiple YAML fences inside `## Schema` are a Parser error.

The parsed YAML must contain exactly one top-level key: `properties`.

```yaml
properties:
  description:
    type: text
```

Unknown top-level schema keys are Parser errors. The legacy `fields` key is not accepted.

### Template block

`## Template` is optional.

Rules:

1. A Type Definition Document may contain at most one `## Template` block.
2. If present, the Template block must contain exactly one fenced code block.
3. The Template fence info string must be `markdown` or `md`.
4. The fenced block content is the Template Block body.
5. Non-whitespace prose outside the fenced block inside `## Template` is a Parser error.
6. Multiple Markdown fences inside `## Template` are a Parser error.

Example:

````markdown
## Template

```markdown
## Definitions <!-- required -->
This concept describes...

## References
```
````

### Parser errors

Parser returns structured `ParseResult` instead of throwing for expected authoring errors.

Parser should collect multiple errors where cheap, but skip dependent parsing after a structural failure. For example, if `## Schema` is missing, Parser reports the missing block and does not attempt schema YAML parsing.

---

## Property schema strictness

The schema language is strict by default.

Allowed Property schema keys:

- `type`
- `required`
- `allow-empty`
- `default`

Unknown Property schema keys are Parser errors.

`required` and `allow-empty` must be strict booleans. Strings such as `"true"` and `"false"` are rejected.

`default` is optional and does not couple to `required`. A required Property may omit a default.

When `default` is present, Parser validates it against the same local type and emptiness rules used by Validation:

- No Resolver calls.
- No TypeRegistry calls.
- Primitive defaults must satisfy the primitive's local shape (string for `text`, finite number for `number`, etc.).
- Wiki Link defaults must have valid Wiki Link shape.
- Top-level `[[name]]` defaults must be a single valid Wiki Link.
- `list<X>` defaults must be an array; each item must satisfy X's local shape:
  - When X is a primitive, each item is validated as that primitive.
  - When X is a Type Reference, each item must be a valid Wiki Link.
- `choice<"a"|"b"|"c">` defaults must be a string equal to one of the declared literal members' `value` exactly (case-sensitive).
- Empty defaults must obey `allow-empty`.

This keeps Scaffolding from emitting values that immediately fail local Property validation.

---

## Type expression grammar

A `type:` value in a Property schema is one of:

- A `PrimitiveTypeName` bare identifier — `text`, `number`, `boolean`, `date`, `datetime`, `wiki-link`.
- A bare Wiki Link `[[name]]` — declares the Property holds a Wiki Link to a Document of type *name*. Parsed as `{ kind: 'type-ref'; name }`.
- `list<X>` — a list whose item type is `X`.
- `choice<"a"|"b"|"c">` — a literal enum: the value must equal one of the listed quoted string literals exactly.

The four forms are syntactically disjoint and the Parser dispatches on shape alone.

### Top-level `[[name]]`

```yaml
type: "[[skill]]"        # Property must be a Wiki Link to a Document of type "skill"
```

Parsed as `{ kind: 'type-ref'; name: 'skill' }`. The same bare-Wiki-Link rules used inside `list<...>` (see below) apply: no alias, no fragment, no path; `name` is a canonical identifier.

### `list<X>`

`X` is one of:

- A `PrimitiveTypeName` literal — parsed as `{ kind: 'list'; of: { kind: 'primitive'; name: X } }`.
- A bare Wiki Link `[[name]]` — parsed as `{ kind: 'list'; of: { kind: 'type-ref'; name } }`.

Examples:

```yaml
type: list<text>           # list of strings
type: list<number>         # list of finite numbers
type: list<wiki-link>      # list of bare Wiki Links (no referential validation)
type: "list<[[skill]]>"    # list of Wiki Links resolving to type "skill"
```

### `choice<"a"|"b"|"c">`

`choice` is enum-only in v1: two or more quoted string literals separated by `|`. Parsed as `{ kind: 'choice'; members: [{ kind: 'literal'; value: 'a' }, ...] }`.

Literal members may use either `"double"` or `'single'` quotes — they are equivalent, and a single `choice<...>` may mix styles (`choice<"a"|'b'>`). Quote style does not affect the parsed value.

Whitespace around members is permitted and trimmed: `choice< "a" | "b" >` is equivalent to `choice<"a"|"b">`. Duplicate literal values produce `parser:invalid-enum`.

Bare identifiers inside `choice<...>` (e.g., `choice<draft|published>`) are **not** allowed and produce `parser:invalid-enum`. Bare identifiers are reserved for the future union extension (`choice<text|[[tag]]>`). In v1, every member must be a quoted literal.

There is no `choice<[[name]]>` form. A single-reference Property is spelled `type: "[[name]]"` at the top level.

Examples:

```yaml
type: 'choice<"draft"|"published">'    # outer single-quoted YAML — preferred
type: "choice<'draft'|'published'>"    # inner single-quoted literals also accepted
type: 'choice<"a" | "b" | "c">'        # whitespace around members is ignored
```

### YAML quoting for `choice<...>`

`choice<...>` literals contain `"` or `'`. To keep the schema readable, **author the outer YAML scalar in the opposite quote style** to the inner literal:

```yaml
type: 'choice<"draft"|"published">'    # outer single, inner double — recommended
type: "choice<'draft'|'published'>"    # outer double, inner single
type: "choice<\"draft\"|\"published\">"  # escaped double-in-double — avoid
```

Plain (unquoted) YAML is not portable because `<`, `>`, `"`, and `'` are not reliably parseable as plain scalars across YAML implementations. Always quote a `type` value that contains `choice<...>`.

### Literal value rules

Inside `choice<...>` quoted literals:

- Any character except the opening quote character, newline, and `|` is allowed.
- No escape sequences in v1. A literal cannot contain its own quote character. Use the other quote style if you need a `"` or `'` inside the value (e.g. `choice<'they"ll'|'others'>`).
- Empty literals (`""`, `''`) are rejected at parse time → `parser:invalid-enum`. To permit an empty value, declare `allow-empty: true` on the Property.

### Bare Wiki Link rules

Wherever `[[name]]` appears in a `type:` value — at the top level or inside `list<...>` — it must be the bare form:

- Exact shape `[[name]]` — no alias (`[[name|alias]]`), no heading or block fragment (`[[name#heading]]`, `[[name#^block]]`), no path (`[[dir/name]]`).
- `name` must be a canonical identifier (lowercase, `[a-z0-9_-]`, no leading/trailing `-` or `_`).
- Whitespace around `[[name]]` inside the angle brackets is permitted and trimmed.

Violations produce `parser:invalid-type-reference` with `details.value` and one of:

- `details.reason: 'wiki-link-not-bare'` — the Wiki Link includes alias, fragment, or path segments (e.g., `"[[skill|alias]]"`, `"[[skill#heading]]"`, `"[[types/skill]]"`).
- `details.reason: 'non-canonical-name'` — name inside `[[...]]` is not a canonical identifier (e.g., `"[[Skill]]"`).

### YAML quoting

A top-level `[[name]]` MUST be quoted, because an unquoted scalar starting with `[` is parsed as a YAML flow sequence:

```yaml
type: "[[skill]]"      # MUST quote — required
type: [[skill]]        # parsed as a nested sequence — wrong
```

`list<[[name]]>` SHOULD be quoted for portability across YAML parsers:

```yaml
type: "list<[[skill]]>"
```

Primitive forms and enums contain no flow indicators and parse safely unquoted:

```yaml
type: text
type: list<text>
type: choice<draft|published>
```

### Errors

- Non-Wiki-Link Type Reference at top level or inside `list<...>` (e.g., `type: skill`, `list<skill>`) → `parser:unknown-property-type` at top level (it is neither a primitive nor a recognised collection form); inside `list<...>` → `parser:invalid-type-reference` with `details.reason: 'expected-wiki-link-or-primitive'`.
- Non-canonical name inside `[[...]]` (e.g., `"[[Skill]]"`, `"list<[[Skill]]>"`) → `parser:invalid-type-reference` with `details.reason: 'non-canonical-name'`.
- Non-bare Wiki Link (alias, fragment, or path) → `parser:invalid-type-reference` with `details.reason: 'wiki-link-not-bare'`.
- Empty bracket contents (`list<>`, `choice<>`), empty enum segments (`choice<"a"|>`, `choice<|"b">`), bare identifiers in `choice<...>` (e.g. `choice<draft|published>`), empty literals (`choice<""|"b">`), duplicate literal values, single member (`choice<"a">` has no `|`), or Wiki Links inside `choice<...>` (e.g., `choice<[[a]]|[[b]]>`) → `parser:invalid-enum`.
- Other angle-bracket constructors (`set<X>`, `map<K,V>`, nested generics) → `parser:unknown-property-type`.

---

## Link grammar

### Wiki Link shape

Core shape validation accepts Obsidian-compatible Wiki Link envelopes, while all resolution semantics remain in Resolver.

Accepted examples:

```markdown
[[TargetDocument]]
[[path/to/TargetDocument]]
[[TargetDocument|Alias]]
[[TargetDocument#Heading]]
[[TargetDocument#^block-id]]
[[TargetDocument|Alias With Spaces]]
```

Shape rules:

- Value must start with `[[` and end with `]]`.
- Target before `|`, `#`, or end must be non-empty.
- Alias after `|` is optional.
- Heading or block fragment after `#` is optional.
- Nested `[[` or `]]` is rejected.
- Surrounding whitespace is rejected.

Resolver receives the original raw string.

## Section parsing

Sections are parsed from Template Block content and Document bodies using ATX headings only.

Rules:

- ATX headings only (`#` through `######`).
- Setext headings are ignored.
- Headings inside fenced code blocks are ignored.
- Section identity is exact heading level plus exact heading text.
- Heading text matching is case-sensitive.
- A Section is present even if it has no body content.

Required marker rules:

- A heading is required if it contains an inline HTML comment whose trimmed content is exactly `required`.
- Whitespace around `required` inside the comment is flexible.
- The required marker is removed from parsed heading text.

Accepted required markers:

```markdown
## Definitions <!-- required -->
## Definitions<!-- required -->
## Definitions <!--required-->
## Definitions <!--   required   -->
```

Rejected required markers:

```markdown
## Definitions <!-- required-section -->
## Definitions <!-- Required -->
## Definitions <!-- required=true -->
```

## Design Principle Violation

**DP7 — Host-specific convention baked into Core** (property key syntax, rationale at the `[a-z0-9_-]` constraint)

The lowercase-only property key rule is justified by Obsidian's silent-lowercasing behaviour: "Obsidian (primary Integration target) silently lowercases all Property keys on save. Allowing mixed-case keys in schemas would cause phantom Validation Errors on Obsidian." This embeds a host-specific normalisation as a universal Core constraint rather than surfacing the collision at the Integration layer. DP7 requires that host conventions be permitted at the Integration layer but never silently absorbed into Core behaviour.

Duplicate required Section identities inside a Template Block are Parser errors. Duplicate non-required Section identities are allowed.
