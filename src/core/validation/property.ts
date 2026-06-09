import type { PropertySchema, PropertyTypeName } from '../parser.js';
import type { Resolver, TypeRegistry } from '../integration.js';
import { isValueEmpty } from './emptiness.js';
import { validationError } from './errors.js';
import { validatePrimitive } from './primitives.js';
import { validateList, validateChoice } from './collections.js';
import { resolveWikiLink } from './link.js';
import type { ValidationError } from '../validation.js';
import type { ResolvedConfig } from './config.js';

export function validateProperty(
  propertyName: string,
  schema: PropertySchema,
  frontmatter: Record<string, unknown>,
  config: ResolvedConfig,
  resolver: Resolver | undefined,
  typeRegistry: TypeRegistry | undefined,
): ValidationError[] {
  if (!(propertyName in frontmatter)) {
    if (schema.required) {
      return [
        validationError(
          'property:missing-required',
          `Property "${propertyName}" is required.`,
          { scope: 'property', property: propertyName },
        ),
      ];
    }
    return [];
  }

  const value = frontmatter[propertyName];
  const allowEmpty =
    schema['allow-empty'] ??
    (typeof schema.type === 'object' && schema.type.kind === 'list');

  if (isValueEmpty(value)) {
    if (!allowEmpty) {
      return [
        validationError(
          'property:empty-not-allowed',
          `Property "${propertyName}" must not be empty.`,
          { scope: 'property', property: propertyName },
        ),
      ];
    }
    return [];
  }

  return validateTypedValue(
    value,
    schema.type,
    propertyName,
    config,
    resolver,
    typeRegistry,
  );
}

function validateTypedValue(
  value: unknown,
  type: PropertyTypeName,
  propertyName: string,
  config: ResolvedConfig,
  resolver: Resolver | undefined,
  typeRegistry: TypeRegistry | undefined,
): ValidationError[] {
  if (typeof type === 'string') {
    const primitiveError = validatePrimitive(
      value,
      type,
      propertyName,
      config.allowedUrlSchemes,
    );
    if (primitiveError) {
      return [primitiveError];
    }

    if (type === 'wiki-link' && typeof value === 'string') {
      const status = resolveWikiLink(value, resolver, propertyName);
      if (status.kind === 'error') {
        return [status.error];
      }
    }

    return [];
  }

  switch (type.kind) {
    case 'list':
      return validateList(
        value,
        type.of,
        propertyName,
        config.referentialValidation,
        config.typeDeclarationKey,
        resolver,
        typeRegistry,
      );
    case 'choice':
      return validateChoice(
        value,
        type.of,
        propertyName,
        config.referentialValidation,
        config.typeDeclarationKey,
        resolver,
        typeRegistry,
      );
  }
}
