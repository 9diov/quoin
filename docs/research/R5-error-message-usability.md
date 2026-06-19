---
_type: "[[research-note]]"
status: "active"
sources:
  - "src/integration/node-cli/validate.ts"
  - "src/integration/node-cli/create.ts"
  - "https://eslint.org/docs/latest/use/formatters/"
  - "https://eslint.org/docs/latest/use/command-line-interface"
  - "https://biomejs.dev/reference/cli/"
  - "https://zod.dev/error-formatting"
  - "https://www.typescriptlang.org/tsconfig/"
  - "https://doc.rust-lang.org/rustc/explain.html"
  - "https://ajv.js.org/options.html"
related:
  - "[[R1-human-readable-cli-output]]"
  - "[[R4-config-file-ux]]"
---

# R5 — Error Message Usability

## Goal

Study similar developer products with strong user-facing diagnostics and identify improvements for Quoin's error messages.

This note focuses on the experience of a user who is trying to fix a broken Document, Type Definition Document, config file, or create/validate command. It extends [R1 — Human-Readable CLI Output](R1-human-readable-cli-output.md), but narrows the question from overall output shape to individual error-message usability.

## Findings

Quoin already has a solid diagnostic model internally: parser and validation failures carry stable `kind`, `message`, `location`, and optional detail data. That is a good machine contract.

The user-facing layer does not yet spend that structure well.

Current CLI output often prints internal diagnostic kinds directly:

```text
FAIL  notes/a.md (concept)
  property:missing-required: Missing required property "status".
```

For target-level diagnostics, the gap is larger:

```text
--- Target Diagnostics ---
  notes/missing.md: target:not-found
```

This is precise for maintainers, but it asks users to understand Quoin's internal taxonomy before they know what to do next. The message says what category fired, but not always what happened, what value was inspected, what rule was violated, or how to recover.

Create-flow failures have the same pattern. They report the abort state, but usually omit the shortest next action:

```text
ABORT  type "concept" not found.
```

A better product message would connect the failed command to a recovery path:

```text
ABORT  type "concept" was not found.
  Quoin could not find a Type Definition Document named "concept".
  Next step: check the type name or run `quoin types` to list discovered types.
```

The core opportunity is not to make every message longer. It is to consistently translate structured diagnostics into messages with a user-facing anatomy:

- summary: what failed, in plain language
- location: where the relevant Document, Property, Section, or input is
- cause: which contract was violated
- recovery: the smallest useful next action
- reference: stable diagnostic kind for searching, automation, and bug reports

## Similar Products

### ESLint

ESLint separates human display from structured data through formatters. Its JSON formatter exposes rule IDs, severity, line/column, fix data, and suggestions, while human-facing formatters prioritize scanability. ESLint also treats warning policy as a user decision through `--quiet` and `--max-warnings`.

Useful patterns for Quoin:

- keep stable diagnostic kinds, but do not lead human messages with them
- include fix suggestions when the tool can safely infer one
- let users adjust warning visibility and warning strictness without changing the validation model

Quoin implication: `property:missing-required` should remain the machine kind, but the human message should lead with "Missing required property `status`" and optionally end with a compact reference like `[property:missing-required]`.

### Biome

Biome exposes diagnostic controls such as `--diagnostic-level` and `--max-diagnostics`, plus multiple reporters. This treats diagnostics as a volume-management problem, not just a formatting problem.

Useful patterns for Quoin:

- allow the user to choose how much diagnostic detail to see
- cap printed diagnostics without hiding total counts
- keep summary counts accurate even when details are truncated

Quoin implication: verbose explanatory messages are helpful locally, but large broken docs repos need caps and severity filters.

### Zod

Zod exposes several views over the same error set: raw issues, a tree-shaped representation, a flattened form, and a pretty human string. Its error model preserves paths and issue codes while letting callers choose the representation that fits their UI.

Useful patterns for Quoin:

- one diagnostic model can support CLI text, Obsidian sidebar rows, JSON output, and future editor integration
- path-oriented grouping matters for nested or repeated data
- pretty output should be derived from structured diagnostics, not hand-built independently

Quoin implication: validation errors for list items, doc references, and sections should be renderable as both concise CLI text and field-focused UI rows.

### TypeScript

TypeScript exposes output-formatting controls such as `pretty` and `noErrorTruncation`. That split acknowledges two competing needs: readable defaults and complete detail when the user asks for it.

Useful patterns for Quoin:

- default messages should be readable and bounded
- full diagnostic detail should remain available
- truncation should be an explicit presentation choice, not data loss

Quoin implication: human output can abbreviate long candidate lists or repeated failures, but JSON output and detail mode should preserve everything.

### Rust compiler diagnostics

Rust diagnostics are notable for giving errors stable codes and long-form explanations. The short compiler output is not expected to carry every teaching detail; users can ask for deeper explanation by error code.

Useful patterns for Quoin:

- stable diagnostic codes are useful when paired with human explanations
- detailed help should be discoverable without overwhelming the default output
- complex conceptual errors benefit from examples and longer reference docs

Quoin implication: parser and validation kinds can become user-facing diagnostic references over time, but only if each maps to clear prose and, for common cases, docs examples.

### Ajv

Ajv distinguishes validation behavior from reporting behavior. Options like `allErrors`, `verbose`, and strict-mode settings let callers decide whether they want fast failure, comprehensive errors, extra schema/data context, or stricter authoring feedback.

Useful patterns for Quoin:

- collecting multiple errors is valuable, but users need controls over how much is printed
- strict authoring errors should be explicit, not silently ignored
- verbose diagnostic context should exist, but it should not be forced into the default happy path

Quoin implication: Core should continue collecting rich diagnostic data; Integrations should expose presentation policy.

## Recommendations

### 1. Define a human diagnostic anatomy

Every rendered human diagnostic should answer, in this order:

1. What failed?
2. Where is it?
3. Why did it fail?
4. What should I try next?
5. What stable diagnostic kind should I cite if I need to search or report it?

Recommended CLI shape:

```text
FAIL  notes/a.md (concept)
  Missing required property `status`.
  Add `status` to the document frontmatter.
  [property:missing-required]
```

For simple diagnostics, the recovery line can be omitted if the message itself is already actionable.

### 2. Stop leading human output with internal kinds

Internal kinds should remain available, but they should be secondary in default human output.

Current:

```text
property:type-mismatch: Property "priority" must be date.
```

Better:

```text
Property `priority` must be a date.
  Current value: "high"
  [property:type-mismatch]
```

This keeps the stable identifier without making it the user's first obstacle.

### 3. Add targeted recovery hints for common failures

The highest-value recovery hints are for failures where the next action is obvious:

- missing required Property: add the missing frontmatter key
- type not found: check spelling or run `quoin types`
- ambiguous type: rename or disambiguate Type Definition Documents
- target not found: check the path passed to the command
- target excluded: check config include/exclude rules
- malformed frontmatter: fix YAML before Quoin can validate the Document
- invalid output path on `create`: choose a Markdown path inside the project root

These should be hand-authored messages, not generic templates.

### 4. Preserve detail through modes, not default verbosity

Default human output should show the most useful explanation for each problem. A future detail mode should expose:

- diagnostic kind
- raw location object
- offending value when available
- expected type or constraint
- candidate type identities for ambiguity
- config file path involved in discovery or filtering

This mirrors TypeScript's readable default plus full-detail options and Ajv's normal vs verbose reporting.

### 5. Group messages around the user's fixing workflow

People usually fix one file, config row, or type definition at a time. Human output should prefer:

- file first
- then Property, Section, Type Declaration, or command input
- then issue details

This is more usable than grouping by internal stage unless the issue is truly run-level, such as discovery failure.

### 6. Make Obsidian and CLI render from the same diagnostic vocabulary

The CLI, Obsidian sidebar, status bar, and future editor integrations should share the same diagnostic message catalog. Presentation can differ, but the underlying title, explanation, recovery hint, and reference kind should be consistent.

This avoids one Integration becoming clearer than another and makes docs examples reusable.

### 7. Treat diagnostic docs as product surface

If Quoin keeps stable diagnostic kinds, common ones should eventually have short docs pages or sections:

- what it means
- why Quoin reports it
- examples of invalid and valid Markdown
- recovery steps

Rust's `rustc --explain` model is heavier than Quoin needs today, but the principle is useful: stable codes become valuable when they are backed by explanations.

## Suggested Message Catalog Shape

Quoin can keep existing Core diagnostics and add an Integration-facing message catalog:

```ts
type HumanDiagnosticMessage = {
  title: string;
  explanation?: string;
  recovery?: string;
  reference: string;
};
```

Example mappings:

```ts
{
  title: 'Missing required property `status`.',
  explanation: 'The `concept` type marks this property as required.',
  recovery: 'Add `status` to the document frontmatter.',
  reference: 'property:missing-required',
}
```

```ts
{
  title: 'Target path was not found.',
  explanation: 'Quoin could not find `notes/missing.md` from the current project root.',
  recovery: 'Check the path or run `quoin validate` without explicit targets.',
  reference: 'target:not-found',
}
```

## Open Questions

- Should recovery hints live in Core, the Integration, or a shared presentation package?
- Should diagnostic kinds be renamed before they become a documented user-facing reference?
- Should Quoin expose a `--explain <diagnostic-kind>` command, or is documentation enough for now?
- How much offending-value detail is safe and useful in human output when values may be long or private?

## Sources

- [src/integration/node-cli/validate.ts](../../src/integration/node-cli/validate.ts)
- [src/integration/node-cli/create.ts](../../src/integration/node-cli/create.ts)
- [R1 — Human-Readable CLI Output](R1-human-readable-cli-output.md)
- [R4 — Config File UX](R4-config-file-ux.md)
- [ESLint Formatters Reference](https://eslint.org/docs/latest/use/formatters/)
- [ESLint Command Line Interface Reference](https://eslint.org/docs/latest/use/command-line-interface)
- [Biome CLI Reference](https://biomejs.dev/reference/cli/)
- [Zod Formatting Errors](https://zod.dev/error-formatting)
- [TypeScript TSConfig Reference](https://www.typescriptlang.org/tsconfig/)
- [Rust Compiler Error Index](https://doc.rust-lang.org/rustc/explain.html)
- [Ajv Options](https://ajv.js.org/options.html)
