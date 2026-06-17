import { describe, expect, it } from 'vitest';

import {
  createPlaceholderBinding,
  DEFAULT_OBSIDIAN_PLUGIN_SETTINGS,
  normalizeObsidianPluginSettings,
  type ObsidianPluginSettings,
  updateBinding,
  validateObsidianPluginSettings,
} from '../../../src/integration/obsidian/settings.js';

describe('normalizeObsidianPluginSettings', () => {
  it('returns the documented defaults for missing saved data', () => {
    expect(normalizeObsidianPluginSettings(undefined)).toEqual({
      typeDeclarationKey: '_type',
      allowedUrlSchemes: ['http', 'https', 'mailto'],
      untypedDocumentBehavior: 'skip',
      referentialValidation: true,
      debounce: {
        activeFile: 300,
        typeDefCascade: 1500,
      },
      bindings: [],
    });
  });

  it('merge-loads valid saved values over defaults', () => {
    const result = normalizeObsidianPluginSettings({
      typeDeclarationKey: 'kind',
      allowedUrlSchemes: ['https'],
      untypedDocumentBehavior: 'warn',
      referentialValidation: false,
      debounce: {
        activeFile: 100,
      },
      bindings: [{ type: 'concept', match: 'concepts/**/*.md' }],
    });

    expect(result).toEqual({
      typeDeclarationKey: 'kind',
      allowedUrlSchemes: ['https'],
      untypedDocumentBehavior: 'warn',
      referentialValidation: false,
      debounce: {
        activeFile: 100,
        typeDefCascade: 1500,
      },
      bindings: [{ type: 'concept', match: 'concepts/**/*.md' }],
    });
  });

  it('preserves deliberately empty allowed URL schemes', () => {
    const result = normalizeObsidianPluginSettings({
      allowedUrlSchemes: [],
    });

    expect(result.allowedUrlSchemes).toEqual([]);
  });

  it('ignores malformed saved values without throwing', () => {
    const result = normalizeObsidianPluginSettings({
      typeDeclarationKey: 12,
      allowedUrlSchemes: ['https', 4, null],
      untypedDocumentBehavior: 'loud',
      referentialValidation: 'yes',
      debounce: {
        activeFile: Number.NaN,
        typeDefCascade: 2000,
      },
      bindings: [{ type: 'concept', match: 'concepts/**/*.md' }, { type: 'bad' }, null],
    });

    expect(result).toEqual({
      typeDeclarationKey: '_type',
      allowedUrlSchemes: ['https'],
      untypedDocumentBehavior: 'skip',
      referentialValidation: true,
      debounce: {
        activeFile: 300,
        typeDefCascade: 2000,
      },
      bindings: [{ type: 'concept', match: 'concepts/**/*.md' }],
    });
  });
});

describe('binding settings helpers', () => {
  it('preserves prior edits when updating a second field on the same row', () => {
    const settings = normalizeObsidianPluginSettings({
      bindings: [{ type: 'note', match: '**/*.md' }],
    });

    updateBinding(settings, 0, { type: 'page' });
    updateBinding(settings, 0, { match: 'docs/**' });

    expect(settings.bindings).toEqual([{ type: 'page', match: 'docs/**' }]);
  });

  it('creates a valid unique placeholder binding', () => {
    const existing = [
      { type: 'new-binding', match: 'new-binding/**/*.md' },
      { type: 'new-binding-2', match: 'new-binding-2/**/*.md' },
    ];

    const binding = createPlaceholderBinding(existing);

    expect(binding).toEqual({
      type: 'new-binding-3',
      match: 'new-binding-3/**/*.md',
    });
    expect(
      validateObsidianPluginSettings({
        ...DEFAULT_OBSIDIAN_PLUGIN_SETTINGS,
        bindings: [...existing, binding],
      }),
    ).toEqual([]);
  });
});

describe('validateObsidianPluginSettings', () => {
  function withSettings(override: Partial<ObsidianPluginSettings>): ObsidianPluginSettings {
    const { debounce, bindings, ...rest } = override;

    return {
      ...DEFAULT_OBSIDIAN_PLUGIN_SETTINGS,
      ...rest,
      debounce: {
        ...DEFAULT_OBSIDIAN_PLUGIN_SETTINGS.debounce,
        ...debounce,
      },
      bindings: bindings ?? DEFAULT_OBSIDIAN_PLUGIN_SETTINGS.bindings,
    };
  }

  it('accepts default settings', () => {
    expect(validateObsidianPluginSettings(DEFAULT_OBSIDIAN_PLUGIN_SETTINGS)).toEqual([]);
  });

  it('blocks empty binding matches before save', () => {
    const issues = validateObsidianPluginSettings(
      withSettings({
        bindings: [{ type: 'concept', match: '  ' }],
      }),
    );

    expect(issues).toContainEqual({
      path: 'bindings[0].match',
      message: 'Binding match must not be empty.',
      severity: 'error',
    });
  });

  it('blocks binding matches that escape the vault root after normalization', () => {
    const issues = validateObsidianPluginSettings(
      withSettings({
        bindings: [{ type: 'concept', match: '../outside/**/*.md' }],
      }),
    );

    expect(issues).toContainEqual({
      path: 'bindings[0].match',
      message: 'Binding match must stay inside the vault root.',
      severity: 'error',
    });
  });

  it('blocks duplicate binding rows before save', () => {
    const issues = validateObsidianPluginSettings(
      withSettings({
        bindings: [
          { type: 'concept', match: 'concepts/**/*.md' },
          { type: 'concept', match: 'concepts/**/*.md' },
        ],
      }),
    );

    expect(issues).toContainEqual({
      path: 'bindings[1]',
      message: 'Binding duplicates an earlier row.',
      severity: 'error',
    });
  });

  it('reports unknown binding types as non-blocking warnings when known types are supplied', () => {
    const issues = validateObsidianPluginSettings(
      withSettings({
        bindings: [{ type: 'missing-type', match: 'notes/**/*.md' }],
      }),
      ['concept'],
    );

    expect(issues).toContainEqual({
      path: 'bindings[0].type',
      message: 'Binding references unknown type "missing-type".',
      severity: 'warning',
    });
  });

  it('blocks invalid scalar settings', () => {
    const issues = validateObsidianPluginSettings(
      withSettings({
        typeDeclarationKey: '',
        allowedUrlSchemes: ['https', ''],
        debounce: {
          activeFile: -1,
          typeDefCascade: -1,
        },
      }),
    );

    expect(issues.map((issue) => [issue.path, issue.severity])).toEqual([
      ['typeDeclarationKey', 'error'],
      ['allowedUrlSchemes[1]', 'error'],
      ['debounce.activeFile', 'error'],
      ['debounce.typeDefCascade', 'error'],
    ]);
  });
});
