import { isValidWikiLinkShape, parseExternalLink } from '../link-grammar.js';
import { isValueEmpty } from './emptiness.js';
import { validationError } from './errors.js';
import type { PropertyTypeName } from '../parser.js';
import type { ValidationError } from '../validation.js';

export function validatePrimitive(
  value: unknown,
  type: PropertyTypeName,
  propertyName: string,
  allowedUrlSchemes: string[],
): ValidationError | null {
  if (typeof type === 'object') return null;

  switch (type) {
    case 'text':
      return validateText(value, propertyName);
    case 'number':
      return validateNumber(value, propertyName);
    case 'boolean':
      return validateBoolean(value, propertyName);
    case 'date':
      return validateDate(value, propertyName);
    case 'datetime':
      return validateDatetime(value, propertyName);
    case 'wiki-link':
      return validateWikiLinkShape(value, propertyName);
    case 'url':
      return validateUrl(value, propertyName, allowedUrlSchemes);
  }
}

function validateText(value: unknown, propertyName: string): ValidationError | null {
  if (typeof value !== 'string') {
    return validationError(
      'property:wrong-type',
      `Property "${propertyName}" must be a string.`,
      { scope: 'property', property: propertyName },
    );
  }
  return null;
}

function validateNumber(value: unknown, propertyName: string): ValidationError | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return validationError(
      'property:wrong-type',
      `Property "${propertyName}" must be a finite number.`,
      { scope: 'property', property: propertyName },
    );
  }
  return null;
}

function validateBoolean(value: unknown, propertyName: string): ValidationError | null {
  if (typeof value !== 'boolean') {
    return validationError(
      'property:wrong-type',
      `Property "${propertyName}" must be a boolean.`,
      { scope: 'property', property: propertyName },
    );
  }
  return null;
}

function validateDate(value: unknown, propertyName: string): ValidationError | null {
  if (typeof value !== 'string' || !isCanonicalDate(value)) {
    return validationError(
      'property:wrong-type',
      `Property "${propertyName}" must be a date in YYYY-MM-DD format.`,
      { scope: 'property', property: propertyName },
    );
  }
  return null;
}

function isCanonicalDate(s: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (year === undefined || month === undefined || day === undefined) return false;
  if (month < 1 || month > 12) return false;
  const daysInMonth = new Date(year, month, 0).getDate();
  if (day < 1 || day > daysInMonth) return false;
  return true;
}

function validateDatetime(value: unknown, propertyName: string): ValidationError | null {
  if (typeof value !== 'string') {
    return validationError(
      'property:wrong-type',
      `Property "${propertyName}" must be a datetime string.`,
      { scope: 'property', property: propertyName },
    );
  }
  if (!isIso8601WithTimezone(value)) {
    return validationError(
      'property:wrong-type',
      `Property "${propertyName}" must be an ISO 8601 datetime with timezone.`,
      { scope: 'property', property: propertyName },
    );
  }
  return null;
}

const ISO_DATETIME_RE =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

function isIso8601WithTimezone(s: string): boolean {
  if (!ISO_DATETIME_RE.test(s)) return false;
  const ts = Date.parse(s);
  return !isNaN(ts);
}

function validateWikiLinkShape(value: unknown, propertyName: string): ValidationError | null {
  if (!isValidWikiLinkShape(value)) {
    return validationError(
      'property:wrong-type',
      `Property "${propertyName}" must be a valid Wiki Link.`,
      { scope: 'property', property: propertyName },
    );
  }
  return null;
}

function validateUrl(
  value: unknown,
  propertyName: string,
  allowedUrlSchemes: string[],
): ValidationError | null {
  const result = parseExternalLink(value, allowedUrlSchemes);
  if (result.kind === 'invalid') {
    return validationError(
      'property:wrong-type',
      `Property "${propertyName}" must be a valid Markdown External Link.`,
      { scope: 'property', property: propertyName },
      {
        scheme: extractScheme(value, result),
        allowedUrlSchemes,
        reason: result.reason,
      },
    );
  }
  return null;
}

function extractScheme(value: unknown, result: { kind: 'invalid'; reason: string }): string | undefined {
  if (typeof value === 'string') {
    const reason = result.reason;
    if (typeof reason === 'string' && reason.startsWith('disallowed-scheme:')) {
      return reason.slice('disallowed-scheme:'.length);
    }
  }
  return undefined;
}
