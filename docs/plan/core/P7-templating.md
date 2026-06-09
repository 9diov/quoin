# P7 — Templating

## Goal

Implement `template` so the Core can return the Markdown body for a new Document from a parsed Type Definition Document's `## Template` block. After this phase, Integrations can create new Documents with frontmatter from Scaffolding and body content from Templating, while keeping all writes and file creation outside the Core.

## Inputs

- [D1 — Architecture](../../design/D1-architecture.md) — Templating is a pure Core function used only for new Documents
- [D2 — Type and Schema Contracts](../../design/D2-type-and-schema-contracts.md) — `TemplatingResult`, `Template Block`, and `template(typeDef)` API
- [ADR-0005 — Functional Core / Imperative Shell](../../adr/0005-functional-core-imperative-shell.md)
- [ADR-0009 — Scaffolding and Templating are creation, not repair](../../adr/0009-scaffolding-is-creation-not-repair.md)
- [P2 — Shared Core Types](P2-shared-core-types.md) — current exported `TemplateBlock` and `TemplatingResult` surface
- [P3 — Parser](P3-parser.md) — parser already extracts the Template fenced block and parses Sections
- [P5 — Validation](P5-validation.md) — Validation consumes parsed Sections, not rendered body output
- [P6 — Scaffolding](P6-scaffolding.md) — creation-only counterpart for frontmatter defaults

## Deliverables

A working `template` covering all of the following.

### Core behaviour

`template(typeDef)` returns:

- `TemplatingResult.body === ''` when `typeDef.templateBlock` is absent
- `TemplatingResult.body === <exact template markdown body>` when `typeDef.templateBlock` is present

Returned shape:

```typescript
{
  body: string
}
```

### Content preservation

Templating must preserve the authored Template Block Markdown content exactly as Parser extracted it from the fenced `markdown` block.

That includes:

- ATX headings
- blank lines
- HTML comments
- body prose
- fenced code blocks inside the template body
- heading-adjacent required markers such as `## Definitions <!-- required -->`

Templating does not reinterpret or normalize Markdown. It returns the stored template body verbatim.

### Required shape correction

The current public `TemplateBlock` shape contains only:

```typescript
{
  sections: Section[]
}
```

That is insufficient to satisfy the templating contract, because `sections` alone cannot reconstruct the exact authored Markdown body:

- heading required-marker comments are stripped from `Section.heading`
- `defaultContent` trims leading and trailing newlines
- non-section Markdown outside parsed Section bodies is not represented canonically
- original spacing and formatting choices are lost

This phase therefore includes a narrow contract correction:

```typescript
type TemplateBlock = {
  body: string
  sections: Section[]
}
```

Parser already has the exact fenced Template Markdown available as `blocks.templateMarkdown`; P7 should preserve that value on `templateBlock.body` instead of discarding it.

### Purity and scope boundary

`template` must stay a pure creation-only function.

- Do not inspect an existing Document body.
- Do not merge with existing body content.
- Do not inject missing Sections into an authored Document.
- Do not parse Markdown again inside `template()`.
- Do not perform I/O.
- Do not mutate `typeDef`.

Templating is not repair. Missing required Sections on existing Documents remain a Validation warning concern, not a Templating concern.

### Relationship to Parser and Validation

Parser remains responsible for:

- detecting the optional `## Template` block
- enforcing the single fenced Markdown block contract
- extracting the exact fenced Markdown body
- parsing Sections from that Markdown for Validation use

Validation remains responsible for:

- checking required Sections against existing Document bodies

Templating only returns the already-parsed template body.

## File layout

Expected touched files:

```text
src/
  index.ts                  public re-exports, if type names change
  core/
    parser.ts               TemplateBlock type update + parser wiring
    template.ts             TemplatingResult type + template() implementation
```

Likely internal reuse:

```text
src/core/parser/
  blocks.ts                 already extracts templateMarkdown
```

No dedicated `template/` helper directory is necessary unless implementation grows beyond a trivial return wrapper.

## Steps

1. Update the public `TemplateBlock` type in `src/core/parser.ts` to include `body: string` alongside `sections`.
2. Update `parseTypeDefinitionDocument()` so that when `blocks.templateMarkdown` exists, it stores:

```typescript
templateBlock = {
  body: blocks.templateMarkdown,
  sections: sectionResult.sections,
}
```

3. Replace the `throw new Error('not implemented')` stub in `src/core/template.ts` with a pure implementation that returns `''` when `templateBlock` is absent and returns `templateBlock.body` otherwise.
4. Update any smoke tests and parser tests whose expected `templateBlock` shape now needs `body`.
5. Add focused unit tests under `test/template/` for exact output preservation and empty-template fallback.
6. Remove the P2 smoke-test todo `it.todo('template renders the Template Block body — P7')` from `test/smoke.test.ts`.
7. Run `npm run typecheck` and `npm test`.

## Suggested tests

Add direct unit tests for at least these cases:

- `template()` returns `''` when `typeDef.templateBlock` is absent.
- `template()` returns the exact stored Markdown body when `templateBlock.body` is present.
- Output preserves blank lines between sections.
- Output preserves `<!-- required -->` comments in heading lines.
- Output preserves fenced code blocks and their contents.
- Calling `template()` does not mutate `typeDef`.

Update existing parser expectations to assert `templateBlock.body` alongside `templateBlock.sections`, for example:

- the simple `Definitions` / `References` template
- body content containing `<!-- required -->` as ordinary prose, not a Section marker

Unlike Parser and Validation, there is no dedicated `docs/test-cases/templating.md` fixture file yet. Plain Vitest unit coverage is sufficient for this phase.

## Acceptance Criteria

- `template(typeDef)` returns `{ body: '' }` when no Template Block exists.
- `template(typeDef)` returns the exact Markdown content extracted from the Template fenced block when present.
- `TemplateBlock` preserves both the raw template body and parsed `sections`.
- Validation continues to use `templateBlock.sections` unchanged after the type expansion.
- Templating does not inspect, merge with, or overwrite any existing Document body.
- `typeDef` is unchanged after the call.
- `npm run typecheck` succeeds.
- `npm test` succeeds.

## Non-goals

- Rendering variables or interpolating frontmatter into template bodies.
- Generating body content from `Section[]` alone.
- Repairing missing Sections in existing Documents.
- Re-parsing Markdown inside `template()`.
- Adding Integration file-creation behavior.

## Follow-up

After this phase, continue with Phase 8: Minimal Integration harness. That phase should prove an Integration can call both `scaffold()` and `template()` when creating a new Document, then write the combined result outside the Core.
