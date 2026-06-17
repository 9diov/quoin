import type { App, Plugin, TAbstractFile, TFile } from 'obsidian';

import type { Resolver } from '../../core/integration.js';
import type { Document } from '../../core/types.js';
import {
  type EffectiveTypeDeclaration,
  resolveEffectiveTypeDeclaration,
} from '../node-cli/bindings.js';

import type { ObsidianPluginSettings } from './settings.js';

export type ObsidianBasenameIndexSnapshot = {
  entries: { basename: string; paths: string[] }[];
};

export class ObsidianBasenameIndex {
  private readonly pathsByBasename = new Map<string, Set<string>>();
  private readonly basenamesByPath = new Map<string, string>();

  rebuild(files: TFile[]): void {
    this.pathsByBasename.clear();
    this.basenamesByPath.clear();

    for (const file of files) {
      this.addFile(file);
    }
  }

  addFile(file: TFile): void {
    if (file.extension !== 'md') return;
    this.removePath(file.path);

    const basename = basenameWithoutExtension(file.path).toLowerCase();
    const paths = this.pathsByBasename.get(basename) ?? new Set<string>();
    paths.add(file.path);
    this.pathsByBasename.set(basename, paths);
    this.basenamesByPath.set(file.path, basename);
  }

  renameFile(file: TFile, oldPath: string): void {
    this.removePath(oldPath);
    this.addFile(file);
  }

  deleteFile(file: TAbstractFile): void {
    this.removePath(file.path);
  }

  candidatesForLinkpath(linkpath: string): string[] {
    const basename = basenameWithoutExtension(linkpath).toLowerCase();
    return [...(this.pathsByBasename.get(basename) ?? [])].sort();
  }

  getSnapshot(): ObsidianBasenameIndexSnapshot {
    return {
      entries: [...this.pathsByBasename.entries()]
        .map(([basename, paths]) => ({ basename, paths: [...paths].sort() }))
        .sort((a, b) => a.basename.localeCompare(b.basename)),
    };
  }

  private removePath(path: string): void {
    const basename = this.basenamesByPath.get(path);
    if (basename === undefined) return;

    const paths = this.pathsByBasename.get(basename);
    paths?.delete(path);
    if (paths?.size === 0) {
      this.pathsByBasename.delete(basename);
    }
    this.basenamesByPath.delete(path);
  }
}

export function createObsidianResolver(
  app: App,
  basenameIndex: ObsidianBasenameIndex,
  sourcePath: string,
): Resolver {
  return (wikiLink) => {
    const linkpath = extractWikiLinkTarget(wikiLink);
    if (linkpath === null) {
      return {
        kind: 'invalid-link',
        wikiLink,
        reason: 'Wiki Link must be in the form [[Target]]',
      };
    }

    const basenameCandidates = basenameIndex.candidatesForLinkpath(linkpath);
    if (basenameCandidates.length > 1) {
      return {
        kind: 'ambiguous',
        wikiLink,
        candidates: basenameCandidates.map((path) => documentFromCache(app, path)),
      };
    }

    const destination = app.metadataCache.getFirstLinkpathDest(linkpath, sourcePath);
    if (destination === null) {
      return { kind: 'not-found', wikiLink };
    }

    return {
      kind: 'found',
      document: documentFromFileCache(app, destination),
    };
  };
}

export function resolveObsidianEffectiveTypeDeclaration(
  document: Document,
  rootRelativePath: string,
  settings: Pick<ObsidianPluginSettings, 'bindings' | 'typeDeclarationKey'>,
): EffectiveTypeDeclaration {
  if (document.frontmatter[settings.typeDeclarationKey] === 'type') {
    return { kind: 'frontmatter', value: 'type' };
  }

  return resolveEffectiveTypeDeclaration(
    document,
    rootRelativePath,
    settings.bindings,
    settings.typeDeclarationKey,
  );
}

export function registerObsidianBasenameIndexEvents(
  plugin: Plugin,
  basenameIndex: ObsidianBasenameIndex,
): void {
  plugin.app.workspace.onLayoutReady(() => {
    basenameIndex.rebuild(plugin.app.vault.getMarkdownFiles());
  });

  plugin.registerEvent(
    plugin.app.vault.on('create', (file) => {
      if (isTFile(file)) {
        basenameIndex.addFile(file);
      }
    }),
  );

  plugin.registerEvent(
    plugin.app.vault.on('rename', (file, oldPath) => {
      if (isTFile(file)) {
        basenameIndex.renameFile(file, oldPath);
      } else {
        basenameIndex.deleteFile({ path: oldPath });
      }
    }),
  );

  plugin.registerEvent(
    plugin.app.vault.on('delete', (file) => {
      basenameIndex.deleteFile(file);
    }),
  );
}

function documentFromFileCache(app: App, file: TFile): Document {
  const cachedFrontmatter = app.metadataCache.getFileCache(file)?.frontmatter;
  return {
    path: file.path,
    frontmatter: isRecord(cachedFrontmatter) ? cachedFrontmatter : {},
    body: '',
  };
}

function documentFromCache(app: App, path: string): Document {
  const file = app.vault.getMarkdownFiles().find((candidate) => candidate.path === path);
  if (file !== undefined) {
    return documentFromFileCache(app, file);
  }

  return {
    path,
    frontmatter: {},
    body: '',
  };
}

function extractWikiLinkTarget(wikiLink: string): string | null {
  if (!wikiLink.startsWith('[[') || !wikiLink.endsWith(']]')) return null;

  const inner = wikiLink.slice(2, -2);
  if (inner.length === 0) return null;

  const hashIdx = inner.indexOf('#');
  const pipeIdx = inner.indexOf('|');
  const targetEnd =
    hashIdx === -1 && pipeIdx === -1
      ? inner.length
      : hashIdx === -1
        ? pipeIdx
        : pipeIdx === -1
          ? hashIdx
          : Math.min(hashIdx, pipeIdx);

  const target = inner.slice(0, targetEnd);
  if (target.length === 0 || target.includes('[') || target.includes(']')) return null;

  return target;
}

function basenameWithoutExtension(path: string): string {
  const normalized = path.replaceAll('\\', '/');
  const lastSlash = normalized.lastIndexOf('/');
  const filename = lastSlash === -1 ? normalized : normalized.slice(lastSlash + 1);
  const dot = filename.lastIndexOf('.');
  return dot <= 0 ? filename : filename.slice(0, dot);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isTFile(file: TAbstractFile): file is TFile {
  return 'extension' in file && file.extension === 'md';
}
