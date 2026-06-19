/**
 * @quoin-terms Body Generation, Body Generation Result, Body Block, Type Definition Document
 * @quoin-docs docs/design/D2-type-and-schema-contracts.md
 */

import type { ParsedTypeDefinitionDocument } from './parser.js';

export type BodyGenerationResult = {
  body: string;
};

export function generateBody(typeDef: ParsedTypeDefinitionDocument): BodyGenerationResult {
  if (!typeDef.bodyBlock) {
    return { body: '' };
  }
  return { body: typeDef.bodyBlock.body };
}
