import type { App, Plugin, TAbstractFile, TFile } from 'obsidian';

import type { TypeRegistry } from '../../core/integration.js';
import type {
  ParsedTypeDefinitionDocument,
  ParseError,
  TypeDefinitionDocumentIdentity,
} from '../../core/parser.js';
import { parseTypeDefinitionDocument } from '../../core/parser.js';

import type { ObsidianPluginSettings } from './settings.js';

export type ObsidianTypeParseFailure = {
  path: string;
  errors: ParseError[];
};

export type ObsidianIngestionDiagnostic = {
  path: string;
  stage: 'frontmatter' | 'read';
  reason: string;
};

export type ObsidianTypeRegistryState = {
  markdownPaths: string[];
  typeCandidatePaths: string[];
  parsedTypes: ParsedTypeDefinitionDocument[];
  typeParseFailures: ObsidianTypeParseFailure[];
  ingestionDiagnostics: ObsidianIngestionDiagnostic[];
  ambiguousNames: { name: string; candidates: ParsedTypeDefinitionDocument[] }[];
  typeRegistry: TypeRegistry;
};

export type CandidateInspection =
  | { kind: 'not-candidate' }
  | { kind: 'candidate' }
  | { kind: 'diagnostic'; diagnostic: ObsidianIngestionDiagnostic };

export class ObsidianVaultTypeRegistry {
  private readonly filesByPath = new Map<string, TFile>();
  private readonly candidatePaths = new Set<string>();
  private readonly parsedById = new Map<string, ParsedTypeDefinitionDocument>();
  private readonly parseFailuresByPath = new Map<string, ObsidianTypeParseFailure>();
  private readonly diagnosticsByPath = new Map<string, ObsidianIngestionDiagnostic>();

  constructor(
    private readonly app: App,
    private readonly getSettings: () => ObsidianPluginSettings,
  ) {}

  async rebuild(): Promise<void> {
    this.filesByPath.clear();
    this.candidatePaths.clear();
    this.parsedById.clear();
    this.parseFailuresByPath.clear();
    this.diagnosticsByPath.clear();

    const files = [...this.app.vault.getMarkdownFiles()].sort(compareFilesByPath);
    for (const file of files) {
      await this.indexFile(file);
    }
  }

  async refreshFile(file: TFile): Promise<void> {
    if (file.extension !== 'md') return;
    this.removePath(file.path);
    await this.indexFile(file);
  }

  async renameFile(file: TFile, oldPath: string): Promise<void> {
    this.removePath(oldPath);
    await this.refreshFile(file);
  }

  deleteFile(file: TAbstractFile): void {
    this.removePath(file.path);
  }

  getState(): ObsidianTypeRegistryState {
    const parsedTypes = [...this.parsedById.values()].sort(compareTypeDefsById);
    const typeParseFailures = [...this.parseFailuresByPath.values()].sort(compareFailuresByPath);
    const ingestionDiagnostics = [...this.diagnosticsByPath.values()].sort(
      compareDiagnosticsByPath,
    );
    const byName = groupTypeDefsByName(parsedTypes);

    return {
      markdownPaths: [...this.filesByPath.keys()].sort(),
      typeCandidatePaths: [...this.candidatePaths].sort(),
      parsedTypes,
      typeParseFailures,
      ingestionDiagnostics,
      ambiguousNames: [...byName.entries()]
        .filter(([, candidates]) => candidates.length > 1)
        .map(([name, candidates]) => ({ name, candidates }))
        .sort((a, b) => a.name.localeCompare(b.name)),
      typeRegistry: createObsidianTypeRegistry(parsedTypes, typeParseFailures),
    };
  }

  private async indexFile(file: TFile): Promise<void> {
    this.filesByPath.set(file.path, file);

    const inspection = inspectTypeDefinitionCandidate(
      file.path,
      this.app.metadataCache.getFileCache(file)?.frontmatter,
      this.getSettings().typeDeclarationKey,
    );

    if (inspection.kind === 'not-candidate') return;

    if (inspection.kind === 'diagnostic') {
      this.diagnosticsByPath.set(file.path, inspection.diagnostic);
      return;
    }

    this.candidatePaths.add(file.path);

    let raw: string;
    try {
      raw = await this.app.vault.read(file);
    } catch (error) {
      this.diagnosticsByPath.set(file.path, {
        path: file.path,
        stage: 'read',
        reason: error instanceof Error ? error.message : 'Unknown read error',
      });
      return;
    }

    const result = parseTypeDefinitionDocument(raw, deriveObsidianTypeIdentity(file.path), {
      typeDeclarationKey: this.getSettings().typeDeclarationKey,
      allowedUrlSchemes: this.getSettings().allowedUrlSchemes,
    });

    if (result.kind === 'ok') {
      this.parsedById.set(result.typeDef.id, result.typeDef);
      return;
    }

    this.parseFailuresByPath.set(file.path, {
      path: file.path,
      errors: result.errors,
    });
  }

  private removePath(path: string): void {
    this.filesByPath.delete(path);
    this.candidatePaths.delete(path);
    this.parsedById.delete(path);
    this.parseFailuresByPath.delete(path);
    this.diagnosticsByPath.delete(path);
  }
}

export function registerObsidianTypeRegistryEvents(
  plugin: Plugin,
  registry: ObsidianVaultTypeRegistry,
): void {
  let layoutReady = false;
  let metadataResolved = false;
  let initialDiscoveryStarted = false;

  const maybeStartInitialDiscovery = (): void => {
    if (!layoutReady || !metadataResolved || initialDiscoveryStarted) return;
    initialDiscoveryStarted = true;
    void registry.rebuild();
  };

  plugin.app.workspace.onLayoutReady(() => {
    layoutReady = true;
    maybeStartInitialDiscovery();
  });

  plugin.registerEvent(
    plugin.app.metadataCache.on('resolved', () => {
      metadataResolved = true;
      maybeStartInitialDiscovery();
    }),
  );

  plugin.registerEvent(
    plugin.app.metadataCache.on('changed', (file) => {
      void registry.refreshFile(file);
    }),
  );

  plugin.registerEvent(
    plugin.app.vault.on('create', (file) => {
      if (isTFile(file)) {
        void registry.refreshFile(file);
      }
    }),
  );

  plugin.registerEvent(
    plugin.app.vault.on('rename', (file, oldPath) => {
      if (isTFile(file)) {
        void registry.renameFile(file, oldPath);
      } else {
        registry.deleteFile({ path: oldPath });
      }
    }),
  );

  plugin.registerEvent(
    plugin.app.vault.on('delete', (file) => {
      registry.deleteFile(file);
    }),
  );
}

export function deriveObsidianTypeIdentity(path: string): TypeDefinitionDocumentIdentity {
  return {
    id: path,
    name: basenameWithoutExtension(path).toLowerCase(),
  };
}

export function inspectTypeDefinitionCandidate(
  path: string,
  frontmatter: unknown,
  typeDeclarationKey: string,
): CandidateInspection {
  if (frontmatter === undefined) return { kind: 'not-candidate' };

  if (!isRecord(frontmatter)) {
    return {
      kind: 'diagnostic',
      diagnostic: {
        path,
        stage: 'frontmatter',
        reason: 'Frontmatter must be a mapping when present.',
      },
    };
  }

  return frontmatter[typeDeclarationKey] === 'type'
    ? { kind: 'candidate' }
    : { kind: 'not-candidate' };
}

function createObsidianTypeRegistry(
  parsedTypeDefs: ParsedTypeDefinitionDocument[],
  parseFailures: ObsidianTypeParseFailure[],
): TypeRegistry {
  const byName = groupTypeDefsByName(parsedTypeDefs);
  const failedByName = new Map<string, string>();

  for (const failure of parseFailures) {
    const name = deriveObsidianTypeIdentity(failure.path).name;
    if (!failedByName.has(name)) {
      failedByName.set(name, `Parse failed: ${failure.errors.length} error(s)`);
    }
  }

  const lookupByName = (typeName: string) => {
    const name = typeName.toLowerCase();
    const candidates = byName.get(name) ?? [];

    if (candidates.length > 1) {
      return { kind: 'ambiguous' as const, typeName: name, candidates };
    }

    const typeDef = candidates[0];
    if (typeDef !== undefined) {
      return { kind: 'found' as const, typeDef };
    }

    const failureReason = failedByName.get(name);
    if (failureReason !== undefined) {
      return { kind: 'unavailable' as const, reason: failureReason };
    }

    return { kind: 'not-found' as const, typeName: name };
  };

  return {
    getByName(typeName) {
      return lookupByName(typeName);
    },
    getByDeclaration(value) {
      if (value === undefined || value === null) {
        return { kind: 'missing-declaration' };
      }

      if (value === 'type') {
        return lookupByName('type');
      }

      if (typeof value !== 'string') {
        return { kind: 'invalid-declaration', value };
      }

      const target = extractWikiLinkTarget(value);
      if (target === null) {
        return { kind: 'invalid-declaration', value };
      }

      return lookupByName(target);
    },
  };
}

function groupTypeDefsByName(
  typeDefs: ParsedTypeDefinitionDocument[],
): Map<string, ParsedTypeDefinitionDocument[]> {
  const byName = new Map<string, ParsedTypeDefinitionDocument[]>();

  for (const typeDef of typeDefs) {
    const existing = byName.get(typeDef.name) ?? [];
    byName.set(typeDef.name, [...existing, typeDef]);
  }

  return byName;
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

  return basenameWithoutExtension(target).toLowerCase();
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

function compareFilesByPath(a: TFile, b: TFile): number {
  return a.path.localeCompare(b.path);
}

function compareTypeDefsById(
  a: ParsedTypeDefinitionDocument,
  b: ParsedTypeDefinitionDocument,
): number {
  return a.id.localeCompare(b.id);
}

function compareFailuresByPath(a: ObsidianTypeParseFailure, b: ObsidianTypeParseFailure): number {
  return a.path.localeCompare(b.path);
}

function compareDiagnosticsByPath(
  a: ObsidianIngestionDiagnostic,
  b: ObsidianIngestionDiagnostic,
): number {
  return a.path.localeCompare(b.path);
}
