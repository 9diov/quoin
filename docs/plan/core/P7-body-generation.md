---
_type: "[[plan-doc]]"
status: "done"
terms: ["Document", "Type Definition Document", "Scaffolding", "Body Generation", "Section", "Body Block", "Core", "Parser", "Integration", "Validation", "Validation Warning"]
---

# P7 — Body Generation

## Goal

Implement `generateBody` so the Core can return the Markdown body for a new
Document from a parsed Type Definition Document's `## Body` block. After this
phase, Integrations can create new Documents with frontmatter from
Scaffolding and body content from Body Generation, while keeping all writes
and file creation outside the Core.

## Inputs

- [D1 — Architecture](../../design/D1-architecture.md) — Body Generation is a
  pure Core function used only for new Documents
- [D2 — Type and Schema Contracts](../../design/D2-type-and-schema-contracts.md)
  — `BodyGenerationResult`, `Body Block`, and `generateBody(typeDef)` API
- [ADR-0005 — Functional Core / Imperative Shell](../../adr/0005-functional-core-imperative-shell.md)
- [ADR-0009 — Scaffolding and Body Generation are creation, not repair](../../adr/0009-scaffolding-is-creation-not-repair.md)
- [P2 — Shared Core Types](P2-shared-core-types.md) — current exported
  `BodyBlock` and `BodyGenerationResult` surface
- [P3 — Parser](P3-parser.md) — parser already extracts the Body fenced block
  and parses Sections
- [P5 — Validation](P5-validation.md) — Validation consumes parsed Sections,
  not rendered body output
- [P6 — Scaffolding](P6-scaffolding.md) — creation-only counterpart for
  frontmatter defaults

## Deliverables

A working `generateBody` covering all of the following.

### Core behaviour

`generateBody(typeDef)` returns:

- `BodyGenerationResult.body === ''` when `typeDef.bodyBlock` is absent
- `BodyGenerationResult.body === <exact stored body markdown>` when
  `typeDef.bodyBlock` is present

Returned shape:

```typescript
{
  body: string
}
```

### Content preservation

Body Generation must preserve the authored Body Block Markdown content exactly
as Parser extracted it from the fenced `markdown` block.

That includes:

- ATX headings
- blank lines
- HTML comments
- body prose
- fenced code blocks inside the body content
- heading-adjacent required markers such as `## Definitions <!-- required -->`

Body Generation does not reinterpret or normalize Markdown. It returns the
stored body verbatim.

### Required shape correction

The public `BodyBlock` shape must carry both the rendered body and parsed
Sections:

```typescript
type BodyBlock = {
  body: string
  sections: Section[]
}
```

Parser preserves the exact fenced Body Markdown as `blocks.bodyMarkdown`; P7
stores that value on `bodyBlock.body`.

### Purity and scope boundary

`generateBody` stays a pure creation-only function.

- Do not inspect an existing Document body.
- Do not merge with existing body content.
- Do not inject missing Sections into an authored Document.
- Do not parse Markdown again inside `generateBody()`.
- Do not perform I/O.
- Do not mutate `typeDef`.

Body Generation is not repair. Missing required Sections on existing Documents
remain a Validation warning concern, not a Body Generation concern.

### Relationship to Parser and Validation

Parser remains responsible for:

- detecting the optional `## Body` block
- enforcing the single fenced Markdown block contract
- extracting the exact fenced Markdown body
- parsing Sections from that Markdown for Validation use

Validation remains responsible for:

- checking required Sections against existing Document bodies

Body Generation only returns the already-parsed body.

## File layout

Expected touched files:

```text
src/
  index.ts                  public re-exports, if type names change
  core/
    parser.ts               BodyBlock type update + parser wiring
    body.ts                 BodyGenerationResult type + generateBody() implementation
```

Likely internal reuse:

```text
src/core/parser/
  blocks.ts                 already extracts bodyMarkdown
```

No dedicated `body/` helper directory is necessary unless implementation grows
beyond a trivial return wrapper.

## Steps

1. Update the public `BodyBlock` type in `src/core/parser.ts` to include
   `body: string` alongside `sections`.
2. Update `parseTypeDefinitionDocument()` so that when `blocks.bodyMarkdown`
   exists, it stores:

```typescript
bodyBlock = {
  body: blocks.bodyMarkdown,
  sections: sectionResult.sections,
}
```

3. Replace the `throw new Error('not implemented')` stub in `src/core/body.ts`
   with a pure implementation that returns `''` when `bodyBlock` is absent and
   returns `bodyBlock.body` otherwise.
4. Update any smoke tests and parser tests whose expected `bodyBlock` shape now
   needs `body`.
5. Add focused unit tests under `test/body/` for exact output preservation and
   empty-body fallback.
6. Remove the P2 smoke-test todo
   `it.todo('generateBody renders the Body Block body — P7')` from
   `test/smoke.test.ts`.
7. Run `npm run typecheck` and `npm test`.

## Suggested tests

Add direct unit tests for at least these cases:

- `generateBody()` returns `''` when `typeDef.bodyBlock` is absent.
- `generateBody()` returns the exact stored Markdown body when
  `bodyBlock.body` is present.
- Output preserves blank lines between sections.
- Output preserves `<!-- required -->` comments in heading lines.
- Output preserves fenced code blocks and their contents.
- Calling `generateBody()` does not mutate `typeDef`.

Update existing parser expectations to assert `bodyBlock.body` alongside
`bodyBlock.sections`, for example:

- the simple `Definitions` / `References` body
- body content containing `<!-- required -->` as ordinary prose, not a Section
  marker

Unlike Parser and Validation, there is no dedicated
`docs/test-cases/body-generation.md` fixture file yet. Plain Vitest unit
coverage is sufficient for this phase.

## Acceptance Criteria

- `generateBody(typeDef)` returns `{ body: '' }` when no Body Block exists.
- `generateBody(typeDef)` returns the exact Markdown content extracted from the
  Body fenced block when present.
- `BodyBlock` preserves both the raw body and parsed `sections`.
- Validation continues to use `bodyBlock.sections` unchanged after the type
  expansion.
- Body Generation does not inspect, merge with, or overwrite any existing
  Document body.
- `typeDef` is unchanged after the call.
- `npm run typecheck` succeeds.
- `npm test` succeeds.

## Non-goals

- Rendering variables or interpolating frontmatter into body content.
- Generating body content from `Section[]` alone.
- Repairing missing Sections in existing Documents.
- Re-parsing Markdown inside `generateBody()`.
- Adding Integration file-creation behavior.

## Follow-up

After this phase, continue with Phase 8: Minimal Integration harness. That
phase should prove an Integration can call both `scaffold()` and
`generateBody()` when creating a new Document, then write the combined result
outside the Core.
