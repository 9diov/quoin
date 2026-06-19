# Quoin

Quoin — pronounced *coin* — is a type system for Markdown frontmatter. You declare schemas in plain Markdown files; Quoin validates that your documents conform to them.

A quoin is a wedge used to lock type into a printing chase.

---

## Quick start

### 1. Install

```sh
TARBALL="$(npm pack --quiet | tail -1)"
npm install -g "./$TARBALL"
```

Once Quoin is published to the npm registry, this becomes:

```sh
npm install -g quoin
```

### 2. Write a Type Definition Document

A **Type Definition Document** is a normal `.md` file that self-identifies as a type via `_type: type` in its frontmatter and declares a schema in a fenced YAML block under `## Schema`.

```markdown
---
_type: type
---

## Schema

```yaml
properties:
  title:
    type: text
    required: true
  status:
    type: 'choice<"draft"|"published"|"archived">'
    default: "draft"
  tags:
    type: list<text>
  level:
    type: "[[level]]"
    required: true
    default: "[[levels/beginner]]"
  related:
    type: "list<[[concept]]>"
    default: []
```
```

`level` is a typed Wiki Link — its value must point to a document that itself conforms to the `level` type. `related` is a list of the same. Quoin validates both shape and type conformance.

No special directory is required. Quoin discovers Type Definition Documents by scanning frontmatter, not by path.

### 3. Declare a type on a document

There are two ways to assign a type to a document.

**Option A — per-document frontmatter**

Add `_type` to the document's frontmatter. The value is a Wiki Link whose target matches the basename of the Type Definition Document (case-insensitive).

```yaml
---
_type: "[[concept]]"
title: "Functional Core / Imperative Shell"
status: "draft"
tags: ["architecture", "patterns"]
level: "[[levels/intermediate]]"
related:
  - "[[concepts/pure-functions]]"
  - "[[concepts/side-effects]]"
---
```

`_type` takes a Wiki Link whose target matches the basename of the Type Definition Document (case-insensitive). `level` and `related` are typed links — Quoin resolves them and checks that the target documents conform to the `level` and `concept` types respectively.

**Option B — path bindings**

Declare a binding in `quoin.config.jsonc` that maps a glob to a type name. Every document whose path matches the glob is treated as that type, with no per-document `_type` needed.

```jsonc
{
  "bindings": [
    { "type": "concept", "match": "concepts/**/*.md" },
    { "type": "skill",   "match": "skills/**/*.md" }
  ]
}
```

Use bindings when directory layout already implies the type, or when adding frontmatter to every file is impractical. When a document has both an `_type` frontmatter entry and a matching binding, frontmatter wins.

### 4. Validate

```sh
quoin validate
```

Quoin finds all `.md` files under the current directory, resolves each document's declared type, and reports any schema violations.

---

## Programmatic API

Quoin also exposes the Node-host integration as a library surface.

Canonical import:

```ts
import {
  loadConfigFile,
  resolveEffectiveConfig,
  runNodeCreate,
  runNodeTypes,
  runNodeValidate,
} from "quoin/node-lib";
```

Use this when you want Quoin's real Node filesystem/config/discovery behavior
without invoking the CLI parser or terminal output.

The `quoin` CLI is now a thin shell over the same `node-lib` integration.

---

## Schema syntax

### Property types

| Form | Example declaration | Accepted value |
|---|---|---|
| `text` | `type: text` | Any string |
| `number` | `type: number` | Numeric value (no string coercion) |
| `boolean` | `type: boolean` | `true` / `false` (no string coercion) |
| `date` | `type: date` | Date string (`YYYY-MM-DD`) |
| `datetime` | `type: datetime` | Datetime string |
| `doc-ref` | `type: doc-ref` | `[[Target]]` or `[Label](path/to/target.md)` (either supported syntax) |
| `doc-ref` (format-constrained) | `type: doc-ref` + `format: wiki-link` (or `markdown-link`) | Value must match the declared `format` |
| Typed `doc-ref` | `type: doc-ref` + `referenced-type: skill`, or shorthand `type: "[[skill]]"` / `type: "[](skill)"` | Document reference whose target declares type `skill` |
| List | `type: list<text>` | Ordered list of primitives |
| Typed list | `type: "list<[[skill]]>"`, `type: "list<[](skill)>"`, `type: list<doc-ref>` (+ `format`/`referenced-type`) | Ordered list of document references |
| Enum | `type: 'choice<"draft"\|"published">'` | Exact match against one of the listed literals |

> **YAML quoting:** any `type` value containing `[[...]]` or `[]` must be quoted — bare `[` is a YAML flow-sequence indicator.

### Constraints

| Constraint | Meaning |
|---|---|
| `required: true` | The property key must be present |
| `allow-empty: false` | The value must not be `null`, empty string, or whitespace-only |

`required` controls presence only. `allow-empty` controls the value given presence. Scalar properties fail `allow-empty` by default; list properties pass by default.

### Referential validation

For typed document references — any `doc-ref` with `referenced-type`, including the shorthands `type: "[[level]]"`, `type: "[](level)"`, and `type: "list<[[concept]]>"` — Quoin runs two checks:

1. **Link resolution**: the document-reference target must exist as a document in the project.
2. **Type conformance**: the target document must itself conform to the declared type (i.e. its `_type` must point to the right Type Definition Document).

This means a broken link and a link to the wrong type are both errors, not just warnings.

Referential validation is enabled by default. Disable it with `--no-referential-validation` or `"referentialValidation": false` in config. It is not transitive — validating a `concept` document checks that its `level` target is a valid `level`, but does not recursively validate everything the `level` document links to.

### Defaults

Properties may declare a `default` value:

```yaml
properties:
  status:
    type: 'choice<"draft"|"published">'
    default: "draft"
```

Defaults are used by `quoin create` to scaffold new documents. They are not applied by `validate` — a missing required property is always an error even if a default is declared.

---

## Body syntax

Type Definition Documents may include a `## Body` block that generates the initial Markdown body when a new document is created with `quoin create`.

````markdown
## Body

```markdown
## Summary <!-- required -->

## Notes
```
````

Sections marked `<!-- required -->` cause `validate` to warn when they are missing from an existing document. Body Generation never overwrites existing content.

---

## CLI reference

### `quoin validate [files...]`

Validates documents against their declared types.

```sh
quoin validate                          # validate all .md files under root
quoin validate notes/my-note.md        # validate one file
quoin validate notes/                  # validate a subtree
```

Exits `0` when all targets pass or emit warnings only. Exits non-zero on any validation error, type resolution failure, or discovery problem.

### `quoin create --type <name> --output <path>`

Creates a new document from a type. Scaffolds missing properties from schema defaults and renders the Body block.

```sh
quoin create --type concept --output notes/my-concept.md
```

Aborts if discovery has errors, the type is ambiguous, or the generated document fails validation.

### `quoin types [name]`

Lists all discovered Type Definition Documents, or shows detail for one type.

```sh
quoin types           # list all types
quoin types concept   # show schema for the "concept" type
```

### Global flags

| Flag | Meaning |
|---|---|
| `--config <path>` | Path to a config file |
| `--root <path>` | Project root (overrides config) |
| `--format json` | Machine-readable JSON output |
| `--no-referential-validation` | Skip type-conformance checks on Wiki Link targets |

---

## Configuration

Quoin works with zero configuration. For project-specific settings, create a `quoin.config.jsonc` file at the project root (supports comments):

```jsonc
{
  // Root directory for discovery (defaults to config file's directory)
  "root": ".",

  // Glob patterns for discovery (defaults shown)
  "include": ["**/*.md"],
  "exclude": [".git/**", "node_modules/**"],

  // Key used for type declarations (default: "_type")
  "typeDeclarationKey": "_type",

  // What to do with documents that have no _type: "skip" or "warn"
  "untypedDocumentBehavior": "skip",

  // Check that Wiki Link targets conform to the declared type (default: true)
  "referentialValidation": true,

  // Assign types by path glob — see "Declare a type" above
  "bindings": [
    { "type": "skill", "match": "skills/**/*.md" }
  ]
}
```

Config file discovery walks up from the current working directory. CLI flags take precedence over config file values.
