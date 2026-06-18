import type { App, Plugin, TAbstractFile, TFile } from 'obsidian';

import type {
  ResolveDocReferenceInput,
  ResolveDocReferenceResult,
  Resolver,
} from '../../core/integration.js';
import { parseMarkdownLink } from '../../core/link-grammar.js';
import type { DocRefFormat } from '../../core/parser.js';
import type { Document } from '../../core/types.js';
import { type EffectiveTypeDeclaration, resolveEffectiveTypeDeclaration } from './bindings.js';

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

function detectFormat(value: string): DocRefFormat | null {
  if (value.startsWith('[[') && value.endsWith(']]')) return 'wiki-link';
  if (parseMarkdownLink(value) !== null) return 'markdown-link';
  return null;
}

export function createObsidianResolver(app: App, basenameIndex: ObsidianBasenameIndex): Resolver {
  const resolveWikiLink = (input: ResolveDocReferenceInput): ResolveDocReferenceResult => {
    const linkpath = extractWikiLinkTarget(input.value);
    if (linkpath === null) {
      return {
        kind: 'invalid-link',
        value: input.value,
        format: 'wiki-link',
        reason: 'Wiki Link must be in the form [[Target]]',
      };
    }

    const basenameCandidates = basenameIndex.candidatesForLinkpath(linkpath);
    if (basenameCandidates.length > 1) {
      return {
        kind: 'ambiguous',
        value: input.value,
        format: 'wiki-link',
        candidates: basenameCandidates.map((path) => documentFromCache(app, path)),
      };
    }

    const destination = app.metadataCache.getFirstLinkpathDest(linkpath, input.sourceDocumentPath);
    if (destination === null) {
      return { kind: 'not-found', value: input.value, format: 'wiki-link' };
    }

    return {
      kind: 'found',
      document: documentFromFileCache(app, destination),
    };
  };

  const resolveMarkdownLink = (input: ResolveDocReferenceInput): ResolveDocReferenceResult => {
    // Delegate to Obsidian's own internal-link resolver so Quoin sees the
    // same target the editor, link preview, and graph view see. The Core
    // grammar rejects protocol-qualified targets at shape validation, so
    // only internal targets reach here.
    const parts = parseMarkdownLink(input.value);
    if (parts === null) {
      return {
        kind: 'invalid-link',
        value: input.value,
        format: 'markdown-link',
        reason: 'Markdown link must be in the form [label](target)',
      };
    }

    const stripped = stripFragment(parts.target);
    if (stripped.length === 0) {
      return {
        kind: 'invalid-link',
        value: input.value,
        format: 'markdown-link',
        reason: 'Markdown link target is empty',
      };
    }

    const linkpath = safeDecodeURI(stripped);
    const destination = app.metadataCache.getFirstLinkpathDest(linkpath, input.sourceDocumentPath);
    if (destination === null || destination.extension !== 'md') {
      return { kind: 'not-found', value: input.value, format: 'markdown-link' };
    }

    return {
      kind: 'found',
      document: documentFromFileCache(app, destination),
    };
  };

  return (input: ResolveDocReferenceInput): ResolveDocReferenceResult => {
    const format = input.format ?? detectFormat(input.value);
    if (format === 'wiki-link') return resolveWikiLink(input);
    if (format === 'markdown-link') return resolveMarkdownLink(input);
    return {
      kind: 'invalid-link',
      value: input.value,
      format: 'wiki-link',
      reason: 'Value is not a recognized document-reference syntax',
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

function stripFragment(target: string): string {
  const hash = target.indexOf('#');
  return hash === -1 ? target : target.slice(0, hash);
}

function safeDecodeURI(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
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
