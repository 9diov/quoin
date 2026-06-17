import { isValidWikiLinkShape } from '../link-grammar.js';
import type {
  ListItemType,
  ParseError,
  ParserConfig,
  PrimitiveTypeName,
  PropertySchema,
  PropertyTypeName,
} from '../parser.js';
import { isCanonicalDate, isIso8601WithTimezone } from '../primitive-grammar.js';
import { propertyError } from './errors.js';

function describeListItem(item: ListItemType): string {
  return item.kind === 'primitive' ? item.name : `[[${item.name}]]`;
}

function describeType(type: PropertyTypeName): string {
  if (typeof type === 'string') return type;
  switch (type.kind) {
    case 'type-ref':
      return `[[${type.name}]]`;
    case 'list':
      return `list<${describeListItem(type.of)}>`;
    case 'choice':
      return `choice<${type.members.map((m) => JSON.stringify(m.value)).join('|')}>`;
  }
}

function isEmpty(type: PropertyTypeName, value: unknown): boolean {
  if (value === null) return true;
  if (typeof value === 'string' && value.trim().length === 0) return true;
  if (Array.isArray(value) && value.length === 0) return true;
  void type;
  return false;
}

function checkPrimitiveDefault(
  property: string,
  value: unknown,
  name: PrimitiveTypeName,
): ParseError | null {
  switch (name) {
    case 'text':
      if (typeof value !== 'string') {
        return defaultError(property, `Default must be a string.`, { expected: 'text' });
      }
      return null;
    case 'number':
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        return defaultError(property, `Default must be a finite number.`, { expected: 'number' });
      }
      return null;
    case 'boolean':
      if (typeof value !== 'boolean') {
        return defaultError(property, `Default must be a boolean.`, { expected: 'boolean' });
      }
      return null;
    case 'date':
      if (typeof value !== 'string' || !isCanonicalDate(value)) {
        return defaultError(property, `Default must be a YYYY-MM-DD date string.`, {
          expected: 'date',
        });
      }
      return null;
    case 'datetime':
      if (typeof value !== 'string' || !isIso8601WithTimezone(value)) {
        return defaultError(property, `Default must be an ISO 8601 datetime with timezone.`, {
          expected: 'datetime',
        });
      }
      return null;
    case 'wiki-link':
      if (!isValidWikiLinkShape(value)) {
        return defaultError(property, `Default must be a Wiki Link.`, { expected: 'wiki-link' });
      }
      return null;
  }
}

function defaultError(
  property: string,
  message: string,
  details: Record<string, unknown>,
): ParseError {
  return propertyError('parser:invalid-default', property, message, details);
}

export function validateDefault(
  property: string,
  schema: PropertySchema,
  config: ParserConfig,
): ParseError[] {
  if (!('default' in schema) || schema.default === undefined) return [];

  const value = schema.default;
  const type = schema.type;
  const allowEmpty = schema['allow-empty'] === true;
  const typeLabel = describeType(type);
  void config;

  if (isEmpty(type, value) && !allowEmpty) {
    return [
      defaultError(
        property,
        `Default for \`${property}\` is empty but \`allow-empty\` is not set.`,
        {
          reason: 'empty-not-allowed',
          expected: typeLabel,
        },
      ),
    ];
  }

  if (isEmpty(type, value) && allowEmpty) {
    return [];
  }

  if (typeof type === 'string') {
    const err = checkPrimitiveDefault(property, value, type);
    return err ? [err] : [];
  }

  if (type.kind === 'type-ref') {
    if (!isValidWikiLinkShape(value)) {
      return [defaultError(property, `Default must be a Wiki Link.`, { expected: 'wiki-link' })];
    }
    return [];
  }

  if (type.kind === 'list') {
    if (!Array.isArray(value)) {
      return [defaultError(property, `Default must be an array.`, { expected: typeLabel })];
    }
    const errors: ParseError[] = [];
    if (type.of.kind === 'primitive') {
      const primitiveName = type.of.name;
      value.forEach((item, index) => {
        const err = checkPrimitiveDefault(property, item, primitiveName);
        if (err) {
          errors.push({
            ...err,
            details: { ...(err.details ?? {}), index },
          });
        }
      });
    } else {
      value.forEach((item, index) => {
        if (!isValidWikiLinkShape(item)) {
          errors.push(
            defaultError(property, `Default item ${index} must be a Wiki Link.`, {
              expected: 'wiki-link',
              index,
            }),
          );
        }
      });
    }
    return errors;
  }

  if (type.kind === 'choice') {
    const allowed = type.members.map((m) => m.value);
    if (typeof value !== 'string') {
      return [defaultError(property, `Default must be a string.`, { expected: 'enum', allowed })];
    }
    if (!allowed.includes(value)) {
      return [
        defaultError(property, `Default must equal one of the declared enum values.`, {
          expected: 'enum',
          allowed,
        }),
      ];
    }
    return [];
  }

  return [];
}
