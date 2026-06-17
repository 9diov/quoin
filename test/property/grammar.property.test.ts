import { fc, test } from '@fast-check/vitest';
import { describe, expect } from 'vitest';

import { isValidWikiLinkShape } from '../../src/core/link-grammar.js';
import { isCanonicalDate } from '../../src/core/primitive-grammar.js';

import {
  arbitraryCanonicalDate,
  arbitraryNonCanonicalDate,
  arbitraryWikiLink,
} from './generators.js';

describe('Tier 1 — grammar properties', () => {
  test.prop([arbitraryWikiLink], { numRuns: 500 })(
    'generated wiki links satisfy isValidWikiLinkShape',
    (link) => {
      expect(isValidWikiLinkShape(link)).toBe(true);
    },
  );

  test.prop([fc.string({ maxLength: 200 }).filter((s) => s !== s.trim())], { numRuns: 500 })(
    'Trim invariance — Wiki Link shape rejects strings with surrounding whitespace',
    (s) => {
      expect(isValidWikiLinkShape(s)).toBe(false);
    },
  );

  test.prop([arbitraryCanonicalDate], { numRuns: 300 })(
    'canonical dates pass isCanonicalDate',
    (date) => {
      expect(isCanonicalDate(date)).toBe(true);
    },
  );

  test.prop([arbitraryNonCanonicalDate], { numRuns: 300 })(
    'non-canonical dates fail isCanonicalDate',
    (date) => {
      expect(isCanonicalDate(date)).toBe(false);
    },
  );
});
