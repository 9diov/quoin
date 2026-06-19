---
_type: "[[design-doc]]"
status: "active"
terms: ["Core", "Document", "Integration", "Parser", "Parse Result", "Resolver", "Reserved Property", "Scaffolding", "Scaffolding Result", "Body Block", "Body Generation", "Body Generation Result", "Type Declaration", "Type Definition Document", "Type Reference", "TypeRegistry", "Validation", "Validation Config", "Validation Result"]
related:
  - "[D2 — Type and Schema Contracts](D2-type-and-schema-contracts.md)"
  - "[D3 — Validation Semantics](D3-validation-semantics.md)"
  - "[D4 — Integration Contracts](D4-integration-contracts.md)"
---

# D1 — Architecture

## Overview

The system follows the Functional Core / Imperative Shell pattern (ADR-0005). The Core is a pure TypeScript library with no I/O. Integrations wrap it with host-specific I/O.

```
┌─────────────────────────────────────────────────────┐
│                    Integration                       │
│  (Obsidian plugin / Node.js API / browser bundle)   │
│                                                      │
│  - Reads Documents from disk/vault                  │
│  - Resolves root Type Declarations                  │
│  - Provides Resolver for Wiki Link lookups          │
│  - Provides TypeRegistry for Type Definition lookup │
│  - Owns Validation Config                           │
│  - Writes Scaffolding/Body Generation Results back  │
│                                                      │
│  ┌───────────────────────────────────────────────┐  │
│  │                    Core                        │  │
│  │                                                │  │
│  │  Parser ──► Validation ──► ValidationResult   │  │
│  │         └──► Scaffolding ──► ScaffoldingResult │  │
│  │     └──► Body Generation ──► BodyGenerationResult │  │
│  └───────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────┘
```

---

## Core modules

### Parser

Strictly extracts the fenced `## Schema` block and optional fenced `## Body` block from a Type Definition Document, using Integration-supplied identity for the Type Definition Document's stable id and Type Reference name. Returns a structured ParseResult with no I/O.

Detailed contracts: [D2 — Type and Schema Contracts](D2-type-and-schema-contracts.md).

### Validation

Pure function. Takes a Document, a parsed Type Definition Document, a Validation Config, and optional Integration-supplied lookup functions. Returns a Validation Result.

Validation has two high-level passes:

1. **Property validation** — checks frontmatter Properties against Constraints, resolves Wiki Links, and optionally performs Referential Validation.
2. **Section validation** — checks existing Document bodies for missing required Sections and emits warnings only.

Detailed behavior: [D3 — Validation Semantics](D3-validation-semantics.md).

### Scaffolding

Pure function. Takes a Document's frontmatter and a parsed Type Definition Document. Returns a Scaffolding Result listing missing Properties that have declared defaults. Defaults belong to Scaffolding, not Validation (ADR-0004).

Detailed contracts: [D2 — Type and Schema Contracts](D2-type-and-schema-contracts.md).

### Body Generation

Pure function. Takes a parsed Body Block. Returns a Body Generation Result with the rendered Markdown body. Applied to new Documents only; existing Documents are never overwritten by Body Generation.

Detailed contracts: [D2 — Type and Schema Contracts](D2-type-and-schema-contracts.md).

### Repairing (future)

Not in scope for the Core's v1 phases. Described in [ADR-0009](../adr/0009-scaffolding-is-creation-not-repair.md).

Repairing is the operation that consumes a `ValidationResult` plus a `ParsedTypeDefinitionDocument` and computes patches for specific Validation error kinds — `property:missing-required` and `property:empty-not-allowed` for frontmatter, `section:missing-required` for body — applying defaults or Body Block Sections to an existing Document. Unlike Scaffolding and Body Generation (which are creation-only), Repairing intentionally mutates existing content.

Repairing is a distinct Concern from Scaffolding and Body Generation with its own semantics, scope boundary, and name. No detailed design doc exists yet.

---

## Integration responsibilities

| Concern | Core | Integration |
|---|---|---|
| Parse Type Definition Document | `parseTypeDefinitionDocument()` | supplies identity + ParserConfig, handles ParseResult, caches success |
| Resolve root Type Declaration | — | resolves before calling `validate()` |
| Validate a Document | `validate()` | supplies Resolver + TypeRegistry + Config |
| Scaffold frontmatter | `scaffold()` | writes ScaffoldingResult back |
| Generate a new Document body | `generateBody()` | writes BodyGenerationResult to new file |
| Repair Validation failures (future) | `repair()` | consumes ValidationResult, writes patches back |
| Resolve Wiki Links | — | implements `Resolver` |
| Resolve Type References and Type Declarations | — | implements `TypeRegistry` |
| Detect Reserved Property conflicts | — | passes `integration` in Config |
| Read/write files | — | owns all I/O |

Detailed lookup contracts: [D4 — Integration Contracts](D4-integration-contracts.md).
