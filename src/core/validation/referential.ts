import type { TypeRegistry } from '../integration.js';
import type { Document } from '../types.js';
import type { ValidationError } from '../validation.js';
import { validationError } from './errors.js';

export function validateReferential(
  wikiLink: string,
  typeRefName: string,
  targetDocument: Document,
  typeRegistry: TypeRegistry | undefined,
  typeDeclarationKey: string,
  propertyName: string,
  index?: number,
): ValidationError | null {
  if (!typeRegistry) {
    return validationError(
      'config:missing-dependency',
      `TypeRegistry is required for referential validation of "${wikiLink}".`,
      {
        scope: 'property',
        property: propertyName,
        ...(index !== undefined ? { index } : {}),
      },
      { dependency: 'typeRegistry' },
    );
  }

  const typeRefResult = typeRegistry.getByName(typeRefName);

  switch (typeRefResult.kind) {
    case 'found':
      break;
    case 'not-found':
      return validationError(
        'type:unknown-reference',
        `Type Reference "${typeRefName}" could not be found.`,
        {
          scope: 'property',
          property: propertyName,
          ...(index !== undefined ? { index } : {}),
        },
        { typeName: typeRefResult.typeName },
      );
    case 'ambiguous':
      return validationError(
        'type:ambiguous-reference',
        `Type Reference "${typeRefName}" is ambiguous.`,
        {
          scope: 'property',
          property: propertyName,
          ...(index !== undefined ? { index } : {}),
        },
        { typeName: typeRefResult.typeName },
      );
    case 'unavailable':
      return validationError(
        'type:unavailable',
        `Type Reference lookup unavailable: ${typeRefResult.reason}`,
        {
          scope: 'property',
          property: propertyName,
          ...(index !== undefined ? { index } : {}),
        },
        { reason: typeRefResult.reason },
      );
  }

  const expectedTypeDef = typeRefResult.typeDef;
  const targetDeclaration = targetDocument.frontmatter[typeDeclarationKey];
  const declResult = typeRegistry.getByDeclaration(targetDeclaration);

  switch (declResult.kind) {
    case 'found':
      break;
    case 'missing-declaration':
      return validationError(
        'type:missing-declaration',
        `Target Document "${targetDocument.path}" has no Type Declaration.`,
        {
          scope: 'property',
          property: propertyName,
          ...(index !== undefined ? { index } : {}),
        },
        { targetPath: targetDocument.path },
      );
    case 'invalid-declaration':
      return validationError(
        'type:invalid-declaration',
        `Target Document "${targetDocument.path}" has a malformed Type Declaration.`,
        {
          scope: 'property',
          property: propertyName,
          ...(index !== undefined ? { index } : {}),
        },
        { value: declResult.value },
      );
    case 'not-found':
      return validationError(
        'type:unknown-declaration',
        `Target Document "${targetDocument.path}" declares an unknown type "${declResult.typeName}".`,
        {
          scope: 'property',
          property: propertyName,
          ...(index !== undefined ? { index } : {}),
        },
        { typeName: declResult.typeName },
      );
    case 'ambiguous':
      return validationError(
        'type:ambiguous-declaration',
        `Type Declaration for target Document "${targetDocument.path}" is ambiguous.`,
        {
          scope: 'property',
          property: propertyName,
          ...(index !== undefined ? { index } : {}),
        },
        { typeName: declResult.typeName },
      );
    case 'unavailable':
      return validationError(
        'type:unavailable',
        `Type Declaration lookup unavailable: ${declResult.reason}`,
        {
          scope: 'property',
          property: propertyName,
          ...(index !== undefined ? { index } : {}),
        },
        { reason: declResult.reason },
      );
  }

  const actualTypeDef = declResult.typeDef;

  if (expectedTypeDef.id !== actualTypeDef.id) {
    return validationError(
      'type:referential-mismatch',
      `Target "${wikiLink}" conforms to "${actualTypeDef.id}", expected "${expectedTypeDef.id}".`,
      {
        scope: 'property',
        property: propertyName,
        ...(index !== undefined ? { index } : {}),
      },
      {
        expectedTypeId: expectedTypeDef.id,
        actualTypeId: actualTypeDef.id,
        wikiLink,
        targetPath: targetDocument.path,
      },
    );
  }

  return null;
}
