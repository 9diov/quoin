import type { ParsedTypeDefinitionDocument, ParseError, ParserConfig } from '../../core/parser.js';
import { parseTypeDefinitionDocument } from '../../core/parser.js';

import { deriveTypeIdentity } from './type-registry.js';

export type ParseFailure = {
  path: string;
  errors: ParseError[];
};

export function parseTypeCandidates(
  candidates: { path: string; raw: string }[],
  parserConfig: ParserConfig,
): {
  parsed: ParsedTypeDefinitionDocument[];
  failures: ParseFailure[];
} {
  const parsed: ParsedTypeDefinitionDocument[] = [];
  const failures: ParseFailure[] = [];

  for (const candidate of candidates) {
    const identity = deriveTypeIdentity(candidate.path);
    const result = parseTypeDefinitionDocument(candidate.raw, identity, parserConfig);

    if (result.kind === 'ok') {
      parsed.push(result.typeDef);
    } else {
      failures.push({ path: candidate.path, errors: result.errors });
    }
  }

  return { parsed, failures };
}
