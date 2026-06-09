import type {
  ParseError,
  PrimitiveTypeName,
  PropertySchema,
  PropertyTypeName,
} from '../parser.js';
import { propertyError } from './errors.js';

const PRIMITIVE_TYPES = new Set<PrimitiveTypeName>([
  'text',
  'number',
  'boolean',
  'date',
  'datetime',
  'wiki-link',
  'url',
]);

const ALLOWED_PROPERTY_SCHEMA_KEYS = new Set([
  'type',
  'required',
  'allow-empty',
  'default',
]);

const CANONICAL_KEY = /^[a-z0-9]([a-z0-9_-]*[a-z0-9])?$/;
const COLLECTION_RE = /^(list|choice)<([^<>]*)>$/;

export function isCanonicalPropertyKey(key: string): boolean {
  if (key === '_type') return true;
  return CANONICAL_KEY.test(key);
}

export function isCanonicalIdentifier(key: string): boolean {
  return CANONICAL_KEY.test(key);
}

function parsePropertyType(
  raw: unknown,
): { type?: PropertyTypeName; error?: 'unknown-property-type' | 'invalid-type-reference'; details?: Record<string, unknown> } {
  if (typeof raw !== 'string') {
    return { error: 'unknown-property-type', details: { value: raw } };
  }
  if (PRIMITIVE_TYPES.has(raw as PrimitiveTypeName)) {
    return { type: raw as PrimitiveTypeName };
  }
  const match = COLLECTION_RE.exec(raw);
  if (match) {
    const kind = match[1] as 'list' | 'choice';
    const inner = match[2] ?? '';
    if (!isCanonicalIdentifier(inner)) {
      return { error: 'invalid-type-reference', details: { value: inner } };
    }
    return { type: { kind, of: inner } };
  }
  return { error: 'unknown-property-type', details: { value: raw } };
}

function isMapping(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export type PropertySchemaResult = {
  schema?: PropertySchema;
  errors: ParseError[];
};

export function validatePropertySchema(
  key: string,
  raw: unknown,
): PropertySchemaResult {
  const errors: ParseError[] = [];

  if (!isCanonicalPropertyKey(key)) {
    errors.push(
      propertyError(
        'parser:invalid-property-key',
        key,
        `Property key \`${key}\` is not canonical (lowercase, [a-z0-9_-], no leading/trailing hyphens or underscores; \`_type\` is the only exception).`,
        { key },
      ),
    );
  }

  if (!isMapping(raw)) {
    errors.push(
      propertyError(
        'parser:invalid-property-schema',
        key,
        `Property \`${key}\` must be a mapping.`,
      ),
    );
    return { errors };
  }

  const unknownKeys = Object.keys(raw).filter((k) => !ALLOWED_PROPERTY_SCHEMA_KEYS.has(k));
  if (unknownKeys.length > 0) {
    errors.push(
      propertyError(
        'parser:invalid-property-schema',
        key,
        `Property \`${key}\` has unknown schema keys: ${unknownKeys.join(', ')}.`,
        { unknownKeys },
      ),
    );
  }

  if (!('type' in raw)) {
    errors.push(
      propertyError(
        'parser:invalid-property-schema',
        key,
        `Property \`${key}\` is missing required schema key \`type\`.`,
        { key: 'type', expected: 'PropertyTypeName' },
      ),
    );
    return { errors };
  }

  const typeResult = parsePropertyType(raw['type']);
  if (typeResult.error === 'unknown-property-type') {
    errors.push(
      propertyError(
        'parser:unknown-property-type',
        key,
        `Property \`${key}\` has unknown type ${JSON.stringify(raw['type'])}.`,
        typeResult.details,
      ),
    );
    return { errors };
  }
  if (typeResult.error === 'invalid-type-reference') {
    errors.push(
      propertyError(
        'parser:invalid-type-reference',
        key,
        `Type Reference name must be canonical (lowercase identifier).`,
        typeResult.details,
      ),
    );
    return { errors };
  }

  const schema: PropertySchema = { type: typeResult.type as PropertyTypeName };

  if ('required' in raw) {
    if (typeof raw['required'] !== 'boolean') {
      errors.push(
        propertyError(
          'parser:invalid-property-schema',
          key,
          `\`required\` must be a strict boolean.`,
          { key: 'required', expected: 'boolean' },
        ),
      );
    } else {
      schema.required = raw['required'];
    }
  }

  if ('allow-empty' in raw) {
    if (typeof raw['allow-empty'] !== 'boolean') {
      errors.push(
        propertyError(
          'parser:invalid-property-schema',
          key,
          `\`allow-empty\` must be a strict boolean.`,
          { key: 'allow-empty', expected: 'boolean' },
        ),
      );
    } else {
      schema['allow-empty'] = raw['allow-empty'];
    }
  }

  if ('default' in raw) {
    schema.default = raw['default'];
  }

  return { schema, errors };
}
