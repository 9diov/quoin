import type { Resolver, TypeRegistry } from '../integration.js';
import { isValidWikiLinkShape } from '../link-grammar.js';
import type { PropertySchema, PropertyTypeName } from '../parser.js';
import type { ValidationError } from '../validation.js';
import { validateChoice, validateList } from './collections.js';
import type { ResolvedConfig } from './config.js';
import { isValueEmpty } from './emptiness.js';
import { validationError } from './errors.js';
import { resolveWikiLink } from './link.js';
import { validatePrimitive } from './primitives.js';
import { validateReferential } from './referential.js';

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
        validationError('property:missing-required', `Property "${propertyName}" is required.`, {
          scope: 'property',
          property: propertyName,
        }),
      ];
    }
    return [];
  }

  const value = frontmatter[propertyName];
  const allowEmpty =
    schema['allow-empty'] ?? (typeof schema.type === 'object' && schema.type.kind === 'list');

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

  return validateTypedValue(value, schema.type, propertyName, config, resolver, typeRegistry);
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
    const primitiveError = validatePrimitive(value, type, propertyName, config.allowedUrlSchemes);
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
    case 'type-ref': {
      if (typeof value !== 'string' || !isValidWikiLinkShape(value)) {
        return [
          validationError(
            'property:wrong-type',
            `Property "${propertyName}" must be a valid Wiki Link.`,
            { scope: 'property', property: propertyName },
          ),
        ];
      }
      const status = resolveWikiLink(value, resolver, propertyName);
      if (status.kind === 'error') {
        return [status.error];
      }
      if (config.referentialValidation) {
        const refError = validateReferential(
          value,
          type.name,
          status.document,
          typeRegistry,
          config.typeDeclarationKey,
          propertyName,
        );
        if (refError) return [refError];
      }
      return [];
    }
    case 'list':
      return validateList(value, type.of, propertyName, config, resolver, typeRegistry);
    case 'choice':
      return validateChoice(value, type.members, propertyName);
  }
}
