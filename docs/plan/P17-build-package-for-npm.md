---
_type: "[[plan-doc]]"
status: "done"
---

# P17 — Build Package For npm Distribution

## Goal

Make Quoin buildable and installable as an npm package without changing CLI
behavior or Core semantics.

After this phase:

- `npm run build` emits a distributable `dist/` tree from `src/`.
- `npm pack` produces a tarball containing only the files needed to run Quoin
  as a package.
- installing that tarball exposes a working `quoin` command.
- the public package entrypoint for library consumers resolves to built output
  under `dist/`.
- `README.md` and `docs/public/index.md` describe an installation flow that is
  now actually supported by the repo.

This phase is about packaging, not about release automation.

## Inputs

- [P16 — Rename project to Quoin](P16-rename-to-quoin.md) — completed the
  naming work and explicitly deferred packaged distribution.
- [D5 — Node CLI Integration](../design/D5-node-cli-integration.md) — defines
  the CLI surface that the packaged binary must preserve.
- [docs/public/index.md](../public/index.md) — already claims
  `npm install -g quoin`, so the repo needs to make that statement true.
- [src/index.ts](../../src/index.ts) — current public library surface that
  needs a built package entrypoint.

## Deliverables

### Build pipeline

Add a production build that compiles `src/**/*.ts` into `dist/` without pulling
in `test/`.

Expected characteristics:

- ESM output remains the package format.
- declarations (`.d.ts`) are emitted for the library surface.
- source maps may be kept if they do not bloat the package unreasonably.
- test files are excluded from the production build.
- `rootDir` is `src` and `outDir` is `dist` so NodeNext-relative imports emit
  correctly into the built tree.

Reasonable implementation options:

- a dedicated `tsconfig.build.json` consumed by `tsc -p`, or
- a build tool such as `tsup` if it stays simple and transparent.

Preference: start with `tsc` unless a concrete packaging problem requires a
bundler.

### Package manifest

`package.json` should become packable:

- set `"private": false`
- add a `"build"` script
- add a `"prepack"` script that guarantees `dist/` exists before `npm pack`
- add a `"bin"` entry for the CLI:

```json
"bin": { "quoin": "./dist/integration/node-cli/index.js" }
```

- add package entrypoints for library consumers:

```json
"main": "./dist/index.js",
"types": "./dist/index.d.ts",
"exports": {
  ".": {
    "types": "./dist/index.d.ts",
    "import": "./dist/index.js"
  }
}
```

- add a `"files"` allowlist so the tarball does not publish `src/`, `test/`,
  fixtures, or planning docs accidentally
- start with:

```json
"files": ["dist/", "README.md", "LICENSE"]
```

- add an `"engines.node"` floor of `>=18`

If npm publication is intended immediately after this phase, add
`"publishConfig": { "access": "public" }` too. If publication is still
deferred, that field may wait.

### CLI entrypoint

The packaged CLI must run as an installed binary, not only through `tsx`.

`src/integration/node-cli/index.ts` should therefore:

- begin with a Node shebang: `#!/usr/bin/env node`
- continue to parse exactly the same commands and flags as today

The built file in `dist/` must preserve executable CLI behavior. `tsc` does not
reliably solve the executable-bit/shebang problem on its own, so the plan
should assume a post-build fixup step unless direct verification proves it
unnecessary. A normal implementation is:

- prepend the shebang to `dist/integration/node-cli/index.js` after build
- `chmod +x dist/integration/node-cli/index.js`

The verification step must check the built file directly, not infer success
from the source file.

### Documentation

Update packaging-facing docs:

- `README.md`
- `docs/public/index.md`

They should distinguish:

- development invocation: `npm run cli -- ...`
- installed-package invocation: `quoin ...`

If the package is not published in this phase, the install section should use a
local-tarball or `npm pack` smoke-test flow in contributor-facing docs instead
of implying that the public registry publish already happened.

### Verification

Add a packaging verification path that exercises the built artifact rather than
the TypeScript source tree.

Minimum checks:

1. `npm run build`
2. `npm pack`
3. install the resulting tarball into a temporary directory
4. run `quoin --help` from the installed package
5. optionally run one real fixture command such as `quoin validate` against a
   known-good fixture root

This can live as:

- a documented manual verification sequence, or
- a small script wired into `package.json` (preferred if it stays readable)

## Non-goals for this phase

This phase does not:

- publish Quoin to npm
- automate releases via GitHub Actions
- add Homebrew, `npx`-specific wrappers, or standalone binaries
- redesign the public Core API
- bundle dependencies into one file unless build tooling proves necessary
- add CommonJS output; ESM-only is fine for v1
- introduce semantic-release, changesets, or versioning workflow automation

## File layout

Expected touch points:

```text
package.json
package-lock.json
tsconfig.json                      (if shared settings need adjustment)
tsconfig.build.json                (likely new)
README.md
LICENSE
docs/public/index.md
src/integration/node-cli/index.ts
dist/**                            (build output, ignored/untracked unless the repo chooses otherwise)
```

Possible additional touch points:

```text
.gitignore
scripts/package-smoke-test.*       (optional)
test/packaging/**                  (optional)
```

The preferred default is to keep `dist/` out of git and generate it during
build/prepack.

## Steps

1. Choose the production build strategy (`tsc` first, bundler only if needed).
2. Add build-specific TypeScript config so production compilation excludes
   `test/`, sets `rootDir: "src"`, and writes to `dist/` via
   `outDir: "dist"`.
3. Add `npm run build` and `prepack` scripts.
4. Add the CLI shebang to `src/integration/node-cli/index.ts` and verify it
   in built output. If `tsc` does not preserve a usable installed entrypoint,
   add a postbuild fixup that prepends the shebang and marks the file
   executable.
5. Add `bin`, `main`, `types`, `exports`, `files`, and `engines` metadata to
   `package.json`.
6. Flip `"private"` to `false` in this phase so `npm pack` and tarball-install
   verification are part of the actual deliverable. Registry publication
   remains deferred.
7. Update README/public docs so installation claims match reality.
8. Run `npm run build`.
9. Verify the built CLI artifact directly:
   - first line of `dist/integration/node-cli/index.js` is
     `#!/usr/bin/env node`
   - file is executable
10. Run `npm pack`, capture the emitted tarball filename dynamically, and
    inspect the tarball contents.
11. Install that tarball into a temp directory and run `quoin --help`.
    The smoke test must not hardcode `quoin-<version>.tgz`; it should capture
    the actual filename from `npm pack`, e.g. via `npm pack --quiet`.
12. Run `npm run typecheck` and `npm test` to ensure packaging changes did not
    regress source behavior.

## Acceptance Criteria

- `npm run build` succeeds from a clean checkout.
- `dist/index.js` and `dist/index.d.ts` exist after the build.
- `dist/integration/node-cli/index.js` exists and is usable as the package bin.
- `dist/integration/node-cli/index.js` starts with `#!/usr/bin/env node` and is
  executable.
- `npm pack` succeeds and the tarball excludes `src/`, `test/`, `fixtures/`,
  and `docs/` except for intentionally published root files such as `README.md`.
- installing the tarball into a temporary project provides a working `quoin`
  command.
- `quoin --help` from the installed package reports the same commands and
  global flags as the development CLI.
- `npm run typecheck` succeeds.
- `npm test` succeeds.
- no CLI command semantics, validation rules, or Core exports change.

## Follow-up

Out of scope for P17 but worth tracking:

- first real `npm publish`
- provenance/signing and release automation
- adding a CI job that runs the packaging smoke test on every release candidate
- publishing API reference docs from the built package surface
- deciding whether to ship CommonJS or `npx`-optimized ergonomics later
