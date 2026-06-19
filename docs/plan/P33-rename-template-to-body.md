---
_type: "[[plan-doc]]"
status: "proposed"
terms: ["Template Block", "Templating", "Templating Result", "Section", "Core", "Parser", "Parse Result", "Integration", "Validation"]
---

# P33 — Rename Template to Body

## Goal

Rename every "Template" concept to "Body" across glossary, design docs, source
code, tests, and fixtures — without changing any behaviour.

The `## Template` heading in Type Definition Documents becomes `## Body`. The
"Template Block" term becomes "Body Block". The "Templating" operation and
"Templating Result" become "Body Generation" and "Body Generation Result". Code
identifiers follow in parallel.

After this phase:

- Type Definition Documents use `## Body` instead of `## Template` for the body
  structure block.
- The GLOSSARY uses "Body Block", "Body Generation", and "Body Generation
  Result" as the canonical terms.
- All source identifiers (`templateBlock`, `templateMarkdown`, `TemplatingResult`,
  `template()`, etc.) are renamed to their `body`/`Body` equivalents.
- Parser error codes `parser:duplicate-template-block` and
  `parser:invalid-template-block` become `parser:duplicate-body-block` and
  `parser:invalid-body-block`.
- `npm run typecheck` and `npm test` continue to pass.

The rename is mechanical. No schema, validation, or behaviour changes are part
of this phase.

## Inputs

- [GLOSSARY](../design/GLOSSARY.md) — current canonical term definitions.
- [D2 — Type and Schema Contracts](../design/D2-type-and-schema-contracts.md)
  — documents the `## Template` block grammar and `TemplateBlock` type.
- [D3 — Validation Semantics](../design/D3-validation-semantics.md)
  — documents required-section validation against the Template Block.
- [D1 — Architecture](../design/D1-architecture.md), [D5](../design/D5-node-cli-integration.md),
  [D7](../design/D7-type-inference-from-documents.md), [D8](../design/D8-obsidian-plugin-integration.md)
  — reference Templating or Template Block in prose.

## Rationale

"Template Block" collides mentally with general-purpose template engines
(Jinja, Handlebars, Liquid). Authors unfamiliar with the project read
`## Template` as "a template language lives here", not "this section defines
the body layout." "Body Block" is unambiguous: the Schema block governs
frontmatter; the Body block governs the document body. The pair
`## Schema` / `## Body` is self-documenting.

A secondary benefit: the overloaded "Template" cluster
(Template Block + Templating + Templating Result) fragments into
independently clear names (Body Block, Body Generation, Body Generation Result),
making it easier to discuss one without invoking the others.

## Term Changes

| Old term | New term |
|---|---|
| Template Block | Body Block |
| Templating | Body Generation |
| Templating Result | Body Generation Result |

The `## Template` heading in Type Definition Document files becomes `## Body`.

## Source Identifier Changes

| Old identifier | New identifier | Location |
|---|---|---|
| `TemplateBlock` | `BodyBlock` | `src/core/parser.ts` |
| `TemplatingResult` | `BodyGenerationResult` | `src/core/template.ts` → `src/core/body.ts` |
| `template()` | `generateBody()` | `src/core/template.ts` → `src/core/body.ts` |
| `templateBlock` | `bodyBlock` | `src/core/parser.ts`, `src/core/validation.ts`, `src/core/validation/sections.ts`, `src/core/template.ts`, `src/integration/node-lib/types.ts` |
| `templateMarkdown` | `bodyMarkdown` | `src/core/parser/blocks.ts`, `src/core/parser.ts` |
| `templateBlockError()` | `bodyBlockError()` | `src/core/parser/errors.ts`, `src/core/parser/blocks.ts` |
| `parseTemplateSections()` | `parseBodySections()` | `src/core/section-parser.ts`, `src/core/parser.ts` |
| `TEMPLATE_LANG` | `BODY_LANG` | `src/core/parser/blocks.ts` |
| `hasTemplate` | `hasBody` | `src/integration/node-lib/types.ts` |
| error code `parser:duplicate-template-block` | `parser:duplicate-body-block` | `src/core/parser.ts`, `src/core/parser/blocks.ts` |
| error code `parser:invalid-template-block` | `parser:invalid-body-block` | `src/core/parser.ts`, `src/core/parser/blocks.ts` |
| block discriminant `'Template'` | `'Body'` | `src/core/parser.ts` (error scope shape) |

File rename: `src/core/template.ts` → `src/core/body.ts`.

Public exports in `src/index.ts` change accordingly:
`TemplatingResult` → `BodyGenerationResult`, `template` → `generateBody`.

## Non-goals

This phase does not:

- change any validation or scaffolding logic.
- change the `## Schema` block name.
- introduce migration or backwards-compatibility for existing `## Template`
  Type Definition Documents — P33 is a clean rename with no legacy alias.
- change Section rules, required-section syntax, or how Sections are parsed.
- publish a new package version (though a semver bump is appropriate since
  public type names and the exported function name change).

## Docs Changes

### GLOSSARY.md

- Rename entry "Template Block" to "Body Block". Update body and `_Avoid_`
  list; update the `## Schema` cross-reference to call its counterpart the
  Body Block.
- Rename entry "Templating" to "Body Generation". Update body to say
  "generates the Markdown body from the fenced Markdown block inside the
  `## Body` block".
- Rename entry "Templating Result" to "Body Generation Result".
- Update the frontmatter `terms:` list to reflect all three renamed terms.

### Design docs

- `D1-architecture.md` — update prose references to Template Block /
  Templating / Templating Result.
- `D2-type-and-schema-contracts.md` — rename the `## Template` block section;
  update type shape prose; rename `TemplateBlock`, `templateBlock`,
  `TemplatingResult`, `template()` wherever they appear.
- `D3-validation-semantics.md` — update Template Block → Body Block; update
  required-section prose.
- `D5-node-cli-integration.md` — update any Templating / Template Block
  references.
- `D7-type-inference-from-documents.md` — update any Template Block
  references.
- `D8-obsidian-plugin-integration.md` — update any Templating / Template
  Block references.

### ADRs

- `adr/0006-parser-lives-in-core-as-utility.md` — update any Template Block
  mentions.
- `adr/0009-scaffolding-is-creation-not-repair.md` — update any Templating /
  Template Block mentions.

### Plan docs

Update plan docs that reference Template Block or Templating in their current
contract descriptions:

- `docs/plan/core/P2-shared-core-types.md`
- `docs/plan/core/P3-parser.md`
- `docs/plan/core/P5-validation.md`
- `docs/plan/core/P6-scaffolding.md`
- `docs/plan/core/P7-body-generation.md` — rename the file from
  `P7-templating.md`
  and update prose throughout.
- `docs/plan/integration/node-cli/P14-create-and-types-commands.md`
- `docs/types/design-doc.md`, `docs/types/plan-doc.md`, `docs/types/test-suite.md`
  — update `terms:` frontmatter lists if they reference the old term names.

### Test-case docs

- `docs/test-cases/parser.md` — rename `parser:duplicate-template-block` and
  `parser:invalid-template-block` to the `body-block` equivalents throughout.
- `docs/test-cases/validation.md` — update any Template Block references.

### Public docs

- `docs/public/index.md` — rename `## Template` block examples and prose.
- `README.md` (if applicable) — update any Template Block / Templating prose.

## Code Changes

### `src/core/template.ts` → `src/core/body.ts`

- Rename the file.
- Rename exported type `TemplatingResult` → `BodyGenerationResult`.
- Rename exported function `template()` → `generateBody()`.
- Update the `@quoin-terms` doc comment.

### `src/core/parser.ts`

- Rename type `TemplateBlock` → `BodyBlock`.
- Rename field `templateBlock` → `bodyBlock` on `ParsedTypeDefinitionDocument`.
- Rename error codes `'parser:duplicate-template-block'` →
  `'parser:duplicate-body-block'` and `'parser:invalid-template-block'` →
  `'parser:invalid-body-block'`.
- Update the `block` discriminant from `'Template'` to `'Body'` in the error
  scope shape.
- Update the import path from `./template.js` → `./body.js` in files that
  import the renamed module.

### `src/core/parser/blocks.ts`

- Rename constant `TEMPLATE_LANG` → `BODY_LANG`.
- Rename field `templateMarkdown` → `bodyMarkdown` on the `BlocksResult`
  interface.
- Replace all `'Template'` heading label strings with `'Body'` — this changes
  the heading the parser looks for in Type Definition Documents.
- Update all `templateBlockError(...)` calls to `bodyBlockError(...)`.
- Update the `@quoin-terms` doc comment.

### `src/core/parser/errors.ts`

- Rename `templateBlockError()` → `bodyBlockError()`.

### `src/core/section-parser.ts`

- Rename `parseTemplateSections()` → `parseBodySections()`.

### `src/core/validation.ts`

- Update `typeDef.templateBlock` → `typeDef.bodyBlock` at the call site for
  `validateSections`.

### `src/core/validation/sections.ts`

- Rename parameter `templateBlock` → `bodyBlock`.

### `src/index.ts`

- Re-export as `BodyGenerationResult` and `generateBody`.

### `src/integration/node-lib/types.ts`

- Rename `hasTemplate` → `hasBody` on both `TypeSummary` types.
- Update `typeDef.templateBlock` → `typeDef.bodyBlock` in the two map
  locations.

## Fixtures

Every Type Definition Document that contains a `## Template` heading must be
updated to `## Body`:

```text
fixtures/scenarios/missing-sections/types/Doc.md
fixtures/vaults/manual-obsidian/types/Concept.md
fixtures/vaults/knowledge-base/types/…   (search for `## Template`)
fixtures/vaults/custom-config/types/…    (search for `## Template`)
```

Run:

```bash
grep -rl "^## Template" fixtures --include="*.md"
```

to identify all affected fixture files before making changes.

Snapshot golden output in integration tests may embed the error code strings
`parser:duplicate-template-block` or `parser:invalid-template-block`. Update
those snapshots after renaming the error codes.

## Tests

- `test/parser/parser.test.ts` — update error code assertions from
  `parser:*-template-block` to `parser:*-body-block`.
- `test/parser/blocks.test.ts` (if present) — same.
- `test/template/template.test.ts` (if present) — rename to
  `test/body/body.test.ts`; update import paths and identifier references.
- `test/integration/node-cli/fixtures.test.ts` — re-snapshot any golden
  output containing old error codes.
- `test/integration/node-cli/types.test.ts` — update `hasTemplate` assertions
  to `hasBody`.
- Any other test file importing from `src/core/template.ts` — update the
  import path.

## Steps

1. Update GLOSSARY.md with the three renamed terms.
2. Rename Type Definition Document fixtures: change `## Template` to `## Body`
   in all fixture files identified by the grep above.
3. Rename `src/core/template.ts` → `src/core/body.ts`; update its exports.
4. Rename identifiers in `src/core/parser/errors.ts` (error helper rename).
5. Rename identifiers in `src/core/parser/blocks.ts` (heading label, constant,
   field, error helper calls).
6. Rename identifiers in `src/core/section-parser.ts` (function rename).
7. Rename identifiers in `src/core/parser.ts` (type, field, error codes,
   discriminant, import path).
8. Rename identifiers in `src/core/validation.ts` and
   `src/core/validation/sections.ts`.
9. Update `src/index.ts` public exports.
10. Rename identifiers in `src/integration/node-lib/types.ts`.
11. Update all other Integration source files that import from `template.ts`.
12. Update design docs, ADRs, plan docs, test-case docs, and public docs.
13. Rename `docs/plan/core/P7-templating.md` → `P7-body-generation.md`;
    update its title and prose.
14. Update test files — rename test directory if applicable, update imports and
    assertions, re-snapshot golden output.
15. Run `npm run typecheck`. Fix any breakage.
16. Run `npm test`. Fix any breakage.

## Acceptance Criteria

- `grep -r "## Template" fixtures --include="*.md"` returns no results.
- `grep -r "templateBlock\|templateMarkdown\|TemplatingResult\|hasTemplate\|TEMPLATE_LANG\|parseTemplateSections\|templateBlockError\|duplicate-template-block\|invalid-template-block" src test --include="*.ts"` returns no results.
- The file `src/core/template.ts` no longer exists; `src/core/body.ts` exists
  in its place.
- Public exports `BodyGenerationResult` and `generateBody` are present in
  `src/index.ts`.
- GLOSSARY.md contains "Body Block", "Body Generation", and "Body Generation
  Result" as canonical terms; "Template Block", "Templating", and
  "Templating Result" no longer appear as term headings.
- `npm run typecheck` succeeds.
- `npm test` succeeds.
- No Core API behaviour, validation contract, CLI command surface, or
  exit-status rule has changed.

## Follow-up

Out of scope for P33 but worth tracking:

- Decide whether to write an ADR documenting the rationale for the rename
  (useful if external consumers ask why the public API changed).
- Bump the semver version to reflect the breaking public API rename before the
  next npm publish.
- Search docs for informal uses of the word "template" (lowercase, in prose)
  that refer to this feature and update them to "body" or "body block" for
  consistency.
