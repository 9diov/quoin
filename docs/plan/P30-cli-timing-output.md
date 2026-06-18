---
_type: "[[plan-doc]]"
status: "proposed"
---

# P30 — CLI Timing Output

## Goal

Append a `Time taken:` line to the Node CLI's human output so developers can
see at a glance how long each command took and where that time was spent.

Example at the bottom of `quoin validate`:

```
Results: 42 passed, 0 failed, 3 skipped/untyped
Diagnostics: 0 ingest, 0 parse, 0 target
Exit: 0

Time taken: 234ms (discovery: 12ms, ingestion: 120ms, parsing: 45ms, validation: 57ms)
```

## Inputs

- [D5 — Node CLI Integration](../design/D5-node-cli-integration.md) — current
  command responsibilities and result shapes.
- [R1 — Human-Readable CLI Output](../research/R1-human-readable-cli-output.md)
  — output philosophy for the CLI.

## Current State

- `validate` already computes summary counts at format time and prints a
  stable trailing summary block.
- `create` returns a tagged union result and may exit early at several points:
  discovery health, type lookup, output-path validation, generated-document
  validation, and write I/O.
- `types` returns a single object result with summary fields and optional
  detail output.
- The test suite primarily asserts structured return values and mocked
  formatter calls; it does not rely on snapshotting human CLI output.

## Decision

### Phases to time

**validate** — timed inside `runValidate()`:

| Phase | Covers |
|---|---|
| `discovery` | `discoverMarkdownFiles()` call |
| `ingestion` | `ingestMarkdownFiles()` call |
| `parsing` | `parseTypeCandidates()` call |
| `validation` | the per-file validation loop |

**create** — timed inside `runCreate()`:

| Phase | Covers |
|---|---|
| `universe` | `buildProjectUniverse()` call |
| `synthesis` | type lookup, output-path resolution, frontmatter/body generation |
| `validation` | `validate(candidate, ...)` call |
| `write` | file write to disk |

**types** — timed inside `runTypes()`:

| Phase | Covers |
|---|---|
| `universe` | `buildProjectUniverse()` call |

Total wall-clock is measured around the whole `run*()` body, not summed from
phases, to capture any overhead between phases.

Commands may return before all phases run. In that case:

- `totalMs` still measures the full command wall-clock up to the return point.
- `phases` includes only phases that actually completed.
- phase names remain in execution order; no placeholder zero-duration entries
  are emitted for skipped phases.

### Data shape

```typescript
type TimingPhase = { name: string; ms: number };

type Timing = {
  totalMs: number;
  phases: TimingPhase[];
};
```

Phases are ordered by when they ran. `ms` values are integers (rounded from
`performance.now()` deltas).

### Capture location

Each `run*()` function records `performance.now()` around phase boundaries and
returns a `timing` field alongside its existing result type.

For `create`, attach `timing` to every branch of the tagged union rather than
introducing a wrapper object. That preserves the current command/formatter call
sites and keeps `createExitCode(result)` unchanged.

### Output behaviour

**Human format** — always append the `Time taken:` line after the existing
summary block, using `printHuman()`.

- `validate` already has an explicit trailing summary block; append timing
  immediately after `Exit: ...`.
- `types` should append timing after its final `Discovered: ...` summary line.
- `create` has no summary footer today, so append timing after the last
  result-specific line for every outcome.

**JSON format** — add a top-level `timing` field to the JSON object.

No flag is required. Timing is always visible — useful noise is better than a
hidden feature.

## Non-goals

- No `--timing` flag or opt-in
- No per-file validation timing
- No memory or CPU measurement
- No percentile or histogram data
- No changes to exit codes or error handling

## Code Changes

### New shared helper: `src/integration/node-cli/timing.ts`

```typescript
export type TimingPhase = { name: string; ms: number };
export type Timing = { totalMs: number; phases: TimingPhase[] };

export function formatTimingHuman(timing: Timing): string {
  if (timing.phases.length === 0) {
    return `Time taken: ${timing.totalMs}ms`;
  }
  const detail = timing.phases.map((p) => `${p.name}: ${p.ms}ms`).join(', ');
  return `Time taken: ${timing.totalMs}ms (${detail})`;
}
```

### `src/integration/node-cli/validate.ts`

- Add `timing: Timing` to `ValidateResult`
- Capture `performance.now()` before and after each of the four phases in
  `runValidate()`; compute total around the full function body
- `formatValidateHuman()` — call `printHuman(formatTimingHuman(result.timing))`
  after the existing summary lines
- `formatValidateJson()` — include `timing: result.timing` in the output object

### `src/integration/node-cli/create.ts`

- Add `timing: Timing` to every `CreateResult` union member
- Capture timings around `buildProjectUniverse()`, synthesis,
  generated-document validation, and write
- Ensure early returns include partial timing with only completed phases
- Update both format functions as above

### `src/integration/node-cli/types.ts`

- Add `timing: Timing` to `TypesResult`
- Capture timing around `buildProjectUniverse()`
- Update both format functions as above

## Implementation Order

1. Add `timing.ts` with the `Timing` type and `formatTimingHuman` helper.
2. Instrument `runValidate()` and update its two format functions.
3. Instrument `runCreate()` and update its two format functions.
4. Instrument `runTypes()` and update its two format functions.
5. Add tests that assert timing shape and formatter integration without
   snapshotting concrete millisecond values.

## Tests

Prefer deterministic structure assertions over snapshots with real clock data.

- `runValidate()` / `runCreate()` / `runTypes()` tests:
  assert `timing.totalMs` is a non-negative integer, and `timing.phases`
  contains the expected phase names in order for representative success cases.
- `runCreate()` early-return tests:
  assert partial timing on at least one pre-write abort path and one
  post-validation path.
- formatter tests:
  mock `printHuman` / `printJson` and assert the timing line or `timing` field
  is present, without pinning exact durations.
- fixture-manifest tests:
  no snapshot rewrite required unless the fixture harness is later expanded to
  execute formatter output end-to-end.

## Exit Criteria

P30 is complete when:

- `quoin validate` human output ends with a `Time taken:` line showing total
  and per-phase durations
- `quoin create` and `quoin types` produce equivalent timing lines
- JSON output for all three commands includes a `timing` field with `totalMs`
  and `phases`
- `create` failure paths still report timing without fabricating skipped phases
- Tests cover timing shape and formatter presence; no existing tests regress
