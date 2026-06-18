---
_type: "[[research-note]]"
status: "active"
---

# R1 — Human-Readable CLI Output

## Goal

Improve Quoin's default CLI output for humans without weakening its existing machine-readable JSON mode.

This note focuses on tools with a similar shape to Quoin:

- project-scoped CLI tools
- validation or analysis workflows
- default human output plus machine-readable output
- frequent use in local development and CI

## Current Quoin Baseline

Quoin already has the right high-level split:

- `human` output for normal CLI use
- `json` output for automation

Current strengths in `src/integration/node-cli`:

- stable status prefixes such as `PASS`, `FAIL`, `WARN`, `SKIP`, `CREATED`, `ABORT`
- deterministic summary counts at the end of `validate`
- consistent root-relative paths
- a shared `effectiveConfig` snapshot in JSON output

Current usability gaps:

1. `validate` is compact, but many failures are still too raw.
   Example: target diagnostics print internal kinds like `target:not-found` instead of a user-oriented explanation.
2. `validate` shows parse-failure counts but not the parse errors themselves.
3. `types` is informative but becomes visually dense once bindings are present.
4. `create` reports success/failure clearly, but success output omits useful next-step context such as whether defaults were scaffolded or whether a template body was rendered.
5. There is no lighter-weight human mode for CI or shell composition, only full `human` and full `json`.

## External Patterns

### ESLint

ESLint keeps a human-oriented default formatter and makes alternate output formats explicit. Its CLI documents `-f, --format` with `stylish` as the default formatter and also provides flags like `--quiet`, `--max-warnings`, and color control.

Why this matters for Quoin:

- the default output is optimized for reading, not scripting
- output verbosity is adjustable without changing the command's meaning
- warnings can be filtered independently from errors

Source:

- https://eslint.org/docs/latest/use/command-line-interface

### Biome

Biome exposes a broader reporter model. Its CLI supports `--reporter=<default|json|json-pretty|github|junit|summary|gitlab|checkstyle|rdjson|sarif>`, plus `--max-diagnostics`, `--diagnostic-level`, and `--error-on-warnings`.

Why this matters for Quoin:

- "reporter" is a better mental model than a binary human/json switch
- summary-only output is a first-class mode
- diagnostic count caps are useful when a repo is very broken

Source:

- https://biomejs.dev/reference/cli/

### Prettier

Prettier separates two human needs cleanly:

- `--check` prints human-friendly status plus the files needing attention
- `--list-different` prints only filenames for scripting and CI composition

It also documents simple exit codes for the main states.

Why this matters for Quoin:

- one command can have both a friendly mode and a pipe-friendly mode
- success messages should reassure quickly
- minimal list output is often more useful than verbose prose in automation-adjacent usage

Source:

- https://prettier.io/docs/cli

## Synthesis

The common pattern is not "human vs machine." It is:

1. friendly default output for local use
2. reduced-noise human output for CI and large repos
3. structured output for automation

Quoin currently has (1) and (3), but not (2).

## Recommendations For Quoin

### 1. Keep `json`, but replace the human switch with reporters

Current:

- `--format human`
- `--format json`

Recommended direction:

- `--reporter default`
- `--reporter summary`
- `--reporter paths`
- `--reporter json`

This stays aligned with tools like Biome while preserving Quoin's existing JSON contract.

Suggested meanings:

- `default`: current human output, improved for actionability
- `summary`: counts plus short diagnostics only
- `paths`: emit only failing or warning paths, one per line
- `json`: exhaustive structured output

`--format json` can remain as a compatibility alias for `--reporter json`.

### 2. Make every human failure actionable

Human output should answer:

- what failed
- where it failed
- why it failed
- what the user should do next

Current failure example:

```text
FAIL  notes/x.md: type "concept" not found
```

Better:

```text
FAIL  notes/x.md
  Type declaration resolves to "concept", but no matching type definition document was discovered.
  Next step: check the declaration spelling or run `quoin types`.
```

This is slightly longer, but materially more useful.

### 3. Group diagnostics by file before grouping by kind

People usually fix one file at a time. `validate` should prefer:

```text
FAIL  notes/a.md (Concept)
  property:missing-required  Missing required property "status".
  property:type-mismatch     Property "level" must be a wiki link to type "level".
  WARN                       Missing required section "## References".
```

instead of forcing the user to mentally merge separate diagnostic blocks.

Run-level problems like ingest failures and broken type definitions should remain separate, but target-level output should stay file-centric.

### 4. Add noise controls

Recommended flags:

- `--quiet`
  Suppress warnings; show failures only.
- `--max-diagnostics <n>`
  Stop printing detailed target diagnostics after `n`, but keep accurate summary counts.
- `--error-on-warnings`
  Treat warning-only runs as non-zero exit for CI.

These are proven patterns from ESLint and Biome and fit Quoin's validation model directly.

### 5. Distinguish interactive output from pipe-friendly output

Quoin needs a minimal mode analogous to Prettier's `--list-different`.

Example for `validate --reporter paths`:

```text
notes/a.md
notes/b.md
```

That mode is valuable for:

- editor integrations
- `xargs` or shell pipelines
- CI annotations built by wrapper scripts

### 6. Improve success output, not just failure output

Current Quoin output is mostly failure-oriented, which is correct, but success still needs to confirm meaningful work.

For `create`, a stronger success message would include:

- written path
- chosen type
- whether defaults were scaffolded
- whether a template body was rendered
- warning count

Example:

```text
CREATED  notes/my-concept.md
  Type: Concept
  Frontmatter defaults scaffolded: 3
  Template sections rendered: 4
  Warnings: 0
```

For `types`, the default list should stay compact, but detail mode can be made more scan-friendly by separating schema facts from discovery facts.

### 7. Print internal terms only when they help

Some current output surfaces internal discriminant names directly, such as `target:not-found`.

Those are good JSON values, but weak human prose.

Rule:

- JSON should preserve internal discriminants exactly.
- Human output should translate them into plain language.

### 8. Keep exit codes simple and documented

Prettier's docs are effective here because they are easy to memorize.

Quoin should document stable exit-code semantics near the CLI docs and keep them shallow:

- `0`: no blocking failures
- `1`: validation or command failure
- `2`: CLI usage or internal runtime failure

If Quoin already uses a different scheme internally, it should still document the mapping explicitly for users.

## Suggested First Iteration

The highest-value changes are small:

1. Add `--quiet`.
2. Add `--max-diagnostics`.
3. Translate raw target diagnostic kinds into human prose.
4. Group `validate` output by file.
5. Add `--reporter summary`.
6. Add `--reporter paths` for failing paths only.

This would materially improve usability without redesigning the result model.

## Concrete Output Direction

### `quoin validate`

Default:

```text
FAIL  notes/example.md (Concept)
  Missing required property "status".
  Property "level" must link to a document of type "level".
  WARN  Missing required section "## References".

PASS  notes/other.md (Concept)

Results: 1 passed, 1 failed, 0 skipped
Diagnostics: 0 ingest, 0 type-parse, 0 target
Exit: 1
```

Summary reporter:

```text
Failed: 1 file
Warnings: 1 file
Passed: 1 file
Exit: 1
```

Paths reporter:

```text
notes/example.md
```

### `quoin create`

Default:

```text
CREATED  notes/my-concept.md
  Type: Concept
  Frontmatter defaults scaffolded: 2
  Template rendered: yes
```

### `quoin types`

Default:

```text
--- Types ---
  Concept   5 properties, 4 sections
  Skill     3 properties, no template

Bindings: 2
Broken type definitions: 0
Ambiguous names: 0
```

## Decision

Adopt a reporter model for human output evolution, while preserving JSON as Quoin's exhaustive automation contract.

That gives Quoin a cleaner long-term UX path than continuing to treat output as a binary `human` vs `json` choice.

## References

- Quoin local design: [D5 — Node CLI Integration](../design/D5-node-cli-integration.md)
- Quoin current implementation:
  - [output.ts](../../src/integration/node-cli/output.ts)
  - [validate.ts](../../src/integration/node-cli/validate.ts)
  - [create.ts](../../src/integration/node-cli/create.ts)
  - [types.ts](../../src/integration/node-cli/types.ts)
- ESLint CLI docs: https://eslint.org/docs/latest/use/command-line-interface
- Biome CLI docs: https://biomejs.dev/reference/cli/
- Prettier CLI docs: https://prettier.io/docs/cli
