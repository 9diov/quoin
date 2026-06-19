---
_type: "[[design-doc]]"
status: "active"
terms: ["Collection Type", "Doc Reference", "Document", "Parser", "Property", "Scaffolding", "Section", "Body Block", "Type Definition Document", "Type Reference", "Validation", "Wiki Link"]
---

# D7 — Type Inference from Documents

> **Note:** [D9 — Doc Reference Format Separation](D9-doc-ref-format-separation.md) supersedes how inferred reference Properties are emitted. Inferred schemas should emit `type: doc-ref` (optionally with `format`/`referenced-type`) rather than `type: wiki-link`.

## Overview

**Type Inference** takes a set of existing Documents and produces a draft Type Definition Document — a Schema (and optional Body Block) that those Documents would conform to. It is a write-side bootstrap tool: the user has a folder of untyped Markdown, runs `infer`, and gets a working `types/<name>.md` they can refine by hand.

Motivating use cases:

- Bootstrap: a user has thirty meeting notes with no formal type and wants a `meeting` Type Definition Document derived from what's already there.
- Documentation by observation: a maintainer wants to record the implicit shape of a convention-heavy folder without hand-authoring every Property and Section.
- Diffing intent vs. reality: running `infer` over docs that *should* conform to an existing type and comparing to the hand-authored Schema (future work; see Future work).

This design only addresses **Type Definition** inference — producing a new Type Definition Document. It does not classify Documents into existing types based on content; that interpretation of "infer" is explicitly rejected (see Non-goals). It is the natural complement to [D6 — Path-Glob Type Bindings](D6-path-glob-type-bindings.md): D6 binds an existing type to Documents by path; D7 produces a new type from Documents by observation.

## Goals

1. Given one or more parsed input Documents, produce a structural `InferenceResult` describing the inferred Schema and Sections, plus per-property conflict diagnostics where input Documents disagree.
2. Render that `InferenceResult` into a Markdown Type Definition Document that round-trips: running `validate(...)` over the original inputs with the inferred type produces zero errors (modulo conflicted properties, which are intentionally elided from the rendered output).
3. Keep the Core pure: inference and rendering are pure functions; the Integration handles I/O.
4. Surface conflicts as first-class result data, not exceptions — the bootstrap workflow tolerates imperfect inputs and the user resolves conflicts in a follow-up edit.

## Non-goals

- **Content-based Document classification.** "Given this untyped Document and a registry of known types, which one is it?" is a separate problem with weaker guarantees. Not pursued.
- **`choice<...>` inference.** Detecting that a property is enum-like ("3 unique values across 30 docs") needs a heuristic threshold. Out of v1; see Future work.
- **`type-ref` inference.** An observed `[[link]]` value yields `wiki-link`. Promoting it to a typed reference (`[[skill]]`) is something only the user knows. Out of v1.
- **`default:` inference.** Defaults are prescriptive (what should the next Document start with?); inference is descriptive (what do current Documents look like?). Conflating the two produces stale-by-default defaults. Out of v1.
- **Inferring Section body / `defaultContent`.** Headings are inferred; body content is not.
- **Filename- or path-derived type names.** The user supplies `--name` explicitly.
- **Threshold-based "required" rules.** Strict 100% only.
- **Three-way merge with an existing hand-edited Type Definition Document.** `--force` overwrites destructively in v1.
- **Re-using D6 bindings during inference.** Bindings are a read-side mechanism; inference is write-side.
- **stdout output (`--out -`).** File output only.

## Language additions

**Type Inference**:
The pure operation of computing, from a non-empty set of input Documents, a draft Schema and optional Body Block, along with per-property and per-section diagnostics describing observations and conflicts.
_Avoid_: type discovery, type extraction, type detection

**InferenceResult**:
The structured output of Type Inference. Carries inferred Properties (each either resolved or conflicted), inferred Sections (each either resolved or conflicted), and a list of input-handling diagnostics (skipped inputs, optional Section candidates).
_Avoid_: inferred schema, draft type, inference output

**Conflict** (in inference):
A Property or Section observation across input Documents that cannot collapse to a single `PropertyTypeName` (or Section presence) under the resolution rules. Surfaced explicitly; never silently resolved.
_Avoid_: disagreement, ambiguity

## Inputs and outputs

```typescript
type InferConfig = {
  sectionDepth?: number   // default 2 — H1..H<sectionDepth> considered
}

declare function infer(
  documents: InferenceInput[],
  config: InferConfig,
): InferenceResult

type InferenceInput = {
  id: string                 // Integration-stable identity (path, URI)
  frontmatter: Record<string, unknown>
  body: string               // raw Markdown body (for Section scan)
}

type InferenceResult = {
  inputCount: number                 // count of accepted inputs
  properties: Record<string, InferredProperty>
  sections: InferredSection[]        // in first-input observation order
  diagnostics: InferenceDiagnostic[]
}

type InferredProperty =
  | {
      kind: 'inferred'
      schema: PropertySchema         // ready for the rendered Schema block
      observedIn: number             // 1 .. inputCount
      observedEmptyIn: number        // 0 .. observedIn
    }
  | {
      kind: 'conflict'
      observedIn: number
      observations: Array<{
        type: PropertyTypeName
        sampleIds: string[]          // input ids contributing this type
      }>
    }

type InferredSection =
  | {
      kind: 'inferred'
      level: number
      heading: string
      required: boolean              // true iff observed in every input
    }
  | {
      kind: 'conflict'
      heading: string
      observations: Array<{
        level: number
        sampleIds: string[]
      }>
    }

type InferenceDiagnostic =
  | { kind: 'input-skipped';                path: string; reason: string }
  | { kind: 'optional-section-candidate';   level: number; heading: string; observedIn: number }
  | { kind: 'list-item-type-unobserved';    propertyName: string }
```

`PropertySchema` and `PropertyTypeName` are unchanged from D2. `InferenceInput` is intentionally looser than D2's `ParsedTypeDefinitionDocument` — inference does not require the input Documents to be themselves Type Definition Documents; it just needs frontmatter loaded as a YAML mapping and a body string.

## Inference algorithm

### Input filtering

Before inference begins, the Integration filters its glob match set:

1. **Exclude Type Definition Documents.** A Document whose frontmatter holds the literal `type` value under the configured Type Declaration key is silently excluded. A `kind: 'input-skipped'` diagnostic with `reason: 'type-definition-document'` is recorded.
2. **Exclude parse failures (non-strict mode).** Documents whose frontmatter cannot be loaded as a YAML mapping are skipped with `reason: 'invalid-frontmatter'`. In `--strict` mode this is a hard CLI failure; see Node CLI integration.
3. **Empty input set after filtering is an error.** `infer(...)` returns an `InferenceResult` with `inputCount: 0` and the diagnostics; the renderer (and CLI) treat zero inputs as a failure mode.

D6 bindings are not consulted. Inference operates on the raw filtered input set.

### Property inference

For each frontmatter key observed in any input Document:

1. **Collect observations.** For each input, record either `absent`, `empty` (`null`, `""`, `[]`), or a value-with-detected-type. Detected type follows the ladder below.
2. **Compute presence.** `observedIn` counts inputs where the key is present (empty counts as present). `observedEmptyIn` counts inputs where the value was empty.
3. **Settle on a type via the lub rule** (least upper bound on the primitive lattice; see "Type detection ladder" below). Empty observations contribute nothing to type detection. If a single lub exists across all non-empty observations → `kind: 'inferred'`. If non-empty observations disagree and no lub fits all of them → `kind: 'conflict'`.
4. **Compute `required`.** `required: true` iff `observedIn === inputCount`. Otherwise the `required` field is omitted from the rendered Schema.
5. **Compute `allow-empty`.** `'allow-empty': true` iff `observedEmptyIn > 0`. Otherwise omitted. This guarantees the inferred Schema round-trips against the original inputs: every empty value observed in a sample is permitted by the resulting Schema.

#### Type detection ladder

Per-value type detection runs each value through this ordered ladder. The first rule that matches wins.

- YAML boolean → `boolean`.
- YAML number → `number`.
- YAML list → `list<T>`, where `T` is computed recursively over items (see "List items" below).
- String matching the literal Wiki Link form (per D2; bare `[[name]]` only) → `wiki-link`.
- String matching D2's ISO-8601 datetime regex (`/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(\.\d+)?(Z|[+-]\d{2}:\d{2})$/`) → `datetime`.
- String matching `YYYY-MM-DD` exactly → `date`.
- Any other string → `text`.

The lattice's partial order: `wiki-link < text`, `datetime < text`, `date < text`. All primitives sit below `text`. There is no relation between `boolean`, `number`, and the string-derived primitives — disagreement across those buckets is a hard conflict with no lub.

Aggregation rule per property:

- All non-empty observations land in the lattice. Take the lub.
- If every observation is the same primitive → that primitive.
- If observations span the string-derived primitives (`date`, `datetime`, `wiki-link`, `text`) → the lub widens to `text`. This is *not* a conflict; it is the intended widening. The user can narrow by hand.
- If observations cross the string/number/boolean/list boundary → `kind: 'conflict'`.

#### List items

For a `list<T>` property:

1. **Per-input homogeneity.** Within one input's list value, run each item through the ladder and compute the lub. If items cross the string/number/boolean boundary within one list, that input contributes a `kind: 'conflict'` observation at the property level (not at the item level — D2 has no union type for list items).
2. **Cross-input aggregation.** All per-input item lubs are collected and lubbed again. The result is `T`.
3. **All-empty case.** If every input has the property as `[]`, no item observations exist. The inferred property is `list<text>` with `allow-empty: true`, and a `kind: 'list-item-type-unobserved'` diagnostic records that the item type was guessed.

### Section inference

The renderer scans each input's body for ATX headings up to `sectionDepth` (default 2). For each `(level, heading)` pair:

1. **Heading comparison.** Heading text is compared after trimming whitespace, case-sensitive. Level must match.
2. **Duplicate within one input.** First occurrence is recorded; subsequent occurrences of the same `(level, heading)` in the same input are ignored.
3. **Level conflict.** If `## Notes` appears in one input and `### Notes` in another, the result is a `kind: 'conflict'` `InferredSection` with both observations recorded. The renderer omits conflicted Sections from the Body Block.
4. **Required.** `required: true` iff the Section appears (at the same level, same heading) in *every* input.
5. **Optional Section candidates.** Sections present in some but not all inputs are *not* written into the Body Block. Each becomes a `kind: 'optional-section-candidate'` diagnostic.

`defaultContent` is always the empty string. Inferring body content is out of scope (Non-goals).

Section order in the rendered Body Block is **first-observation order from the first accepted input**. Cross-input reordering is common and not a conflict.

## Renderer

```typescript
type RenderConfig = {
  name: string          // canonical type name; [a-z0-9_-]
  strict?: boolean      // default false
  typeDeclarationKey?: string   // default '_type', mirrors D2 ParserConfig
}

type RenderedTypeDefinition =
  | { kind: 'rendered';        markdown: string; emittedConflicts: number }
  | { kind: 'refused-strict';  blockingConflicts: number; markdown: null }

declare function renderInferenceResult(
  result: InferenceResult,
  config: RenderConfig,
): RenderedTypeDefinition
```

Rendered output shape:

```markdown
---
_type: type
---

<!--
Inferred from N documents. Unresolved conflicts:
  - property `tags`: list<text> (28 docs), text (2 docs: a.md, b.md)
  - section `## Notes`: H2 (27 docs), H3 (3 docs)
Edit before use.
-->

## Schema
```yaml
properties:
  title: { type: text, required: true }
  # ... etc.
```

## Body
### Notes <!-- required -->

### Action Items <!-- required -->
```

Rules:

1. **`_type: type` is always emitted under the configured Type Declaration key.** Identity per ADR-0008; the file's filesystem path (set by `--out`) provides the Integration-supplied `name` per D2.
2. **Conflicted Properties are elided from the `## Schema` block.** They appear only in the leading HTML comment so the rendered file is a valid Type Definition Document that parses without warnings about unknown keys.
3. **Conflicted Sections are elided from the `## Body` block.** Same reason.
4. **Optional-Section candidates are listed in the comment but not emitted as Sections.** Sections are either required (present in all inputs) or absent from the block.
5. **`strict: true` flips conflicts from soft-elide to hard-refuse.** `kind: 'refused-strict'` is returned with no Markdown; the CLI prints the conflict list to stderr and exits non-zero.
6. **The `## Body` block is omitted entirely when no Section is inferred-and-required.** Empty Body Blocks are noise.
7. **Property order in the `## Schema` block is first-observation order from the first accepted input**, with properties unique to later inputs appended in the order they were first seen.

The HTML comment is a deliberate channel: it survives Markdown round-trips, doesn't render in viewers, and is easy to grep for in CI to detect unresolved drafts.

## Node CLI integration

The Node CLI (D5) gains an `infer` subcommand:

```
quoin infer --name <type-name> --from <glob> [--from <glob>...] \
            [--out <path>] [--strict] [--section-depth <n>] [--force]
```

Flags:

- **`--name <type-name>`** *(required)*. Canonical name (`[a-z0-9_-]`, no leading/trailing `-`/`_`). Validated up-front; invalid names exit non-zero before any I/O.
- **`--from <glob>`** *(required, repeatable)*. Glob anchored at the project root. Multiple `--from` flags union their match sets. Same glob semantics as D6.
- **`--out <path>`** *(optional)*. Defaults to `types/<name>.md`. Relative paths resolve from the project root.
- **`--strict`** *(optional)*. (a) Parse failures in any matched input fail the command. (b) Any conflict in the `InferenceResult` causes the renderer to refuse, no file written, non-zero exit. Without `--strict`, parse failures are skipped with diagnostics and conflicts are elided into the comment.
- **`--section-depth <n>`** *(optional)*. Default 2. Heading depth considered for Section inference.
- **`--force`** *(optional)*. Overwrite `--out` if it already exists. Without `--force`, the command refuses to overwrite and exits non-zero.

Bindings (D6) are not read during `infer`. The `untypedDocumentBehavior` config has no effect on inference — it is a validation-time concern.

### Output file handling

1. Resolve `--out`. If it exists and `--force` is unset → non-zero exit, no I/O.
2. Filter inputs (exclude Type Definition Documents; in non-strict mode, exclude parse failures).
3. If the filtered input set is empty → non-zero exit with a `no-input-documents` diagnostic, no file written.
4. Call `infer(...)`, then `renderInferenceResult(...)`.
5. `kind: 'refused-strict'` → non-zero exit, diagnostics to stderr, no file written.
6. `kind: 'rendered'` → write `markdown` to `--out`. Exit zero if `emittedConflicts === 0`; non-zero otherwise. In the non-zero-with-file case, the file is still written (so the user has a draft to edit), but CI still catches the unresolved drafts.

### Exit codes

| Condition | File written | Exit |
|---|---|---|
| Clean inference, no conflicts | yes | 0 |
| Conflicts present, non-strict | yes | non-zero |
| Conflicts present, strict | no | non-zero |
| Output path exists, `--force` unset | no | non-zero |
| Empty filtered input set | no | non-zero |
| Invalid `--name` | no | non-zero |
| Parse failure in any input, strict | no | non-zero |

The `create` command (D5) is unaffected. Inference is purely a new entry point.

## Edge cases

- **Single input Document.** `infer` accepts `inputCount === 1`. Every present property becomes `required: true`. Documented as the degenerate case; the user typically hand-edits afterward.
- **All inputs identical.** Works exactly the same; the inferred Schema is the literal shape of that one observation.
- **Property observed only as empty in every input.** `kind: 'inferred'` with `schema.type` set to the lub of zero observations → `text` (the lattice top among strings), `allow-empty: true`, plus a `kind: 'list-item-type-unobserved'`-style diagnostic only for lists. For scalars, the `text`-fallback is silent; the user can narrow.
- **List property with items in some inputs and empty list in others.** Item type is the lub of the non-empty inputs' items; `allow-empty: true`.
- **Property whose value is YAML `null`.** Counts as empty (same as `""` and `[]`).
- **Property whose value is a YAML mapping (`{ ... }`).** D2 has no object/mapping primitive. Surfaces as a `kind: 'conflict'` with `observations: [{ type: '<unsupported>', sampleIds: [...] }]`. The renderer elides the property and notes it in the comment.
- **Frontmatter key colliding with the Type Declaration key in input Documents.** Standard D5 behavior — the input Document is just a regular Document with an explicit Type Declaration; it gets parsed normally for inference. Its declared type is ignored by `infer` (which is producing a *new* type, not validating against an existing one).
- **Output path inside `types/`.** Recommended convention but not enforced. `--out` accepts any project-relative path.
- **Output path that would itself be matched by `--from`.** A risk only on subsequent runs (the first run writes a file that the glob then matches). The Type-Definition-Document filter (Input filtering, step 1) handles this: the next `infer` run sees the prior output as a Type Definition Document and excludes it. No special-casing needed.
- **Mixed-line-ending or BOM-prefixed inputs.** Loader normalizes line endings before the Section scan. BOMs are stripped silently.
- **Globs that match zero files.** Same as "empty filtered input set" — non-zero exit, no file.

## Open questions

1. **Diff mode against an existing Type Definition Document.** `quoin infer --diff types/meeting.md ...` to preview the delta vs. a hand-authored Schema. Defer until the bootstrap workflow has shipped.
2. **Choice candidacy hints.** When a `text` property has fewer than K distinct values across inputs, emit a `kind: 'choice-candidate'` diagnostic. Useful but easy to defer; pure cosmetic.
3. **Round-trip self-check.** Optionally run `validate(...)` over the input set with the inferred type at the end of `infer` and surface any residual errors as a CLI warning. Probably worth doing — defer to a follow-up.
4. **Case-insensitive Section matching toggle.** A `--section-case-insensitive` flag for vaults with inconsistent heading capitalization. Wait for a real user request.
5. **Numeric subtype detection (`integer` vs. `decimal`).** D2 has only `number` today; not actionable until the type lattice gains the distinction.

## Future work

- **Three-way merge / structured update of existing Type Definition Documents.** A `--update` mode that reads `types/<name>.md`, runs `infer`, and produces a patched output that preserves hand-edits (comments, `default:`, `allow-empty: true` overrides) while updating the structural inference. Needs its own design doc.
- **`choice<...>` promotion.** Add a heuristic — e.g. "fewer than K distinct values across all inputs" — that proposes a `choice<...>` member list. Surface as a diagnostic first; promote to default behavior only with strong evidence.
- **Defaults from samples.** Re-evaluate inferring `default:` from a common value across inputs once the bootstrap workflow has matured. Pair with the round-trip self-check (Open questions 3).
- **Per-Integration entry points.** Obsidian could add an "Infer type from selection" command using the same Core `infer(...)` + `renderInferenceResult(...)` pair; only the input collection and output write differ.
- **stdout mode and pipe-friendly output.** `--out -` for shell composition. Trivial to add when needed.
- **Content-based Document classification (the rejected interpretation of "infer").** If a future use case demands "which existing type does this Document most resemble," it gets its own design doc — it is a different problem with different guarantees and should not be conflated with D7's structural inference.

## Relationship to existing design docs

- [D1 — Architecture](D1-architecture.md): `infer` and `renderInferenceResult` are new pure Core functions, peers of `parseTypeDefinitionDocument`, `validate`, `scaffold`, `template`. They participate in the same Functional-Core / Imperative-Shell discipline.
- [D2 — Type and Schema Contracts](D2-type-and-schema-contracts.md): D7 reuses D2's `PropertySchema`, `PropertyTypeName`, primitive detection rules (Wiki Link, URL, date/datetime regexes), and `[a-z0-9_-]` canonical name rules. The renderer emits a standard Type Definition Document parseable by D2's parser.
- [D3 — Validation Semantics](D3-validation-semantics.md): unchanged. Inference does not call `validate`; the round-trip self-check (Open questions 3) would.
- [D4 — Integration Contracts](D4-integration-contracts.md): unchanged. `infer` is a separate Core entry point; it does not pass through Root Type Dispatch.
- [D5 — Node CLI Integration](D5-node-cli-integration.md): adds the `infer` subcommand alongside `create`, `types`, and `validate`. Reuses the same project-root resolution, glob engine, and config-loading machinery.
- [D6 — Path-Glob Type Bindings](D6-path-glob-type-bindings.md): complementary. D6 binds existing types to Documents (read-side); D7 produces new types from Documents (write-side). They do not interact: bindings are not consulted during inference, and inferred Type Definition Documents are picked up by D6 only insofar as the user wires them in afterward.
- ADR-0005 (Functional Core / Imperative Shell): preserved. Inference and rendering are pure; the Integration handles the file I/O.

## Design Principle Violations

**DP8 — Silent `text` fallback for empty-only scalars** (type-detection ladder, empty observation)

When a scalar property is observed only as empty across all input Documents, the inferred type silently defaults to `text` with no diagnostic emitted: "For scalars, the `text`-fallback is silent; the user can narrow." DP8 requires that output be fully explainable. A silent fallback produces a result the user cannot trace back to an explicit policy.

**DP7 — Silent BOM stripping** (input normalisation)

BOM characters are stripped from input without surfacing the normalisation: "BOMs are stripped silently." DP7 requires that host-specific input conventions be surfaced explicitly rather than silently absorbed. A caller that passes BOM-prefixed content receives no signal that the input was modified before inference ran.

**DP9 — URL-looking strings widen to text**

URL-looking strings are inferred as `text` until a future text-refinement mechanism exists. This avoids a hardcoded URL detection policy and keeps inference aligned with D2's primitive set.
- ADR-0008 (Type Definition Document self-identifies via frontmatter): preserved. The rendered output begins with `_type: type` under the configured Type Declaration key, and the input-filtering step uses the same marker to exclude existing Type Definition Documents from the inference set.
