# P1 — Project Scaffold

## Goal

Create a minimal TypeScript package that can compile, run tests, and expose the Core API surface.

This phase should not implement Parser, Validation, Scaffolding, or Templating behavior yet. It only creates the project structure needed for implementation.

## Inputs

- [D1 — Architecture](../design/D1-architecture.md)
- [D2 — Type and Schema Contracts](../design/D2-type-and-schema-contracts.md)
- [D3 — Validation Semantics](../design/D3-validation-semantics.md)
- [D4 — Integration Contracts](../design/D4-integration-contracts.md)
- [Core implementation plan](core-implementation-plan.md)

## Deliverables

- `package.json`
- `tsconfig.json`
- test runner configuration
- `src/` directory
- initial Core module file layout
- public exports from `src/index.ts`

Recommended layout:

```text
src/
  index.ts
  core/
    types.ts
    parser.ts
    validation.ts
    scaffold.ts
    template.ts
    link-grammar.ts
    section-parser.ts
```

## Recommended Tooling

Use a small, conventional TypeScript stack:

- TypeScript for compilation.
- Vitest for tests.
- `tsx` only if a future CLI/dev script needs direct TypeScript execution.

Package scripts:

```json
{
  "scripts": {
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

## Steps

1. Initialize package metadata.
2. Add TypeScript and test dependencies.
3. Add `tsconfig.json`.
4. Add test runner config if needed.
5. Create `src/index.ts`.
6. Create placeholder Core module files.
7. Export placeholder modules from `src/index.ts`.
8. Add one smoke test proving the test runner works.
9. Run typecheck and tests.

## Acceptance Criteria

- `npm test` or equivalent test command runs successfully.
- TypeScript typecheck runs successfully.
- `src/index.ts` is the public API entrypoint.
- Core module files exist but contain no real behavior yet.
- No runtime Integration code is introduced in this phase.
- No filesystem, network, Obsidian, or Node-specific Core logic is introduced.

## Non-goals

- Implement Parser behavior.
- Implement Validation behavior.
- Implement Scaffolding or Templating behavior.
- Implement Resolver or TypeRegistry factories.
- Add Obsidian, browser, or full Node Integration code.

## Follow-up

After this phase, continue with Phase 2: shared Core types.

