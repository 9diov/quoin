# P4 — Link and Section grammar helpers

## Goal

Lock in the string-grammar surface that Validation (P5) will consume. Wiki Link and External Link shape validators already exist from P3; ATX heading extraction lives inside the Template parser. P4 finishes the job: extract the body-heading walker into a shared helper, add focused unit tests so each helper is exercised in isolation, and confirm every D2 shape rule has direct coverage.

This phase is mostly **refactor + tests**, not new behavior. The Parser does not change observably.

## Inputs

- [D2 — Type and Schema Contracts](../../design/D2-type-and-schema-contracts.md) — Wiki Link / External Link / Section parsing rules
- [D3 — Validation Semantics](../../design/D3-validation-semantics.md) — Section validation consumer
- [Core implementation plan](core-implementation-plan.md)
- [P3 — Parser](P3-parser.md) — what's already built

## Status — what P3 landed

P3 pulled most of P4's deliverables forward to unblock its own work:

- `src/core/link-grammar.ts` — `isValidWikiLinkShape`.
- `src/core/section-parser.ts` — `parseTemplateSections`: mdast-based ATX walk with Setext filtering, required-marker detection, duplicate-required tracking, `defaultContent` slicing.

What's still missing for P5:

1. A shared **body-side** ATX heading extractor — Validation's `section:missing-required` check walks the Document body the same way Template parsing walks the Template Block, but it wants `{ level, heading }` and nothing else (no required markers, no defaultContent).
2. **Isolated unit tests.** Today both modules are only exercised through `parseTypeDefinitionDocument`. The recent Codex round found three bugs (Setext false-positives, missing URL parse check, defaultContent mutation) that the parser-level tests didn't catch. Direct unit tests would have.
3. **Surface decision** for the body-heading walker — it stays internal, reused by `section-parser.ts` and (in P5) by `validation.ts`.

## Deliverables

### Shared ATX heading walker

`src/core/section-parser.ts` gains an internal `extractAtxHeadings(markdown: string): AtxHeading[]` helper:

```typescript
export type AtxHeading = {
  level: number;        // 1–6
  heading: string;      // trimmed, HTML comments excluded
  startOffset: number;  // position in source, for defaultContent slicing by callers
  endOffset: number;
};

export function extractAtxHeadings(markdown: string): AtxHeading[];
```

Rules:

- ATX headings only — Setext headings filtered by inspecting the source at `position.start.offset` (already done in P3).
- Headings inside fenced code blocks ignored (already done — mdast does not emit them as Heading nodes).
- Heading text is the concatenation of `text` and `inlineCode` children, trimmed; HTML nodes excluded.
- Levels 1–6 are all returned. Filtering by level is the caller's job.
- Result preserves source order.

`parseTemplateSections` is refactored to call `extractAtxHeadings`, then layer on:

- Required-marker detection (case-sensitive, trim-flexible HTML comment whose content is exactly `required`).
- `defaultContent` slicing from `endOffset` to the next heading's `startOffset`.
- Duplicate-required tracking → `parser:duplicate-required-section`.

Observable behavior of the Parser does not change.

### Direct unit tests

Two new test files exercise the helpers in isolation, decoupled from `parseTypeDefinitionDocument`:

- `test/parser/link-grammar.test.ts`
- `test/parser/section-parser.test.ts`

These tests are the source of truth for the grammar rules; Parser-level tests in `parser.test.ts` stay focused on orchestration.

### Wiki Link unit cases

Coverage targets (the accepted/rejected lists from D2):

- Accepted: `[[Target]]`, `[[path/to/Target]]`, `[[Target|Alias]]`, `[[Target#Heading]]`, `[[Target#^block-id]]`, `[[Target|Alias With Spaces]]`.
- Rejected: empty target, missing closing `]]`, surrounding whitespace, nested `[[` or `]]`, non-string input, alias-only `[[|Alias]]`, heading-only `[[#Heading]]`.

### External Link unit cases

- Accepted: `[Docs](https://example.com)`, `[**Docs**](https://example.com)`, `[`API`](https://example.com)`.
- Rejected by shape: `[](https://example.com)`, `[   ](https://example.com)`, surrounding whitespace, `[Docs](https://example.com "title")` (Markdown title), `[Spec](https://example.com/path(foo))` (raw parens), URL with internal whitespace.
- Rejected by scheme allowlist: `[x](javascript:alert(1))`, `[x](file:///etc/passwd)` — unless the test passes a custom `allowedSchemes`.
- Rejected by parse: `[x](https://exa[mple.com)`, `[x](https://%zz/)`, `[x](http://)`.
- `mailto:` accepted on shape + scheme alone (URL parser disagrees with the contract on `mailto:` strings, so the implementation exempts it — test pins this behavior).

### Section parser unit cases

- ATX levels 1–6 all returned with correct level field.
- Setext heading `Foo\n----` not returned.
- ATX heading inside a fenced code block (` ```\n## Foo\n``` `) not returned.
- HTML comments stripped from heading text (not from `defaultContent`).
- Required marker variants: `<!-- required -->`, `<!--required-->`, `<!--   required   -->` all set `required: true`.
- Non-marker variants: `<!-- Required -->`, `<!-- required-section -->`, `<!-- required=true -->` leave `required: false`.
- `defaultContent` preserves comment text, intra-section formatting, and trailing prose.
- Duplicate required identity (same level + heading) produces one `parser:duplicate-required-section` error and drops the second from `sections`.
- Duplicate non-required identity is accepted (both appear in `sections`).
- ATX headings with up to three leading spaces are still recognized (CommonMark allowance).
- Headings with `inlineCode` children include the code text.

## File layout

```text
src/core/
  link-grammar.ts          (no change — already P3)
  section-parser.ts        +extractAtxHeadings helper, parseTemplateSections refactored to use it
test/parser/
  link-grammar.test.ts     (new)
  section-parser.test.ts   (new)
  parser.test.ts           (unchanged — orchestration cases stay)
```

## Steps

1. Add `extractAtxHeadings` to `section-parser.ts`, with the `AtxHeading` type and source-offset fields. No public re-export from `src/index.ts`.
2. Refactor `parseTemplateSections` to call `extractAtxHeadings` and layer required-marker + defaultContent + duplicate-required logic on top. Confirm Parser tests still pass.
3. Write `test/parser/link-grammar.test.ts` covering every accepted/rejected case in D2's link grammar section.
4. Write `test/parser/section-parser.test.ts` exercising `extractAtxHeadings` directly and `parseTemplateSections` for required-marker / defaultContent / duplicate behavior.
5. Run `npm run typecheck` and `npm test`.

## Acceptance Criteria

- `extractAtxHeadings` returns ordered `AtxHeading[]` with correct `level`, `heading`, and source offsets for every ATX heading in the input.
- Setext headings and fenced-code-block headings are absent from the result.
- `parseTemplateSections` behavior is bit-for-bit unchanged through `parseTypeDefinitionDocument` — every existing parser test still passes.
- Direct unit tests cover every accepted/rejected example in D2's Wiki Link, External Link, and Section grammar sections.
- The recent regressions (Setext false-positives, URL parse, defaultContent mutation) have dedicated unit tests against the helpers, not just integration tests through the Parser.
- No new public exports. `extractAtxHeadings` and friends remain internal to `src/core/`.
- `npm run typecheck` and `npm test` pass.

## Non-goals

- Implement Validation behavior. `section:missing-required` lookup is a P5 concern; P4 only provides the helper Validation will call.
- Change the Parser's public API or observable error output.
- Add new URL schemes, new heading levels, or any other grammar extension.
- Replace the markdown / YAML libraries.
- Cover Document-body Section identity matching — that's a Validation rule, tested in P5.

## Follow-up

After P4, continue with [P5 — Validation](P5-validation.md) (TBD). P5 consumes `extractAtxHeadings` for body Section checks and `isValidWikiLinkShape` for Wiki Link value-level Validation of present, non-empty Property values before Resolver is called.
