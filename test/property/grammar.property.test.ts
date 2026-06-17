import { fc, test } from '@fast-check/vitest';
import { describe, expect } from 'vitest';

import {
  isValidExternalLinkShape,
  isValidWikiLinkShape,
  parseExternalLink,
} from '../../src/core/link-grammar.js';
import { isCanonicalDate } from '../../src/core/primitive-grammar.js';

import {
  arbitraryAllowedSchemes,
  arbitraryCanonicalDate,
  arbitraryExternalLink,
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

  test.prop([arbitraryExternalLink], { numRuns: 500 })(
    'generated external links satisfy isValidExternalLinkShape',
    (link) => {
      expect(isValidExternalLinkShape(link)).toBe(true);
    },
  );

  // Draw from valid links of both kinds plus arbitrary strings, so the
  // disjointness claim is exercised on the interesting inputs (actual links),
  // not just on random strings that are neither.
  test.prop([fc.oneof(arbitraryWikiLink, arbitraryExternalLink, fc.string({ maxLength: 200 }))], {
    numRuns: 1000,
  })('Wiki/external link disjointness — no string satisfies both predicates', (s) => {
    const wiki = isValidWikiLinkShape(s);
    const ext = isValidExternalLinkShape(s);
    expect(wiki && ext).toBe(false);
  });

  test.prop([fc.string({ maxLength: 200 }).filter((s) => s !== s.trim())], { numRuns: 500 })(
    'Trim invariance — shape checks reject strings with surrounding whitespace',
    (s) => {
      expect(isValidWikiLinkShape(s)).toBe(false);
      expect(isValidExternalLinkShape(s)).toBe(false);
    },
  );

  test.prop([fc.string({ maxLength: 200 }), arbitraryAllowedSchemes], { numRuns: 500 })(
    'parseExternalLink determinism — same input returns identical result across two runs',
    (s, schemes) => {
      const r1 = JSON.stringify(parseExternalLink(s, schemes));
      const r2 = JSON.stringify(parseExternalLink(s, schemes));
      expect(r1).toBe(r2);
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
