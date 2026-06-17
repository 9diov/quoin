# P27 — Remove `url` Primitive Type

## Goal

Remove `url` from Quoin's primitive type set.

`url` currently means Markdown External Link syntax (`[text](url)`), not a
bare URL. That makes the schema spelling misleading: authors reasonably expect
`type: url` to accept values such as `https://example.com`, while the current
contract rejects those values and accepts only Markdown links.

After this phase:

- `PrimitiveTypeName` no longer includes `url`.
- schemas using `type: url` or `list<url>` fail parsing as unknown property
  types.
- Markdown External Link grammar helpers are removed from Core unless still
  needed by another active feature.
- `allowedUrlSchemes` is removed from Parser, Validation, CLI, and Obsidian
  configuration surfaces.
- examples and fixtures model external links as plain `text`.
- the future "format"/constraint direction is explicitly deferred.

## Inputs

- [D2 — Type and Schema Contracts](../design/D2-type-and-schema-contracts.md)
  — currently lists `url` as a primitive, validates URL defaults, and defines
  External Link grammar.
- [D3 — Validation Semantics](../design/D3-validation-semantics.md) —
  currently says `url` accepts Markdown External Link syntax and uses
  `ValidationConfig.allowedUrlSchemes`.
- [D4 — Integration Contracts](../design/D4-integration-contracts.md) —
  currently includes `allowedUrlSchemes` in integration-facing config.
- [D5 — Node CLI Integration](../design/D5-node-cli-integration.md) —
  currently exposes `allowedUrlSchemes`.
- [D7 — Type Inference From Documents](../design/D7-type-inference-from-documents.md)
  — currently treats `url < text` in the primitive lattice.
- [D8 — Obsidian Plugin Integration](../design/D8-obsidian-plugin-integration.md)
  — currently exposes `allowedUrlSchemes` in plugin settings.
- [ADR-0002 — `link` primitive split into `wiki-link` and `url`](../adr/0002-link-split-into-wiki-link-and-url.md)
  — superseded by this phase.

## Decision

Remove the `url` primitive instead of renaming it.

External-resource strings remain valid data through `type: text`. The next
schema-language phase may introduce text refinements such as:

```yaml
properties:
  homepage:
    type: text
    format: url
  citation:
    type: text
    format: markdown-link
```

That refinement system is out of scope for P27. This phase only removes the
misleading primitive and the configuration that existed solely to support it.

## Non-goals

This phase does not:

- add `format`, `pattern`, `constraint`, or any other text-refinement schema
  key.
- preserve `type: url` as a deprecated alias.
- introduce bare-URL validation.
- introduce Markdown External Link validation under another name.
- change `wiki-link`, Type Reference, Resolver, or Referential Validation
  semantics.
- change the parser's strict unknown-key behavior.

## Public Contract Changes

### Primitive Types

`PrimitiveTypeName` becomes:

```typescript
type PrimitiveTypeName =
  | 'text'
  | 'number'
  | 'boolean'
  | 'date'
  | 'datetime'
  | 'wiki-link'
```

`url` is no longer a valid bare primitive name.

### Schema Parsing

Parser behavior:

- `type: url` -> `parser:unknown-property-type`.
- `type: list<url>` -> `parser:invalid-type-reference` with
  `details.reason: 'expected-wiki-link-or-primitive'`.
- `default` values that previously relied on `url` validation now validate
  only when the property is declared as `text`.

### Validation

Validation no longer has URL-specific behavior:

- no Markdown External Link parser is invoked from primitive validation.
- no scheme allowlist is consulted.
- `type: text` accepts Markdown links, bare URLs, and any other non-empty
  string equally.

### Configuration

Remove `allowedUrlSchemes` from:

- `ParserConfig`
- `ValidationConfig`
- Node CLI effective config and config-file schema
- Obsidian plugin settings model and settings UI
- create/validate command plumbing

Config files that still contain `allowedUrlSchemes` should be handled according
to the existing config strictness policy for unknown keys. If current config
loading ignores unknown keys, do not add special migration behavior in this
phase.

## Docs Changes

Update user-facing docs:

- [README.md](../../README.md)
  - remove `homepage: type: url` from the schema example.
  - model homepage/source URLs as `type: text`.
  - remove `url` from the primitive table.
  - remove the validation bullet for Markdown External Link syntax.
  - avoid implying bare URL validation exists.
- [docs/public/index.md](../public/index.md)
  - remove `url` from examples, primitive lists, and configuration snippets.
  - remove `allowedUrlSchemes`.
- [fixtures/README.md](../../fixtures/README.md)
  - remove guidance that "`url` wants a Markdown external link".

Update domain language:

- [CONTEXT.md](../../CONTEXT.md)
  - change **External Link** so it is no longer "declared as `type: url`".
  - update **Validation Config** so it no longer lists allowed URL schemes.

Update design docs:

- [D2](../design/D2-type-and-schema-contracts.md)
  - remove `url` from `PrimitiveTypeName`.
  - remove `allowedUrlSchemes` from `ParserConfig`.
  - remove URL default-validation rules.
  - remove `url` from the type-expression grammar.
  - delete or rewrite the External Link grammar section as historical/future
    material.
- [D3](../design/D3-validation-semantics.md)
  - remove `allowedUrlSchemes` from `ValidationConfig`.
  - remove `url` primitive validation.
  - remove `url` from list-primitive examples.
- [D4](../design/D4-integration-contracts.md)
  - remove `allowedUrlSchemes` from integration config examples and rationale.
- [D5](../design/D5-node-cli-integration.md)
  - remove `allowedUrlSchemes` from config shape, defaults, and examples.
- [D7](../design/D7-type-inference-from-documents.md)
  - remove `url` from the type detection ladder and primitive lattice.
  - treat URL-looking strings as `text` until the future format phase exists.
  - update DP9, since hardcoded URL detection policy disappears.
- [D8](../design/D8-obsidian-plugin-integration.md)
  - remove `allowedUrlSchemes` from settings, defaults, and UI.

Update ADRs:

- [ADR-0002](../adr/0002-link-split-into-wiki-link-and-url.md)
  - mark as superseded by P27.
  - explain that `wiki-link` remains a primitive because it participates in
    Link Resolution, while external links are now plain text until a future
    text-refinement mechanism exists.

Update implementation plans and test cases:

- [docs/test-cases/parser.md](../test-cases/parser.md)
- [docs/test-cases/validation.md](../test-cases/validation.md)
- [docs/plan/core/P2-shared-core-types.md](core/P2-shared-core-types.md)
- [docs/plan/core/P3-parser.md](core/P3-parser.md)
- [docs/plan/core/P4-link-and-section-grammar.md](core/P4-link-and-section-grammar.md)
- [docs/plan/core/P5-validation.md](core/P5-validation.md)
- [docs/plan/core/core-implementation-plan.md](core/core-implementation-plan.md)
- [docs/plan/P18-property-based-testing-first-iteration.md](P18-property-based-testing-first-iteration.md)

These older plans can remain historical, but any "current contract" wording
inside them should not contradict P27.

## Code Changes

### Core Parser Types

Touch points:

```text
src/core/parser.ts
src/core/parser/property-schema.ts
src/core/parser/defaults.ts
```

Required changes:

- remove `'url'` from `PrimitiveTypeName`.
- remove `'url'` from `PRIMITIVE_TYPES`.
- remove `allowedUrlSchemes` from `ParserConfig`.
- remove `url` default validation from `parser/defaults.ts`.
- update any helper signatures that pass allowed schemes only for URL checks.

### Core Link Grammar

Touch point:

```text
src/core/link-grammar.ts
```

Required changes:

- keep Wiki Link helpers.
- remove `parseExternalLink`, `isValidExternalLinkShape`,
  `ExternalLinkResult`, and default URL scheme constants if no remaining code
  uses them.
- if property-based tests still need link disjointness, rewrite them around
  active grammar only or delete that property.

### Core Validation

Touch points:

```text
src/core/validation.ts
src/core/validation/config.ts
src/core/validation/primitives.ts
src/core/validation/property.ts
src/core/validation/collections.ts
```

Required changes:

- remove `allowedUrlSchemes` from `ValidationConfig`.
- remove defaulting/normalization of allowed URL schemes.
- remove the `url` branch from primitive validation.
- simplify `validatePrimitive(...)` signatures so callers no longer pass URL
  scheme config.
- update list-of-primitive validation accordingly.

### Public Exports

Touch point:

```text
src/index.ts
```

Required changes:

- ensure exported types reflect the narrower config and primitive unions.
- remove any exported External Link grammar helpers if they are currently
  public.

### Node CLI Integration

Touch points:

```text
src/integration/node-cli/config.ts
src/integration/node-cli/project.ts
src/integration/node-cli/validate.ts
src/integration/node-cli/create.ts
src/integration/node-cli/types.ts
```

Required changes:

- remove `allowedUrlSchemes` from raw and effective config types.
- remove default `['http', 'https', 'mailto']`.
- remove config-file coercion for `allowedUrlSchemes`.
- stop passing URL schemes into Parser and Validation.
- update generated type summaries so `url` is not displayed as a primitive.

### Obsidian Integration

Touch points:

```text
src/integration/obsidian/settings.ts
src/integration/obsidian/settings-tab.ts
src/integration/obsidian/discovery.ts
src/integration/obsidian/active-validation.ts
src/integration/obsidian/create-flow.ts
src/integration/obsidian/vault-validation.ts
```

Required changes:

- remove `allowedUrlSchemes` from saved settings, defaults, validation, and
  settings UI.
- stop passing URL schemes into Parser and Validation.
- preserve loading of existing settings objects without crashing; stale
  `allowedUrlSchemes` data can be ignored rather than migrated.

## Tests

### Parser Tests

Touch points:

```text
test/parser/parser.test.ts
test/parser/link-grammar.test.ts
test/property/grammar.property.test.ts
test/property/parser.property.test.ts
```

Required changes:

- remove valid `url` parsing/default tests.
- add coverage that `type: url` is rejected as
  `parser:unknown-property-type`.
- add coverage that `type: list<url>` is rejected as an invalid list item type.
- remove External Link grammar unit tests if the helper is deleted.
- update property generators and properties that produce external links.

### Validation Tests

Touch points:

```text
test/validation/primitives.test.ts
test/validation/collections.test.ts
test/property/cross-layer.property.test.ts
```

Required changes:

- remove URL primitive validation cases.
- add/adjust text cases proving Markdown links and bare URLs pass as ordinary
  non-empty text.
- remove allowed-scheme validation cases.
- update list primitive coverage so `list<url>` is absent and `list<text>`
  covers link-like strings as strings.

### Integration Tests

Touch points:

```text
test/integration/node-cli/config.test.ts
test/integration/node-cli/fixtures.test.ts
test/integration/node-cli/types.test.ts
test/integration/obsidian/settings.test.ts
test/integration/obsidian/discovery.test.ts
test/integration/obsidian/active-validation.test.ts
test/integration/obsidian/vault-validation.test.ts
test/integration/obsidian/create-flow.test.ts
```

Required changes:

- remove expected `allowedUrlSchemes` defaults from config/settings tests.
- remove tests for coercing invalid URL scheme arrays.
- update fixture expectations where `type: url` currently appears.
- ensure existing config files with stale `allowedUrlSchemes` do not break if
  current config loading ignores unknown keys.

## Fixtures

Update schema fixtures that currently declare `type: url`:

```text
fixtures/scenarios/create-no-template/types/Bookmark.md
fixtures/vaults/custom-config/types/Page.md
fixtures/vaults/knowledge-base/types/Person.md
fixtures/vaults/knowledge-base/types/Source.md
fixtures/vaults/manual-obsidian/types/Source.md
```

Change those properties to `type: text`.

Update document fixtures as needed:

```text
fixtures/vaults/manual-obsidian/sources/reference-source.md
fixtures/vaults/knowledge-base/sources/poeaa.md
```

Bare URL and Markdown link values may remain, because both are valid `text`.

Update config fixtures:

```text
fixtures/vaults/custom-config/quoin.config.jsonc
```

Remove `allowedUrlSchemes`.

## Steps

1. Update design docs, ADR-0002, README, public docs, CONTEXT, and test-case
   docs so the intended contract is clear before code changes.
2. Remove `url` and `allowedUrlSchemes` from Core public types.
3. Remove URL-specific parser default validation and External Link grammar
   helpers that no active code still uses.
4. Remove URL-specific validation branches and simplify primitive validation
   signatures.
5. Remove `allowedUrlSchemes` from Node CLI config loading and command
   plumbing.
6. Remove `allowedUrlSchemes` from Obsidian settings and validation plumbing.
7. Update fixtures from `type: url` to `type: text`.
8. Update parser, validation, property, integration, and fixture tests.
9. Run `npm run typecheck`.
10. Run `npm test`.
11. Run the package smoke checks if public exports or CLI config output changed
    materially.

## Acceptance Criteria

- `rg "'url'|\"url\"|type: url|list<url>" src test fixtures docs README.md CONTEXT.md`
  finds no active contract claiming `url` is a supported primitive. Historical
  mentions are allowed only when explicitly marked superseded.
- `PrimitiveTypeName` excludes `url`.
- `ParserConfig` and `ValidationConfig` exclude `allowedUrlSchemes`.
- Parser rejects `type: url` and `list<url>` with stable structured errors.
- Validation contains no URL-specific primitive branch.
- Node CLI config no longer exposes or defaults `allowedUrlSchemes`.
- Obsidian settings no longer expose or validate `allowedUrlSchemes`.
- All fixtures that previously used `type: url` now use `type: text`.
- README and public docs describe external links as ordinary text until a
  future format/constraint phase.
- `npm run typecheck` succeeds.
- `npm test` succeeds.

## Follow-up

A future schema-language phase should design text refinements explicitly. Open
questions for that phase:

- Should the schema key be `format`, `constraint`, `pattern`, or something
  else?
- Should `format: url` mean a bare URL, a Markdown link, or should those be
  distinct formats?
- Should format validation live in Core or be Integration-specific?
- How should formats compose with `list<text>`?
- Should inference detect URL-looking strings as `text` plus a suggested
  format, rather than as a distinct primitive?
