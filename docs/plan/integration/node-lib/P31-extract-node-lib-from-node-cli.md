---
_type: "[[plan-doc]]"
status: "in-progress"
---

# P31 — Extract node-lib from node-cli

## Goal

Refactor the current Node CLI integration so that all non-CLI logic moves into
a new reusable integration: `node-lib`.

After this phase:

- `src/integration/node-cli/` is a thin CLI shell only.
- reusable Node runtime logic lives under `src/integration/node-lib/`.
- programmatic callers can invoke Node-backed project discovery, validation,
  creation, and type inspection without going through `commander` or terminal
  output.
- the npm package exports a stable library surface for `node-lib`.

This phase is about boundary extraction and public API exposure, not about
adding new validation semantics.

## Why This Exists

The current `node-cli` integration already mixes two separate concerns:

- CLI concerns:
  argument parsing, process exit, command wiring, and terminal-oriented output
- reusable Node integration concerns:
  config resolution, filesystem discovery, ingestion, type lookup, project
  universe building, create/validate/types execution, and result shaping

That makes the CLI harder to keep small, and it prevents callers from reusing
the same real Node integration programmatically.

This phase restores the architecture described by
[ADR 0005 — Functional Core / Imperative Shell](../../../adr/0005-functional-core-imperative-shell.md):
the shell should stay thin, while reusable integration behavior sits behind a
data-oriented interface.

## Inputs

- [D5 — Node CLI Integration](../../../design/D5-node-cli-integration.md) —
  defines the current Node-host behavior that must be preserved.
- [P17 — Build Package For npm Distribution](../../P17-build-package-for-npm.md) —
  established packaged library and CLI exports.
- [ADR 0005 — Functional Core / Imperative Shell](../../../adr/0005-functional-core-imperative-shell.md) —
  defines the intended boundary between reusable logic and shell logic.
- `src/integration/node-cli/` — current implementation to extract from.
- `src/index.ts` — current public package surface.
- `package.json` — current package export map.

## Deliverables

### 1. New integration layout

Create a new integration folder:

```text
src/integration/node-lib/
```

The extracted library should own the reusable Node-backed runtime, including:

- config loading and effective-config resolution
- filesystem discovery and ingestion
- type-definition lookup and project-universe construction
- command execution logic for validate/create/types
- reusable result types returned to callers
- programmatic entrypoints that do not print or call `process.exit`

The existing CLI folder should retain only shell-specific concerns:

- `commander` setup
- mapping CLI flags and args onto library calls
- selecting human vs JSON formatting
- writing to stdout/stderr
- converting library outcomes into process exit codes

### 2. Programmatic API

`node-lib` should expose a stable API that a caller can import and run directly.

Minimum expected surface:

```typescript
type NodeLib = {
  loadConfig(...): Promise<...>
  validate(...): Promise<...>
  create(...): Promise<...>
  types(...): Promise<...>
}
```

The exact function names can follow repo conventions, but the design should
preserve these properties:

- accepts explicit inputs rather than reading `process.argv`
- returns structured results rather than printing
- does not call `process.exit`
- can be composed by tests, scripts, editors, or other Node hosts

Preferred structure:

- one small public `index.ts` for `node-lib`
- internal helpers organized by concern
- public result and config types exported alongside the functions that use them

### 3. CLI compatibility layer

The CLI should become an adapter over `node-lib`, not a second implementation.

Expected refactor direction:

- move `runValidate`, `runCreate`, `runTypes`, config helpers, and project
  runtime helpers into `node-lib`
- keep human/JSON formatting close to the CLI unless a formatter is explicitly
  intended to be reusable by programmatic callers
- keep `handleValidate`, `handleCreate`, and `handleTypes` thin, or remove them
  if direct library invocation from the CLI is clearer

The CLI command behavior, flags, and exit semantics should remain unchanged.

### 4. Package exports

The published package should expose `node-lib` for programmatic use.

Minimum packaging change:

- add an explicit export path for the new surface:

```json
"exports": {
  ".": {
    "types": "./dist/index.d.ts",
    "import": "./dist/index.js"
  },
  "./node-lib": {
    "types": "./dist/integration/node-lib/index.d.ts",
    "import": "./dist/integration/node-lib/index.js"
  }
}
```

Recommended companion change:

- re-export the `node-lib` public surface from `src/index.ts` as well when that
  does not make the root package surface noisy or ambiguous

That gives callers two reasonable import styles:

```typescript
import { ... } from 'quoin/node-lib'
```

and, if desired by the final API shape:

```typescript
import { ... } from 'quoin'
```

Preference: keep `quoin/node-lib` as the canonical Node-host-specific import,
and only re-export from the package root if the names are clean and clearly
scoped.

### 5. Tests

Tests should follow the extracted boundary.

Expected outcomes:

- reusable runtime behavior is tested against `node-lib`
- CLI tests focus on shell behavior only
- existing Node integration tests are moved or renamed if they are really
  library tests rather than CLI tests

At minimum, cover:

- config resolution through the library API
- validate/create/types execution through the library API
- CLI smoke coverage proving the shell still delegates correctly

## Non-goals

This phase does not:

- redesign Core APIs
- change D5 semantics for validation, creation, lookup, or discovery
- add new CLI commands
- change output wording unless extraction makes a tiny cleanup necessary
- make the package runtime-agnostic beyond Node
- commit to long-term API stability beyond the newly defined `node-lib` surface
  for clearly exported symbols

## File layout

Expected touch points:

```text
docs/plan/README.md
docs/plan/integration/README.md
docs/plan/integration/node-lib/README.md
docs/plan/integration/node-lib/P31-extract-node-lib-from-node-cli.md
src/integration/node-cli/index.ts
src/integration/node-cli/commands.ts
src/integration/node-cli/output.ts
src/integration/node-lib/index.ts
src/integration/node-lib/**
src/index.ts
package.json
test/integration/node-cli/**
test/integration/node-lib/**
```

Possible additional touch points:

```text
README.md
docs/public/index.md
```

Update package-consumer docs only if they mention the programmatic API.

## Recommended extraction shape

### Public node-lib surface

Prefer a small public entrypoint such as:

```typescript
export type { NodeLibConfig, EffectiveNodeConfig, ValidateResult, CreateResult, TypesResult };
export { loadNodeConfig, runNodeValidate, runNodeCreate, runNodeTypes };
```

Naming can vary, but two rules should hold:

- public names should read as library calls, not CLI handlers
- CLI-only words like `handle` or `CommandIntent` should not leak into
  `node-lib`

### Internal layering

Prefer this shape:

1. `node-lib/config.ts`
2. `node-lib/project.ts`
3. `node-lib/validate.ts`
4. `node-lib/create.ts`
5. `node-lib/types.ts`
6. optional `node-lib/lookup.ts`, `node-lib/ingestion.ts`, `node-lib/bindings.ts`

The goal is not a blind file move. The goal is a clearer public boundary:

- public modules define reusable API
- internal modules support those APIs
- CLI modules import from `node-lib`, not the reverse

### Output formatting boundary

Keep terminal formatting out of the library by default.

That means:

- `node-lib` returns plain structured data
- `node-cli` owns `printHuman`, `printJson`, and terminal-oriented formatting

Exception:
if some serializer is genuinely host-neutral and useful to external callers, it
can live in `node-lib`, but it should not depend on CLI naming or process
behavior.

## Steps

1. Define the public `node-lib` API before moving files. Decide which types and
   functions are intentionally exported and which stay internal.
2. Create `src/integration/node-lib/` and move reusable runtime modules there.
3. Rename public functions where necessary so they read as library operations
   rather than CLI handlers.
4. Update imports so `node-cli` depends on `node-lib`, never the reverse.
5. Reduce `src/integration/node-cli/index.ts` to argument parsing, output
   selection, and exit handling.
6. Remove or simplify CLI-only wrapper types such as `CommandIntent` if they no
   longer add value after extraction.
7. Export the new library surface from
   `src/integration/node-lib/index.ts`.
8. Update `src/index.ts` and `package.json` exports to expose `node-lib`
   programmatically.
9. Move or rewrite tests so reusable runtime behavior is exercised through the
   `node-lib` API.
10. Re-run packaging verification to ensure both `quoin` and `quoin/node-lib`
    resolve from built output.

## Acceptance criteria

- all non-CLI Node integration logic lives under `src/integration/node-lib/`
  or a clearly equivalent extracted boundary
- `src/integration/node-cli/` is a thin shell with no duplicated runtime logic
- a Node caller can import the programmatic API without invoking CLI parsing or
  terminal output
- package exports expose the new library surface from built output
- existing CLI behavior remains compatible
- tests cover both the extracted library API and the thin CLI adapter

## Risks and watchouts

- avoid exporting accidental internals just because they are convenient during
  the refactor
- avoid moving terminal formatting into `node-lib` unless there is a concrete
  reuse case
- avoid preserving CLI-centric naming in the public library API
- avoid a circular dependency where `node-lib` imports back from `node-cli`
- avoid changing D5 semantics under the cover of “just extraction”
