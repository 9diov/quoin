# P11 — Filesystem Discovery And Ingestion

## Goal

Implement the shared filesystem-backed discovery and ingestion pipeline described in D5.

After this phase, the CLI should be able to turn a project root into:

- a deterministic set of Markdown paths
- ingested `Document` artifacts
- ingestion diagnostics
- discovered Type Definition Document candidates

This phase still does not need the final Node Resolver or TypeRegistry behavior.

## Inputs

- [D2 — Type and Schema Contracts](../../../design/D2-type-and-schema-contracts.md)
- [D5 — Node CLI Integration](../../../design/D5-node-cli-integration.md)
- [P10 — CLI Scaffold and Config](P10-cli-scaffold-and-config.md)

## Deliverables

- Markdown path enumeration under the effective root
- include/exclude filtering
- root-relative POSIX path normalization
- frontmatter split and YAML parsing for real files
- body preservation after frontmatter split
- ingestion diagnostics for read/frontmatter failures
- Type Definition Document candidate discovery by sentinel frontmatter

Recommended dependencies for this phase:

- `fast-glob`
- existing `yaml`
- `node:fs/promises`
- `node:path`

License constraint for this phase:

- do not add a separate frontmatter package unless it is permissively licensed and fills a concrete gap

Recommended runtime outputs:

```typescript
type IngestedMarkdown =
  | { kind: 'document'; path: string; raw: string; document: Document }
  | { kind: 'ingest-failure'; path: string; stage: 'read' | 'frontmatter'; reason: string }
```

## Steps

1. Enumerate Markdown files under the effective root using `fast-glob` and the resolved discovery scope.
2. Ignore symlinks.
3. Normalize every discovered path to root-relative POSIX form.
4. Read raw file contents.
5. Split top-of-file frontmatter when present.
6. Parse frontmatter with the existing `yaml` dependency.
7. Require frontmatter, when present, to parse to a mapping/object.
8. Preserve the body text exactly after the frontmatter split.
9. Classify successful `Document` artifacts and ingestion failures.
10. Discover Type Definition Document candidates where `frontmatter[typeDeclarationKey] === 'type'`.

## Acceptance Criteria

- No-frontmatter Markdown files ingest as `{ frontmatter: {}, body: fullFile }`.
- Malformed frontmatter produces structured ingestion diagnostics.
- Type Definition Document discovery remains sentinel-based, not directory-based.
- Discovery order is deterministic.
- `npm run typecheck` succeeds.
