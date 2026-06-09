# Markdown Type System

A system that enforces field-level schemas on Markdown files by declaring types in frontmatter.

## Conventions

### Design documents

Design documents live in `docs/design/` and use a sequential `D`-prefixed number: `D1-slug.md`, `D2-slug.md`, etc. Scan the directory for the highest existing number and increment by one.

### ADRs

ADRs live in `docs/adr/` and use sequential four-digit numbering: `0001-slug.md`, `0002-slug.md`, etc.

## Language

**Document**:
A single Markdown file that can declare a type and conform to a schema.
_Avoid_: Note, file, page

**Type Definition Document**:
A normal Document with `_type: type` in its frontmatter, located in `types/`. It declares the schema for a type via a `## Schema` block containing exactly one fenced YAML block.
_Avoid_: Type file, schema file, type definition

**Conforms to**:
The relationship between a Document and its Type Definition Document. A Document conforms to a Type Definition Document when its frontmatter satisfies the declared schema.
_Avoid_: Implements, extends, is typed as

**Property**:
A single key-value entry in a Document's YAML frontmatter that is governed by the schema. Called "fields" in Hugo, Gatsby, and Docusaurus; "variables" in Jekyll/GitHub Pages; "attributes" in VitePress. This project uses "Property" to align with Obsidian and GitBook, the primary integration targets.

Property keys declared in Type Definition Documents must match `[a-z0-9_-]`, be lowercase, and have no leading/trailing hyphens or underscores (except the reserved `_type` key). The Parser rejects schemas that violate this. See D2 for rationale and possible future relaxations.
_Avoid_: Field, variable, attribute, key

**Wiki Link**:
A Property value in the form `[[TargetDocument]]` — an internal reference to another Document in the same vault or repository. Used by Collection Types (`list<X>`, `choice<Y>`) as the value format for Type References.
_Avoid_: Internal link, wikilink, link

**External Link**:
A Property value in the form `[text](url)` — a standard Markdown hyperlink to an external resource. Declared as `type: url` in a schema. Distinct from a Wiki Link and not used as a Type Reference.
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
A Property type that wraps a Type Reference — currently `list<X>` (ordered list of links to Documents of type X) and `choice<Y>` (a single link to a Document of type Y). The only two forms supported; no maps, sets, or other containers.
_Avoid_: Container type, compound type, generic type

**Type Reference**:
A named reference to a Type Definition Document used as a constraint within a Property's type declaration (e.g. `list<skill>`, `choice<level>`).
_Avoid_: Type parameter, type argument, linked type

**Untyped Document**:
A Document with no Type Declaration. Validation skips or warns on Untyped Documents depending on the active Validation Config.
_Avoid_: Unvalidated document, unschemed document

**Link Resolution**:
The standard Validation stage after Wiki Link shape validation — resolving a Wiki Link to a Document, or returning a precise reason resolution failed. Runs for present, non-empty `wiki-link`, `list<X>`, and `choice<Y>` values that pass shape validation.
_Avoid_: Link checking, link validation

**Referential Validation**:
The opt-in Collection Type validation stage after Link Resolution — checking that the target Document conforms to the Type Reference declared in the schema (e.g. a `list<skill>` entry must conform to the `skill` type). Applies only to `list<X>` and `choice<Y>`, not primitive `wiki-link`. Opt-in via Validation Config, as it requires TypeRegistry lookup and can be expensive at scale.
_Avoid_: Deep validation, type validation, reference checking

**Validation Config**:
The configuration that controls Validation behaviour across an Integration. Includes: whether Untyped Documents produce a warning or are skipped silently; which Integration's Reserved Properties are active; allowed URL schemes; whether Referential Validation is enabled; and the Type Declaration key (defaults to `_type`, configurable if the Integration has already claimed that key for another purpose).
_Avoid_: Settings, options, configuration

**Type Declaration**:
The frontmatter entry (`_type: "[[TypeName]]"`) that binds a Document to a Type Definition Document. A system-level key, not a user-defined Property — it belongs to the type system itself.
_Avoid_: Type annotation, type tag, type marker

**Core**:
The functional core of the type system — pure functions for Validation, Scaffolding, and schema resolution, plus a shared Parser utility. No I/O, no side effects, no runtime APIs. Follows the Functional Core / Imperative Shell pattern: the Core only transforms data; all I/O is handled by the Integration.
_Avoid_: Engine, library, shared module

**Parser**:
A shared Core utility that strictly extracts the schema from a Type Definition Document's fenced `## Schema` block and optional fenced `## Template` block, returning a structured Parse Result with Integration-supplied identity. Not part of the Validation or Scaffolding pipelines — Integrations call it once upfront, then pass the parsed Type Definition Document into Core functions. Keeps parsing logic in one place without coupling it to Validation.
_Avoid_: Extractor, reader, deserializer

**Parse Result**:
The structured result returned by the Parser — either a parsed Type Definition Document or one or more Parse Errors. Parser reports expected authoring errors as data instead of throwing.
_Avoid_: Parser output, parse response

**Resolver**:
A function injected by the Integration into the Core that takes a Wiki Link and returns a Resolve Wiki Link Result. The Core's only mechanism for accessing Documents outside the one being validated — keeping I/O out of the Core. Resolution strategy (e.g. Obsidian's shortest-path vs full-path matching) is baked in at construction time by an Integration factory — the Core sees only `(wikiLink: string) => ResolveWikiLinkResult`.
_Avoid_: Document store, loader, fetcher

**Resolve Wiki Link Result**:
The pure result returned by a Resolver. Describes whether a Wiki Link resolved to one Document, was not found, was malformed, matched multiple Documents, or could not be resolved because the Integration was unavailable.
_Avoid_: Resolver output, lookup result, resolved link

**TypeRegistry**:
A lookup interface injected by the Integration into the Core for Referential Validation. Resolves Type References from Collection Types and Type Declarations from target Document frontmatter to Type Definition Documents. The Core compares resolved Type Definition Document identity, not raw Type Declaration strings.
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
