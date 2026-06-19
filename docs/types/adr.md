---
_type: type
---

## Schema

```yaml
properties:
  status:
    type: 'choice<"proposed"|"accepted"|"superseded"|"rejected">'
  decision-date:
    type: date
  superseded-by:
    type: doc-ref
```

## Body

```markdown
## Context

## Decision

## Consequences
```
