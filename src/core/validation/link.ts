import type { Resolver } from '../integration.js';
import type { Document } from '../types.js';
import { validationError } from './errors.js';
import type { ValidationError } from '../validation.js';

export type WikiLinkResolveStatus =
  | { kind: 'error'; error: ValidationError }
  | { kind: 'success'; document: Document };

export function resolveWikiLink(
  wikiLink: string,
  resolver: Resolver | undefined,
  propertyName: string,
  index?: number,
): WikiLinkResolveStatus {
  if (!resolver) {
    return {
      kind: 'error',
      error: validationError(
        'config:missing-dependency',
        `Resolver is required to validate Wiki Link value "${wikiLink}".`,
        { scope: 'property', property: propertyName, ...(index !== undefined ? { index } : {}) },
        { dependency: 'resolver' },
      ),
    };
  }

  const result = resolver(wikiLink);

  switch (result.kind) {
    case 'found':
      return { kind: 'success', document: result.document };
    case 'not-found':
      return {
        kind: 'error',
        error: validationError(
          'resolve:broken-wiki-link',
          `Wiki Link "${wikiLink}" could not be found.`,
          { scope: 'property', property: propertyName, ...(index !== undefined ? { index } : {}) },
          { wikiLink: result.wikiLink },
        ),
      };
    case 'invalid-link':
      return {
        kind: 'error',
        error: validationError(
          'resolve:invalid-wiki-link',
          `Wiki Link "${wikiLink}" is malformed: ${result.reason}`,
          { scope: 'property', property: propertyName, ...(index !== undefined ? { index } : {}) },
          { wikiLink: result.wikiLink, reason: result.reason },
        ),
      };
    case 'ambiguous':
      return {
        kind: 'error',
        error: validationError(
          'resolve:ambiguous-wiki-link',
          `Wiki Link "${wikiLink}" is ambiguous.`,
          { scope: 'property', property: propertyName, ...(index !== undefined ? { index } : {}) },
          { wikiLink: result.wikiLink },
        ),
      };
    case 'unavailable':
      return {
        kind: 'error',
        error: validationError(
          'resolve:unavailable',
          `Wiki Link "${wikiLink}" could not be resolved: ${result.reason}`,
          { scope: 'property', property: propertyName, ...(index !== undefined ? { index } : {}) },
          { wikiLink: result.wikiLink, reason: result.reason },
        ),
      };
  }
}
