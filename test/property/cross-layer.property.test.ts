import { fc, test } from '@fast-check/vitest';
import { describe, expect } from 'vitest';

import type { Document } from '../../src/index.js';
import { scaffold, validate } from '../../src/index.js';

import { arbitrarySchemaWithDefault } from './generators.js';

describe('Tier 3 — cross-layer properties', () => {
  test.prop([arbitrarySchemaWithDefault, fc.boolean()], { numRuns: 200 })(
    'scaffold-then-validate produces no property:missing-required for defaulted properties',
    ({ typeDef, defaultedPropertyKey }, hasProp) => {
      const defaultValue = typeDef.schema.properties[defaultedPropertyKey]?.default;

      const frontmatter: Record<string, unknown> = hasProp
        ? { [defaultedPropertyKey]: defaultValue }
        : {};

      const scaffoldingResult = scaffold(frontmatter, typeDef);

      const mergedFrontmatter: Record<string, unknown> = {
        ...frontmatter,
        ...scaffoldingResult.properties,
      };

      const document: Document = {
        path: 'notes/test.md',
        frontmatter: mergedFrontmatter,
        body: '',
      };

      const validationResult = validate(document, typeDef, {});

      const missingRequiredErrors = validationResult.errors.filter(
        (e) =>
          e.kind === 'property:missing-required' &&
          e.location.scope === 'property' &&
          e.location.property === defaultedPropertyKey,
      );

      expect(missingRequiredErrors).toEqual([]);
    },
  );
});
