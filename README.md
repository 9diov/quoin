# Markdown Type System

A type system for Markdown files that validates YAML frontmatter Properties against schemas declared in Markdown Type Definition Documents.

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
  skills:
    type: list<skill>
    allow-empty: false
  homepage:
    type: url
  level:
    type: choice<level>
    required: true
    default: "[[levels/Beginner]]"
```
````

Documents conform to a Type Definition Document by declaring `_type` in frontmatter:

```yaml
_type: "[[Concept]]"
description: "A reusable idea"
skills:
  - "[[skills/TypeScript]]"
homepage: "[TypeScript](https://www.typescriptlang.org/)"
level: "[[levels/Beginner]]"
```

Supported primitive Property types:

- `text`
- `number`
- `boolean`
- `date`
- `datetime`
- `wiki-link`
- `url`

Supported Collection Types:

- `list<X>` — ordered list of Wiki Links to Documents conforming to Type Definition Document `X`
- `choice<Y>` — one Wiki Link to a Document conforming to Type Definition Document `Y`

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
- `url` validates Markdown External Link syntax and configured allowed URL schemes, with no network checks.

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
- **External Links** use standard Markdown link syntax, `[text](url)`, and are declared as `type: url`.
- **Referential Validation** is opt-in. It applies only to `list<X>` and `choice<Y>`, checking whether linked Documents conform to declared Type References using an Integration-supplied TypeRegistry.
- Referential Validation is not transitive.

## Design docs

- [Context and glossary](CONTEXT.md)
- [Architecture](docs/design/D1-architecture.md)
- [Type and schema contracts](docs/design/D2-type-and-schema-contracts.md)
- [Validation semantics](docs/design/D3-validation-semantics.md)
- [Integration contracts](docs/design/D4-integration-contracts.md)
- [ADRs](docs/adr/)
