import { describe, expect, it } from 'vitest';

import type { TypeRegistry } from '../../../src/core/integration.js';
import type { ParsedTypeDefinitionDocument } from '../../../src/core/parser.js';
import {
  renderActiveFileStatus,
  validateActiveFile,
} from '../../../src/integration/obsidian/active-validation.js';
import { ObsidianBasenameIndex } from '../../../src/integration/obsidian/lookup.js';
import { DEFAULT_OBSIDIAN_PLUGIN_SETTINGS } from '../../../src/integration/obsidian/settings.js';

type FakeFile = {
  path: string;
  extension: string;
  frontmatter?: unknown;
  frontmatterPosition?: {
    start: { offset: number };
    end: { offset: number };
  };
  raw: string;
};

type FakeApp = Parameters<typeof validateActiveFile>[0]['app'];

describe('validateActiveFile', () => {
  it('hides status for missing or non-Markdown active files', async () => {
    const app = createFakeApp([fakeFile('asset.png', {}, 'png')]);
    const state = await validateActiveFile({
      app,
      file: app.vault.getMarkdownFiles()[0] ?? null,
      settings: DEFAULT_OBSIDIAN_PLUGIN_SETTINGS,
      typeRegistry: emptyRegistry(),
      basenameIndex: new ObsidianBasenameIndex(),
    });

    expect(state).toEqual({ kind: 'hidden' });
  });

  it('classifies Type Definition Documents without running document validation', async () => {
    const typeFile = fakeFile('types/Concept.md', { _type: 'type' });
    const app = createFakeApp([typeFile]);

    const state = await validateActiveFile({
      app,
      file: typeFile,
      settings: DEFAULT_OBSIDIAN_PLUGIN_SETTINGS,
      typeRegistry: emptyRegistry(),
      basenameIndex: new ObsidianBasenameIndex(),
    });

    expect(state).toEqual({
      kind: 'type-definition',
      path: 'types/Concept.md',
      typeName: 'concept',
    });
  });

  it('validates a uniquely typed regular document with the Obsidian integration config', async () => {
    const note = fakeFile(
      'notes/typed.md',
      { _type: '[[Concept]]', tags: 'reserved but present' },
      'md',
      `---
_type: "[[Concept]]"
tags: reserved but present
---

Body
`,
    );
    const app = createFakeApp([note]);

    const state = await validateActiveFile({
      app,
      file: note,
      settings: DEFAULT_OBSIDIAN_PLUGIN_SETTINGS,
      typeRegistry: registryWithType(conceptType()),
      basenameIndex: new ObsidianBasenameIndex(),
    });

    expect(state.kind).toBe('validated');
    if (state.kind === 'validated') {
      expect(state.result.errors).toEqual([]);
      expect(state.result.warnings.map((warning) => warning.kind)).toEqual([
        'property:reserved-collision',
      ]);
    }
  });

  it('returns root type resolution failures before calling validation', async () => {
    const note = fakeFile('notes/missing.md', { _type: '[[Missing]]' });
    const app = createFakeApp([note]);

    const state = await validateActiveFile({
      app,
      file: note,
      settings: DEFAULT_OBSIDIAN_PLUGIN_SETTINGS,
      typeRegistry: emptyRegistry(),
      basenameIndex: new ObsidianBasenameIndex(),
    });

    expect(state).toEqual({
      kind: 'type-not-found',
      path: 'notes/missing.md',
      declaration: '[[Missing]]',
      typeName: 'missing',
    });
  });

  it('uses path bindings when frontmatter does not declare a type', async () => {
    const note = fakeFile('notes/bound.md', { title: 'Bound' });
    const app = createFakeApp([note]);

    const state = await validateActiveFile({
      app,
      file: note,
      settings: {
        ...DEFAULT_OBSIDIAN_PLUGIN_SETTINGS,
        bindings: [{ type: 'concept', match: 'notes/**/*.md' }],
      },
      typeRegistry: registryWithType(conceptType()),
      basenameIndex: new ObsidianBasenameIndex(),
    });

    expect(state).toMatchObject({
      kind: 'validated',
      path: 'notes/bound.md',
      typeName: 'concept',
    });
  });

  it('uses Obsidian frontmatter offsets when extracting the validation body', async () => {
    const raw = `---
_type: "[[Sectioned]]"
---
## Required
`;
    const note = fakeFile('notes/sectioned.md', { _type: '[[Sectioned]]' }, 'md', raw);
    note.frontmatterPosition = {
      start: { offset: 0 },
      end: { offset: raw.indexOf('---', 4) + 3 },
    };
    const app = createFakeApp([note]);

    const state = await validateActiveFile({
      app,
      file: note,
      settings: DEFAULT_OBSIDIAN_PLUGIN_SETTINGS,
      typeRegistry: registryWithType(sectionedType()),
      basenameIndex: new ObsidianBasenameIndex(),
    });

    expect(state.kind).toBe('validated');
    if (state.kind === 'validated') {
      expect(state.result.warnings).toEqual([]);
    }
  });

  it('falls back to raw body text when frontmatter is unterminated and no offset is available', async () => {
    const raw = `---
_type: "[[Sectioned]]"
## Required
`;
    const note = fakeFile('notes/broken-frontmatter.md', { _type: '[[Sectioned]]' }, 'md', raw);
    const app = createFakeApp([note]);

    const state = await validateActiveFile({
      app,
      file: note,
      settings: DEFAULT_OBSIDIAN_PLUGIN_SETTINGS,
      typeRegistry: registryWithType(sectionedType()),
      basenameIndex: new ObsidianBasenameIndex(),
    });

    expect(state.kind).toBe('validated');
    if (state.kind === 'validated') {
      expect(state.result.warnings).toEqual([]);
    }
  });
});

describe('renderActiveFileStatus', () => {
  it('renders warnings-alone validation as amber success', () => {
    expect(
      renderActiveFileStatus({
        kind: 'validated',
        path: 'notes/ok.md',
        typeId: 'types/Concept.md',
        typeName: 'concept',
        result: {
          passed: true,
          errors: [],
          warnings: [
            {
              kind: 'property:reserved-collision',
              message: 'Reserved',
              location: { scope: 'property', property: 'tags' },
            },
          ],
        },
      }),
    ).toEqual({
      visible: true,
      text: '✓',
      tooltip: 'Conforms with 1 warning(s)',
      statusKind: 'success-warning',
      clickTarget: 'validation',
    });
  });

  it('renders type resolution failures as warnings', () => {
    expect(
      renderActiveFileStatus({
        kind: 'type-not-found',
        path: 'note.md',
        typeName: 'missing',
        declaration: '[[Missing]]',
      }),
    ).toMatchObject({
      visible: true,
      text: '⚠',
      statusKind: 'warning',
      clickTarget: 'validation',
    });
  });
});

function createFakeApp(files: FakeFile[]): FakeApp {
  return {
    vault: {
      getMarkdownFiles: () => files,
      read: async (file: FakeFile) => file.raw,
      on: () => ({}),
    },
    metadataCache: {
      getFileCache: (file: FakeFile) => ({
        frontmatter: file.frontmatter,
        frontmatterPosition: file.frontmatterPosition,
      }),
      getFirstLinkpathDest: () => null,
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
  } as FakeApp;
}

function fakeFile(path: string, frontmatter: unknown = {}, extension = 'md', raw = ''): FakeFile {
  return { path, extension, frontmatter, raw };
}

function emptyRegistry(): TypeRegistry {
  return {
    getByName: (typeName) => ({ kind: 'not-found', typeName: typeName.toLowerCase() }),
    getByDeclaration: (value) => {
      if (typeof value !== 'string') return { kind: 'invalid-declaration', value };
      const typeName = value.replace(/^\[\[/, '').replace(/\]\]$/, '').toLowerCase();
      return { kind: 'not-found', typeName };
    },
  };
}

function registryWithType(typeDef: ParsedTypeDefinitionDocument): TypeRegistry {
  return {
    getByName: (typeName) =>
      typeName.toLowerCase() === typeDef.name
        ? { kind: 'found', typeDef }
        : { kind: 'not-found', typeName: typeName.toLowerCase() },
    getByDeclaration: (value) => {
      if (value === `[[${capitalize(typeDef.name)}]]` || value === typeDef.name) {
        return { kind: 'found', typeDef };
      }
      return emptyRegistry().getByDeclaration(value);
    },
  };
}

function conceptType(): ParsedTypeDefinitionDocument {
  return {
    id: 'types/Concept.md',
    name: 'concept',
    schema: {
      properties: {
        tags: { type: 'text' },
      },
    },
  };
}

function sectionedType(): ParsedTypeDefinitionDocument {
  return {
    id: 'types/Sectioned.md',
    name: 'sectioned',
    schema: {
      properties: {},
    },
    templateBlock: {
      body: '## Required <!-- required -->',
      sections: [
        {
          level: 2,
          heading: 'Required',
          required: true,
          defaultContent: '',
        },
      ],
    },
  };
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
