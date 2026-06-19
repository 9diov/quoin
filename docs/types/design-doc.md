---
_type: type
---

## Schema

```yaml
properties:
  status:
    type: 'choice<"draft"|"active"|"superseded">'
  supersedes:
    type: doc-ref
  related:
    type: list<doc-ref>
  terms:
    type: list<text>
```

## Template

```markdown
## Problem

## Goals

## Non-goals

## Decision

## Consequences
```
