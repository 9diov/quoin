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
  __linkpathCalls(): { linkpath: string; sourcePath: string }[];
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

    const result = createObsidianResolver(
      app,
      index,
    )({
      value: '[[Alias]]',
      sourceDocumentPath: 'notes/Source.md',
    });

    expect(result).toEqual({
      kind: 'found',
      document: {
        path: 'notes/Target.md',
        frontmatter: { _type: '[[Concept]]' },
        body: '',
      },
    });
  });

  it('narrows ambiguous basenames using a path qualifier and delegates to metadataCache', () => {
    const first = fakeFile('a/Target.md', { _type: '[[A]]' });
    const second = fakeFile('b/Target.md', { _type: '[[B]]' });
    const app = createFakeApp([first, second]);
    app.__resolve('a/Target', 'source.md', first);
    const index = new ObsidianBasenameIndex();
    index.rebuild([first, second]);

    const result = createObsidianResolver(
      app,
      index,
    )({
      value: '[[a/Target]]',
      sourceDocumentPath: 'source.md',
    });

    expect(result.kind).toBe('found');
    if (result.kind === 'found') {
      expect(result.document.path).toBe('a/Target.md');
    }
  });

  it('falls back to original ambiguity when path qualifier matches no basename candidate', () => {
    const first = fakeFile('a/Target.md');
    const second = fakeFile('b/Target.md');
    const app = createFakeApp([first, second]);
    const index = new ObsidianBasenameIndex();
    index.rebuild([first, second]);

    const result = createObsidianResolver(
      app,
      index,
    )({
      value: '[[c/Target]]',
      sourceDocumentPath: 'source.md',
    });

    expect(result.kind).toBe('ambiguous');
    if (result.kind === 'ambiguous') {
      expect(result.candidates.map((c) => c.path).sort()).toEqual(['a/Target.md', 'b/Target.md']);
    }
  });

  it('returns ambiguous for duplicate basename candidates before accepting Obsidian selection', () => {
    const first = fakeFile('a/Target.md', { _type: '[[A]]' });
    const second = fakeFile('b/target.md', { _type: '[[B]]' });
    const app = createFakeApp([first, second]);
    app.__resolve('Target', 'source.md', first);
    const index = new ObsidianBasenameIndex();
    index.rebuild([first, second]);

    const result = createObsidianResolver(
      app,
      index,
    )({
      value: '[[Target]]',
      sourceDocumentPath: 'source.md',
    });

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

    expect(
      createObsidianResolver(
        app,
        index,
      )({
        value: '[[Missing]]',
        sourceDocumentPath: 'source.md',
      }),
    ).toEqual({
      kind: 'not-found',
      value: '[[Missing]]',
      format: 'wiki-link',
    });
  });

  it('validates wiki-link syntax before resolver lookup', () => {
    const app = createFakeApp([]);
    const index = new ObsidianBasenameIndex();

    expect(
      createObsidianResolver(
        app,
        index,
      )({
        value: 'Missing',
        sourceDocumentPath: 'source.md',
      }),
    ).toMatchObject({
      kind: 'invalid-link',
      value: 'Missing',
    });
  });

  it('resolves markdown-link by delegating to metadataCache.getFirstLinkpathDest', () => {
    const target = fakeFile('sources/example.md', { _type: '[[Concept]]' });
    const app = createFakeApp([target]);
    app.__resolve('sources/example.md', 'notes/page.md', target);
    const index = new ObsidianBasenameIndex();
    index.rebuild([target]);

    const result = createObsidianResolver(
      app,
      index,
    )({
      value: '[Example](sources/example.md)',
      sourceDocumentPath: 'notes/page.md',
    });

    expect(result).toEqual({
      kind: 'found',
      document: {
        path: 'sources/example.md',
        frontmatter: { _type: '[[Concept]]' },
        body: '',
      },
    });
  });

  it('returns not-found when Obsidian cannot resolve the markdown-link target', () => {
    const app = createFakeApp([]);
    const index = new ObsidianBasenameIndex();

    expect(
      createObsidianResolver(
        app,
        index,
      )({
        value: '[Missing](missing.md)',
        sourceDocumentPath: 'notes/page.md',
      }),
    ).toEqual({
      kind: 'not-found',
      value: '[Missing](missing.md)',
      format: 'markdown-link',
    });
  });

  it('strips the URL fragment before delegating markdown-link resolution', () => {
    const target = fakeFile('notes/glossary.md');
    const app = createFakeApp([target]);
    app.__resolve('notes/glossary.md', 'notes/page.md', target);
    const index = new ObsidianBasenameIndex();
    index.rebuild([target]);

    const result = createObsidianResolver(
      app,
      index,
    )({
      value: '[Glossary](notes/glossary.md#term)',
      sourceDocumentPath: 'notes/page.md',
    });

    expect(result.kind).toBe('found');
    const calls = app.__linkpathCalls();
    expect(calls).toContainEqual({ linkpath: 'notes/glossary.md', sourcePath: 'notes/page.md' });
    expect(calls.every((c) => !c.linkpath.includes('#'))).toBe(true);
  });

  it('percent-decodes the markdown-link target before delegating', () => {
    const target = fakeFile('notes/My Note.md');
    const app = createFakeApp([target]);
    app.__resolve('notes/My Note.md', 'notes/page.md', target);
    const index = new ObsidianBasenameIndex();
    index.rebuild([target]);

    const result = createObsidianResolver(
      app,
      index,
    )({
      value: '[Note](notes/My%20Note.md)',
      sourceDocumentPath: 'notes/page.md',
    });

    expect(result.kind).toBe('found');
    expect(app.__linkpathCalls()).toContainEqual({
      linkpath: 'notes/My Note.md',
      sourcePath: 'notes/page.md',
    });
  });

  it('treats non-markdown destinations as not-found for markdown-link', () => {
    const target = fakeFile('assets/diagram.png', {}, 'png');
    const app = createFakeApp([target]);
    app.__resolve('assets/diagram.png', 'notes/page.md', target);
    const index = new ObsidianBasenameIndex();

    expect(
      createObsidianResolver(
        app,
        index,
      )({
        value: '[Diagram](assets/diagram.png)',
        sourceDocumentPath: 'notes/page.md',
      }),
    ).toEqual({
      kind: 'not-found',
      value: '[Diagram](assets/diagram.png)',
      format: 'markdown-link',
    });
  });

  it('returns invalid-link when caller forces markdown-link format on a value that fails shape parsing', () => {
    const app = createFakeApp([]);
    const index = new ObsidianBasenameIndex();

    expect(
      createObsidianResolver(
        app,
        index,
      )({
        value: 'not a markdown link',
        format: 'markdown-link',
        sourceDocumentPath: 'notes/page.md',
      }),
    ).toMatchObject({
      kind: 'invalid-link',
      format: 'markdown-link',
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
  const linkpathCalls: { linkpath: string; sourcePath: string }[] = [];

  return {
    vault: {
      getMarkdownFiles: () => [...filesByPath.values()],
      read: async () => '',
      on: () => ({}),
    },
    metadataCache: {
      getFileCache: (file: FakeFile) => ({ frontmatter: file.frontmatter }),
      getFirstLinkpathDest: (linkpath: string, sourcePath: string) => {
        linkpathCalls.push({ linkpath, sourcePath });
        return resolutions.get(`${sourcePath}\0${linkpath}`) ?? null;
      },
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
    __linkpathCalls: () => [...linkpathCalls],
  } as FakeApp;
}

function fakeFile(path: string, frontmatter: unknown = {}, extension = 'md'): FakeFile {
  return { path, extension, frontmatter };
}

function makeDocument(path: string, frontmatter: Record<string, unknown>): Document {
  return { path, frontmatter, body: '' };
}
