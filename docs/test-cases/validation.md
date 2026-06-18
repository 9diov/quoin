# Validation Test Cases

> **Note:** [D9](../design/D9-doc-ref-format-separation.md) supersedes the cases that treated `wiki-link` as a primitive. Internal reference Properties are now `doc-ref` (optionally with `format` and `referenced-type`); Validation routes them through a format-aware branch and passes the source `document.path` to the Resolver.

These cases cover the accepted Validation pipeline:

1. Property presence and emptiness.
2. Primitive Property type checks.
3. Collection Type shape checks.
4. Link Resolution.
5. Referential Validation.
6. Section warnings.
7. Config and dependency failures.

Unless a case says otherwise:

- `typeDeclarationKey` defaults to `_type`.
- `referentialValidation` defaults to `false`.
- Schemas are open by default.
- The Integration has already resolved the root Document Type Declaration and passed the correct Type Definition Document to `validate`.

## Shared Type Definitions

### Concept

```yaml
properties:
  description:
    type: text
    required: true
  mentor:
    type: wiki-link
  skills:
    type: "list<[[skill]]>"
    allow-empty: false
  level:
    type: "[[level]]"
  homepage:
    type: text
  priority:
    type: number
  published:
    type: boolean
  publish-date:
    type: date
  reviewed-at:
    type: datetime
```

Identity:

```ts
{ id: 'types/Concept.md', name: 'concept' }
```

### Skill

```yaml
properties:
  description:
    type: text
    required: true
```

Identity:

```ts
{ id: 'types/Skill.md', name: 'skill' }
```

### Level

```yaml
properties:
  rank:
    type: number
    required: true
```

Identity:

```ts
{ id: 'types/Level.md', name: 'level' }
```

## Presence And Emptiness

### V001 required Property missing

Schema:

```yaml
properties:
  description:
    type: text
    required: true
```

Document frontmatter:

```yaml
_type: "[[Concept]]"
```

Expected:

```ts
{
  passed: false,
  errors: [
    {
      kind: 'property:missing-required',
      location: { scope: 'property', property: 'description' }
    }
  ],
  warnings: []
}
```

### V002 optional missing Property passes

Schema:

```yaml
properties:
  mentor:
    type: wiki-link
```

Document frontmatter:

```yaml
_type: "[[Concept]]"
```

Expected:

```ts
{
  passed: true,
  errors: [],
  warnings: []
}
```

### V003 null is present but empty

Schema:

```yaml
properties:
  description:
    type: text
    required: true
```

Document frontmatter:

```yaml
_type: "[[Concept]]"
description:
```

Expected:

```ts
{
  passed: false,
  errors: [
    {
      kind: 'property:empty-not-allowed',
      location: { scope: 'property', property: 'description' }
    }
  ],
  warnings: []
}
```

### V004 whitespace-only string is empty

Schema:

```yaml
properties:
  description:
    type: text
```

Document frontmatter:

```yaml
_type: "[[Concept]]"
description: "   "
```

Expected:

```ts
{
  passed: false,
  errors: [
    {
      kind: 'property:empty-not-allowed',
      location: { scope: 'property', property: 'description' }
    }
  ],
  warnings: []
}
```

### V005 empty scalar allowed with allow-empty true

Schema:

```yaml
properties:
  description:
    type: text
    allow-empty: true
```

Document frontmatter:

```yaml
_type: "[[Concept]]"
description: ""
```

Expected:

```ts
{
  passed: true,
  errors: [],
  warnings: []
}
```

### V006 empty list passes by default

Schema:

```yaml
properties:
  skills:
    type: "list<[[skill]]>"
```

Document frontmatter:

```yaml
_type: "[[Concept]]"
skills: []
```

Expected:

```ts
{
  passed: true,
  errors: [],
  warnings: []
}
```

### V007 empty list fails with allow-empty false

Schema:

```yaml
properties:
  skills:
    type: "list<[[skill]]>"
    allow-empty: false
```

Document frontmatter:

```yaml
_type: "[[Concept]]"
skills: []
```

Expected:

```ts
{
  passed: false,
  errors: [
    {
      kind: 'property:empty-not-allowed',
      location: { scope: 'property', property: 'skills' }
    }
  ],
  warnings: []
}
```

## Primitive Types

### V010 text accepts non-empty string

Schema:

```yaml
properties:
  description:
    type: text
```

Document frontmatter:

```yaml
_type: "[[Concept]]"
description: "A reusable idea"
```

Expected:

```ts
{ passed: true, errors: [], warnings: [] }
```

### V011 number rejects numeric string

Schema:

```yaml
properties:
  priority:
    type: number
```

Document frontmatter:

```yaml
_type: "[[Concept]]"
priority: "42"
```

Expected error:

```ts
{
  kind: 'property:wrong-type',
  location: { scope: 'property', property: 'priority' }
}
```

### V012 boolean rejects string

Schema:

```yaml
properties:
  published:
    type: boolean
```

Document frontmatter:

```yaml
_type: "[[Concept]]"
published: "true"
```

Expected error:

```ts
{
  kind: 'property:wrong-type',
  location: { scope: 'property', property: 'published' }
}
```

### V013 date accepts canonical date string

Schema:

```yaml
properties:
  publish-date:
    type: date
```

Document frontmatter:

```yaml
_type: "[[Concept]]"
publish-date: "2026-06-08"
```

Expected:

```ts
{ passed: true, errors: [], warnings: [] }
```

### V014 datetime requires timezone

Schema:

```yaml
properties:
  reviewed-at:
    type: datetime
```

Document frontmatter:

```yaml
_type: "[[Concept]]"
reviewed-at: "2026-06-08T14:30:00"
```

Expected error:

```ts
{
  kind: 'property:wrong-type',
  location: { scope: 'property', property: 'reviewed-at' }
}
```

### V015 text accepts bare URL string

Schema:

```yaml
properties:
  homepage:
    type: text
```

Document frontmatter:

```yaml
_type: "[[Concept]]"
homepage: "https://www.typescriptlang.org/"
```

Expected:

```ts
{ passed: true, errors: [], warnings: [] }
```

### V016 text accepts Markdown External Link string

Schema:

```yaml
properties:
  homepage:
    type: text
```

Document frontmatter:

```yaml
_type: "[[Concept]]"
homepage: "[TypeScript](https://www.typescriptlang.org/)"
```

Expected:

```ts
{ passed: true, errors: [], warnings: [] }
```

## Wiki Links And Link Resolution

### V020 wiki-link shape failure happens before Resolver

Schema:

```yaml
properties:
  mentor:
    type: wiki-link
```

Document frontmatter:

```yaml
_type: "[[Concept]]"
mentor: "Alice"
```

Expected:

```ts
{
  passed: false,
  errors: [
    {
      kind: 'property:wrong-type',
      location: { scope: 'property', property: 'mentor' }
    }
  ],
  warnings: []
}
```

Resolver expectation:

```text
Resolver is not called.
```

### V021 valid wiki-link calls Resolver and passes when found

Schema:

```yaml
properties:
  mentor:
    type: wiki-link
```

Document frontmatter:

```yaml
_type: "[[Concept]]"
mentor: "[[Alice]]"
```

Resolver:

```ts
("[[Alice]]") => { kind: 'found', document: { path: 'people/Alice.md', frontmatter: {}, body: '' } }
```

Expected:

```ts
{ passed: true, errors: [], warnings: [] }
```

### V022 broken wiki-link returns resolve error

Schema:

```yaml
properties:
  mentor:
    type: wiki-link
```

Document frontmatter:

```yaml
_type: "[[Concept]]"
mentor: "[[Missing]]"
```

Resolver:

```ts
("[[Missing]]") => { kind: 'not-found', wikiLink: '[[Missing]]' }
```

Expected error:

```ts
{
  kind: 'resolve:broken-wiki-link',
  location: { scope: 'property', property: 'mentor' },
  details: { wikiLink: '[[Missing]]' }
}
```

### V023 ambiguous wiki-link returns resolve error

Schema:

```yaml
properties:
  mentor:
    type: wiki-link
```

Document frontmatter:

```yaml
_type: "[[Concept]]"
mentor: "[[Alice]]"
```

Resolver:

```ts
("[[Alice]]") => {
  kind: 'ambiguous',
  wikiLink: '[[Alice]]',
  candidates: [
    { path: 'people/Alice.md', frontmatter: {}, body: '' },
    { path: 'archive/Alice.md', frontmatter: {}, body: '' }
  ]
}
```

Expected error:

```ts
{
  kind: 'resolve:ambiguous-wiki-link',
  location: { scope: 'property', property: 'mentor' }
}
```

### V024 missing Resolver is a config error only after shape passes

Schema:

```yaml
properties:
  mentor:
    type: wiki-link
```

Document frontmatter:

```yaml
_type: "[[Concept]]"
mentor: "[[Alice]]"
```

Resolver:

```ts
undefined
```

Expected error:

```ts
{
  kind: 'config:missing-dependency',
  location: { scope: 'property', property: 'mentor' },
  details: { dependency: 'resolver' }
}
```

### V025 top-level [[name]] resolves and (with referentialValidation) checks type

Config:

```ts
{ referentialValidation: true }
```

Schema:

```yaml
properties:
  level:
    type: "[[level]]"
```

Document frontmatter:

```yaml
_type: "[[Concept]]"
level: "[[Beginner]]"
```

Resolver:

```ts
("[[Beginner]]") => {
  kind: 'found',
  document: {
    path: 'levels/Beginner.md',
    frontmatter: { _type: '[[Level]]' },
    body: ''
  }
}
```

TypeRegistry: returns the Level type definition for `getByName('level')` and `getByDeclaration('[[Level]]')`, both with `id: 'types/Level.md'`.

Expected:

```ts
{ passed: true, errors: [], warnings: [] }
```

### V026 top-level [[name]] rejects non-Wiki-Link string

Schema:

```yaml
properties:
  level:
    type: "[[level]]"
```

Document frontmatter:

```yaml
_type: "[[Concept]]"
level: "Beginner"
```

Expected:

```ts
{
  passed: false,
  errors: [
    {
      kind: 'property:wrong-type',
      location: { scope: 'property', property: 'level' }
    }
  ],
  warnings: []
}
```

### V027 top-level [[name]] referential mismatch

Config:

```ts
{ referentialValidation: true }
```

Schema:

```yaml
properties:
  level:
    type: "[[level]]"
```

Document frontmatter:

```yaml
_type: "[[Concept]]"
level: "[[TypeScript]]"
```

Resolver:

```ts
("[[TypeScript]]") => {
  kind: 'found',
  document: {
    path: 'skills/TypeScript.md',
    frontmatter: { _type: '[[Skill]]' },
    body: ''
  }
}
```

TypeRegistry: `getByName('level')` returns the Level type def (`id: 'types/Level.md'`); `getByDeclaration('[[Skill]]')` returns the Skill type def (`id: 'types/Skill.md'`).

Expected:

```ts
{
  passed: false,
  errors: [
    {
      kind: 'type:referential-mismatch',
      location: { scope: 'property', property: 'level' },
      details: {
        expectedTypeId: 'types/Level.md',
        actualTypeId: 'types/Skill.md',
        wikiLink: '[[TypeScript]]',
        targetPath: 'skills/TypeScript.md'
      }
    }
  ],
  warnings: []
}
```

## Collection Types

### V030 list accumulates item-level errors

Schema:

```yaml
properties:
  skills:
    type: "list<[[skill]]>"
```

Document frontmatter:

```yaml
_type: "[[Concept]]"
skills:
  - 123
  - "not a wiki link"
  - "[[Missing]]"
```

Resolver:

```ts
("[[Missing]]") => { kind: 'not-found', wikiLink: '[[Missing]]' }
```

Expected errors:

```ts
[
  {
    kind: 'property:wrong-type',
    location: { scope: 'property', property: 'skills', index: 0 }
  },
  {
    kind: 'property:wrong-type',
    location: { scope: 'property', property: 'skills', index: 1 }
  },
  {
    kind: 'resolve:broken-wiki-link',
    location: { scope: 'property', property: 'skills', index: 2 }
  }
]
```

Resolver expectation:

```text
Resolver is called only for index 2.
```

### V031 top-level [[name]] requires a single Wiki Link string

A top-level Type Reference rejects arrays — that is the `list<[[name]]>` form.

Schema:

```yaml
properties:
  level:
    type: "[[level]]"
```

Document frontmatter:

```yaml
_type: "[[Concept]]"
level:
  - "[[Beginner]]"
```

Expected error:

```ts
{
  kind: 'property:wrong-type',
  location: { scope: 'property', property: 'level' }
}
```

### V032 list does not use TypeRegistry when Referential Validation is off

Config:

```ts
{ referentialValidation: false }
```

Schema:

```yaml
properties:
  skills:
    type: "list<[[skill]]>"
```

Document frontmatter:

```yaml
_type: "[[Concept]]"
skills:
  - "[[TypeScript]]"
```

Resolver:

```ts
("[[TypeScript]]") => {
  kind: 'found',
  document: {
    path: 'skills/TypeScript.md',
    frontmatter: { _type: '[[Skill]]' },
    body: ''
  }
}
```

TypeRegistry:

```ts
undefined
```

Expected:

```ts
{ passed: true, errors: [], warnings: [] }
```

### V033 list<text> validates each item as a primitive

Schema:

```yaml
properties:
  tags:
    type: list<text>
```

Document frontmatter:

```yaml
_type: "[[Concept]]"
tags:
  - "alpha"
  - 42
  - "  "
```

Resolver:

```ts
undefined
```

Expected:

```ts
{
  passed: false,
  errors: [
    {
      kind: 'property:wrong-type',
      location: { scope: 'property', property: 'tags', index: 1 },
      details: { expected: 'text' }
    },
    {
      kind: 'property:empty-not-allowed',
      location: { scope: 'property', property: 'tags', index: 2 }
    }
  ],
  warnings: []
}
```

A `list<primitive>` never invokes Resolver. The missing Resolver in this case is not an error.

### V034 list<number> rejects non-numeric items

Schema:

```yaml
properties:
  scores:
    type: list<number>
```

Document frontmatter:

```yaml
_type: "[[Concept]]"
scores:
  - 1
  - "2"
  - 3
```

Expected:

```ts
{
  passed: false,
  errors: [
    {
      kind: 'property:wrong-type',
      location: { scope: 'property', property: 'scores', index: 1 },
      details: { expected: 'number' }
    }
  ],
  warnings: []
}
```

### V035 list<wiki-link> validates shape but does not referentially check

Config:

```ts
{ referentialValidation: true }
```

Schema:

```yaml
properties:
  links:
    type: list<wiki-link>
```

Document frontmatter:

```yaml
_type: "[[Concept]]"
links:
  - "[[Page A]]"
  - "[[Page B]]"
```

Resolver:

```ts
(_) => ({ kind: 'found', document: { path: '_.md', frontmatter: {}, body: '' } })
```

TypeRegistry:

```ts
undefined
```

Expected:

```ts
{ passed: true, errors: [], warnings: [] }
```

`list<wiki-link>` resolves each link via Resolver but never invokes TypeRegistry, regardless of `referentialValidation`. Missing TypeRegistry is therefore not a config error.

### V036 choice<enum> matches one of the allowed values

Schema:

```yaml
properties:
  status:
    type: 'choice<"draft"|"published"|"archived">'
```

Document frontmatter:

```yaml
_type: "[[Concept]]"
status: "published"
```

Expected:

```ts
{ passed: true, errors: [], warnings: [] }
```

### V037 choice<enum> rejects unlisted value

Schema:

```yaml
properties:
  status:
    type: 'choice<"draft"|"published"|"archived">'
```

Document frontmatter:

```yaml
_type: "[[Concept]]"
status: "ready"
```

Expected:

```ts
{
  passed: false,
  errors: [
    {
      kind: 'property:invalid-enum-value',
      location: { scope: 'property', property: 'status' },
      details: { value: 'ready', allowed: ['draft', 'published', 'archived'] }
    }
  ],
  warnings: []
}
```

### V038 choice<enum> rejects non-string value

Schema:

```yaml
properties:
  status:
    type: 'choice<"draft"|"published">'
```

Document frontmatter:

```yaml
_type: "[[Concept]]"
status: 1
```

Expected:

```ts
{
  passed: false,
  errors: [
    {
      kind: 'property:wrong-type',
      location: { scope: 'property', property: 'status' },
      details: { expected: 'string' }
    }
  ],
  warnings: []
}
```

### V039 choice<enum> match is case-sensitive

Schema:

```yaml
properties:
  status:
    type: 'choice<"draft"|"published">'
```

Document frontmatter:

```yaml
_type: "[[Concept]]"
status: "Draft"
```

Expected:

```ts
{
  passed: false,
  errors: [
    {
      kind: 'property:invalid-enum-value',
      location: { scope: 'property', property: 'status' },
      details: { value: 'Draft', allowed: ['draft', 'published'] }
    }
  ],
  warnings: []
}
```

## Referential Validation

### V040 referential match passes

Config:

```ts
{ referentialValidation: true }
```

Schema:

```yaml
properties:
  skills:
    type: "list<[[skill]]>"
```

Document frontmatter:

```yaml
_type: "[[Concept]]"
skills:
  - "[[TypeScript]]"
```

Resolver:

```ts
("[[TypeScript]]") => {
  kind: 'found',
  document: {
    path: 'skills/TypeScript.md',
    frontmatter: { _type: '[[Skill]]' },
    body: ''
  }
}
```

TypeRegistry:

```ts
getByName('skill') => { kind: 'found', typeDef: { id: 'types/Skill.md', name: 'skill', schema } }
getByDeclaration('[[Skill]]') => { kind: 'found', typeDef: { id: 'types/Skill.md', name: 'skill', schema } }
```

Expected:

```ts
{ passed: true, errors: [], warnings: [] }
```

### V041 missing TypeRegistry is config error after link resolves

Config:

```ts
{ referentialValidation: true }
```

Schema:

```yaml
properties:
  skills:
    type: "list<[[skill]]>"
```

Document frontmatter:

```yaml
_type: "[[Concept]]"
skills:
  - "[[TypeScript]]"
```

Resolver:

```ts
("[[TypeScript]]") => {
  kind: 'found',
  document: { path: 'skills/TypeScript.md', frontmatter: { _type: '[[Skill]]' }, body: '' }
}
```

TypeRegistry:

```ts
undefined
```

Expected error:

```ts
{
  kind: 'config:missing-dependency',
  location: { scope: 'property', property: 'skills', index: 0 },
  details: { dependency: 'typeRegistry' }
}
```

### V042 unknown Type Reference

Config:

```ts
{ referentialValidation: true }
```

Schema:

```yaml
properties:
  skills:
    type: "list<[[skill]]>"
```

Document frontmatter:

```yaml
_type: "[[Concept]]"
skills:
  - "[[TypeScript]]"
```

Resolver:

```ts
("[[TypeScript]]") => {
  kind: 'found',
  document: { path: 'skills/TypeScript.md', frontmatter: { _type: '[[Skill]]' }, body: '' }
}
```

TypeRegistry:

```ts
getByName('skill') => { kind: 'not-found', typeName: 'skill' }
```

Expected error:

```ts
{
  kind: 'type:unknown-reference',
  location: { scope: 'property', property: 'skills', index: 0 },
  details: { typeName: 'skill' }
}
```

### V043 target Document missing Type Declaration

Config:

```ts
{ referentialValidation: true }
```

Schema:

```yaml
properties:
  skills:
    type: "list<[[skill]]>"
```

Document frontmatter:

```yaml
_type: "[[Concept]]"
skills:
  - "[[TypeScript]]"
```

Resolver:

```ts
("[[TypeScript]]") => {
  kind: 'found',
  document: { path: 'skills/TypeScript.md', frontmatter: {}, body: '' }
}
```

TypeRegistry:

```ts
getByName('skill') => { kind: 'found', typeDef: { id: 'types/Skill.md', name: 'skill', schema } }
getByDeclaration(undefined) => { kind: 'missing-declaration' }
```

Expected error:

```ts
{
  kind: 'type:missing-declaration',
  location: { scope: 'property', property: 'skills', index: 0 },
  details: { targetPath: 'skills/TypeScript.md' }
}
```

### V044 target Document referential mismatch

Config:

```ts
{ referentialValidation: true }
```

Schema:

```yaml
properties:
  skills:
    type: "list<[[skill]]>"
```

Document frontmatter:

```yaml
_type: "[[Concept]]"
skills:
  - "[[Beginner]]"
```

Resolver:

```ts
("[[Beginner]]") => {
  kind: 'found',
  document: { path: 'levels/Beginner.md', frontmatter: { _type: '[[Level]]' }, body: '' }
}
```

TypeRegistry:

```ts
getByName('skill') => { kind: 'found', typeDef: { id: 'types/Skill.md', name: 'skill', schema } }
getByDeclaration('[[Level]]') => { kind: 'found', typeDef: { id: 'types/Level.md', name: 'level', schema } }
```

Expected error:

```ts
{
  kind: 'type:referential-mismatch',
  location: { scope: 'property', property: 'skills', index: 0 },
  details: {
    expectedTypeId: 'types/Skill.md',
    actualTypeId: 'types/Level.md',
    wikiLink: '[[Beginner]]',
    targetPath: 'levels/Beginner.md'
  }
}
```

## Open Schemas And Warnings

### V050 unknown Document Property is allowed

Schema:

```yaml
properties:
  description:
    type: text
```

Document frontmatter:

```yaml
_type: "[[Concept]]"
description: "A reusable idea"
extra: "allowed"
```

Expected:

```ts
{ passed: true, errors: [], warnings: [] }
```

### V051 reserved Property collision is warning

Config:

```ts
{ integration: 'obsidian' }
```

Schema:

```yaml
properties:
  tags:
    type: "list<[[skill]]>"
```

Document frontmatter:

```yaml
_type: "[[Concept]]"
tags: []
```

Expected:

```ts
{
  passed: true,
  errors: [],
  warnings: [
    {
      kind: 'property:reserved-collision',
      location: { scope: 'property', property: 'tags' },
      details: { integration: 'obsidian' }
    }
  ]
}
```

### V052 missing required Section is warning

Template Block:

```markdown
## Definitions <!-- required -->

## References
```

Document body:

```markdown
## References
```

Expected:

```ts
{
  passed: true,
  errors: [],
  warnings: [
    {
      kind: 'section:missing-required',
      location: { scope: 'section', section: 'Definitions', level: 2 }
    }
  ]
}
```
