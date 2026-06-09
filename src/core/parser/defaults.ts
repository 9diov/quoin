import type {
  ParseError,
  ParserConfig,
  PropertySchema,
  PropertyTypeName,
} from '../parser.js';
import {
  isValidExternalLinkShape,
  isValidWikiLinkShape,
} from '../link-grammar.js';
import { propertyError } from './errors.js';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DATETIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:?\d{2})$/;

function describeType(type: PropertyTypeName): string {
  if (typeof type === 'string') return type;
  return `${type.kind}<${type.of}>`;
}

function isEmpty(type: PropertyTypeName, value: unknown): boolean {
  if (value === null) return true;
  if (typeof value === 'string' && value.trim().length === 0) return true;
  if (Array.isArray(value) && value.length === 0) return true;
  void type;
  return false;
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
  const allowedSchemes = config.allowedUrlSchemes ?? ['http', 'https', 'mailto'];
  const typeLabel = describeType(type);

  if (isEmpty(type, value) && !allowEmpty) {
    return [
      defaultError(property, `Default for \`${property}\` is empty but \`allow-empty\` is not set.`, {
        reason: 'empty-not-allowed',
        expected: typeLabel,
      }),
    ];
  }

  if (isEmpty(type, value) && allowEmpty) {
    return [];
  }

  if (typeof type === 'string') {
    switch (type) {
      case 'text':
        if (typeof value !== 'string') {
          return [defaultError(property, `Default must be a string.`, { expected: 'text' })];
        }
        return [];
      case 'number':
        if (typeof value !== 'number' || !Number.isFinite(value)) {
          return [defaultError(property, `Default must be a finite number.`, { expected: 'number' })];
        }
        return [];
      case 'boolean':
        if (typeof value !== 'boolean') {
          return [defaultError(property, `Default must be a boolean.`, { expected: 'boolean' })];
        }
        return [];
      case 'date':
        if (typeof value !== 'string' || !DATE_RE.test(value)) {
          return [defaultError(property, `Default must be a YYYY-MM-DD date string.`, { expected: 'date' })];
        }
        return [];
      case 'datetime':
        if (typeof value !== 'string' || !DATETIME_RE.test(value)) {
          return [
            defaultError(property, `Default must be an ISO 8601 datetime with timezone.`, {
              expected: 'datetime',
            }),
          ];
        }
        return [];
      case 'wiki-link':
        if (!isValidWikiLinkShape(value)) {
          return [defaultError(property, `Default must be a Wiki Link.`, { expected: 'wiki-link' })];
        }
        return [];
      case 'url':
        if (!isValidExternalLinkShape(value, allowedSchemes)) {
          return [defaultError(property, `Default must be a Markdown External Link with an allowed scheme.`, { expected: 'url' })];
        }
        return [];
    }
  }

  if (type.kind === 'list') {
    if (!Array.isArray(value)) {
      return [defaultError(property, `Default must be an array of Wiki Links.`, { expected: typeLabel })];
    }
    const errors: ParseError[] = [];
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
    return errors;
  }

  if (type.kind === 'choice') {
    if (!isValidWikiLinkShape(value)) {
      return [defaultError(property, `Default must be a Wiki Link.`, { expected: 'wiki-link' })];
    }
    return [];
  }

  return [];
}
