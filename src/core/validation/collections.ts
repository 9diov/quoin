import type { ChoiceMember, ListItemType } from '../parser.js';
import type { Resolver, TypeRegistry } from '../integration.js';
import { isValidWikiLinkShape } from '../link-grammar.js';
import { validationError } from './errors.js';
import { resolveWikiLink } from './link.js';
import { validateReferential } from './referential.js';
import { validatePrimitive } from './primitives.js';
import type { ValidationError } from '../validation.js';
import type { ResolvedConfig } from './config.js';

function describeItem(item: ListItemType): string {
  return item.kind === 'primitive' ? item.name : `[[${item.name}]]`;
}

export function validateList(
  value: unknown,
  item: ListItemType,
  propertyName: string,
  config: ResolvedConfig,
  resolver: Resolver | undefined,
  typeRegistry: TypeRegistry | undefined,
): ValidationError[] {
  if (!Array.isArray(value)) {
    return [
      validationError(
        'property:wrong-type',
        `Property "${propertyName}" must be an array for type list<${describeItem(item)}>.`,
        { scope: 'property', property: propertyName },
      ),
    ];
  }

  const errors: ValidationError[] = [];

  for (let i = 0; i < value.length; i++) {
    const entry = value[i];

    if (item.kind === 'primitive') {
      const primitiveError = validatePrimitive(
        entry,
        item.name,
        propertyName,
        config.allowedUrlSchemes,
      );
      if (primitiveError) {
        errors.push({
          ...primitiveError,
          location: { scope: 'property', property: propertyName, index: i },
        });
        continue;
      }
      if (item.name === 'wiki-link' && typeof entry === 'string') {
        const status = resolveWikiLink(entry, resolver, propertyName, i);
        if (status.kind === 'error') {
          errors.push(status.error);
        }
      }
      continue;
    }

    // item.kind === 'type-ref'
    if (typeof entry !== 'string' || entry.trim().length === 0) {
      errors.push(
        validationError(
          'property:wrong-type',
          `Item at index ${i} of "${propertyName}" must be a non-empty string Wiki Link.`,
          { scope: 'property', property: propertyName, index: i },
        ),
      );
      continue;
    }

    if (!isValidWikiLinkShape(entry)) {
      errors.push(
        validationError(
          'property:wrong-type',
          `Item at index ${i} of "${propertyName}" must be a valid Wiki Link.`,
          { scope: 'property', property: propertyName, index: i },
        ),
      );
      continue;
    }

    const status = resolveWikiLink(entry, resolver, propertyName, i);
    if (status.kind === 'error') {
      errors.push(status.error);
      continue;
    }

    if (config.referentialValidation) {
      const refResult = validateReferential(
        entry,
        item.name,
        status.document,
        typeRegistry,
        config.typeDeclarationKey,
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
  members: ChoiceMember[],
  propertyName: string,
): ValidationError[] {
  const allowed = members.map((m) => m.value);
  if (typeof value !== 'string') {
    return [
      validationError(
        'property:wrong-type',
        `Property "${propertyName}" must be a string for type choice<${allowed.map((v) => JSON.stringify(v)).join('|')}>.`,
        { scope: 'property', property: propertyName },
      ),
    ];
  }

  if (!allowed.includes(value)) {
    return [
      validationError(
        'property:invalid-enum-value',
        `Property "${propertyName}" must equal one of: ${allowed.map((v) => JSON.stringify(v)).join(', ')}.`,
        { scope: 'property', property: propertyName },
        { value, allowed },
      ),
    ];
  }

  return [];
}
