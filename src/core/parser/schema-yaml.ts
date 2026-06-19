/**
 * @quoin-terms Parser, Property, Type Definition Document, Parse Result
 * @quoin-docs docs/design/D2-type-and-schema-contracts.md
 */

import { parse as parseYaml } from 'yaml';

import type { ParseError, PropertySchema, Schema } from '../parser.js';
import { schemaBlockError } from './errors.js';
import { isMapping } from './object.js';
import { validatePropertySchema } from './property-schema.js';

export type SchemaParseResult = {
  schema?: Schema;
  errors: ParseError[];
};

const ALLOWED_TOP_LEVEL = new Set(['properties']);

export function parseSchemaYaml(yamlBody: string): SchemaParseResult {
  let parsed: unknown;
  try {
    parsed = parseYaml(yamlBody);
  } catch (e) {
    return {
      errors: [
        schemaBlockError(
          'parser:invalid-schema-yaml',
          `Schema YAML is not valid: ${(e as Error).message}`,
        ),
      ],
    };
  }

  if (!isMapping(parsed)) {
    return {
      errors: [
        schemaBlockError(
          'parser:missing-properties',
          'Schema YAML must contain a top-level `properties` mapping.',
        ),
      ],
    };
  }

  const errors: ParseError[] = [];

  for (const key of Object.keys(parsed)) {
    if (!ALLOWED_TOP_LEVEL.has(key)) {
      errors.push(
        schemaBlockError('parser:unknown-schema-key', `Unknown top-level schema key \`${key}\`.`, {
          key,
        }),
      );
    }
  }

  if (!('properties' in parsed)) {
    errors.push(
      schemaBlockError(
        'parser:missing-properties',
        'Schema YAML must contain a top-level `properties` mapping.',
      ),
    );
    return { errors };
  }

  const rawProperties = parsed.properties;
  if (!isMapping(rawProperties)) {
    errors.push(
      schemaBlockError('parser:missing-properties', '`properties` must be a YAML mapping.'),
    );
    return { errors };
  }

  const properties: Record<string, PropertySchema> = {};
  for (const [key, raw] of Object.entries(rawProperties)) {
    const result = validatePropertySchema(key, raw);
    errors.push(...result.errors);
    if (result.schema) {
      properties[key] = result.schema;
    }
  }

  return { schema: { properties }, errors };
}
