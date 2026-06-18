import type { Resolver, TypeRegistry } from '../integration.js';
import { isValidMarkdownLinkShape, isValidWikiLinkShape } from '../link-grammar.js';
import type { DocReference, PropertySchema, PropertyTypeName } from '../parser.js';
import type { ValidationError } from '../validation.js';
import { validateChoice, validateList } from './collections.js';
import type { ResolvedConfig } from './config.js';
import { isValueEmpty } from './emptiness.js';
import { validationError } from './errors.js';
import { resolveDocReference } from './link.js';
import { validatePrimitive } from './primitives.js';
import { validateReferential } from './referential.js';

export function validateProperty(
  propertyName: string,
  schema: PropertySchema,
  frontmatter: Record<string, unknown>,
  sourceDocumentPath: string,
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

  return validateTypedValue(
    value,
    schema.type,
    propertyName,
    sourceDocumentPath,
    config,
    resolver,
    typeRegistry,
  );
}

export function validateDocRefValue(
  value: unknown,
  ref: DocReference,
  propertyName: string,
  sourceDocumentPath: string,
  config: ResolvedConfig,
  resolver: Resolver | undefined,
  typeRegistry: TypeRegistry | undefined,
  index?: number,
): ValidationError[] {
  if (typeof value !== 'string') {
    return [
      validationError(
        'property:wrong-type',
        `Property "${propertyName}" must be a string document reference.`,
        {
          scope: 'property',
          property: propertyName,
          ...(index !== undefined ? { index } : {}),
        },
      ),
    ];
  }

  const shapeError = validateDocRefShape(value, ref, propertyName, index);
  if (shapeError) return [shapeError];

  const status = resolveDocReference(
    value,
    ref.format,
    sourceDocumentPath,
    resolver,
    propertyName,
    index,
  );
  if (status.kind === 'error') return [status.error];

  if (ref.referencedType !== undefined && config.referentialValidation) {
    const refErr = validateReferential(
      value,
      ref.referencedType,
      status.document,
      typeRegistry,
      config.typeDeclarationKey,
      propertyName,
      index,
    );
    if (refErr) return [refErr];
  }
  return [];
}

function validateDocRefShape(
  value: string,
  ref: DocReference,
  propertyName: string,
  index?: number,
): ValidationError | null {
  const loc = {
    scope: 'property' as const,
    property: propertyName,
    ...(index !== undefined ? { index } : {}),
  };
  if (ref.format === 'wiki-link') {
    if (!isValidWikiLinkShape(value)) {
      return validationError(
        'property:wrong-type',
        `Property "${propertyName}" must be a valid Wiki Link.`,
        loc,
      );
    }
    return null;
  }
  if (ref.format === 'markdown-link') {
    if (!isValidMarkdownLinkShape(value)) {
      return validationError(
        'property:wrong-type',
        `Property "${propertyName}" must be a valid Markdown link.`,
        loc,
      );
    }
    return null;
  }
  // Format omitted: accept either supported syntax.
  if (!isValidWikiLinkShape(value) && !isValidMarkdownLinkShape(value)) {
    return validationError(
      'property:wrong-type',
      `Property "${propertyName}" must be a valid document reference (Wiki Link or Markdown link).`,
      loc,
    );
  }
  return null;
}

function validateTypedValue(
  value: unknown,
  type: PropertyTypeName,
  propertyName: string,
  sourceDocumentPath: string,
  config: ResolvedConfig,
  resolver: Resolver | undefined,
  typeRegistry: TypeRegistry | undefined,
): ValidationError[] {
  if (typeof type === 'string') {
    const primitiveError = validatePrimitive(value, type, propertyName);
    return primitiveError ? [primitiveError] : [];
  }

  switch (type.kind) {
    case 'doc-ref':
      return validateDocRefValue(
        value,
        type,
        propertyName,
        sourceDocumentPath,
        config,
        resolver,
        typeRegistry,
      );
    case 'list':
      return validateList(
        value,
        type.of,
        propertyName,
        sourceDocumentPath,
        config,
        resolver,
        typeRegistry,
      );
    case 'choice':
      return validateChoice(value, type.members, propertyName);
  }
}
