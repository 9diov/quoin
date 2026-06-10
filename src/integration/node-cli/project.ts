import type { ParsedTypeDefinitionDocument } from '../../core/parser.js';
import type { Resolver, TypeRegistry } from '../../core/integration.js';

import type { EffectiveConfig } from './config.js';
import {
  discoverMarkdownFiles,
  ingestMarkdownFiles,
  isTypeDefinitionCandidate,
  type IngestedMarkdown,
} from './ingestion.js';
import {
  createResolver,
  createTypeRegistry,
  parseTypeCandidates,
  type ParseFailure,
} from './lookup.js';

export type IngestedDocument = Extract<IngestedMarkdown, { kind: 'document' }>;
export type IngestFailure = Extract<
  IngestedMarkdown,
  { kind: 'ingest-failure' }
>;

/**
 * The full project-scoped Markdown universe, built once per command run.
 *
 * Discovery is always project-wide (D5): every command discovers, ingests, and
 * indexes the entire universe even when its later work targets a single file.
 */
export type ProjectUniverse = {
  ingestedDocs: IngestedDocument[];
  ingestFailures: IngestFailure[];
  parsedTypes: ParsedTypeDefinitionDocument[];
  typeParseFailures: ParseFailure[];
  /** Paths of every Type Definition candidate, parsed or broken. */
  typeCandidatePaths: string[];
  typeRegistry: TypeRegistry;
  resolver: Resolver;
};

export async function buildProjectUniverse(
  config: EffectiveConfig,
): Promise<ProjectUniverse> {
  const allPaths = await discoverMarkdownFiles(
    config.root,
    config.include,
    config.exclude,
  );

  const ingestionResults = await ingestMarkdownFiles(config.root, allPaths);

  const ingestedDocs: IngestedDocument[] = [];
  const ingestFailures: IngestFailure[] = [];
  for (const result of ingestionResults) {
    if (result.kind === 'ingest-failure') {
      ingestFailures.push(result);
    } else {
      ingestedDocs.push(result);
    }
  }

  const candidateDocs = ingestedDocs.filter((d) =>
    isTypeDefinitionCandidate(d.document, config.typeDeclarationKey),
  );

  const { parsed, failures } = parseTypeCandidates(
    candidateDocs.map((d) => ({ path: d.path, raw: d.raw })),
    {
      typeDeclarationKey: config.typeDeclarationKey,
      allowedUrlSchemes: config.allowedUrlSchemes,
    },
  );

  const typeRegistry = createTypeRegistry(parsed, failures);
  const resolver = createResolver([...ingestedDocs, ...ingestFailures]);

  const typeCandidatePaths = candidateDocs.map((d) => d.path).sort();

  return {
    ingestedDocs,
    ingestFailures,
    parsedTypes: parsed,
    typeParseFailures: failures,
    typeCandidatePaths,
    typeRegistry,
    resolver,
  };
}
