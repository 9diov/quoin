import { describe, expect, it, vi } from 'vitest';

import type { TypeRegistry } from '../../../src/core/integration.js';
import type { ParsedTypeDefinitionDocument } from '../../../src/core/parser.js';
import {
  buildCreatedDocumentCandidate,
  createTypePickerItems,
  defaultOutputPath,
  evaluateDiscoveryHealth,
  serializeDocument,
  validateOutputPath,
} from '../../../src/integration/obsidian/create-flow.js';
import type { ObsidianTypeRegistryState } from '../../../src/integration/obsidian/discovery.js';
import { ObsidianBasenameIndex } from '../../../src/integration/obsidian/lookup.js';
import { DEFAULT_OBSIDIAN_PLUGIN_SETTINGS } from '../../../src/integration/obsidian/settings.js';

vi.mock('obsidian', () => {
  class FuzzySuggestModal<T> {
    setPlaceholder(_placeholder: string): void {}
    open(): void {}
    getItems(): T[] {
      return [];
    }
    getItemText(_item: T): string {
      return '';
    }
    renderSuggestion(_item: T, _el: HTMLElement): void {}
    onChooseItem(_item: T): void {}
    onClose(): void {}
  }

  class Modal {
    contentEl = {
      empty: () => undefined,
      createEl: () => ({ onClickEvent: () => undefined, setText: () => undefined }),
      createDiv: () => ({ createEl: () => ({ onClickEvent: () => undefined }) }),
    };
    open(): void {}
    close(): void {}
  }

  class Setting {
    setName(): this {
      return this;
    }
    addText(): this {
      return this;
    }
  }

  return {
    FuzzySuggestModal,
    MarkdownView: class MarkdownView {},
    Modal,
    Notice: class Notice {},
    Setting,
    TFile: class TFile {},
    TFolder: class TFolder {},
    normalizePath: (path: string) =>
      path.replaceAll('\\', '/').replace(/\/+/g, '/').replace(/^\.\//, '').replace(/\/$/, ''),
  };
});

type FakeFile = {
  path: string;
  extension: string;
};

type FakeApp = Parameters<typeof validateOutputPath>[0];

describe('evaluateDiscoveryHealth', () => {
  it('blocks create when discovery has dirty state', () => {
    expect(
      evaluateDiscoveryHealth({
        ...registryState([]),
        ingestionDiagnostics: [{ path: 'types/A.md', stage: 'read', reason: 'denied' }],
        typeParseFailures: [{ path: 'types/B.md', errors: [] }],
        ambiguousNames: [{ name: 'concept', candidates: [conceptType(), conceptType('x')] }],
      }),
    ).toEqual({
      ok: false,
      reasons: ['1 ingestion diagnostic(s)', '1 type parse failure(s)', '1 ambiguous type name(s)'],
    });
  });
});

describe('createTypePickerItems', () => {
  it('returns sorted unique type choices and excludes ambiguous names', () => {
    const state = registryState([sourceType(), conceptType(), conceptType('other')]);
    state.ambiguousNames = [{ name: 'concept', candidates: [conceptType(), conceptType('other')] }];

    expect(createTypePickerItems(state)).toEqual([
      {
        typeDef: sourceType(),
        title: 'source',
        subtitle: 'types/Source.md',
      },
    ]);
  });
});

describe('validateOutputPath', () => {
  it('accepts vault-relative Markdown paths', () => {
    expect(validateOutputPath(fakeApp([]), ' notes/New.md ')).toEqual({
      ok: true,
      path: 'notes/New.md',
    });
  });

  it('rejects paths that cannot be created safely', () => {
    const app = fakeApp([{ path: 'notes/Existing.md', extension: 'md' }]);

    expect(validateOutputPath(app, '/tmp/out.md')).toMatchObject({ ok: false });
    expect(validateOutputPath(app, '../out.md')).toMatchObject({ ok: false });
    expect(validateOutputPath(app, 'notes/out.txt')).toMatchObject({ ok: false });
    expect(validateOutputPath(app, 'notes/Existing.md')).toEqual({
      ok: false,
      reason: 'A file already exists at that path.',
    });
  });
});

describe('buildCreatedDocumentCandidate', () => {
  it('serializes frontmatter, scaffolds defaults, templates the body, and validates', () => {
    const typeDef = conceptType();
    const candidate = buildCreatedDocumentCandidate({
      app: fakeApp([]),
      basenameIndex: new ObsidianBasenameIndex(),
      outputPath: 'notes/Untitled.md',
      registryState: registryState([typeDef]),
      settings: DEFAULT_OBSIDIAN_PLUGIN_SETTINGS,
      typeDef,
    });

    expect(candidate.document).toEqual({
      path: 'notes/Untitled.md',
      frontmatter: {
        _type: '[[Concept]]',
        title: 'Untitled',
      },
      body: '## Notes\n',
    });
    expect(candidate.contents).toBe(`---
_type: "[[Concept]]"
title: Untitled
---

## Notes
`);
    expect(candidate.frontmatterEndOffset).toBe(
      `---
_type: "[[Concept]]"
title: Untitled
---
`.length,
    );
    expect(candidate.validation.errors).toEqual([]);
  });
});

describe('serializeDocument', () => {
  it('writes frontmatter-only documents when the template body is empty', () => {
    expect(serializeDocument({ _type: '[[Concept]]' }, '')).toBe(`---
_type: "[[Concept]]"
---
`);
  });
});

describe('defaultOutputPath', () => {
  it('prefills Untitled.md inside the selected folder', () => {
    expect(defaultOutputPath('notes')).toBe('notes/Untitled.md');
    expect(defaultOutputPath('')).toBe('Untitled.md');
    expect(defaultOutputPath('/')).toBe('Untitled.md');
  });
});

function fakeApp(files: FakeFile[]): FakeApp {
  return {
    vault: {
      getAbstractFileByPath: (path: string) => files.find((file) => file.path === path) ?? null,
      getMarkdownFiles: () => files,
      read: async () => '',
      on: () => ({}),
    },
    metadataCache: {
      getFileCache: () => null,
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

function registryState(parsedTypes: ParsedTypeDefinitionDocument[]): ObsidianTypeRegistryState {
  return {
    markdownPaths: [],
    typeCandidatePaths: parsedTypes.map((typeDef) => typeDef.id),
    parsedTypes,
    typeParseFailures: [],
    ingestionDiagnostics: [],
    ambiguousNames: [],
    typeRegistry: registryWithTypes(parsedTypes),
  };
}

function registryWithTypes(typeDefs: ParsedTypeDefinitionDocument[]): TypeRegistry {
  return {
    getByName: (typeName) => {
      const typeDef = typeDefs.find((candidate) => candidate.name === typeName.toLowerCase());
      return typeDef === undefined
        ? { kind: 'not-found', typeName: typeName.toLowerCase() }
        : { kind: 'found', typeDef };
    },
    getByDeclaration: (value) => {
      if (typeof value !== 'string') return { kind: 'invalid-declaration', value };
      const typeName = value.replace(/^\[\[/, '').replace(/\]\]$/, '').toLowerCase();
      const typeDef = typeDefs.find((candidate) => candidate.name === typeName);
      return typeDef === undefined ? { kind: 'not-found', typeName } : { kind: 'found', typeDef };
    },
  };
}

function conceptType(idPrefix = 'types'): ParsedTypeDefinitionDocument {
  return {
    id: `${idPrefix}/Concept.md`,
    name: 'concept',
    schema: {
      properties: {
        title: { type: 'text', required: true, default: 'Untitled' },
      },
    },
    templateBlock: {
      body: '## Notes\n',
      sections: [{ level: 2, heading: 'Notes', required: false, defaultContent: '' }],
    },
  };
}

function sourceType(): ParsedTypeDefinitionDocument {
  return {
    id: 'types/Source.md',
    name: 'source',
    schema: { properties: {} },
  };
}
