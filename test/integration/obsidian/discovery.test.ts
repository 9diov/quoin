import { describe, expect, it } from 'vitest';

import {
  deriveObsidianTypeIdentity,
  inspectTypeDefinitionCandidate,
  ObsidianVaultTypeRegistry,
} from '../../../src/integration/obsidian/discovery.js';
import { DEFAULT_OBSIDIAN_PLUGIN_SETTINGS } from '../../../src/integration/obsidian/settings.js';

type FakeFile = {
  path: string;
  extension: string;
  frontmatter: unknown;
  raw: string;
};

type FakeApp = ConstructorParameters<typeof ObsidianVaultTypeRegistry>[0] & {
  __addFile(file: FakeFile): void;
  __deletePath(path: string): void;
  __setRaw(path: string, raw: string): void;
};

describe('deriveObsidianTypeIdentity', () => {
  it('uses the vault-relative path as id and lowercase basename as name', () => {
    expect(deriveObsidianTypeIdentity('Types/Concept.Note.md')).toEqual({
      id: 'Types/Concept.Note.md',
      name: 'concept.note',
    });
  });
});

describe('inspectTypeDefinitionCandidate', () => {
  it('discovers type definitions by sentinel frontmatter only', () => {
    expect(inspectTypeDefinitionCandidate('types/Concept.md', { _type: 'type' }, '_type')).toEqual({
      kind: 'candidate',
    });
    expect(inspectTypeDefinitionCandidate('types/Concept.md', undefined, '_type')).toEqual({
      kind: 'not-candidate',
    });
    expect(
      inspectTypeDefinitionCandidate('types/Concept.md', { _type: 'concept' }, '_type'),
    ).toEqual({
      kind: 'not-candidate',
    });
  });

  it('surfaces malformed frontmatter as an ingestion diagnostic', () => {
    expect(inspectTypeDefinitionCandidate('bad.md', ['not', 'a', 'mapping'], '_type')).toEqual({
      kind: 'diagnostic',
      diagnostic: {
        path: 'bad.md',
        stage: 'frontmatter',
        reason: 'Frontmatter must be a mapping when present.',
      },
    });
  });
});

describe('ObsidianVaultTypeRegistry', () => {
  it('builds a deterministic type registry from Obsidian markdown files', async () => {
    const app = createFakeApp([
      fakeFile('notes/regular.md', { _type: '[[Concept]]' }, '# Regular'),
      fakeFile('types/Broken.md', { _type: 'type' }, brokenType('Broken')),
      fakeFile('types/Concept.md', { _type: 'type' }, validType('Concept')),
      fakeFile('more/Concept.md', { _type: 'type' }, validType('Concept')),
      fakeFile('types/Page.md', { kind: 'type' }, validType('Page')),
      fakeFile('bad-frontmatter.md', ['bad'], '# Bad'),
    ]);
    const registry = new ObsidianVaultTypeRegistry(app, () => DEFAULT_OBSIDIAN_PLUGIN_SETTINGS);

    await registry.rebuild();

    const state = registry.getState();
    expect(state.markdownPaths).toEqual([
      'bad-frontmatter.md',
      'more/Concept.md',
      'notes/regular.md',
      'types/Broken.md',
      'types/Concept.md',
      'types/Page.md',
    ]);
    expect(state.typeCandidatePaths).toEqual([
      'more/Concept.md',
      'types/Broken.md',
      'types/Concept.md',
    ]);
    expect(state.parsedTypes.map((typeDef) => typeDef.id)).toEqual([
      'more/Concept.md',
      'types/Concept.md',
    ]);
    expect(state.typeParseFailures.map((failure) => failure.path)).toEqual(['types/Broken.md']);
    expect(state.ingestionDiagnostics).toEqual([
      {
        path: 'bad-frontmatter.md',
        stage: 'frontmatter',
        reason: 'Frontmatter must be a mapping when present.',
      },
    ]);
    expect(state.ambiguousNames).toEqual([
      {
        name: 'concept',
        candidates: state.parsedTypes,
      },
    ]);
    expect(state.typeRegistry.getByName('concept')).toMatchObject({
      kind: 'ambiguous',
      typeName: 'concept',
    });
    expect(state.typeRegistry.getByName('broken')).toEqual({
      kind: 'unavailable',
      reason: 'Parse failed: 1 error(s)',
    });
  });

  it('updates registry entries on create, change, rename, and delete', async () => {
    const page = fakeFile('types/Page.md', { _type: 'type' }, validType('Page'));
    const app = createFakeApp([page]);
    const registry = new ObsidianVaultTypeRegistry(app, () => DEFAULT_OBSIDIAN_PLUGIN_SETTINGS);

    await registry.rebuild();
    expect(registry.getState().typeRegistry.getByName('page')).toMatchObject({ kind: 'found' });

    app.__setRaw('types/Page.md', brokenType('Page'));
    await registry.refreshFile(page);
    expect(registry.getState().typeRegistry.getByName('page')).toEqual({
      kind: 'unavailable',
      reason: 'Parse failed: 1 error(s)',
    });

    const article = fakeFile('types/Article.md', { _type: 'type' }, validType('Article'));
    app.__addFile(article);
    await registry.refreshFile(article);
    expect(registry.getState().typeRegistry.getByName('article')).toMatchObject({ kind: 'found' });

    const renamed = fakeFile('types/Essay.md', { _type: 'type' }, validType('Essay'));
    app.__deletePath('types/Article.md');
    app.__addFile(renamed);
    await registry.renameFile(renamed, 'types/Article.md');
    expect(registry.getState().typeRegistry.getByName('article')).toEqual({
      kind: 'not-found',
      typeName: 'article',
    });
    expect(registry.getState().typeRegistry.getByName('essay')).toMatchObject({ kind: 'found' });

    registry.deleteFile(renamed);
    expect(registry.getState().typeRegistry.getByName('essay')).toEqual({
      kind: 'not-found',
      typeName: 'essay',
    });
  });
});

function createFakeApp(files: FakeFile[]): FakeApp {
  const filesByPath = new Map<string, FakeFile>();
  const frontmatterByPath = new Map<string, unknown>();
  const rawByPath = new Map<string, string>();

  for (const file of files) {
    filesByPath.set(file.path, file);
    frontmatterByPath.set(file.path, file.frontmatter);
    rawByPath.set(file.path, file.raw);
  }

  return {
    vault: {
      getMarkdownFiles: () => [...filesByPath.values()],
      read: async (file: FakeFile) => rawByPath.get(file.path) ?? '',
      on: () => ({}),
    },
    metadataCache: {
      getFileCache: (file: FakeFile) => ({ frontmatter: frontmatterByPath.get(file.path) }),
      getFirstLinkpathDest: () => null,
      on: () => ({}),
    },
    workspace: {
      detachLeavesOfType: () => undefined,
      getLeavesOfType: () => [],
      getRightLeaf: () => null,
      onLayoutReady: () => undefined,
      revealLeaf: () => undefined,
    },
    __addFile: (file: FakeFile) => {
      filesByPath.set(file.path, file);
      frontmatterByPath.set(file.path, file.frontmatter);
      rawByPath.set(file.path, file.raw);
    },
    __deletePath: (path: string) => {
      filesByPath.delete(path);
      frontmatterByPath.delete(path);
      rawByPath.delete(path);
    },
    __setRaw: (path: string, raw: string) => {
      rawByPath.set(path, raw);
    },
  } as FakeApp;
}

function fakeFile(path: string, frontmatter: unknown, raw: string): FakeFile {
  return { path, extension: 'md', frontmatter, raw };
}

function validType(_name: string): string {
  return `---
_type: type
---

## Schema

\`\`\`yaml
properties:
  title:
    type: text
\`\`\`
`;
}

function brokenType(name: string): string {
  return `---
_type: type
---

# ${name}
`;
}
