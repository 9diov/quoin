import type { Resolver, TypeRegistry } from '../integration.js';
import { isValidWikiLinkShape } from '../link-grammar.js';
import { validationError } from './errors.js';
import { resolveWikiLink } from './link.js';
import { validateReferential } from './referential.js';
import type { ValidationError } from '../validation.js';

export function validateList(
  value: unknown,
  typeRefName: string,
  propertyName: string,
  referentialValidation: boolean,
  typeDeclarationKey: string,
  resolver: Resolver | undefined,
  typeRegistry: TypeRegistry | undefined,
): ValidationError[] {
  if (!Array.isArray(value)) {
    return [
      validationError(
        'property:wrong-type',
        `Property "${propertyName}" must be an array for type list<${typeRefName}>.`,
        { scope: 'property', property: propertyName },
      ),
    ];
  }

  const errors: ValidationError[] = [];

  for (let i = 0; i < value.length; i++) {
    const item = value[i];

    if (typeof item !== 'string' || item.trim().length === 0) {
      errors.push(
        validationError(
          'property:wrong-type',
          `Item at index ${i} of "${propertyName}" must be a non-empty string Wiki Link.`,
          { scope: 'property', property: propertyName, index: i },
        ),
      );
      continue;
    }

    if (!isValidWikiLinkShape(item)) {
      errors.push(
        validationError(
          'property:wrong-type',
          `Item at index ${i} of "${propertyName}" must be a valid Wiki Link.`,
          { scope: 'property', property: propertyName, index: i },
        ),
      );
      continue;
    }

    const status = resolveWikiLink(item, resolver, propertyName, i);
    if (status.kind === 'error') {
      errors.push(status.error);
      continue;
    }

    if (referentialValidation) {
      const refResult = validateReferential(
        item,
        typeRefName,
        status.document,
        typeRegistry,
        typeDeclarationKey,
        propertyName,
        i,
      );
      if (refResult) {
        errors.push(refResult);
      }
    }
  }

  return errors;
}

export function validateChoice(
  value: unknown,
  typeRefName: string,
  propertyName: string,
  referentialValidation: boolean,
  typeDeclarationKey: string,
  resolver: Resolver | undefined,
  typeRegistry: TypeRegistry | undefined,
): ValidationError[] {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return [
      validationError(
        'property:wrong-type',
        `Property "${propertyName}" must be a non-empty string Wiki Link for type choice<${typeRefName}>.`,
        { scope: 'property', property: propertyName },
      ),
    ];
  }

  if (Array.isArray(value)) {
    return [
      validationError(
        'property:wrong-type',
        `Property "${propertyName}" must be a single Wiki Link string, not an array.`,
        { scope: 'property', property: propertyName },
      ),
    ];
  }

  if (!isValidWikiLinkShape(value)) {
    return [
      validationError(
        'property:wrong-type',
        `Property "${propertyName}" must be a valid Wiki Link.`,
        { scope: 'property', property: propertyName },
      ),
    ];
  }

  const errors: ValidationError[] = [];

  const status = resolveWikiLink(value, resolver, propertyName);
  if (status.kind === 'error') {
    errors.push(status.error);
    return errors;
  }

  if (referentialValidation) {
    const refResult = validateReferential(
      value,
      typeRefName,
      status.document,
      typeRegistry,
      typeDeclarationKey,
      propertyName,
    );
    if (refResult) {
      errors.push(refResult);
    }
  }

  return errors;
}
