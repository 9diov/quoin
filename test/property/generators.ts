import fc from 'fast-check';
import { isCanonicalPropertyKey } from '../../src/core/parser/property-schema.js';
import type { ParsedTypeDefinitionDocument, Schema } from '../../src/index.js';

const alphaNumSlash = fc.constantFrom(
  ...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789/-_.'.split(''),
);

const WIKI_TARGET_CHAR = fc.string({
  unit: alphaNumSlash,
  minLength: 1,
  maxLength: 30,
});

const alphaNumSpace = fc.constantFrom(
  ...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 _-'.split(''),
);

const WIKI_ALIAS_CHAR = fc.string({
  unit: alphaNumSpace,
  minLength: 1,
  maxLength: 20,
});

const WIKI_HEADING_CHAR = fc.string({
  unit: alphaNumSpace,
  minLength: 1,
  maxLength: 20,
});

const alphaNumDash = fc.constantFrom(
  ...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-'.split(''),
);

const WIKI_BLOCK_ID_CHAR = fc.string({
  unit: alphaNumDash,
  minLength: 1,
  maxLength: 10,
});

export const arbitraryWikiLink: fc.Arbitrary<string> = fc
  .tuple(
    WIKI_TARGET_CHAR,
    fc.option(WIKI_ALIAS_CHAR, { nil: undefined }),
    fc.option(WIKI_HEADING_CHAR, { nil: undefined }),
    fc.option(WIKI_BLOCK_ID_CHAR, { nil: undefined }),
  )
  .map(([target, alias, heading, blockId]) => {
    const parts: string[] = [];
    if (alias !== undefined) parts.push(`|${alias}`);
    if (heading !== undefined) parts.push(`#${heading}`);
    if (blockId !== undefined && heading === undefined) parts.push(`#^${blockId}`);
    return `[[${target}${parts.join('')}]]`;
  });

const linkTextChars = fc.constantFrom(
  ...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 _-'.split(''),
);

// Link text must trim to something non-empty and must not contain `]`, which
// would prematurely terminate the text bracket in parseExternalLink.
const LINK_TEXT = fc
  .string({ unit: linkTextChars, minLength: 1, maxLength: 20 })
  .filter((t) => t.trim().length > 0 && !t.includes(']'));

// URL path restricted to characters that keep `new URL(...)` happy and contain
// no whitespace or parentheses (both rejected by parseExternalLink).
const urlPathChars = fc.constantFrom(
  ...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_/'.split(''),
);

const URL_PATH = fc.string({ unit: urlPathChars, maxLength: 30 });

export const arbitraryAllowedSchemes: fc.Arbitrary<string[]> = fc
  .tuple(
    fc.constant('https' as const),
    fc.constant('http' as const),
    fc.constant('mailto' as const),
    fc.boolean(),
    fc.boolean(),
    fc.boolean(),
  )
  .map(([, , , includeHttp, includeMailto, includeExtra]) => {
    const schemes = ['https'];
    if (includeHttp) schemes.push('http');
    if (includeMailto) schemes.push('mailto');
    if (includeExtra) schemes.push('ftp');
    return schemes;
  });

// Valid-by-construction external links across all default-allowed schemes.
// http/https use a real host so `new URL(...)` succeeds; mailto is accepted on
// shape alone by parseExternalLink.
export const arbitraryExternalLink: fc.Arbitrary<string> = fc
  .tuple(LINK_TEXT, fc.constantFrom('http', 'https', 'mailto'), URL_PATH)
  .map(([text, scheme, path]) => {
    const url = scheme === 'mailto' ? 'mailto:user@example.com' : `${scheme}://example.com/${path}`;
    return `[${text}](${url})`;
  });

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

function isGregorianLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export const arbitraryCanonicalDate: fc.Arbitrary<string> = fc
  .tuple(fc.integer({ min: 1, max: 9999 }), fc.integer({ min: 1, max: 12 }))
  .chain(([year, month]) =>
    fc.integer({ min: 1, max: daysInMonth(year, month) }).map((day) => {
      const y = String(year).padStart(4, '0');
      const m = String(month).padStart(2, '0');
      const d = String(day).padStart(2, '0');
      return `${y}-${m}-${d}`;
    }),
  );

const INVALID_DATE_KIND = fc.constantFrom(
  'bad-format',
  'month-zero',
  'month-thirteen',
  'april-31',
  'feb-29-non-leap',
  'day-zero',
  'garbage',
) as fc.Arbitrary<string>;

export const arbitraryNonCanonicalDate: fc.Arbitrary<string> = INVALID_DATE_KIND.chain((kind) => {
  switch (kind) {
    case 'bad-format':
      return fc
        .tuple(
          fc.integer({ min: 10000, max: 99999 }),
          fc.integer({ min: 1, max: 12 }),
          fc.integer({ min: 1, max: 28 }),
        )
        .map(([y, m, d]) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
    case 'month-zero':
      return fc.integer({ min: 1, max: 28 }).map((d) => `2023-00-${String(d).padStart(2, '0')}`);
    case 'month-thirteen':
      return fc.integer({ min: 1, max: 28 }).map((d) => `2023-13-${String(d).padStart(2, '0')}`);
    case 'april-31':
      return fc.constant('2023-04-31');
    case 'feb-29-non-leap': {
      const nonLeap = fc.integer({ min: 1, max: 9999 }).filter((y) => !isGregorianLeapYear(y));
      return nonLeap.map((y) => `${y}-02-29`);
    }
    case 'day-zero':
      return fc.constant('2023-06-00');
    case 'garbage':
      return fc.constantFrom('not-a-date', '', '2023', '2023-14-01');
    default:
      return fc.constant('not-a-date');
  }
});

const CANONICAL_KEY_CHARS = 'abcdefghijklmnopqrstuvwxyz0123456789_-'.split('');

const CANONICAL_KEY_CHAR_ARB = fc.constantFrom(...CANONICAL_KEY_CHARS);

const CANONICAL_KEY_MID = fc.string({
  unit: CANONICAL_KEY_CHAR_ARB,
  minLength: 1,
  maxLength: 20,
});

const CANONICAL_KEY_START = fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789'.split(''));

export const arbitraryCanonicalPropertyKey: fc.Arbitrary<string> = fc
  .tuple(CANONICAL_KEY_START, CANONICAL_KEY_MID)
  .map(([start, mid]) => {
    if (mid.length === 0) return start;
    const lastChar = mid[mid.length - 1];
    if (lastChar === '-' || lastChar === '_') {
      return start + mid.slice(0, -1);
    }
    return start + mid;
  })
  .filter((key) => {
    if (key.length === 0) return false;
    const first = key[0] ?? '';
    const last = key[key.length - 1] ?? '';
    if (first === '-' || first === '_') return false;
    if (last === '-' || last === '_') return false;
    return true;
  });

export const arbitraryNonCanonicalPropertyKey: fc.Arbitrary<string> = fc
  .oneof(
    fc.constant(''),
    arbitraryCanonicalPropertyKey.map((k) => `-${k}`),
    arbitraryCanonicalPropertyKey.map((k) => `${k}-`),
    arbitraryCanonicalPropertyKey.map((k) => `_${k}`),
    arbitraryCanonicalPropertyKey.map((k) => `${k}_`),
    arbitraryCanonicalPropertyKey.map((k) => k.toUpperCase()),
    fc.string({
      unit: fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')),
      minLength: 1,
      maxLength: 10,
    }),
  )
  // Some mutations are no-ops on certain inputs (e.g. `toUpperCase()` on an
  // all-digit key like "23" yields a still-canonical key). Filter against the
  // real predicate so the generator's declared intent — "non-canonical" —
  // actually holds for every value it emits.
  .filter((k) => !isCanonicalPropertyKey(k));

const PRIMITIVE_TYPES = fc.constantFrom('text', 'number', 'boolean', 'date') as fc.Arbitrary<
  'text' | 'number' | 'boolean' | 'date'
>;

export type GeneratedSchemaInfo = {
  typeDef: ParsedTypeDefinitionDocument;
  defaultedPropertyKey: string;
};

export const arbitrarySchemaWithDefault: fc.Arbitrary<GeneratedSchemaInfo> = fc
  .tuple(
    arbitraryCanonicalPropertyKey.filter((k) => k !== '_type'),
    PRIMITIVE_TYPES,
  )
  .chain(([key, type]) => {
    const defaultVal: fc.Arbitrary<unknown> =
      type === 'text'
        ? fc.string({ minLength: 1, maxLength: 20 })
        : type === 'number'
          ? fc.integer({ min: 0, max: 100 })
          : type === 'boolean'
            ? fc.boolean()
            : arbitraryCanonicalDate;

    return defaultVal.map((defaultValue) => {
      const properties: Schema['properties'] = {
        [key]: {
          type,
          required: true,
          default: defaultValue,
        },
      };

      const schema: Schema = { properties };
      const typeDef: ParsedTypeDefinitionDocument = {
        id: 'types/Test.md',
        name: 'test',
        schema,
      };

      return { typeDef, defaultedPropertyKey: key };
    });
  });
