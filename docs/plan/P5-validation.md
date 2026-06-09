# P5 — Validation

## Goal

Implement `validate` so that every test case in [validation.md](../test-cases/validation.md) passes. After this phase, the Core can check whether a Document conforms to a parsed Type Definition Document, producing a `ValidationResult` with zero or more errors and warnings — pure, no I/O, Resolver and TypeRegistry wired through Integration-supplied seams.

## Inputs

- [D3 — Validation Semantics](../design/D3-validation-semantics.md) — full Validation contract
- [D4 — Integration Contracts](../design/D4-integration-contracts.md) — Resolver, TypeRegistry, and Type Declaration dispatch
- [Validation test cases](../test-cases/validation.md) — acceptance fixtures
- [ADR-0001 — Reserved property collision is a warning](../adr/0001-reserved-property-collision-is-a-warning.md)
- [ADR-0003 — No transitive referential validation](../adr/0003-no-transitive-referential-validation.md)
- [ADR-0004 — Default is scaffolding not validation](../adr/0004-default-is-scaffolding-not-validation.md)
- [ADR-0007 — TypeRegistry for referential validation](../adr/0007-type-registry-for-referential-validation.md)
- [ADR-0008 — Type Definition Document self-identifies via frontmatter](../adr/0008-type-definition-document-self-identifies-via-frontmatter.md)
- [P2 — Shared Core Types](P2-shared-core-types.md) — types already landed in `validation.ts`
- [P3 — Parser](P3-parser.md) — `ParsedTypeDefinitionDocument` and helpers this phase consumes
- [P4 — Link and Section grammar helpers](P4-link-and-section-grammar.md) — `isValidWikiLinkShape`, `parseExternalLink`, `extractAtxHeadings`

## Deliverables

A working `validate` covering all of the following.

### Validation pipeline

For each Property declared in `typeDef.schema.properties`, run a staged pipeline:

1. **Presence**: if absent from `document.frontmatter` and `required: true` → `property:missing-required`. If absent and not required → skip remaining stages.
2. **Emptiness**: if present but empty and `allow-empty` is not `true` → `property:empty-not-allowed`. If present but empty and `allow-empty: true` → skip remaining stages.
3. **Type check** (see below).
4. **Link Resolution** (for `wiki-link`, `list<X>`, `choice<Y>` values that pass shape validation).
5. **Referential Validation** (for `list<X>`, `choice<Y>` when `config.referentialValidation: true`).

Unknown Properties in `document.frontmatter` (not declared in the schema) are silently allowed — schemas are open by default.

### Property presence and emptiness

**Missing Property:**

- Valid when `required` is false or absent.
- Produces `property:missing-required` when `required: true`.
- A key whose value is `null` is present, not missing. It falls through to the Emptiness stage below.

**Empty Property:**

- `null` is present but empty. Produces `property:empty-not-allowed` unless `allow-empty: true`.
- Whitespace-only strings are empty.
- Empty scalar strings fail by default with `property:empty-not-allowed`.
- Empty lists (`[]`) pass by default.
- `allow-empty: false` makes empty lists fail with `property:empty-not-allowed`.
- `allow-empty: true` permits empty scalar values and empty lists.

### Primitive Property validation

- **`text`**: accepts non-empty strings. Rejects `null`, numbers, booleans, arrays, objects → `property:wrong-type`.
- **`number`**: accepts only finite JavaScript numbers. Numeric strings are not coerced → `property:wrong-type`. `NaN`, `Infinity`, `-Infinity` are rejected.
- **`boolean`**: accepts only booleans. String values such as `"true"` are not coerced → `property:wrong-type`.
- **`date`**: accepts only strings matching `YYYY-MM-DD`. Loose validation: `/^\d{4}-\d{2}-\d{2}$/` with valid month (01–12) and day within calendar month. Any other shape → `property:wrong-type`.
- **`datetime`**: accepts only ISO 8601 datetime strings with timezone. Minimum: must parse with `new Date()` and the parsed result's UTC offset must not rely on local timezone inference. Practical check: string must match `/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(\.\d+)?(Z|[+-]\d{2}:\d{2})$/` and `!isNaN(new Date(value).getTime())`. Any other shape → `property:wrong-type`.
- **`wiki-link`**: accepts only non-empty strings passing `isValidWikiLinkShape`. Shape failures → `property:wrong-type`. Link Resolution runs only after shape passes.
- **`url`**: accepts only Markdown External Link syntax (`[text](url)`) passing `parseExternalLink` with `config.allowedUrlSchemes`. Shape/scheme failures → `property:wrong-type`. Core never performs network validation.

### Collection Type validation

**`list<X>`:**

1. Value must be a YAML array. Non-array → `property:wrong-type`.
2. Each item must be a non-empty string. Non-string or empty → `property:wrong-type` at `{ scope: 'property', property, index }`.
3. Each item must pass `isValidWikiLinkShape`. Shape failures → `property:wrong-type` with index.
4. Each item that passes shape proceeds to Link Resolution.
5. If `config.referentialValidation: true`, each successfully resolved item proceeds to Referential Validation against Type Reference `X`.

**`choice<Y>`:**

1. Value must be a non-empty string. Non-string, empty, or array → `property:wrong-type`.
2. Value must pass `isValidWikiLinkShape`. Shape failure → `property:wrong-type`.
3. Proceeds to Link Resolution.
4. If `config.referentialValidation: true`, proceeds to Referential Validation against Type Reference `Y`.

List validation accumulates item-level errors. When one item fails, Validation stops downstream stages for that item but continues checking sibling items. For example, item at index 0 failing shape check never reaches Link Resolution; item at index 2 that passes shape proceeds to Link Resolution independently.

### Link Resolution

Runs for `wiki-link`, `list<X>`, and `choice<Y>` values that pass Wiki Link shape validation.

If `resolver` is missing when a value reaches Link Resolution → `config:missing-dependency` with `details: { dependency: 'resolver' }` at that value's location. Never throws.

Resolver result mapping:

| Resolver result | Validation error |
|---|---|
| `found` | Continue to next stage (Referential Validation or pass) |
| `not-found` | `resolve:broken-wiki-link` with `details.wikiLink` |
| `invalid-link` | `resolve:invalid-wiki-link` with `details.wikiLink`, `details.reason` |
| `ambiguous` | `resolve:ambiguous-wiki-link` with `details.wikiLink` |
| `unavailable` | `resolve:unavailable` with `details.wikiLink`, `details.reason` |

### Referential Validation

Applies only when `config.referentialValidation: true`, and only to `list<X>` and `choice<Y>` values. Primitive `wiki-link` is never referentially validated.

If `typeRegistry` is missing when a Collection Type value reaches Referential Validation → `config:missing-dependency` with `details: { dependency: 'typeRegistry' }` at that value's location.

Per resolved Collection Type value:

1. Resolve expected Type Reference with `typeRegistry.getByName(TypeReferenceName)`.
2. Read the resolved target Document's Type Declaration from its own frontmatter (`resolvedDocument.frontmatter[config.typeDeclarationKey]`) and pass to `typeRegistry.getByDeclaration(...)`. This is the Document returned by the Resolver, not the root Document being validated.
3. Compare resolved Type Definition Document identity by `id`.

Type Reference lookup mapping (`getByName`):

| Result | Validation error |
|---|---|
| `found` | Continue to step 2 |
| `not-found` | `type:unknown-reference` with `details.typeName` |
| `ambiguous` | `type:ambiguous-reference` with `details.typeName` |
| `unavailable` | `type:unavailable` with `details.reason` |

Type Declaration lookup mapping (`getByDeclaration`):

| Result | Validation error |
|---|---|
| `found` | Continue to identity comparison |
| `missing-declaration` | `type:missing-declaration` with `details.targetPath` |
| `invalid-declaration` | `type:invalid-declaration` with `details.value` |
| `not-found` | `type:unknown-declaration` with `details.typeName` |
| `ambiguous` | `type:ambiguous-declaration` with `details.typeName` |
| `unavailable` | `type:unavailable` with `details.reason` |

When both lookups resolve but their `ParsedTypeDefinitionDocument.id` values differ → `type:referential-mismatch` with:

```typescript
details: {
  expectedTypeId: string;
  actualTypeId: string;
  wikiLink: string;
  targetPath: string;
}
```

`typeRegistry.getByDeclaration` may receive the bare literal `type` when the target is itself a Type Definition Document (ADR-0008). The function delegates to the Integration — the Core does not interpret the value.

### Section validation

Checks required Sections parsed from the Type Definition Document's Template Block against headings in the existing Document body. Runs after all Property validation is complete, regardless of whether Property validation produced errors or warnings.

1. If `typeDef.templateBlock` is absent → skip.
2. Collect all `Section` entries from `templateBlock.sections` where `required: true`.
3. Extract ATX headings from `document.body` using the existing `extractAtxHeadings` helper from `section-parser.ts`.
4. For each required Section, check if a heading with the same `level` and exact same `heading` text (case-sensitive) exists in the extracted ATX headings.
5. Missing required Section → `section:missing-required` warning with `location: { scope: 'section', section, level }`.
6. Near misses (wrong level, different case, different text) do not produce additional warnings.
7. Only ATX headings matter. Setext headings and headings inside fenced code blocks are excluded by `extractAtxHeadings`.
8. Content under the heading is not required — presence of the heading alone satisfies the requirement.

### Reserved Property collision detection

When `config.integration` is set, check each Property key declared in the schema against a hardcoded reserved-properties table for that Integration.

Reserved Properties table (from CONTEXT.md):

| Integration | Reserved keys |
|---|---|
| `obsidian` | `tags`, `aliases`, `cssclasses`, `publish` |
| `hugo` | `title`, `date`, `draft`, `aliases`, `description`, `categories`, `tags`, `weight` |
| `jekyll` | `layout`, `title`, `date`, `categories`, `tags`, `published` |
| `gitbook` | `title`, `layout`, `description`, `type` |
| `docusaurus` | `title`, `slug`, `description`, `keywords`, `image`, `sidebar_position`, `sidebar_label` |
| `vitepress` | `title`, `description`, `head`, `lastUpdated`, `prev`, `next`, `layout` |

For each collision → `property:reserved-collision` warning with `location: { scope: 'property', property }` and `details: { integration }`.

Collision detection is a warning, not an error (ADR-0001). The user may intentionally constrain a reserved key.

Detection runs against declared schema Properties, not document frontmatter values. The collision is about the schema authoring, not runtime data.

### Untyped Document handling

Integrations own root Type Declaration dispatch (D3). The Integration resolves a Document's `_type` to a `ParsedTypeDefinitionDocument` before calling `validate`. Untyped Documents — those with no Type Declaration in their frontmatter — are filtered during dispatch, not inside `validate`. If `config.untypedDocumentBehavior` is `'warn'`, the Integration produces the `document:untyped` warning itself before calling `validate`; if `'skip'`, it omits the warning. The Core's `validate` function does not inspect `document.frontmatter[config.typeDeclarationKey]` and does not produce `document:untyped`. No test fixture exists for this warning in [validation.md](../test-cases/validation.md) — it is covered by Integration-level tests in a later phase (P8).

### Error and warning collection

- Return `{ passed: true, errors: [], warnings: [...] }` when `errors` is empty.
- Return `{ passed: false, errors: [...], warnings: [...] }` when `errors` has any entries.
- `passed` is `true` iff `errors.length === 0`. Warnings do not affect `passed`.
- Collect errors across all Properties. A missing required Property in one key does not stop Validation from checking other Properties.
- For lists, accumulate per-item errors. Shape failure on item 0 stops downstream for item 0 but not for items 1..n.
- Never throw for any Validation scenario. All issues are returned as structured errors or warnings.
- Reserve thrown errors for programmer bugs (invariant violations) only.

### Config defaults

```typescript
// Internal type: ValidationConfig with all optional fields resolved to concrete values.
// Differs from Required<ValidationConfig> because integration stays IntegrationName | undefined.
type ResolvedConfig = {
  typeDeclarationKey: string;
  untypedDocumentBehavior: UntypedDocumentBehavior;
  referentialValidation: boolean;
  allowedUrlSchemes: string[];
  integration: IntegrationName | undefined;
};

const DEFAULT_CONFIG: ResolvedConfig = {
  typeDeclarationKey: '_type',
  untypedDocumentBehavior: 'skip',
  referentialValidation: false,
  allowedUrlSchemes: ['http', 'https', 'mailto'],
  integration: undefined,
};
```

Merge passed config with defaults. `undefined` fields inherit defaults. `allowedUrlSchemes` is normalised to lowercase at entry.

## File layout

```text
src/core/
  validation.ts              Types (already landed) + validate() entry point, dispatches to helpers
  validation/
    property.ts              Per-property pipeline (presence → emptiness → type dispatch → resolve → referential)
    emptiness.ts             isValueEmpty(value, allowEmptyList: boolean) helper
    primitives.ts            Primitive type validators: text, number, boolean, date, datetime, url
    collections.ts           list<X> + choice<Y> shape validation + item-level pipeline
    link.ts                  Link Resolution stage: call resolver, map results to ValidationError
    referential.ts           Referential Validation stage: getByName → getByDeclaration → compare
    sections.ts              Required Section checking against document.body
    reserved.ts              Reserved Property collision detection + hardcoded table
    errors.ts                ValidationError and ValidationWarning constructors keyed by kind
    config.ts                Config defaults + merge logic
```

The `validation/` subdirectory is an internal split. Only `validate` (in `validation.ts`) is exported from the package. All helpers are private to `validation/`.

## Steps

1. Add `validation/config.ts` — config defaults and merge. Trivial; start here to unblock later steps.
2. Add `validation/emptiness.ts` — `isValueEmpty(value, allowEmptyList): boolean`. Covers `null`, whitespace-only strings, empty string, empty array (respecting `allowEmptyList`).
3. Add `validation/primitives.ts` — `validatePrimitive(value, type, allowedUrlSchemes)` for text, number, boolean, date, datetime, wiki-link (shape only), url (parse + scheme). Returns `ValidationError | null`. Reuses `isValidWikiLinkShape` and `parseExternalLink` from P3/P4.
4. Add `validation/link.ts` — `resolveWikiLink(wikiLink, resolver, location)`. Calls resolver, maps `ResolveWikiLinkResult` to `ValidationError | null`. Returns `config:missing-dependency` if resolver is undefined.
5. Add `validation/referential.ts` — `validateReferential(wikiLink, typeRefName, targetDocument, typeRegistry, typeDeclarationKey, location)`. Calls `getByName`, extracts target declaration, calls `getByDeclaration`, compares `id`. Maps all lookup results to `ValidationError | null`.
6. Add `validation/collections.ts` — `validateList(value, typeRefName, config, resolver, typeRegistry)` and `validateChoice(value, typeRefName, config, resolver, typeRegistry)`. Item-level loops with per-item indexing and error accumulation. Delegates to `primitives.ts` for raw value checks, `link.ts` for resolution, `referential.ts` for opt-in validation.
7. Add `validation/property.ts` — `validateProperty(key, schema, frontmatterValue, config, resolver, typeRegistry)`. Orchestrates presence → emptiness → type dispatch (primitive vs collection). Returns `ValidationError[]`.
8. Add `validation/sections.ts` — `validateSections(body, templateBlock)`. Uses `extractAtxHeadings` from `section-parser.ts`. Returns `ValidationWarning[]`.
9. Add `validation/reserved.ts` — `validateReservedCollisions(schema, integration)`. Returns `ValidationWarning[]`. Hardcoded table of reserved properties per integration.
10. Add `validation/errors.ts` — constructor functions for each `ValidationErrorKind` and `ValidationWarningKind`. Keeps message construction and location shaping consistent.
11. Wire the `validate` function in `src/core/validation.ts`. Imports and delegates to each pipeline stage. Aggregates all errors and warnings into a single `ValidationResult`. The function body replaces the current `throw new Error('not implemented')` stub.
12. Port every case in [validation.md](../test-cases/validation.md) to a Vitest suite under `test/validation/`. Organise by pipeline stage: `presence-emptiness.test.ts`, `primitives.test.ts`, `wiki-links.test.ts`, `collections.test.ts`, `referential.test.ts`, `sections.test.ts`, `warnings.test.ts`.
13. Remove the P2 `it.todo('validate produces a ValidationResult — P5')` marker from `test/smoke.test.ts`.
14. Run `npm run typecheck` and `npm test`.

## Acceptance Criteria

- Every case in [validation.md](../test-cases/validation.md) passes — V001 through V052, plus any cases added during implementation.
- All `ValidationErrorKind` variants are exercised by at least one test case.
- All `ValidationWarningKind` variants produced by `validate` (`property:reserved-collision`, `section:missing-required`) are exercised by at least one test case.
- Errors accumulate across independent Properties. A missing required Property does not stop checking other Properties.
- List items accumulate independently. Error on item 0 stops downstream for item 0 but not items 1..n.
- Missing Resolver produces `config:missing-dependency` for valid wiki-link values, not a thrown error.
- Missing TypeRegistry produces `config:missing-dependency` for Referential Validation values, not a thrown error.
- `null` value on a required Property produces `property:empty-not-allowed` — `null` is present but empty. Only a missing key produces `property:missing-required`.
- Whitespace-only string is treated as empty; emits `property:empty-not-allowed` unless `allow-empty: true`.
- Empty list passes by default; fails with `allow-empty: false`.
- Shape validation for wiki-links runs before Resolver. Shape failure blocks the Resolver call entirely.
- Referential Validation only fires when `config.referentialValidation: true` and only for Collection Types.
- `validate` never throws for any authoring error or missing dependency covered by the test cases.
- `validate` performs no I/O. No `fs`, `path`, `fetch`, or filesystem-shaped imports appear in any `src/core/validation*` file.
- `validate` matches the P2 signature exactly. Only its body changes.
- All errors and warnings carry `kind`, `message`, `location`, and optionally `details` matching D3 shapes.
- `npm run typecheck` and `npm test` pass.

## Non-goals

- Implement Scaffolding (P6) or Templating (P7) behavior.
- Resolve root Document Type Declarations — Integration owns this before calling `validate`.
- Build a Resolver or TypeRegistry. Only wire through the seams defined in D4.
- Perform network validation for URLs. Core only checks shape and scheme.
- Coerce user-authored values (`"true"` → `true`, numeric strings → numbers).
- Transitive Referential Validation (ADR-0003). Only one level deep.
- Warn on the `_type` Property itself appearing in a schema. Integration handles this.
- Implement validation test cases not present in [validation.md](../test-cases/validation.md). Add new fixtures there first.

## Follow-up

After P5, continue with [P6 — Scaffolding](P6-scaffolding.md) to compute missing defaults from Type Definition Documents.
