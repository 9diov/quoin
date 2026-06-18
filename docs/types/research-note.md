---
_type: type
---

## Schema

```yaml
properties:
  status:
    type: 'choice<"draft"|"active"|"superseded">'
  sources:
    type: list<text>
  related:
    type: list<doc-ref>
```

## Template

```markdown
## Goal

## Findings

## Recommendations

## Sources
```
