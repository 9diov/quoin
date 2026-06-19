---
_type: "[[plan-doc]]"
status: "done"
terms: ["Document", "Property", "Scaffolding", "Templating", "Section", "Core", "Parser", "Resolver", "TypeRegistry", "Integration", "Validation"]
---

# P2 — Shared Core Types

> **Note:** [P28](../P28-doc-reference-format-separation.md) supersedes the type list below. `wiki-link` is no longer a `PrimitiveTypeName`; `DocReference` is exported by the Core and used in `PropertyTypeName` / `ListItemType`.

## Goal

Encode the TypeScript contracts from D2, D3, and D4 as type-level declarations in the Core. After this phase, the Core has no behavior, but every type referenced by Parser, Validation, Scaffolding, Templating, Resolver, and TypeRegistry is declared and exported.

This phase is type-only. Parser, Validation, Scaffolding, and Templating remain stubbed.

## Inputs

- [D2 — Type and Schema Contracts](../../design/D2-type-and-schema-contracts.md)
- [D3 — Validation Semantics](../../design/D3-validation-semantics.md)
- [D4 — Integration Contracts](../../design/D4-integration-contracts.md)
- [Core implementation plan](core-implementation-plan.md)
- [P1 — Project Scaffold](P1-project-scaffold.md)

## Deliverables

All types declared and re-exported from `src/index.ts`.

### From D2 — Type and Schema Contracts

- `PrimitiveTypeName` — union of `'text' | 'number' | 'boolean' | 'date' | 'datetime' | 'wiki-link'`
- `CollectionTypeName` — discriminated union of `{ kind: 'list'; of: string }` and `{ kind: 'choice'; of: string }`
- `PropertyTypeName` — `PrimitiveTypeName | CollectionTypeName`
- `PropertySchema` — `{ type; required?; 'allow-empty'?; default? }`
- `Schema` — `{ properties: Record<string, PropertySchema> }`
- `Section` — `{ level; heading; required; defaultContent }`
- `TemplateBlock` — `{ sections: Section[] }`
- `TypeDefinitionDocumentIdentity` — `{ id; name }`
- `ParserConfig` — `{ typeDeclarationKey? }`
- `ParsedTypeDefinitionDocument` — `{ id; name; schema; templateBlock? }`
- `ParseErrorKind` — full union from D2
- `ParseLocation` — discriminated union of `document`, `block`, `property`, `section` scopes
- `ParseError` — `{ kind; message; location; details? }`
- `ParseResult` — `{ kind: 'ok'; typeDef } | { kind: 'error'; errors }`
- `Document` — `{ path; frontmatter; body }`
- `ScaffoldingResult` — `{ properties: Record<string, unknown> }`
- `TemplatingResult` — `{ body: string }`

### From D3 — Validation Semantics

- `IntegrationName` — union of supported Integration identifiers
- `UntypedDocumentBehavior` — `'skip' | 'warn'`
- `ValidationConfig` — `{ typeDeclarationKey?; untypedDocumentBehavior?; referentialValidation?; integration? }`
- `ValidationErrorKind` — full union from D3
- `ValidationWarningKind` — full union from D3
- `ValidationLocation` — discriminated union of `config`, `property`, `section` scopes; `property` carries optional `index`; `section` carries `level`
- `ValidationError` — `{ kind; message; location; details? }`
- `ValidationWarning` — `{ kind; message; location; details? }`
- `ValidationResult` — `{ passed; errors; warnings }`

### From D4 — Integration Contracts

- `ResolveWikiLinkResult` — discriminated union over `found`, `not-found`, `invalid-link`, `ambiguous`, `unavailable`
- `Resolver` — `(wikiLink: string) => ResolveWikiLinkResult`
- `TypeReferenceLookupResult` — discriminated union over `found`, `not-found`, `ambiguous`, `unavailable`
- `TypeDeclarationLookupResult` — discriminated union over `found`, `missing-declaration`, `invalid-declaration`, `not-found`, `ambiguous`, `unavailable`
- `TypeRegistry` — `{ getByName; getByDeclaration }`

### Function signatures (stubs only)

The four Core entry points get exported signatures so consumers see the full surface. Bodies throw `not implemented` and will be filled in later phases.

```typescript
// src/core/parser.ts
declare function parseTypeDefinitionDocument(
  raw: string,
  identity: TypeDefinitionDocumentIdentity,
  config?: ParserConfig
): ParseResult

// src/core/validation.ts
declare function validate(
  document: Document,
  typeDef: ParsedTypeDefinitionDocument,
  config: ValidationConfig,
  resolver?: Resolver,
  typeRegistry?: TypeRegistry
): ValidationResult

// src/core/scaffold.ts
declare function scaffold(
  frontmatter: Record<string, unknown>,
  typeDef: ParsedTypeDefinitionDocument
): ScaffoldingResult

// src/core/template.ts
declare function template(
  typeDef: ParsedTypeDefinitionDocument
): TemplatingResult
```

## File layout

Types live with their nearest module rather than in a single `types.ts` god-file. This keeps each module's contract co-located with its eventual implementation.

```text
src/
  index.ts                  re-exports everything public
  core/
    types.ts                Document only (used by every module)
    parser.ts               Parser types + parseTypeDefinitionDocument stub
    validation.ts           Validation types + validate stub
    scaffold.ts             Scaffolding types + scaffold stub
    template.ts             Templating types + template stub
    link-grammar.ts         (unchanged in P2 — populated in P4)
    section-parser.ts       (unchanged in P2 — populated in P4)
    integration.ts          Resolver, TypeRegistry, lookup result unions
```

Rationale: `Document` is the one type that crosses every module, so it stays in `types.ts`. Parser types belong with the Parser. Validation types belong with Validation. Integration-facing contracts (Resolver, TypeRegistry) get their own file because they are not owned by any single Core pipeline.

If a future contributor finds this split causes circular imports, collapsing everything into `types.ts` is an acceptable fallback. The acceptance criteria do not depend on the split.

## Steps

1. Add D2 types to `src/core/parser.ts` (Parser-owned) and `src/core/types.ts` (`Document` only).
2. Add D3 types to `src/core/validation.ts`.
3. Add D4 types to a new `src/core/integration.ts`.
4. Add D2 result types to `src/core/scaffold.ts` and `src/core/template.ts`.
5. Add stub function signatures in `parser.ts`, `validation.ts`, `scaffold.ts`, `template.ts` whose bodies `throw new Error('not implemented')`.
6. Re-export every public name from `src/index.ts`.
7. Add a type-level smoke test under `test/` that constructs literal values for each top-level type to catch shape regressions.
8. Run `npm run typecheck` and `npm test`.

## Acceptance Criteria

- Type names and string literal unions match D2, D3, and D4 exactly.
- `Section` carries `level`, and `ValidationLocation` for `section` scope carries `level`.
- `ValidationLocation` for `property` scope carries an optional `index` for list-item errors.
- `parseTypeDefinitionDocument` returns `ParseResult` and never throws for authoring errors (stub may throw `not implemented` only because the body is absent in this phase).
- `Resolver` is a callable type `(wikiLink: string) => ResolveWikiLinkResult`, not an object.
- `TypeRegistry` exposes `getByName` and `getByDeclaration` returning their respective lookup result unions.
- `ValidationConfig.typeDeclarationKey` is optional and defaults are documented only — not enforced at the type level.
- `npm run typecheck` succeeds.
- `npm test` succeeds — the type-level smoke test compiles and runs.
- `src/index.ts` re-exports every public type and the four stub functions.

## Non-goals

- Implement Parser, Validation, Scaffolding, or Templating behavior.
- Implement Link grammar or Section parser helpers.
- Implement Resolver or TypeRegistry factories.
- Choose Markdown or YAML parsing libraries.
- Add Integration code.

## Follow-up

After this phase, continue with Phase 3: Parser. P3 fills in `parseTypeDefinitionDocument` against the test cases in [parser.md](../../test-cases/parser.md), using only the types declared here.
