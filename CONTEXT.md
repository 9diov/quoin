# Quoin

Quoin is a system that enforces field-level schemas on Markdown files by declaring types in frontmatter.

## Conventions

### Document types

Repository docs are organized around Type Definition Documents in `docs/types/`. The current project doc types are:

| Type | Conventional location | Use when |
|---|---|---|
| `adr` | `docs/adr/` | Recording a durable architectural decision, its context, and consequences. ADRs use sequential four-digit numbering: `0001-slug.md`, `0002-slug.md`, etc. |
| `branding-note` | `docs/branding/` | Capturing product language, naming, visual direction, or other brand-facing guidance. |
| `design-doc` | `docs/design/` | Describing architecture, semantics, contracts, or product behavior that guides implementation. Design documents use sequential `D`-prefixed numbering: `D1-slug.md`, `D2-slug.md`, etc. |
| `manual-page` | `docs/manual/` | Explaining setup, workflows, operations, or troubleshooting for a developer, operator, or user audience. |
| `plan-doc` | `docs/plan/` | Translating accepted design work into ordered implementation steps, milestones, or integration plans. Plans use sequential `P`-prefixed numbering where appropriate. |
| `public-page` | `docs/public/` | Drafting published-facing docs, website copy, examples, or other externally consumed pages. |
| `research-note` | `docs/research/` | Capturing investigation notes, sources, findings, and recommendations before a design or decision is settled. |
| `test-suite` | `docs/test-cases/` | Describing parser, validation, integration, or mixed test cases in Markdown form. |

The locations above are repository conventions and path-glob bindings for dogfooding. Core still treats type identity as data declared by Type Definition Documents, not as a directory rule.

## Language

Quoin's glossary lives in [docs/design/GLOSSARY.md](docs/design/GLOSSARY.md). Use those terms consistently in design docs, ADRs, plans, code comments, and user-facing documentation.

## Design principles
Quoin's design principles live in [docs/design/PRINCIPLES.md](docs/design/PRINCIPLES.md). Use them to evaluate new features, ADRs, integration contracts, and architectural tradeoffs.
