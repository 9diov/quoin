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
```

## Template

```markdown
## Problem

## Goals

## Non-goals

## Decision

## Consequences
```
