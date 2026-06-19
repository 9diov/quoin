---
_type: type
---

## Schema

```yaml
properties:
  status:
    type: 'choice<"proposed"|"in-progress"|"done"|"abandoned">'
  parent:
    type: doc-ref
  related:
    type: list<doc-ref>
  terms:
    type: list<text>
```

## Body

```markdown
## Goal

## Inputs

## Deliverables

## Steps

## Acceptance Criteria
```
