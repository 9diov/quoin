import type { Resolver, TypeRegistry } from '../integration.js';
import type { ChoiceMember, DocReference, ListItemType } from '../parser.js';
import type { ValidationError } from '../validation.js';
import type { ResolvedConfig } from './config.js';
import { validationError } from './errors.js';
import { validatePrimitive } from './primitives.js';
import { validateDocRefValue } from './property.js';

function describeDocRef(ref: DocReference): string {
  const parts: string[] = [];
  if (ref.format !== undefined) parts.push(ref.format);
  if (ref.referencedType !== undefined) parts.push(ref.referencedType);
  return parts.length === 0 ? 'doc-ref' : `doc-ref<${parts.join(', ')}>`;
}

function describeItem(item: ListItemType): string {
  return item.kind === 'primitive' ? item.name : describeDocRef(item);
}

export function validateList(
  value: unknown,
  item: ListItemType,
  propertyName: string,
  sourceDocumentPath: string,
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
      const primitiveError = validatePrimitive(entry, item.name, propertyName);
      if (primitiveError) {
        errors.push({
          ...primitiveError,
          location: { scope: 'property', property: propertyName, index: i },
        });
      }
      continue;
    }

    // item.kind === 'doc-ref'
    errors.push(
      ...validateDocRefValue(
        entry,
        item,
        propertyName,
        sourceDocumentPath,
        config,
        resolver,
        typeRegistry,
        i,
      ),
    );
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
