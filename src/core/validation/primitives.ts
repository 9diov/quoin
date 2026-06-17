import { isValidWikiLinkShape } from '../link-grammar.js';
import type { PropertyTypeName } from '../parser.js';
import { isCanonicalDate, isIso8601WithTimezone } from '../primitive-grammar.js';
import type { ValidationError } from '../validation.js';
import { validationError } from './errors.js';

export function validatePrimitive(
  value: unknown,
  type: PropertyTypeName,
  propertyName: string,
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
  }
}

function validateText(value: unknown, propertyName: string): ValidationError | null {
  if (typeof value !== 'string') {
    return validationError('property:wrong-type', `Property "${propertyName}" must be a string.`, {
      scope: 'property',
      property: propertyName,
    });
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
    return validationError('property:wrong-type', `Property "${propertyName}" must be a boolean.`, {
      scope: 'property',
      property: propertyName,
    });
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
