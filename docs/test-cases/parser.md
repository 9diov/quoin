# Parser Test Cases

These cases cover strict Type Definition Document parsing.

Unless a case says otherwise, Parser is called with:

```ts
{
  id: 'types/Concept.md',
  name: 'concept'
}
```

Unless a case says otherwise, each Type Definition Document begins with the system Type Declaration in its frontmatter:

```markdown
---
_type: type
---
```

For brevity, the frontmatter block is omitted from the fixture body in cases that do not exercise frontmatter handling.

## Frontmatter

### P000a missing Type Declaration

Type Definition Document (no frontmatter):

````markdown
# Concept

## Schema

```yaml
properties: {}
```
````

Expected error:

```ts
{
  kind: 'parser:missing-type-declaration',
  location: { scope: 'document' }
}
```

### P000b Type Declaration value is not the literal `type`

Type Definition Document:

````markdown
---
_type: "[[Concept]]"
---

## Schema

```yaml
properties: {}
```
````

Expected error:

```ts
{
  kind: 'parser:invalid-type-declaration',
  location: { scope: 'document' },
  details: { value: '[[Concept]]' }
}
```

### P000c custom typeDeclarationKey honored

Parser is called with:

```ts
parseTypeDefinitionDocument(raw, identity, { typeDeclarationKey: '_kind' })
```

Type Definition Document:

````markdown
---
_kind: type
---

## Schema

```yaml
properties: {}
```
````

Expected:

```ts
{ kind: 'ok' }
```

## Blocks

### P001 valid Schema and Template fences

Type Definition Document:

````markdown
# Concept

## Schema

```yaml
properties:
  description:
    type: text
    required: true
```

## Template

```markdown
## Definitions <!-- required -->

## References
```
````

Expected:

```ts
{
  kind: 'ok',
  typeDef: {
    id: 'types/Concept.md',
    name: 'concept',
    schema: {
      properties: {
        description: {
          type: 'text',
          required: true
        }
      }
    },
    templateBlock: {
      sections: [
        {
          level: 2,
          heading: 'Definitions',
          required: true,
          defaultContent: ''
        },
        {
          level: 2,
          heading: 'References',
          required: false,
          defaultContent: ''
        }
      ]
    }
  }
}
```

### P002 missing Schema block

Type Definition Document:

````markdown
# Concept

## Template

```markdown
## Definitions
```
````

Expected error:

```ts
{
  kind: 'parser:missing-schema-block',
  location: { scope: 'document' }
}
```

### P003 Schema heading is case-sensitive

Type Definition Document:

````markdown
## schema

```yaml
properties: {}
```
````

Expected error:

```ts
{
  kind: 'parser:missing-schema-block',
  location: { scope: 'document' }
}
```

### P004 Schema must contain exactly one YAML fence

Type Definition Document:

````markdown
## Schema

properties:
  description:
    type: text
````

Expected error:

```ts
{
  kind: 'parser:invalid-schema-block',
  location: { scope: 'block', block: 'Schema' }
}
```

### P005 Template must contain exactly one Markdown fence

Type Definition Document:

````markdown
## Schema

```yaml
properties: {}
```

## Template

## Definitions
````

Expected error:

```ts
{
  kind: 'parser:invalid-template-block',
  location: { scope: 'block', block: 'Template' }
}
```

## Schema Strictness

### P010 legacy fields key is rejected

Type Definition Document:

````markdown
## Schema

```yaml
fields:
  description:
    type: text
```
````

Expected errors include:

```ts
{
  kind: 'parser:missing-properties',
  location: { scope: 'block', block: 'Schema' }
}
```

### P011 unknown top-level schema key is rejected

Type Definition Document:

````markdown
## Schema

```yaml
properties: {}
closed: true
```
````

Expected error:

```ts
{
  kind: 'parser:unknown-schema-key',
  location: { scope: 'block', block: 'Schema' },
  details: { key: 'closed' }
}
```

### P012 unknown Property schema key is rejected

Type Definition Document:

````markdown
## Schema

```yaml
properties:
  description:
    type: text
    min-length: 20
```
````

Expected error:

```ts
{
  kind: 'parser:invalid-property-schema',
  location: { scope: 'property', property: 'description' },
  details: { unknownKeys: ['min-length'] }
}
```

### P013 schema flags are strict booleans

Type Definition Document:

````markdown
## Schema

```yaml
properties:
  description:
    type: text
    required: "true"
```
````

Expected error:

```ts
{
  kind: 'parser:invalid-property-schema',
  location: { scope: 'property', property: 'description' },
  details: { key: 'required', expected: 'boolean' }
}
```

### P014 Type Reference name must be canonical

Type Definition Document:

````markdown
## Schema

```yaml
properties:
  skills:
    type: list<Skill>
```
````

Expected error:

```ts
{
  kind: 'parser:invalid-type-reference',
  location: { scope: 'property', property: 'skills' },
  details: { value: 'Skill' }
}
```

## Defaults

### P020 default is locally type-checked

Type Definition Document:

````markdown
## Schema

```yaml
properties:
  level:
    type: choice<level>
    default: "Beginner"
```
````

Expected error:

```ts
{
  kind: 'parser:invalid-default',
  location: { scope: 'property', property: 'level' },
  details: { expected: 'wiki-link' }
}
```

### P021 empty default must obey allow-empty

Type Definition Document:

````markdown
## Schema

```yaml
properties:
  description:
    type: text
    default: ""
```
````

Expected error:

```ts
{
  kind: 'parser:invalid-default',
  location: { scope: 'property', property: 'description' },
  details: { reason: 'empty-not-allowed' }
}
```

### P022 empty default allowed when allow-empty is true

Type Definition Document:

````markdown
## Schema

```yaml
properties:
  description:
    type: text
    allow-empty: true
    default: ""
```
````

Expected:

```ts
{ kind: 'ok' }
```

## Identity

### P030 identity name must be canonical

Identity:

```ts
{ id: 'types/Skill.md', name: 'Skill' }
```

Expected error:

```ts
{
  kind: 'parser:invalid-type-definition-identity',
  location: { scope: 'document' },
  details: { name: 'Skill' }
}
```

### P031 identity id must be non-empty

Identity:

```ts
{ id: '   ', name: 'skill' }
```

Expected error:

```ts
{
  kind: 'parser:invalid-type-definition-identity',
  location: { scope: 'document' },
  details: { id: '   ' }
}
```

## Sections

### P040 required marker allows flexible whitespace

Type Definition Document:

````markdown
## Schema

```yaml
properties: {}
```

## Template

```markdown
## Definitions <!--   required   -->
```
````

Expected parsed Section:

```ts
{
  level: 2,
  heading: 'Definitions',
  required: true
}
```

### P041 duplicate required Section identity is rejected

Type Definition Document:

````markdown
## Schema

```yaml
properties: {}
```

## Template

```markdown
## Definitions <!-- required -->

## Definitions <!-- required -->
```
````

Expected error:

```ts
{
  kind: 'parser:duplicate-required-section',
  location: { scope: 'section', section: 'Definitions', level: 2 }
}
```

