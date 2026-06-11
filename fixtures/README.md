# CLI Fixtures

Committed Markdown vaults for running the Node CLI by hand and as end-to-end
regression inputs. Two tiers:

- **`scenarios/`** — minimal vaults, each isolating exactly one outcome so the
  exit code and diagnostic are unambiguous.
- **`vaults/`** — larger, realistic vaults for exploratory runs, demos, and
  exercising `create` / `types` against something that looks like a real project.

[`manifest.json`](manifest.json) declares each fixture's command and expected
result; [`test/integration/node-cli/fixtures.test.ts`](../test/integration/node-cli/fixtures.test.ts)
runs every entry as a golden test (`npm test`).

## Running by hand

From the repo root:

```bash
npm run cli -- --root fixtures/scenarios/<name> <command>
```

Two things to know:

1. **Config files are not auto-loaded with `--root`.** Config is discovered by
   searching upward from the current working directory, *not* from `--root`. The
   `vaults/` fixtures ship a `quoin.config.jsonc`; to make it take
   effect, pass it explicitly:

   ```bash
   npm run cli -- --root fixtures/vaults/custom-config \
     --config fixtures/vaults/custom-config/quoin.config.jsonc validate
   ```

2. **Sandbox note (only some environments).** If `npm run cli` fails to bind an
   IPC socket under a restrictive sandbox, run the entrypoint via Node directly:
   `node --import tsx src/integration/node-cli/index.ts …`. On a normal machine
   `npm run cli` is fine.

`create` writes a real file; its output path must be **inside** the root and must
not already exist. Use a throwaway path and delete it afterward:

```bash
npm run cli -- --root fixtures/scenarios/create-with-template create -t meeting -o _tmp/note.md
rm -rf fixtures/scenarios/create-with-template/_tmp
```

## Scenarios

| Fixture | Command | Exit | Demonstrates |
|---|---|---|---|
| `valid-minimal` | `validate` | 0 | a conforming document passes |
| `missing-required` | `validate` | 1 | `property:missing-required` |
| `wrong-type` | `validate` | 1 | `property:wrong-type` (number set to text) |
| `empty-not-allowed` | `validate` | 1 | `property:empty-not-allowed` (present-but-empty) |
| `broken-wiki-link` | `validate` | 1 | `resolve:broken-wiki-link` (always checked, even with `--no-referential-validation`) |
| `ambiguous-link` | `validate` | 1 | `resolve:ambiguous-wiki-link` (two notes share a basename) |
| `type-not-found` | `validate` | 1 | declared type was never defined |
| `type-ambiguous` | `validate` | 1 | two type defs share a canonical name |
| `missing-sections` | `validate` | 0 | `section:missing-required` **warning** — warnings don't fail |
| `malformed-frontmatter` | `validate` | 1 | ingest failure (unterminated `---`) fails the whole run |
| `broken-type-def` | `validate` | 1 | a type def missing `## Schema` fails the whole run |
| `referential-mismatch` | `validate` | 1 / 0 | `type:referential-mismatch`; passes with `--no-referential-validation` |
| `binding-valid` | `validate` | 0 | untyped regular document is typed through config `bindings` |
| `binding-type-not-found` | `validate` | 1 | `binding-type-not-found` from config-driven dispatch |
| `create-no-template` | `create -t bookmark` | 0 | frontmatter-only file (type has no `## Template`) |
| `create-with-template` | `create -t meeting` | 0 | frontmatter + template body |

The `referential-mismatch` fixture is the one to run both ways:

```bash
npm run cli -- --root fixtures/scenarios/referential-mismatch validate                          # exit 1
npm run cli -- --root fixtures/scenarios/referential-mismatch --no-referential-validation validate  # exit 0
```

## Vaults

| Vault | Highlights | Try |
|---|---|---|
| `knowledge-base` | `Concept` / `Person` / `Source` types, interlinked notes, all valid | `validate` → all pass; `types`; `create -t concept` |
| `obsidian-style` | types under `types/`, plain notes present; config sets `untypedDocumentBehavior: warn` | `validate` with vs without `--config` (skip vs warn) |
| `custom-config` | `typeDeclarationKey: "kind"`, `https`-only URLs, `drafts/**` excluded | `validate --config …` → exit 0 (the failing draft is excluded) |
| `bindings-config` | config-driven `bindings`; `types` shows discovered and undiscovered binding targets | `types --config …` |

### Gotchas baked into the fixtures (worth knowing when authoring vaults)

- **Typed references use Wiki Link syntax inside angle brackets.** `list<concept>`
  is invalid — write `"list<[[concept]]>"` whose items must be Wiki Links to
  `Concept` documents. For a list of plain strings, use `list<text>`. Single-value
  typed references use the bare form: `type: "[[concept]]"` (no `choice<...>`
  wrapper — `choice` is enum-only).
- **Wiki Link resolution is basename match, case-insensitive but not
  space/hyphen-normalized.** `[[Event Sourcing]]` resolves to `Event Sourcing.md`,
  not `event-sourcing.md`.
- **The `url` type wants a Markdown external link**, e.g. `"[label](https://…)"`,
  not a bare URL.
