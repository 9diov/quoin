# Quoin

Quoin, pronounced *coin*, is a type system for Markdown files that validates YAML frontmatter Properties against schemas declared in Markdown Type Definition Documents.

## Install

For local packaging verification:

```sh
npm run build
TARBALL="$(npm pack --quiet | tail -1)"
npm install -g "./$TARBALL"
```

For source checkout development:

```sh
npm run cli -- --help
```

## What it does

- **Type Definition Documents** live in `types/*.md` and declare schemas under `## Schema`
- **Documents** declare their type with a Type Declaration in frontmatter, defaulting to `_type: "[[Concept]]"`
- **Validation** checks frontmatter Properties and required body Sections
- **Document initialization** — Scaffolding fills missing frontmatter Properties from schema defaults; Body Generation generates the initial Markdown body for new Documents from `## Body`. Both are creation-only — they never overwrite existing content.

## Tech stack

- TypeScript

## Architecture

The system follows a Functional Core / Imperative Shell architecture.

- **Core** is pure TypeScript: Parser, Validation, Scaffolding, Body Generation, and schema resolution helpers.
- **Integrations** own I/O: reading Documents, writing Scaffolding and Body Generation Results, constructing Wiki Link Resolvers, supplying TypeRegistry lookup, and passing Validation Config.

Target Integrations:

- Obsidian plugin
- Browser bundle
- Node.js CLI/API

## Schema syntax

A Type Definition Document defines the schema of a type. It is a normal Document that self-identifies via `_type: type` in its frontmatter — integrations discover Type Definition Documents by scanning frontmatter, not by directory layout.

The schema declares Properties in a fenced YAML block under `## Schema`:

````markdown
## Schema

```yaml
properties:
  description:
    type: text
    required: true
  tags:
    type: list<text>
  skills:
    type: "list<[[skill]]>"
    allow-empty: false
  homepage:
    type: text
  level:
    type: "[[level]]"
    required: true
    default: "[[levels/Beginner]]"
  status:
    type: 'choice<"draft"|"published"|"archived">'
    default: "draft"
```
````

Documents conform to a Type Definition Document by declaring `_type` in frontmatter:

```yaml
_type: "[[Concept]]"
description: "A reusable idea"
tags: ["typescript", "types"]
skills:
  - "[[skills/TypeScript]]"
homepage: "[TypeScript](https://www.typescriptlang.org/)"
level: "[[levels/Beginner]]"
status: "draft"
```

Supported Property types:

| Form | Example | Meaning |
|---|---|---|
| Primitive | `type: text` | One of `text`, `number`, `boolean`, `date`, `datetime`. |
| Document reference | `type: doc-ref` | A reference to another Document in either supported syntax. |
| Document reference (constrained format) | `type: doc-ref` + `format: wiki-link` (or `markdown-link`) | Narrowed to one concrete link syntax. |
| Typed document reference | `type: doc-ref` + `referenced-type: skill`, or shorthand `type: "[[skill]]"` / `type: "[](skill)"` | Document reference whose target must declare type `skill`. |
| List | `type: list<text>` / `type: "list<[[skill]]>"` / `type: list<doc-ref>` | Ordered list whose items are primitives or document references. |
| Enum | `type: 'choice<"draft"\|"published">'` | Value must equal one of the listed quoted string literals exactly. |

YAML quoting note: any `type` value containing `[[...]]` or `[]` should be quoted — `[` is a YAML flow-sequence indicator. Bare `[[name]]` and `[](name)` at the top level MUST be quoted; `list<[[name]]>` and `list<[](name)>` SHOULD be quoted for portability.

Supported Constraints:

- `required`
- `allow-empty`

`format` and `referenced-type` are valid only on `doc-ref` properties (including `list<doc-ref>` items). When `format` is omitted, `doc-ref` accepts either supported syntax.

`default` is used by Scaffolding only. Validation does not apply or evaluate defaults.

## Validation semantics

- Schemas are open by default; unknown frontmatter Properties are allowed.
- `required` controls key presence only.
- `allow-empty` controls present-but-empty values.
- `null` and whitespace-only strings are empty.
- Empty scalar values fail by default; empty lists pass by default.
- `number` and `boolean` do not coerce strings.
- `date` and `datetime` are string-only; Integrations should avoid YAML date coercion before calling Core.
- External links are ordinary `text` values in this phase; Quoin does not validate URL or Markdown link syntax.

## Body syntax

Type Definition Documents may declare a `## Body` block for new Document bodies:

````markdown
## Body

```markdown
## Definitions <!-- required -->
This concept describes...

## Why it matters? <!-- required -->

## Applications

## References
```
````

Required Sections are marked with `<!-- required -->`. Section matching is exact heading text plus exact heading level. On existing Documents, Validation warns when required Sections are missing; Body Generation never overwrites existing content.

## Link semantics

- **Document References** (`type: doc-ref`) are internal references resolved by an Integration-supplied Resolver during standard Validation.
- Supported `doc-ref` formats are `wiki-link` (`[[Target]]`) and `markdown-link` (`[Label](path/to/target.md)`). Protocol-qualified targets (`https://…`, `mailto:…`) are not document references.
- **External Links** use standard Markdown link syntax with an explicit protocol, e.g. `[text](https://example.com)`, and are currently declared as `type: text`.
- **Referential Validation** is opt-in. It applies only to document references whose schema sets `referenced-type` (or the shorthand `type: "[[name]]"` / `type: "[](name)"`), checking whether the linked Document declares the expected type via an Integration-supplied TypeRegistry. A `doc-ref` without `referenced-type` validates link shape and target existence but is never referentially validated.
- Referential Validation is not transitive.

## Design docs

- [Context and glossary](CONTEXT.md)
- [Architecture](docs/design/D1-architecture.md)
- [Type and schema contracts](docs/design/D2-type-and-schema-contracts.md)
- [Validation semantics](docs/design/D3-validation-semantics.md)
- [Integration contracts](docs/design/D4-integration-contracts.md)
- [Node CLI integration](docs/design/D5-node-cli-integration.md)
- [ADRs](docs/adr/)

## Related projects
* https://github.com/platers/obsidian-linter
