# D2 — Type and Schema Contracts

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
  | 'url'

type CollectionTypeName =
  | { kind: 'list';   of: string }   // string = Type Reference name
  | { kind: 'choice'; of: string }

type PropertyTypeName = PrimitiveTypeName | CollectionTypeName


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
  allowedUrlSchemes?: string[]  // default: ['http', 'https', 'mailto']
}

type ParsedTypeDefinitionDocument = {
  id: string
  name: string
  schema: Schema
  templateBlock?: TemplateBlock
}


// ── Parser Result ────────────────────────────────────────────────────

type ParseErrorKind =
  | 'parser:missing-schema-block'
  | 'parser:duplicate-schema-block'
  | 'parser:invalid-schema-block'
  | 'parser:invalid-schema-yaml'
  | 'parser:missing-properties'
  | 'parser:unknown-schema-key'
  | 'parser:invalid-property-key'
  | 'parser:unknown-property-type'
  | 'parser:invalid-type-reference'
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

- Type Reference names in `list<X>` and `choice<Y>`
- `TypeDefinitionDocumentIdentity.name`

`TypeDefinitionDocumentIdentity.id` is opaque to the Core, but must be a non-empty string after trimming.

### Possible future relaxations

In priority order — do not implement until the need arises:

1. **Case normalisation** — allow uppercase keys, normalise to lowercase internally. Most likely relaxation when Hugo/Jekyll Integration is built (`Title`, `Date` are common there).
2. **Dot-notation namespacing** — allow `og.title`, `twitter.card` for OpenGraph/meta schemas in static-site contexts.
3. **Broader leading-underscore allowance** — allow any `_`-prefixed key (not just `_type`) as a vault-owner convention for private/system fields.
4. **Quoted keys with spaces** — YAML supports `"my field": value` but almost no tool handles it well. Unlikely to ever be needed.

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
- Wiki Link defaults must have valid Wiki Link shape.
- URL defaults must have valid External Link shape and allowed scheme under ParserConfig.
- Empty defaults must obey `allow-empty`.

This keeps Scaffolding from emitting values that immediately fail local Property validation.

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

### External Link shape

`url` values use a constrained Markdown External Link shape:

```markdown
[text](url)
```

Rules:

- Link text must be non-empty after trimming.
- Link text may contain Markdown formatting, but not an unescaped `]`.
- URL target must be non-empty.
- URL target must contain no whitespace.
- URL target must contain no raw parentheses.
- Markdown link titles are not supported initially.
- Surrounding whitespace is rejected.
- URL target must parse and its scheme must be allowed by Validation Config.
- Core never performs network validation.

Accepted:

```markdown
[Docs](https://example.com)
[**Docs**](https://example.com)
[`API`](https://example.com)
```

Rejected:

```markdown
[](https://example.com)
[   ](https://example.com)
[Docs](https://example.com "Example docs")
[Spec](https://example.com/path(foo))
 [Docs](https://example.com) 
```

---

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

Duplicate required Section identities inside a Template Block are Parser errors. Duplicate non-required Section identities are allowed.
