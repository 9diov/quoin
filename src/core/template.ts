import type { ParsedTypeDefinitionDocument } from './parser.js';

export type TemplatingResult = {
  body: string;
};

export function template(_typeDef: ParsedTypeDefinitionDocument): TemplatingResult {
  throw new Error('not implemented');
}
