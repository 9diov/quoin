import type { ParsedTypeDefinitionDocument } from './parser.js';

export type ScaffoldingResult = {
  properties: Record<string, unknown>;
};

export function scaffold(
  _frontmatter: Record<string, unknown>,
  _typeDef: ParsedTypeDefinitionDocument,
): ScaffoldingResult {
  throw new Error('not implemented');
}
