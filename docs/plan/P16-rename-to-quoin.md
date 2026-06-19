---
_type: "[[plan-doc]]"
status: "done"
terms: ["Core", "Integration", "Validation"]
---

# P16 — Rename project to Quoin

## Goal

Rename the project from `markdown-type-system` to `quoin` across code, configuration, documentation, tests, and fixtures, without changing any behaviour.

After this phase:

- The package is named `quoin`.
- The development CLI invoked via `npm run cli` identifies itself as `quoin`.
- The default config file is `quoin.config.jsonc`.
- All documentation reads as "Quoin" or "quoin" where it previously read "Markdown Type System" or "markdown-type-system".
- The directory layout under `src/` is unchanged.
- The Core API surface is unchanged.
- `npm run typecheck` and `npm test` continue to pass.

The rename is mechanical. No design contract changes are part of this phase.

## Inputs

- [D5 — Node CLI Integration](../design/D5-node-cli-integration.md) — references the config file name
- [D6 — Path-Glob Type Bindings](../design/D6-path-glob-type-bindings.md) — references the config file name
- Existing repo state: every file matching `grep -ril "markdown-type-system\|Markdown Type System\|markdown type system"`

## Deliverables

### Package manifest

`package.json`:

- `"name": "quoin"`
- update `"description"` to reflect the new name; the substantive description does not change
- keep the existing development `npm run cli` entry unchanged

`package-lock.json`:

- refresh the root package name from `markdown-type-system` to `quoin`

This phase does not introduce packaged-distribution mechanics. No `"bin"` entry, build script, `dist/` output, or global-install story is part of this rename.

### CLI runtime

`src/integration/node-cli/index.ts`:

- `.name('quoin')`
- help text mentioning the config file becomes `quoin.config.jsonc`

`src/integration/node-cli/config.ts`:

- `CONFIG_FILE_NAME = 'quoin.config.jsonc'`

No other Node CLI source files are expected to change. Discovery, ingestion, registry, validation, and command logic are name-agnostic.

### Documentation

Update prose, titles, and config-file-name references in:

- `README.md`
- `CONTEXT.md`
- `docs/design/D5-node-cli-integration.md`
- `docs/design/D6-path-glob-type-bindings.md`
- `docs/test-cases/README.md`
- `docs/plan/README.md`
- `docs/plan/core/README.md`
- `docs/plan/integration/README.md`
- `docs/plan/integration/node-cli/README.md`
- `docs/plan/integration/node-cli/P9-node-cli-implementation-plan.md`
- `docs/plan/integration/node-cli/P10-cli-scaffold-and-config.md`
- `fixtures/README.md`

Pronunciation note: the project README should state "Quoin — pronounced *coin*" in the first paragraph. This is a one-time tax to prevent repeated questions.

### Tests and fixtures

- `test/integration/node-cli/fixtures.test.ts` and `test/integration/node-cli/config.test.ts` — update any literal references to `markdown-type-system.config.jsonc` and any expected CLI program-name strings.
- `fixtures/` — rename any literal `markdown-type-system.config.jsonc` files to `quoin.config.jsonc` and re-snapshot golden output if it embeds the file name.

### Non-goals for this phase

This phase does not:

- introduce a `bindings.yaml` sidecar file (deferred per D6)
- accept legacy `markdown-type-system.config.jsonc` as a fallback config name
- restructure `src/`, `docs/`, or `test/` directories
- rename the local working-tree directory or the GitHub repository (handled outside this plan)
- add packaged CLI distribution work such as a `"bin"` entry, build pipeline, or published install path
- register the npm package, the `quoin.io` domain, or a Homebrew formula
- change Core APIs, CLI commands, result shapes, or exit-status rules

A clean rename is preferred over a deprecation window because there are no external consumers yet.

## File layout

Expected touch points:

```text
package.json
package-lock.json
src/integration/node-cli/index.ts
src/integration/node-cli/config.ts
README.md
CONTEXT.md
docs/design/D5-node-cli-integration.md
docs/design/D6-path-glob-type-bindings.md
docs/plan/README.md
docs/plan/core/README.md
docs/plan/integration/README.md
docs/plan/integration/node-cli/README.md
docs/plan/integration/node-cli/P9-node-cli-implementation-plan.md
docs/plan/integration/node-cli/P10-cli-scaffold-and-config.md
docs/test-cases/README.md
fixtures/README.md
fixtures/**/markdown-type-system.config.jsonc   (rename)
test/integration/node-cli/fixtures.test.ts
test/integration/node-cli/config.test.ts
```

No new files are created by this phase.

## Steps

1. Apply the `package.json` updates: `name`, `description`.
2. Refresh `package-lock.json` so its root package metadata also reads `quoin`.
3. Update the CLI program name and help text in `src/integration/node-cli/index.ts`.
4. Update `CONFIG_FILE_NAME` in `src/integration/node-cli/config.ts`.
5. Sweep `README.md` and `CONTEXT.md` for old-name references; rewrite titles and prose.
6. Sweep the design docs (`D5`, `D6`) for `markdown-type-system.config.jsonc` references.
7. Sweep the plan README files and `P9` / `P10` for old-name references.
8. Sweep `docs/test-cases/README.md` and `fixtures/README.md`.
9. Rename any fixture config files from `markdown-type-system.config.jsonc` to `quoin.config.jsonc` and update the corresponding fixture tests.
10. Update test assertions in `test/integration/node-cli/fixtures.test.ts` and `test/integration/node-cli/config.test.ts`.
11. Run `npm run typecheck`. Fix any breakage.
12. Run `npm test`. Fix any breakage; re-snapshot golden output if the file name leaked into snapshot text.
13. Final search: `grep -ril "markdown-type-system\|Markdown Type System\|markdown type system" --include='*.md' --include='*.ts' --include='*.json' --include='*.jsonc' --include='*.yml' --include='*.yaml' . | grep -v node_modules` must return only intentional historical references (e.g. inside a changelog entry, if one exists). Commit otherwise.

## Acceptance Criteria

- `package.json` reports `"name": "quoin"`.
- `package-lock.json` reports the root package name as `quoin`.
- The CLI invoked via `npm run cli -- --help` prints `quoin` as the program name and references `quoin.config.jsonc` in its help text.
- Loading a project that contains `quoin.config.jsonc` succeeds; loading a project that still contains `markdown-type-system.config.jsonc` and no `quoin.config.jsonc` falls back to zero-config (the old name is no longer recognized).
- No file under `src/`, `test/`, `docs/`, `fixtures/`, or the repository root contains the string `markdown-type-system` or `Markdown Type System` outside intentional historical mentions.
- `npm run typecheck` succeeds.
- `npm test` succeeds.
- No Core API, CLI command surface, validation contract, or exit-status rule has changed.

## Follow-up

Out of scope for P16 but worth tracking:

- Register `quoin.io` (primary) and optionally `quoin.sh`.
- Reserve `quoin` on npm with a placeholder publish once the package is ready to flip from `"private": true` to `"private": false`.
- Rename the local working-tree directory and the GitHub repository.
- Decide whether to accept `.quoinrc.json` / `.quoinrc.jsonc` as alternative config file names; deferrable until a real user requests it.
- Author a Homebrew formula after the first stable release.
