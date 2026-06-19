/**
 * @quoin-terms Reserved Property, Integration, Validation Warning
 * @quoin-docs docs/design/D3-validation-semantics.md
 */

import type { Schema } from '../parser.js';
import type { IntegrationName, ValidationWarning } from '../validation.js';
import { validationWarning } from './errors.js';

const RESERVED_PROPERTIES: Record<IntegrationName, ReadonlySet<string>> = {
  obsidian: new Set(['tags', 'aliases', 'cssclasses', 'publish']),
  hugo: new Set([
    'title',
    'date',
    'draft',
    'aliases',
    'description',
    'categories',
    'tags',
    'weight',
  ]),
  jekyll: new Set(['layout', 'title', 'date', 'categories', 'tags', 'published']),
  gitbook: new Set(['title', 'layout', 'description', 'type']),
  docusaurus: new Set([
    'title',
    'slug',
    'description',
    'keywords',
    'image',
    'sidebar_position',
    'sidebar_label',
  ]),
  vitepress: new Set(['title', 'description', 'head', 'lastUpdated', 'prev', 'next', 'layout']),
};

export function validateReservedCollisions(
  schema: Schema,
  integration: IntegrationName | undefined,
): ValidationWarning[] {
  if (!integration) return [];

  const reserved = RESERVED_PROPERTIES[integration];
  const warnings: ValidationWarning[] = [];

  for (const propertyKey of Object.keys(schema.properties)) {
    if (reserved.has(propertyKey)) {
      warnings.push(
        validationWarning(
          'property:reserved-collision',
          `Property "${propertyKey}" collides with a reserved ${integration} property.`,
          { scope: 'property', property: propertyKey },
          { integration },
        ),
      );
    }
  }

  return warnings;
}
