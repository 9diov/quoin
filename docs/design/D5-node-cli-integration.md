# D5 — Node CLI Integration

## Overview

This document defines a narrow Node.js CLI integration for Quoin.

It is a **reference integration**:

- real filesystem-backed I/O
- real Markdown discovery and frontmatter parsing
- real Resolver and TypeRegistry wiring
- no host-specific behavior beyond Node and the local filesystem

It remains aligned with [D1 — Architecture](D1-architecture.md): Core stays pure, and the CLI owns discovery, ingestion, root type dispatch, lookup strategy, config, reporting, and writes.

## Goals

V1 goals:

1. Discover and parse Type Definition Documents from disk.
2. Validate one file, many files, or a subtree of files.
3. Create a new Document from a discovered Type Definition Document using Scaffolding and Templating.
4. Expose registry and discovery state for debugging.

V1 commands:

- `validate`
- `create`
- `types`

## Non-goals

The Node CLI v1 does not:

- repair or mutate existing authored Documents during validation
- watch files or run as a daemon
- persist caches across runs
- emulate full Obsidian path semantics
- require a specific directory layout such as `types/`
- auto-enforce meta-Type Definition Document validation
- accept arbitrary caller-supplied frontmatter for `create`
- follow symlinks
- read or write outside the effective project root

## Project Model

The CLI is **project-scoped**. Every run has one effective root directory. All discovery, validation targets, resolver indexing, output paths, and Type Definition identities are interpreted relative to that root.

Node CLI parser identity:

```typescript
type NodeTypeIdentity = {
  id: string   // normalized root-relative POSIX path, e.g. "types/Concept.md"
  name: string // lowercase basename without extension, e.g. "concept"
}
```

Recommended derivation:

- `id =` normalized root-relative POSIX path
- `name =` lowercase basename without extension

Example:

- `types/Concept.md` -> `{ id: 'types/Concept.md', name: 'concept' }`

## Commands

### `validate`

`validate` is read-only.

Per run it:

1. discovers the full project-scoped Markdown universe
2. builds the TypeRegistry and Resolver from that universe
3. chooses explicit or default validation targets
4. resolves each target Document's root Type Declaration outside Core
5. calls `validate(...)` only when the root type resolves uniquely
6. reports per-target outcomes plus run-level diagnostics

It never:

- writes scaffolded defaults
- inserts Template Sections
- rewrites frontmatter
- normalizes body formatting

### `create`

`create` creates a new Markdown Document from a discovered Type Definition Document.

Per run it:

1. discovers the full project-scoped Markdown universe
2. builds the TypeRegistry and Resolver from that universe
3. resolves the selected type by canonical type name
4. synthesizes initial frontmatter using only the configured Type Declaration key
5. calls `scaffold(...)`
6. calls `template(...)`
7. builds a candidate `Document`
8. runs `validate(...)` against that candidate
9. aborts on validation errors
10. writes on warnings only

Example:

```text
create --type concept --output notes/my-note.md
```

V1 `create` does not accept arbitrary caller-supplied frontmatter.

### `types`

`types` is a registry and discovery introspection command.

It:

- lists discovered Type Definition Documents
- lists discovered Type Definition Document parse failures
- may show detail for one resolved type
- surfaces ambiguity where lookup by canonical type name is not unique

## Config

The CLI supports zero-config operation and an optional project config file:

```text
quoin.config.jsonc
```

Config discovery precedence:

1. `--config <path>`
2. upward search from current working directory
3. zero-config fallback rooted at current working directory

Root precedence:

1. `--root <path>`
2. config file directory when config is used
3. current working directory in zero-config mode

After the effective root is computed:

- include/exclude globs are interpreted relative to it
- reported paths are relative to it
- type `id` values are relative to it

Semantic config model:

```typescript
type NodeCliConfig = {
  root?: string
  include?: string[]
  exclude?: string[]
  typeDeclarationKey?: string
  untypedDocumentBehavior?: 'skip' | 'warn'
  referentialValidation?: boolean
  resolver?: {
    strategy?: 'basename'
  }
  output?: {
    format?: 'human' | 'json'
  }
}
```

Config precedence:

1. command flags
2. config file
3. built-in defaults

Recommended defaults:

```typescript
const defaults = {
  include: ['**/*.md'],
  exclude: ['.git/**', 'node_modules/**'],
  typeDeclarationKey: '_type',
  untypedDocumentBehavior: 'skip',
  referentialValidation: true,
  resolver: { strategy: 'basename' },
  output: { format: 'human' },
}
```

Core still defaults `referentialValidation` to `false`. The Node CLI intentionally overrides that integration policy and enables referential validation by default, with an explicit opt-out such as `--no-referential-validation`.

## Discovery And File Selection

Discovery is full-scope and project-wide for every command, even when `validate` is given one explicit target. Explicit validation targets narrow only which regular Documents are validated. They do not narrow discovery.

Discovery scope:

- files under the effective root
- matching include globs
- not matching exclude globs
- Markdown files only
- symlinks ignored

`validate` target rules:

- explicit file targets must be in-root Markdown files and not excluded
- explicit directory targets expand recursively to Markdown files under that subtree
- explicit directory expansion still respects `exclude`
- explicit directory expansion does not require matching global `include`

All targets are:

- normalized to root-relative POSIX paths
- de-duplicated
- processed in stable lexical order

If no explicit targets are given, `validate` targets all regular Documents in the discovery universe.

Type Definition Documents are not validated as ordinary Documents by default.

`create` requires an explicit output path. It must be under the effective root, must not already exist, and may create parent directories automatically.

## Document Ingestion

The CLI should use one shared ingestion pipeline for all commands.

```typescript
type IngestedMarkdown =
  | { kind: 'document'; path: string; raw: string; document: Document }
  | { kind: 'ingest-failure'; path: string; stage: 'read' | 'frontmatter'; reason: string }
```

Pipeline:

1. enumerate candidate Markdown paths
2. read raw file contents
3. split top-of-file YAML frontmatter when present
4. parse frontmatter with YAML
5. require parsed frontmatter, when present, to be a mapping/object
6. preserve the body exactly after the frontmatter split
7. produce either:
   - a `Document`
   - an ingestion diagnostic
8. among ingested `Document`s, discover Type Definition Document candidates by sentinel frontmatter
9. parse discovered type candidates with `parseTypeDefinitionDocument(...)`
10. build resolver and registry indexes from successful artifacts

No-frontmatter Markdown files are valid regular Documents:

- `frontmatter = {}`
- `body =` full file content

Malformed frontmatter is an integration ingestion failure, not a Core validation result.

## Type Definition Discovery

The CLI preserves the discovery contract from [D4 — Integration Contracts](D4-integration-contracts.md).

A Markdown file is a Type Definition Document candidate when:

```typescript
frontmatter[typeDeclarationKey] === 'type'
```

Directory layout is not semantic.

Discovery keeps separate:

- discovered type candidates that parsed successfully
- discovered type candidates that failed parsing

Type Definition Document parse failures remain visible in `types` and `validate`.

## Root Type Dispatch

Root Type Declaration dispatch is Integration-owned.

For a regular `Document`, the CLI:

1. reads `document.frontmatter[typeDeclarationKey]`
2. if missing:
   - returns `skipped-untyped` when `untypedDocumentBehavior === 'skip'`
   - returns `warn-untyped` when `untypedDocumentBehavior === 'warn'`
3. otherwise resolves the declaration through the TypeRegistry
4. calls `validate(document, typeDef, config, resolver, typeRegistry)` only when the declaration resolves uniquely

Accepted declaration value space:

- regular Documents: Wiki Link strings such as `[[Concept]]`
- Type Definition Documents: the bare literal `type`

The CLI does not add alternate declaration syntaxes such as bare names, file paths, or aliases.

## Resolver

The Node CLI supplies a filesystem-backed `Resolver`.

V1 resolver policy:

```typescript
resolver.strategy = 'basename'
```

This is the only supported strategy in v1, though the strategy slot remains configurable for future extensibility.

Resolution rules:

1. parse the raw Wiki Link string
2. extract only the document target portion
3. if the target contains path segments, use only the final path segment
4. ignore section fragments and display text for lookup
5. match by basename against the project-wide resolver universe

Examples:

- `[[TypeScript]]` -> `TypeScript`
- `[[skills/TypeScript]]` -> `TypeScript`
- `[[TypeScript#Generics]]` -> `TypeScript`
- `[[TypeScript|TS]]` -> `TypeScript`

The resolver indexes all ingested Markdown `Document`s in scope, including Type Definition Documents.

Resolver outcomes follow [D4](D4-integration-contracts.md):

- `found`
- `not-found`
- `invalid-link`
- `ambiguous`
- `unavailable`

Node-specific guidance:

- no basename match -> `not-found`
- one basename match that failed ingestion -> `unavailable`
- multiple basename matches -> `ambiguous`, even if some are unavailable

This conservative rule prevents hidden basename collisions.

## TypeRegistry

The Node CLI supplies a TypeRegistry backed by successfully parsed Type Definition Documents.

Lookup rules:

- `getByName(typeName)` resolves by canonical `name`
- `getByDeclaration(value)`:
  - accepts the bare literal `type`
  - accepts root declaration Wiki Links such as `[[Concept]]`
  - canonicalizes the declaration target into the same lowercase name space as `getByName`

Duplicate canonical names remain discoverable but are ambiguous:

- discovery keeps all candidates
- lookup by name returns `ambiguous`
- `validate` reports structured type ambiguity
- `create --type concept` fails as ambiguous

The CLI does not use last-write-wins behavior.

## Create Semantics

`create` is intentionally narrow.

Inputs:

- selected type by canonical name
- explicit output path

The CLI synthesizes initial frontmatter using only the configured Type Declaration key:

```yaml
_type: "[[Concept]]"
```

The written declaration uses the discovered type-definition file basename as display identity.

Example:

- selected type: `concept`
- source type file: `types/Concept.md`
- written declaration: `[[Concept]]`

Generation flow:

1. resolve selected type by canonical name
2. synthesize root declaration
3. call `scaffold(frontmatter, typeDef)`
4. merge root declaration plus scaffolded defaults
5. call `template(typeDef)`
6. build candidate `Document`
7. call `validate(...)`
8. abort on validation errors
9. write on warnings only

If the selected type has no Template Block, `create` still succeeds and writes a frontmatter-only file.

`create` is strict about discovery health. If project-wide discovery finds type parse failures, document ingestion failures, or other run-level integration failures, `create` aborts before writing.

## Output And Result Shapes

The CLI supports:

- compact human output by default
- exhaustive JSON output

Human output should be failure-oriented. JSON output should include:

- every processed target
- every discovery diagnostic
- every explicit-target diagnostic
- summary counts
- effective config snapshot

Paths in both human and JSON output use normalized root-relative POSIX form whenever the path is inside the effective root.

Shared shapes:

```typescript
type EffectiveConfig = {
  root: string
  include: string[]
  exclude: string[]
  typeDeclarationKey: string
  untypedDocumentBehavior: 'skip' | 'warn'
  referentialValidation: boolean
  resolverStrategy: 'basename'
  outputFormat: 'human' | 'json'
}

type DiscoveryDiagnostic =
  | { kind: 'ingest-failure'; path: string; stage: 'read' | 'frontmatter'; reason: string }
  | { kind: 'type-parse-failure'; path: string; errors: ParseError[] }

type TargetDiagnostic =
  | { kind: 'target:outside-root'; input: string }
  | { kind: 'target:unsupported-kind'; input: string }
  | { kind: 'target:excluded'; input: string }
  | { kind: 'target:not-found'; input: string }
```

`validate` target outcomes:

```typescript
type ValidationTargetResult =
  | { kind: 'validated'; path: string; result: ValidationResult; typeId: string; typeName: string }
  | { kind: 'skipped-untyped'; path: string }
  | { kind: 'warn-untyped'; path: string; warning: ValidationWarning }
  | { kind: 'invalid-type-declaration'; path: string; value: unknown }
  | { kind: 'type-not-found'; path: string; declaration: unknown; typeName: string }
  | { kind: 'type-ambiguous'; path: string; declaration: unknown; typeName: string; candidateIds: string[] }
  | { kind: 'type-unavailable'; path: string; declaration: unknown; reason: string }
```

Exact top-level command result fields may evolve, but command contracts should remain explicit and discriminated.

## Exit Status

### `validate`

Exit `0` when all processed targets either:

- pass
- emit warnings only
- are skipped-untyped under configured `skip`

Exit non-zero when any of the following occur:

- a target has validation errors
- a target has root type resolution failure
- any discovery-universe ingestion failure occurs
- any discovered Type Definition Document parse failure occurs
- any explicit target diagnostic occurs
- any command-level config or I/O failure occurs

### `create`

Exit non-zero when any of the following occur:

- discovery health is not clean
- selected type is missing or ambiguous
- output path is invalid or already exists
- generated candidate validation has errors
- command-level I/O or config failure occurs

Warnings do not block write by themselves.

### `types`

Exit non-zero when discovered Type Definition Document candidates fail to parse.

Ordinary non-type document ingestion failures do not control `types` exit status by default.

## Determinism

Observable CLI behavior must be deterministic.

Required properties:

- stable normalized root-relative path reporting
- stable lexical ordering of targets and diagnostics
- stable ambiguity behavior
- stable write formatting

The CLI may parallelize I/O, but observable results must not depend on traversal order.

## Relationship To Existing Design Docs

- [D1 — Architecture](D1-architecture.md): the CLI is an Imperative Shell around the Core.
- [D2 — Type and Schema Contracts](D2-type-and-schema-contracts.md): the CLI consumes `Document`, `ParsedTypeDefinitionDocument`, Scaffolding, and Templating contracts.
- [D3 — Validation Semantics](D3-validation-semantics.md): the CLI owns root-type dispatch and reporting around Core validation.
- [D4 — Integration Contracts](D4-integration-contracts.md): the CLI provides the concrete Node Resolver, TypeRegistry, parser identity, and discovery behavior.
