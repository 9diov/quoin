---
_type: "[[design-doc]]"
status: "active"
terms: ["Document", "Type Definition Document", "Conforms to", "Frontmatter", "Property", "Schema", "Primitive Type", "Doc Reference", "Wiki Link", "Markdown Link", "External Link", "Constraint", "Scaffolding", "Templating", "Section", "Templating Result", "Template Block", "Scaffolding Result", "Collection Type", "Type Reference", "Untyped Document", "Meta-Type Definition Document", "Link Resolution", "Referential Validation", "Validation Config", "Type Declaration", "Type Binding", "Effective Type Declaration", "Core", "Parser", "Parse Result", "Discovery", "Ingestion", "Resolver", "Resolve Doc Reference Result", "TypeRegistry", "Integration", "Reserved Property", "Validation", "Validation Result", "Validation Error", "Validation Warning"]
---

# Glossary

Quoin uses the following terms consistently across design docs, ADRs, plans, code comments, and user-facing documentation.

**Document**:
A single Markdown file that can declare a type and conform to a schema.
_Avoid_: Note, file, page

**Type Definition Document**:
A normal Document that self-identifies via the system Type Declaration `_type: type` in its frontmatter. It declares the schema for a type via a `## Schema` block containing exactly one fenced YAML block. Integrations discover Type Definition Documents by scanning frontmatter for the sentinel, not by directory layout — `types/` is a convention, not a Core requirement. See ADR-0008.
_Avoid_: Type file, schema file, type definition

**Conforms to**:
The relationship between a Document and its Type Definition Document. A Document conforms to a Type Definition Document when its frontmatter satisfies the declared schema.
_Avoid_: Implements, extends, is typed as

**Frontmatter**:
The YAML metadata block at the top of a Document. Quoin reads Properties and the system Type Declaration from frontmatter; Integrations are responsible for parsing or obtaining it from their host environment before calling Core.
_Avoid_: Header, metadata, attributes

**Property**:
A single key-value entry in a Document's YAML frontmatter that is governed by the schema. Called "fields" in Hugo, Gatsby, and Docusaurus; "variables" in Jekyll/GitHub Pages; "attributes" in VitePress. This project uses "Property" to align with Obsidian and GitBook, the primary integration targets.

Property keys declared in Type Definition Documents must match `[a-z0-9_-]`, be lowercase, and have no leading/trailing hyphens or underscores (except the reserved `_type` key). The Parser rejects schemas that violate this. See D2 for rationale and possible future relaxations.
_Avoid_: Field, variable, attribute, key

**Schema**:
The structured set of Property declarations parsed from the fenced YAML block inside a Type Definition Document's `## Schema` section. A Schema governs frontmatter Properties only; body structure is governed by the Template Block and Section rules.
_Avoid_: Type file, model, validator

**Primitive Type**:
A built-in Property type whose value is validated directly without nested structure or TypeRegistry lookup. Current Primitive Types are `text`, `number`, `boolean`, `date`, and `datetime`.
_Avoid_: Scalar type, base type, simple type

**Doc Reference**:
A Property value that points to another Document — semantically modeled by `type: doc-ref`. Two concrete syntaxes are supported: Wiki Link (`[[Target]]`) and Markdown Link (`[Label](path/to/target.md)`). The `format` schema key narrows the accepted syntax; `referenced-type` constrains the target Document's declared type. The schema shorthands `type: "[[name]]"` and `type: "[](name)"` normalize to `doc-ref` with the corresponding `format` and `referenced-type`.
_Avoid_: Internal link, link, reference

**Wiki Link**:
One supported concrete syntax for a Doc Reference, in the form `[[TargetDocument]]`. Not a Property type; `wiki-link` is a `format` value for `doc-ref`. Legacy `type: wiki-link` is accepted as a parser alias for `type: doc-ref` + `format: wiki-link`.
_Avoid_: Internal link, wikilink

**Markdown Link**:
One supported concrete syntax for a Doc Reference, in the form `[Label](path/to/target.md)`. Targets are resolved relative to the containing Document's path (or root-relative when starting with `/`). Protocol-qualified targets (`https://…`, `mailto:…`) are not Doc References and remain plain `text`.
_Avoid_: Markdown hyperlink, external link

**External Link**:
A Property value in the form `[text](https://…)` or another protocol-qualified URL — a standard Markdown hyperlink to an external resource. Currently modeled as `type: text`; not a Doc Reference and not used for Referential Validation.
_Avoid_: URL, hyperlink, link

**Constraint**:
A rule declared on a Property in a Type Definition Document that must be satisfied for a Document to conform. Examples: `required`, `allow-empty`. Does not include `default` — that belongs to Scaffolding, not Validation.
_Avoid_: Option, rule, attribute, setting

**Scaffolding**:
A Core operation that computes missing Property values from the defaults declared in a Type Definition Document, returning a Scaffolding Result. The Integration applies the result to the Document — the Core never mutates anything directly.
_Avoid_: Fixing, templating, applying defaults

**Templating**:
A Core operation that generates the Markdown body of a new Document from the fenced Markdown block inside the `## Template` block in its Type Definition Document. Applied only when creating a new Document. On existing Documents, Validation warns if required sections are missing — Templating never overwrites existing content.
_Avoid_: Body scaffolding, content generation, document generation

**Section**:
A heading in a Document's Markdown body, identified by exact ATX heading level plus exact heading text. A Section is considered present if the heading exists, regardless of whether content follows it. Sections in a Template Block may be marked required with an inline HTML comment whose trimmed content is exactly `required` — `## Heading <!-- required -->`. Validation warns only on missing required Sections in existing Documents.
_Avoid_: Heading, block, content block

**Templating Result**:
The pure data structure returned by the Core after a Templating operation — the rendered Markdown body ready to be written by the Integration.
_Avoid_: Template output, rendered template, body

**Template Block**:
The `## Template` section in a Type Definition Document containing exactly one fenced Markdown block that defines the Markdown body structure for new Documents of that type. Distinct from the `## Schema` block, which governs frontmatter Properties.
_Avoid_: Body template, content template, document template

**Scaffolding Result**:
The pure data structure returned by the Core after a Scaffolding operation — describing which Properties were missing and what values should be applied. The Integration writes these back to the Document.
_Avoid_: Patch, diff, update

**Collection Type**:
A Property type that takes an inner form in angle brackets — currently `list<X>` (ordered list whose items are primitives or `doc-ref`s) and `choice<"a"|"b"|"c">` (a literal enum: value must equal one of the listed quoted string literals exactly). The only two forms supported; no maps, sets, or other containers. The `choice<...>` grammar reserves room for a future union extension (`choice<text|[[tag]]>`); v1 accepts quoted literals only.
_Avoid_: Container type, compound type, generic type

**Type Reference**:
A schema/type-definition lookup — the canonical type name used to fetch a Type Definition Document by name (`TypeDefinitionDocumentIdentity.name`). At runtime, schemas express Type Reference through `referenced-type: name` on a `doc-ref` Property or through the shorthands `type: "[[name]]"` and `type: "[](name)"`. Not itself a Property value type.
_Avoid_: Type parameter, type argument, linked type

**Untyped Document**:
A Document with no Type Declaration. Validation skips or warns on Untyped Documents depending on the active Validation Config.
_Avoid_: Unvalidated document, unschemed document

**Meta-Type Definition Document**:
A user-authored Type Definition Document whose `TypeDefinitionDocumentIdentity.name === 'type'`. Optional. When present, Integrations validate every other Type Definition Document against it through ordinary Validation — extra required Properties on the frontmatter of all Type Definition Documents, extra required Sections in their bodies. Absent any user-authored meta-Type Definition Document, the Parser's hardcoded baseline (`_type: type` + `## Schema`) is the entire contract for what counts as a Type Definition Document. See ADR-0008.
_Avoid_: Schema of schemas, root type, type-of-types

**Link Resolution**:
The standard Validation stage after Doc Reference shape validation — resolving a Doc Reference to a Document, or returning a precise reason resolution failed. Runs for every present, non-empty `doc-ref` value that passes shape validation, including list items of type `doc-ref`.
_Avoid_: Link checking, link validation

**Referential Validation**:
The opt-in Validation stage after Link Resolution — checking that the target Document conforms to the Type Reference declared in the schema (e.g. a `list<[[skill]]>` entry must conform to the `skill` type). Applies only to `doc-ref` Properties whose schema sets `referenced-type` (or the shorthand `type: "[[name]]"` / `type: "[](name)"`). A `doc-ref` without `referenced-type` and `choice<"a"|"b"|"c">` are never referentially validated. Opt-in via Validation Config, as it requires TypeRegistry lookup and can be expensive at scale.
_Avoid_: Deep validation, type validation, reference checking

**Validation Config**:
The configuration that controls Validation behaviour across an Integration. Includes: whether Untyped Documents produce a warning or are skipped silently; which Integration's Reserved Properties are active; whether Referential Validation is enabled; and the Type Declaration key (defaults to `_type`, configurable if the Integration has already claimed that key for another purpose).
_Avoid_: Settings, options, configuration

**Type Declaration**:
The frontmatter entry under the configured Type Declaration key (default `_type`) that identifies a Document to the type system. Two value forms:

- `_type: "[[TypeName]]"` — a Wiki Link binding a regular Document to a Type Definition Document named `TypeName`.
- `_type: type` — the reserved literal that marks a Type Definition Document itself (ADR-0008).

A system-level key, not a user-defined Property — it belongs to the type system. The bare literal `type` is reserved as a *value* under this key; it is not reserved as a Type Reference name. A user-authored Type Definition Document whose `name` is `type` is the optional Meta-Type Definition Document.
_Avoid_: Type annotation, type tag, type marker

**Type Binding**:
A path-glob rule supplied by an Integration that assigns a Type Reference to matching regular Documents that do not have a frontmatter Type Declaration. Bindings are opt-in, Integration-owned, and frontmatter Type Declarations always take precedence.
_Avoid_: Type rule, type assignment, glob binding

**Effective Type Declaration**:
The Type Declaration an Integration uses for a Document after applying frontmatter and Type Binding precedence rules. It is computed before Root Type Declaration dispatch and before Core Validation.
_Avoid_: Resolved type, declared type, inferred type

**Core**:
The functional core of the type system — pure functions for Validation, Scaffolding, and schema resolution, plus a shared Parser utility. No I/O, no side effects, no runtime APIs. Follows the Functional Core / Imperative Shell pattern: the Core only transforms data; all I/O is handled by the Integration.
_Avoid_: Engine, library, shared module

**Parser**:
A shared Core utility that strictly extracts the schema from a Type Definition Document's fenced `## Schema` block and optional fenced `## Template` block, returning a structured Parse Result with Integration-supplied identity. Not part of the Validation or Scaffolding pipelines — Integrations call it once upfront, then pass the parsed Type Definition Document into Core functions. Keeps parsing logic in one place without coupling it to Validation.
_Avoid_: Extractor, reader, deserializer

**Parse Result**:
The structured result returned by the Parser — either a parsed Type Definition Document or one or more Parse Errors. Parser reports expected authoring errors as data instead of throwing.
_Avoid_: Parser output, parse response

**Discovery**:
The Integration-owned process of finding Markdown files and Type Definition Document candidates in a host environment. Discovery determines the candidate universe; Core does not perform discovery.
_Avoid_: Scanning, crawling, finding files

**Ingestion**:
The Integration-owned process of turning discovered Markdown files into Core Documents or structured ingestion diagnostics. Ingestion includes reading content, obtaining frontmatter, preserving body text, and reporting host/read/frontmatter failures outside Core Validation.
_Avoid_: Loading, importing, parsing

**Resolver**:
A function injected by the Integration into the Core that takes a Doc Reference input (`{ value, format?, sourceDocumentPath }`) and returns a Resolve Doc Reference Result. The Core's only mechanism for accessing Documents outside the one being validated — keeping I/O out of the Core. Format-aware: a `wiki-link` value, a `markdown-link` value, or an unconstrained value where the Integration detects the format. Resolution strategy (e.g. Obsidian's shortest-path matching, Node CLI's basename match for `wiki-link`, or relative-path resolution for `markdown-link`) is baked in at construction time by an Integration factory.
_Avoid_: Document store, loader, fetcher

**Resolve Doc Reference Result**:
The pure result returned by a Resolver. Describes whether a Doc Reference resolved to one Document, was not found, was malformed, matched multiple Documents, or could not be resolved because the Integration was unavailable. Carries `value` and `format` so diagnostics can attribute failures to the concrete syntax involved.
_Avoid_: Resolver output, lookup result, resolved link

**TypeRegistry**:
A lookup interface injected by the Integration into the Core for Referential Validation. Resolves Type References declared by Property schemas (top-level `[[name]]`, `list<[[name]]>`) and Type Declarations from target Document frontmatter to Type Definition Documents. The Core compares resolved Type Definition Document identity, not raw Type Declaration strings.
_Avoid_: Type store, schema registry, definition loader

**Integration**:
The host-specific layer that embeds the Core into a target environment. Current targets: Obsidian plugin, browser bundle, Node.js CLI/API. Owns the Validation Config and supplies the filesystem/vault access the Core requires for Link Resolution and Referential Validation.
_Avoid_: Adapter, runtime, platform

**Reserved Property**:
A frontmatter key claimed by a host Integration that must not be redefined in a Type Definition Document. Conflicts cause silent breakage — the host interprets the key its own way regardless of the schema.

| Integration | Reserved keys |
|---|---|
| Obsidian | `tags`, `aliases`, `cssclasses`, `publish` |
| Hugo | `title`, `date`, `draft`, `aliases`, `description`, `categories`, `tags`, `weight` |
| Jekyll / GitHub Pages | `layout`, `title`, `date`, `categories`, `tags`, `published` |
| GitBook | `title`, `layout`, `description`, `type` |
| Docusaurus | `title`, `slug`, `description`, `keywords`, `image`, `sidebar_position`, `sidebar_label` |
| VitePress | `title`, `description`, `head`, `lastUpdated`, `prev`, `next`, `layout` |

High-risk keys that appear across multiple systems: `title`, `date`, `tags`, `description`, `layout`.

Validation warns (does not error) when a Type Definition Document declares a Property whose key matches a Reserved Property for the active Integration. The user may intentionally constrain a reserved key.

**Validation**:
The process of checking whether a Document's frontmatter satisfies the schema declared in its Type Definition Document. Produces a Validation Result containing zero or more Validation Errors.
_Avoid_: Type-checking, linting

**Validation Result**:
The outcome of running Validation on a Document — either passing or failing. Contains zero or more Validation Errors (fatal) and zero or more Validation Warnings (non-fatal). Fails if any Validation Error is present.
_Avoid_: Validation report, validation output

**Validation Error**:
A single fatal problem found during Validation, describing what failed, where it failed, and which Constraint or lookup stage was violated. Causes the Validation Result to fail.
_Avoid_: Validation warning, validation issue, error message

**Validation Warning**:
A single non-fatal issue found during Validation — e.g. a Reserved Property collision or an Untyped Document. Surfaced in the Validation Result but does not cause it to fail.
_Avoid_: Validation error, validation hint, notice
