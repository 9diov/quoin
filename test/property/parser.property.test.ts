import { describe, expect } from 'vitest';
import { test, fc } from '@fast-check/vitest';

import { isCanonicalPropertyKey } from '../../src/core/parser/property-schema.js';

import {
  arbitraryCanonicalPropertyKey,
  arbitraryNonCanonicalPropertyKey,
} from './generators.js';

const CANONICAL_KEY_RE = /^[a-z0-9]([a-z0-9_-]*[a-z0-9])?$/;

function matchesGrammar(k: string): boolean {
  if (k === '_type') return true;
  return CANONICAL_KEY_RE.test(k);
}

describe('Tier 2 — parser properties', () => {
  test.prop(
    [arbitraryCanonicalPropertyKey],
    { numRuns: 500 },
  )(
    'canonical property keys pass isCanonicalPropertyKey',
    (key) => {
      expect(isCanonicalPropertyKey(key)).toBe(true);
      expect(matchesGrammar(key)).toBe(true);
    },
  );

  test.prop(
    [arbitraryNonCanonicalPropertyKey],
    { numRuns: 500 },
  )(
    'non-canonical property keys fail isCanonicalPropertyKey',
    (key) => {
      expect(isCanonicalPropertyKey(key)).toBe(false);
      expect(matchesGrammar(key)).toBe(false);
    },
  );

  test.prop(
    [fc.string({ maxLength: 50 })],
    { numRuns: 1000 },
  )(
    'property-key validation matches documented grammar for any string',
    (k) => {
      const implResult = isCanonicalPropertyKey(k);
      const grammarResult = matchesGrammar(k);
      expect(implResult).toBe(grammarResult);
    },
  );
});
