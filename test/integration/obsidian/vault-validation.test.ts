import type { TFile } from 'obsidian';
import { describe, expect, it } from 'vitest';

import { enumerateVaultValidationTargets } from '../../../src/integration/obsidian/vault-validation.js';

type FakeFile = {
  path: string;
  extension: string;
};

describe('enumerateVaultValidationTargets', () => {
  it('returns regular Markdown documents sorted by path and excludes type candidates', () => {
    const targets = enumerateVaultValidationTargets(
      [
        fakeFile('z-last.md'),
        fakeFile('types/Concept.md'),
        fakeFile('asset.png', 'png'),
        fakeFile('a-first.md'),
        fakeFile('types/Broken.md'),
      ] as TFile[],
      ['types/Broken.md', 'types/Concept.md'],
    );

    expect(targets.map((file) => file.path)).toEqual(['a-first.md', 'z-last.md']);
  });
});

function fakeFile(path: string, extension = 'md'): FakeFile {
  return { path, extension };
}
