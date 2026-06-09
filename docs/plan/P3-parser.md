# P3 — Parser

## Goal

Implement `parseTypeDefinitionDocument` so that every test case in [parser.md](../test-cases/parser.md) passes. After this phase, the Core can turn a Type Definition Document and Integration-supplied identity into a `ParsedTypeDefinitionDocument` or a list of `ParseError`s — no I/O, no Resolver, no TypeRegistry.

## Inputs

- [D2 — Type and Schema Contracts](../design/D2-type-and-schema-contracts.md) — full Parser contract
- [Parser test cases](../test-cases/parser.md) — acceptance fixtures
- [ADR-0006 — Parser lives in Core](../adr/0006-parser-lives-in-core-as-utility.md)
- [P2 — Shared Core Types](P2-shared-core-types.md) — types this phase fills in

## Relationship to P4

P4 (Link and Section grammar helpers) is split out so Validation can reuse the same grammar. P3 needs three of those helpers up front:

- Wiki Link shape validation — for `wiki-link`, `list<X>`, `choice<Y>` defaults
- External Link shape validation + allowed-scheme check — for `url` defaults
- ATX heading parser with fenced-code awareness + required-marker extraction — for Template Block Section parsing

Recommendation: build these helpers in `src/core/link-grammar.ts` and `src/core/section-parser.ts` as part of P3 with just enough surface to support default validation and Template parsing. P4 then expands them (e.g., body-section walks for Validation) and adds the broader unit-test suite. The alternative — re-ordering P4 before P3 — is acceptable but pushes Milestone 1 wall-clock the same amount.

## Deliverables

A working `parseTypeDefinitionDocument` covering all of the following.

### Frontmatter self-identification

- Extract the YAML frontmatter block (`---`-fenced) from the raw input.
- Look up the key named by `ParserConfig.typeDeclarationKey` (default `_type`).
- If the key is absent (or frontmatter is missing entirely), return `parser:missing-type-declaration` at `location: { scope: 'document' }`. Treat this as a structural failure — skip Schema and Template parsing.
- If the key is present but its value is not the literal string `type`, return `parser:invalid-type-declaration` with `details.value` carrying the offending value (Wiki Links, arrays, numbers, etc. all fail the same way). This is also a structural failure.
- See ADR-0008 for the rationale and D2 for the contract.

### Block extraction

- Exact level-2, case-sensitive `## Schema` detection. Reject `# Schema`, `### Schema`, `## schema`, `## SCHEMA`, `## Schema:`, `## Schema <!-- metadata -->`.
- Exact level-2, case-sensitive `## Template` detection with the same rejection rules.
- `## Schema` is required exactly once.
- `## Template` is optional, at most once.
- Each block must contain exactly one fenced code block.
- Schema fence info string must be `yaml` or `yml`.
- Template fence info string must be `markdown` or `md`.
- Non-whitespace prose outside the fenced block inside `## Schema` or `## Template` is a Parser error.
- Multiple fences inside either block are a Parser error.

### Schema YAML

- Parse the fenced YAML body.
- Top-level keys: exactly `properties`. Reject `fields` (legacy), reject any unknown top-level key (`closed`, `version`, etc.) with `parser:unknown-schema-key` and `details.key`.
- `properties` must be a mapping.
- Each Property entry must be a mapping.

### Property schema

- Allowed Property schema keys: `type`, `required`, `allow-empty`, `default`.
- Unknown Property schema keys → `parser:invalid-property-schema` with `details.unknownKeys`.
- `required` and `allow-empty` must be strict booleans; reject `"true"`, `"false"`, `1`, `0`, etc., with `details.key` and `details.expected: 'boolean'`.
- `type` is required and must be one of the primitive names or a Collection Type literal.

### Type parsing

- Primitive names: `text`, `number`, `boolean`, `date`, `datetime`, `wiki-link`, `url`. Unknown → `parser:unknown-property-type`.
- Collection literals: `list<X>` and `choice<Y>`. Parse the inner Type Reference name and validate it as a canonical identifier.
- Non-canonical Type Reference name (e.g., `list<Skill>`) → `parser:invalid-type-reference` with `details.value`.
- No other angle-bracket forms accepted (`set<X>`, `map<K,V>`, nested generics, etc.).

### Property keys

- Canonical key rules: lowercase, `[a-z0-9_-]`, no leading/trailing `-` or `_`, with `_type` as the only allowed leading-underscore exception.
- Violations → `parser:invalid-property-key`.

### Identity

- `identity.name` must follow the same canonical rule as Property keys → `parser:invalid-type-definition-identity` with `details.name`.
- `identity.id` must be a non-empty string after trimming → `parser:invalid-type-definition-identity` with `details.id`.

### Defaults

When `default` is present, validate it locally against the declared type using the same emptiness rules as Validation:

- `text` default must be a string; empty string fails unless `allow-empty: true`.
- `number` default must be a finite JS number.
- `boolean` default must be a boolean.
- `date` default must match `YYYY-MM-DD`.
- `datetime` default must be an ISO 8601 datetime with timezone.
- `wiki-link` default must pass Wiki Link shape validation.
- `url` default must pass External Link shape validation and use an allowed scheme under `ParserConfig.allowedUrlSchemes` (default `['http', 'https', 'mailto']`).
- `list<X>` default must be an array of valid Wiki Links.
- `choice<Y>` default must be a single valid Wiki Link.

Violations → `parser:invalid-default` with `details.expected` (the type the default failed against) or `details.reason: 'empty-not-allowed'` for empty-not-allowed cases.

No Resolver calls, no TypeRegistry calls, no network.

### Template Block Section parsing

When a Template Block exists, parse its fenced Markdown body into `Section[]`:

- ATX headings only (`#` through `######`). Ignore Setext headings.
- Ignore headings inside fenced code blocks.
- Section identity = exact heading level + exact heading text.
- Required marker: inline HTML comment whose trimmed content is exactly `required`. Whitespace inside the comment is flexible. Remove the marker from the parsed heading text.
- Reject near-miss markers (`required-section`, `Required`, `required=true`).
- Duplicate required Section identities → `parser:duplicate-required-section`.
- Duplicate non-required Section identities are allowed.
- `defaultContent` is the body text under each heading until the next heading at the same or higher level.

### Error collection

- Return `{ kind: 'ok', typeDef }` only when zero errors are produced.
- Return `{ kind: 'error', errors: [...] }` otherwise.
- Collect multiple independent errors where cheap (e.g., several invalid Property schemas, several invalid identity fields).
- Skip dependent stages after a structural failure (e.g., missing Schema block → do not attempt YAML parsing; invalid YAML → do not validate Property schemas).
- Errors carry the precise `ParseLocation` shape from D2 (`document`, `block`, `property`, `section`).
- Never throw for authoring errors. Reserve thrown errors for programmer bugs (invariant violations).

## Recommended libraries

Two third-party libraries cover the Markdown and YAML work without writing our own parsers.

- **Markdown:** `unified` + `remark-parse` (mdast). Mature, used by remark/MDX, gives a typed AST with clear node kinds for headings, fenced code, paragraphs. Alternative: `marked` (simpler, less typed). Whichever is picked, isolate it behind internal helpers so a future swap costs nothing outside `parser.ts`.
- **YAML:** `yaml` (eemeli/yaml). Supports strict mode, distinguishes `true` from `"true"` natively, and exposes parse errors with line/column. `js-yaml` is the older alternative.

These are the only new runtime dependencies P3 adds. No transitive Integration code (Obsidian, Node fs, etc.).

## File layout

```text
src/core/
  parser.ts                parseTypeDefinitionDocument + dispatch
  link-grammar.ts          wiki-link / external-link shape validators (shared with P4/P5)
  section-parser.ts        ATX heading walker + required-marker extractor (shared with P4/P5)
  parser/
    frontmatter.ts         frontmatter extraction + _type sentinel check
    blocks.ts              ## Schema / ## Template block extraction
    schema-yaml.ts         YAML parse + top-level schema validation
    property-schema.ts     per-Property validation, including type parsing
    defaults.ts            local default validation, dispatching by PropertyTypeName
    identity.ts            identity name + id validation
    errors.ts              ParseError constructors keyed by ParseErrorKind
```

The `parser/` subdirectory is an internal split. Only `parseTypeDefinitionDocument` (in `parser.ts`) is exported from the package.

## Steps

1. Add `yaml` and `unified` + `remark-parse` to `package.json`. Wire them into `parser.ts` behind narrow internal helpers.
2. Implement frontmatter extraction + sentinel check in `parser/frontmatter.ts`. Cover P000a, P000b, P000c first — every later case assumes a valid Type Declaration is already present.
3. Implement block extraction in `parser/blocks.ts`. Cover P002–P005 first.
4. Implement YAML parsing + top-level schema validation in `parser/schema-yaml.ts`. Cover P010, P011.
5. Implement Property schema validation in `parser/property-schema.ts`. Cover P012, P013, P014 and Property-key canonicality.
6. Implement identity validation in `parser/identity.ts`. Cover P030, P031.
7. Build the Wiki Link / External Link shape helpers in `link-grammar.ts` with just enough surface for default validation.
8. Implement default validation in `parser/defaults.ts`. Cover P020–P022.
9. Build the section parser in `section-parser.ts` (ATX heading walk, fenced-code awareness, required marker). Cover P040, P041.
10. Wire everything together in `parser.ts` with error accumulation semantics.
11. Port every case in [parser.md](../test-cases/parser.md) to a vitest suite under `test/parser/`.
12. Remove the P2 `it.todo('parseTypeDefinitionDocument ...')` marker from `test/smoke.test.ts`.
13. Run `npm run typecheck` and `npm test`.

## Acceptance Criteria

- Every case in [parser.md](../test-cases/parser.md) passes — both `ok` outcomes and every `parser:*` error kind listed in D2.
- Parser collects multiple independent errors per Document where cheap. At minimum: multiple invalid Property schemas in one Document produce multiple errors; identity errors and Schema-block errors can coexist.
- Parser stops after a structural failure: missing Schema block does not produce YAML errors; invalid YAML does not produce per-Property errors.
- Parser never throws for any authoring error covered by the test cases.
- Parser performs no I/O. No `fs`, `path`, `fetch`, or filesystem-shaped imports appear in any `src/core/parser*` file.
- Parser calls no Resolver and no TypeRegistry. Default validation is fully local.
- `parseTypeDefinitionDocument` matches the P2 signature exactly. Only its body changes.
- All errors carry `kind`, `message`, `location`, and `details` matching D2's `ParseError` shape. `location` is always one of the four discriminated forms.
- `npm run typecheck` and `npm test` pass.

## Non-goals

- Implement Validation, Scaffolding, or Templating behavior.
- Build a Resolver or TypeRegistry.
- Resolve Wiki Link targets in defaults — only shape validation.
- Resolve Type References — defer to Referential Validation in P5.
- Expose any Markdown or YAML library types in the public API. Helpers are internal.
- Support `## schema`, `## SCHEMA`, or any case-insensitive matching. Strictness is the feature.
- Coerce user-authored values (`"true"` → `true`, numeric strings → numbers).
- Implement parser test cases not present in [parser.md](../test-cases/parser.md). Add new fixtures there first.

## Follow-up

After P3, continue with [P4 — Link and Section grammar helpers](P4-link-and-section-grammar.md) to extract the remaining grammar shared with Validation and to lock in unit-test coverage of the helpers in isolation. P5 (Validation) is the first phase that consumes those helpers via the Resolver/TypeRegistry seams.
