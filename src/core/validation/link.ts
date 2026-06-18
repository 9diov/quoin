import type { Resolver } from '../integration.js';
import { detectDocRefFormat } from '../link-grammar.js';
import type { DocRefFormat } from '../parser.js';
import type { Document } from '../types.js';
import type { ValidationError } from '../validation.js';
import { validationError } from './errors.js';

export type DocRefResolveStatus =
  | { kind: 'error'; error: ValidationError }
  | { kind: 'success'; document: Document };

export function resolveDocReference(
  value: string,
  format: DocRefFormat | undefined,
  sourceDocumentPath: string,
  resolver: Resolver | undefined,
  propertyName: string,
  index?: number,
): DocRefResolveStatus {
  if (!resolver) {
    return {
      kind: 'error',
      error: validationError(
        'config:missing-dependency',
        `Resolver is required to validate document-reference value "${value}".`,
        { scope: 'property', property: propertyName, ...(index !== undefined ? { index } : {}) },
        { dependency: 'resolver' },
      ),
    };
  }

  const effectiveFormat = format ?? detectDocRefFormat(value) ?? undefined;
  const input = {
    value,
    sourceDocumentPath,
    ...(effectiveFormat !== undefined ? { format: effectiveFormat } : {}),
  };
  const result = resolver(input);

  const loc = {
    scope: 'property' as const,
    property: propertyName,
    ...(index !== undefined ? { index } : {}),
  };

  switch (result.kind) {
    case 'found':
      return { kind: 'success', document: result.document };
    case 'not-found':
      return {
        kind: 'error',
        error: validationError(
          'resolve:broken-wiki-link',
          `Document reference "${value}" could not be found.`,
          loc,
          { value: result.value, format: result.format },
        ),
      };
    case 'invalid-link':
      return {
        kind: 'error',
        error: validationError(
          'resolve:invalid-wiki-link',
          `Document reference "${value}" is malformed: ${result.reason}`,
          loc,
          { value: result.value, format: result.format, reason: result.reason },
        ),
      };
    case 'ambiguous':
      return {
        kind: 'error',
        error: validationError(
          'resolve:ambiguous-wiki-link',
          `Document reference "${value}" is ambiguous.`,
          loc,
          { value: result.value, format: result.format },
        ),
      };
    case 'unavailable':
      return {
        kind: 'error',
        error: validationError(
          'resolve:unavailable',
          `Document reference "${value}" could not be resolved: ${result.reason}`,
          loc,
          { value: result.value, format: result.format, reason: result.reason },
        ),
      };
  }
}
