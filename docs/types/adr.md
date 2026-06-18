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

## Template

```markdown
## Context

## Decision

## Consequences
```
