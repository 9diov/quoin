import type { TFile } from 'obsidian';

export function enumerateVaultValidationTargets(
  files: TFile[],
  typeCandidatePaths: string[],
): TFile[] {
  const typeCandidates = new Set(typeCandidatePaths);

  return files
    .filter((file) => file.extension === 'md' && !typeCandidates.has(file.path))
    .sort((a, b) => a.path.localeCompare(b.path));
}
