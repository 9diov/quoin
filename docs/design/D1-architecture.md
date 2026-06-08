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
│  - Writes Scaffolding/Templating Results back       │
│                                                      │
│  ┌───────────────────────────────────────────────┐  │
│  │                    Core                        │  │
│  │                                                │  │
│  │  Parser ──► Validation ──► ValidationResult   │  │
│  │         └──► Scaffolding ──► ScaffoldingResult │  │
│  │         └──► Templating ──► TemplatingResult   │  │
│  └───────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────┘
```

---

## Core modules

### Parser

Strictly extracts the fenced `## Schema` block and optional fenced `## Template` block from a Type Definition Document, using Integration-supplied identity for the Type Definition Document's stable id and Type Reference name. Returns a structured ParseResult with no I/O.

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

### Templating

Pure function. Takes a parsed Template Block. Returns a Templating Result with the rendered Markdown body. Applied to new Documents only; existing Documents are never overwritten by Templating.

Detailed contracts: [D2 — Type and Schema Contracts](D2-type-and-schema-contracts.md).

---

## Integration responsibilities

| Concern | Core | Integration |
|---|---|---|
| Parse Type Definition Document | `parseTypeDefinitionDocument()` | supplies identity + ParserConfig, handles ParseResult, caches success |
| Resolve root Type Declaration | — | resolves before calling `validate()` |
| Validate a Document | `validate()` | supplies Resolver + TypeRegistry + Config |
| Scaffold frontmatter | `scaffold()` | writes ScaffoldingResult back |
| Template a new Document body | `template()` | writes TemplatingResult to new file |
| Resolve Wiki Links | — | implements `Resolver` |
| Resolve Type References and Type Declarations | — | implements `TypeRegistry` |
| Detect Reserved Property conflicts | — | passes `integration` in Config |
| Read/write files | — | owns all I/O |

Detailed lookup contracts: [D4 — Integration Contracts](D4-integration-contracts.md).

---

## Related design docs

- [D2 — Type and Schema Contracts](D2-type-and-schema-contracts.md)
- [D3 — Validation Semantics](D3-validation-semantics.md)
- [D4 — Integration Contracts](D4-integration-contracts.md)
