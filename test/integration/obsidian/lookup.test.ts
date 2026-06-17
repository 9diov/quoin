import { describe, expect, it } from 'vitest';

import type { Document } from '../../../src/core/types.js';
import {
  createObsidianResolver,
  ObsidianBasenameIndex,
  resolveObsidianEffectiveTypeDeclaration,
} from '../../../src/integration/obsidian/lookup.js';
import { DEFAULT_OBSIDIAN_PLUGIN_SETTINGS } from '../../../src/integration/obsidian/settings.js';

type FakeFile = {
  path: string;
  extension: string;
  frontmatter?: unknown;
};

type FakeApp = Parameters<typeof createObsidianResolver>[0] & {
  __resolve(linkpath: string, sourcePath: string, destination: FakeFile | null): void;
};

describe('ObsidianBasenameIndex', () => {
  it('indexes markdown files by lowercase basename and updates on mutations', () => {
    const index = new ObsidianBasenameIndex();
    const concept = fakeFile('types/Concept.md');
    const duplicate = fakeFile('notes/concept.md');
    const page = fakeFile('notes/Page.md');

    index.rebuild([concept, page, fakeFile('asset.png', {}, 'png')]);
    expect(index.candidatesForLinkpath('Concept')).toEqual(['types/Concept.md']);

    index.addFile(duplicate);
    expect(index.candidatesForLinkpath('folder/Concept')).toEqual([
      'notes/concept.md',
      'types/Concept.md',
    ]);

    index.renameFile(fakeFile('notes/Idea.md'), 'notes/concept.md');
    expect(index.candidatesForLinkpath('Concept')).toEqual(['types/Concept.md']);
    expect(index.candidatesForLinkpath('Idea')).toEqual(['notes/Idea.md']);

    index.deleteFile(page);
    expect(index.candidatesForLinkpath('Page')).toEqual([]);
  });
});

describe('createObsidianResolver', () => {
  it('delegates destination selection to metadataCache using the source path', () => {
    const target = fakeFile('notes/Target.md', { _type: '[[Concept]]' });
    const app = createFakeApp([target]);
    app.__resolve('Alias', 'notes/Source.md', target);
    const index = new ObsidianBasenameIndex();
    index.rebuild([target]);

    const result = createObsidianResolver(app, index, 'notes/Source.md')('[[Alias]]');

    expect(result).toEqual({
      kind: 'found',
      document: {
        path: 'notes/Target.md',
        frontmatter: { _type: '[[Concept]]' },
        body: '',
      },
    });
  });

  it('returns ambiguous for duplicate basename candidates before accepting Obsidian selection', () => {
    const first = fakeFile('a/Target.md', { _type: '[[A]]' });
    const second = fakeFile('b/target.md', { _type: '[[B]]' });
    const app = createFakeApp([first, second]);
    app.__resolve('Target', 'source.md', first);
    const index = new ObsidianBasenameIndex();
    index.rebuild([first, second]);

    const result = createObsidianResolver(app, index, 'source.md')('[[Target]]');

    expect(result.kind).toBe('ambiguous');
    if (result.kind === 'ambiguous') {
      expect(result.candidates.map((candidate) => candidate.path)).toEqual([
        'a/Target.md',
        'b/target.md',
      ]);
    }
  });

  it('returns not-found when Obsidian cannot resolve the linkpath', () => {
    const app = createFakeApp([]);
    const index = new ObsidianBasenameIndex();
    index.rebuild([]);

    expect(createObsidianResolver(app, index, 'source.md')('[[Missing]]')).toEqual({
      kind: 'not-found',
      wikiLink: '[[Missing]]',
    });
  });

  it('validates wiki-link syntax before resolver lookup', () => {
    const app = createFakeApp([]);
    const index = new ObsidianBasenameIndex();

    expect(createObsidianResolver(app, index, 'source.md')('Missing')).toMatchObject({
      kind: 'invalid-link',
      wikiLink: 'Missing',
    });
  });
});

describe('resolveObsidianEffectiveTypeDeclaration', () => {
  it('preserves type definition documents as frontmatter declarations even when a binding matches', () => {
    const document = makeDocument('types/Concept.md', { _type: 'type' });

    expect(
      resolveObsidianEffectiveTypeDeclaration(document, document.path, {
        ...DEFAULT_OBSIDIAN_PLUGIN_SETTINGS,
        bindings: [{ type: 'concept', match: 'types/**/*.md' }],
      }),
    ).toEqual({ kind: 'frontmatter', value: 'type' });
  });

  it('uses binding dispatch for regular documents without frontmatter declarations', () => {
    const document = makeDocument('notes/page.md', {});

    expect(
      resolveObsidianEffectiveTypeDeclaration(document, document.path, {
        ...DEFAULT_OBSIDIAN_PLUGIN_SETTINGS,
        bindings: [{ type: 'concept', match: 'notes/**/*.md' }],
      }),
    ).toEqual({
      kind: 'binding',
      typeName: 'concept',
      matchedBinding: { type: 'concept', match: 'notes/**/*.md' },
    });
  });

  it('matches nested binding globs and preserves ambiguous binding results', () => {
    const document = makeDocument('notes/nested/page.md', {});

    expect(
      resolveObsidianEffectiveTypeDeclaration(document, document.path, {
        ...DEFAULT_OBSIDIAN_PLUGIN_SETTINGS,
        bindings: [
          { type: 'concept', match: 'notes/**/*.md' },
          { type: 'source', match: '**/*.md' },
        ],
      }),
    ).toEqual({
      kind: 'ambiguous-binding',
      candidates: [
        { type: 'concept', match: 'notes/**/*.md' },
        { type: 'source', match: '**/*.md' },
      ],
    });
  });
});

function createFakeApp(files: FakeFile[]): FakeApp {
  const filesByPath = new Map(files.map((file) => [file.path, file]));
  const resolutions = new Map<string, FakeFile | null>();

  return {
    vault: {
      getMarkdownFiles: () => [...filesByPath.values()],
      read: async () => '',
      on: () => ({}),
    },
    metadataCache: {
      getFileCache: (file: FakeFile) => ({ frontmatter: file.frontmatter }),
      getFirstLinkpathDest: (linkpath: string, sourcePath: string) =>
        resolutions.get(`${sourcePath}\0${linkpath}`) ?? null,
      on: () => ({}),
    },
    workspace: {
      detachLeavesOfType: () => undefined,
      getActiveFile: () => null,
      getLeavesOfType: () => [],
      getRightLeaf: () => null,
      on: () => ({}),
      onLayoutReady: () => undefined,
      revealLeaf: () => undefined,
    },
    __resolve: (linkpath: string, sourcePath: string, destination: FakeFile | null) => {
      resolutions.set(`${sourcePath}\0${linkpath}`, destination);
    },
  } as FakeApp;
}

function fakeFile(path: string, frontmatter: unknown = {}, extension = 'md'): FakeFile {
  return { path, extension, frontmatter };
}

function makeDocument(path: string, frontmatter: Record<string, unknown>): Document {
  return { path, frontmatter, body: '' };
}
