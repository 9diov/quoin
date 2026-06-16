import type { ParsedTypeDefinitionDocument } from './parser.js';

export type ScaffoldingResult = {
  properties: Record<string, unknown>;
};

export function scaffold(
  frontmatter: Record<string, unknown>,
  typeDef: ParsedTypeDefinitionDocument,
): ScaffoldingResult {
  const properties: Record<string, unknown> = {};

  for (const [key, propertySchema] of Object.entries(typeDef.schema.properties)) {
    if (!propertySchema) continue;

    if (Object.hasOwn(frontmatter, key)) continue;

    if (!('default' in propertySchema)) continue;

    const value = propertySchema.default;
    if (Array.isArray(value)) {
      properties[key] = [...value];
    } else {
      properties[key] = value;
    }
  }

  return { properties };
}
