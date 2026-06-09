# P10 — CLI Scaffold And Config

## Goal

Create the minimal Node CLI shell that can:

- parse subcommands and flags
- locate and load `markdown-type-system.config.jsonc`
- compute effective config values
- select output mode
- hand control to command-specific runtime code

This phase does not yet need to scan Markdown files or call Core.

## Inputs

- [D1 — Architecture](../../../design/D1-architecture.md)
- [D5 — Node CLI Integration](../../../design/D5-node-cli-integration.md)
- [P9 — Node CLI Implementation Plan](P9-node-cli-implementation-plan.md)

## Deliverables

- CLI entrypoint under a private runtime location
- config-file loader for JSONC
- upward config discovery
- `--config` and `--root` precedence handling
- effective config resolution with D5 defaults
- basic command dispatch for:
  - `validate`
  - `create`
  - `types`

Recommended layout:

```text
src/
  integration/
    node-cli/
      index.ts
      config.ts
      commands.ts
      output.ts
```

Exact filenames may vary. The public package API should remain separate from the CLI runtime.

## Steps

1. Choose a Node entrypoint strategy that works with the current TypeScript package layout.
2. Add JSONC config loading.
3. Implement config search precedence:
   - explicit `--config`
   - upward search
   - zero-config fallback
4. Implement effective root precedence with `--root` override.
5. Normalize include/exclude, resolver strategy, output format, and referential-validation defaults.
6. Add a tiny command dispatcher that returns structured command-intent data for later phases.

## Acceptance Criteria

- The CLI can be invoked under Node with a recognized subcommand.
- Effective config is resolved deterministically.
- `--root` overrides config-derived root.
- No filesystem discovery or Core calls are required yet.
- `npm run typecheck` succeeds.

