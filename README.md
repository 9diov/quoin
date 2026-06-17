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
- **Document initialization** — Scaffolding fills missing frontmatter Properties from schema defaults; Templating generates the initial Markdown body for new Documents from `## Template`. Both are creation-only — they never overwrite existing content.

## Tech stack

- TypeScript

## Architecture

The system follows a Functional Core / Imperative Shell architecture.

- **Core** is pure TypeScript: Parser, Validation, Scaffolding, Templating, and schema resolution helpers.
- **Integrations** own I/O: reading Documents, writing Scaffolding and Templating Results, constructing Wiki Link Resolvers, supplying TypeRegistry lookup, and passing Validation Config.

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
| Primitive | `type: text` | One of `text`, `number`, `boolean`, `date`, `datetime`, `wiki-link`. |
| Typed reference | `type: "[[skill]]"` | A Wiki Link to a Document of type `skill`. |
| List | `type: list<text>` / `type: "list<[[skill]]>"` | Ordered list whose items are primitives or typed references. |
| Enum | `type: 'choice<"draft"\|"published">'` | Value must equal one of the listed quoted string literals exactly. |

YAML quoting note: any `type` value containing `[[...]]` should be quoted — `[` is a YAML flow-sequence indicator. Bare `[[name]]` at the top level MUST be quoted; `list<[[name]]>` SHOULD be quoted for portability.

Supported Constraints:

- `required`
- `allow-empty`

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

## Template syntax

Type Definition Documents may declare a `## Template` block for new Document bodies:

````markdown
## Template

```markdown
## Definitions <!-- required -->
This concept describes...

## Why it matters? <!-- required -->

## Applications

## References
```
````

Required Sections are marked with `<!-- required -->`. Section matching is exact heading text plus exact heading level. On existing Documents, Validation warns when required Sections are missing; Templating never overwrites existing content.

## Link semantics

- **Wiki Links** use `[[TargetDocument]]` and are resolved by an Integration-supplied Resolver during standard Validation.
- **External Links** use standard Markdown link syntax, `[text](url)`, and are currently declared as `type: text`.
- **Referential Validation** is opt-in. It applies only to typed references — `type: "[[name]]"` and `list<[[name]]>` — checking whether linked Documents conform to declared Type References using an Integration-supplied TypeRegistry. Primitive `wiki-link`, `list<wiki-link>`, and `choice<"a"|"b"|"c">` carry no Type Reference and are never referentially validated.
- Referential Validation is not transitive.

## Design docs

- [Context and glossary](CONTEXT.md)
- [Architecture](docs/design/D1-architecture.md)
- [Type and schema contracts](docs/design/D2-type-and-schema-contracts.md)
- [Validation semantics](docs/design/D3-validation-semantics.md)
- [Integration contracts](docs/design/D4-integration-contracts.md)
- [Node CLI integration](docs/design/D5-node-cli-integration.md)
- [ADRs](docs/adr/)
