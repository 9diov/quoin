## Convention

* [~] - WIP
* [x] - Done
* [ ] - Not started

## WIP

* [~] (Implementation) Build the `infer` feature described in [D7](../design/D7-type-inference-from-documents.md)
  Output: implementation plan, core inference module, CLI command, tests
* [~] (Implementation) Improve human-readable CLI output based on [R1](../research/R1-human-readable-cli-output.md)
  Output: reporter model follow-up, better human diagnostics, quieter CI-oriented modes

## To do

* [ ] (Design) Design the future `repair()` capability referenced in [D1](../design/D1-architecture.md)
  Output: repair design doc
* [ ] (Planning) Break `infer` implementation into numbered execution plans
  Output: plan docs under `docs/plan/`
* [ ] (Planning) Break CLI output usability improvements into numbered execution plans
  Output: plan docs under `docs/plan/`

## Done

* [x] (Design) Architecture baseline
  Output: [D1](../design/D1-architecture.md)
* [x] (Design) Type and schema contracts
  Output: [D2](../design/D2-type-and-schema-contracts.md)
* [x] (Design) Validation semantics
  Output: [D3](../design/D3-validation-semantics.md)
* [x] (Design) Integration contracts
  Output: [D4](../design/D4-integration-contracts.md)
* [x] (Design) Node CLI integration
  Output: [D5](../design/D5-node-cli-integration.md)
* [x] (Design) Path-glob type bindings
  Output: [D6](../design/D6-path-glob-type-bindings.md)
* [x] (Design) Type inference from documents
  Output: [D7](../design/D7-type-inference-from-documents.md)

* [x] (Research) Research similar tools to improve human-readable output
  Output: [R1](../research/R1-human-readable-cli-output.md)

* [x] (Planning) Core implementation plan and phases
  Output: [core implementation plan](core/core-implementation-plan.md), [P1](core/P1-project-scaffold.md), [P2](core/P2-shared-core-types.md), [P3](core/P3-parser.md), [P4](core/P4-link-and-section-grammar.md), [P5](core/P5-validation.md), [P6](core/P6-scaffolding.md), [P7](core/P7-templating.md), [P8](core/P8-minimal-integration-harness.md)
* [x] (Planning) Node CLI implementation plan and phases
  Output: [P9](integration/node-cli/P9-node-cli-implementation-plan.md), [P10](integration/node-cli/P10-cli-scaffold-and-config.md), [P11](integration/node-cli/P11-filesystem-discovery-and-ingestion.md), [P12](integration/node-cli/P12-node-resolver-and-type-registry.md), [P13](integration/node-cli/P13-validate-command.md), [P14](integration/node-cli/P14-create-and-types-commands.md), [P15](integration/node-cli/P15-path-glob-type-bindings.md)
* [x] (Planning) Rename package and CLI to Quoin
  Output: [P16](P16-rename-to-quoin.md)
* [x] (Planning) Build package for npm
  Output: [P17](P17-build-package-for-npm.md)

* [x] (Implementation) Build the pure core and validation stack
  Output: `src/core/**`, `test/parser/**`, `test/validation/**`, `test/scaffold/**`, `test/template/**`
* [x] (Implementation) Build the minimal integration harness
  Output: `test/integration/harness.ts`, `test/integration/integration-harness.test.ts`
* [x] (Implementation) Build the Node CLI for config, discovery, validate, create, types, and bindings
  Output: `src/integration/node-cli/**`, `test/integration/node-cli/**`
* [x] (Implementation) Package Quoin as an installable CLI/library
  Output: `package.json`, `tsconfig.build.json`, `scripts/fix-cli-bin.mjs`, `scripts/package-smoke-test.mjs`
