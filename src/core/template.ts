/**
 * @quoin-terms Templating, Templating Result, Template Block, Type Definition Document
 * @quoin-docs docs/design/D2-type-and-schema-contracts.md
 */

import type { ParsedTypeDefinitionDocument } from './parser.js';

export type TemplatingResult = {
  body: string;
};

export function template(typeDef: ParsedTypeDefinitionDocument): TemplatingResult {
  if (!typeDef.templateBlock) {
    return { body: '' };
  }
  return { body: typeDef.templateBlock.body };
}
