import { describe, expect, it } from 'vitest';

import {
  isValidExternalLinkShape,
  isValidWikiLinkShape,
  parseExternalLink,
} from '../../src/core/link-grammar.js';

describe('isValidWikiLinkShape — accepted', () => {
  it.each([
    '[[TargetDocument]]',
    '[[path/to/TargetDocument]]',
    '[[TargetDocument|Alias]]',
    '[[TargetDocument#Heading]]',
    '[[TargetDocument#^block-id]]',
    '[[TargetDocument|Alias With Spaces]]',
    '[[TargetDocument#Heading|Alias]]',
  ])('accepts %s', (value) => {
    expect(isValidWikiLinkShape(value)).toBe(true);
  });
});

describe('isValidWikiLinkShape — rejected', () => {
  it.each([
    ['empty target', '[[]]'],
    ['empty target with alias', '[[|Alias]]'],
    ['empty target with heading', '[[#Heading]]'],
    ['missing closing', '[[TargetDocument'],
    ['missing opening', 'TargetDocument]]'],
    ['surrounding whitespace', ' [[TargetDocument]]'],
    ['trailing whitespace', '[[TargetDocument]] '],
    ['nested open brackets', '[[Outer[[Inner]]]]'],
    ['nested close brackets', '[[Outer]]Inner]]'],
    ['single brackets', '[TargetDocument]'],
    ['only brackets', '[[]'],
  ])('rejects %s', (_label, value) => {
    expect(isValidWikiLinkShape(value)).toBe(false);
  });

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['number', 42],
    ['object', { target: 'X' }],
    ['array', ['[[X]]']],
  ])('rejects non-string input: %s', (_label, value) => {
    expect(isValidWikiLinkShape(value)).toBe(false);
  });
});

describe('parseExternalLink / isValidExternalLinkShape — accepted', () => {
  it.each([
    '[Docs](https://example.com)',
    '[**Docs**](https://example.com)',
    '[`API`](https://example.com)',
    '[Docs with text](https://example.com/path)',
    '[Example](http://example.com)',
    '[Email](mailto:user@example.com)',
  ])('accepts %s', (value) => {
    expect(isValidExternalLinkShape(value)).toBe(true);
  });

  it('exposes parsed components on success', () => {
    const result = parseExternalLink('[Docs](https://example.com)');
    expect(result.kind).toBe('valid');
    if (result.kind !== 'valid') return;
    expect(result.text).toBe('Docs');
    expect(result.url).toBe('https://example.com');
    expect(result.scheme).toBe('https');
  });
});

describe('parseExternalLink — rejected by shape', () => {
  it.each([
    ['empty label', '[](https://example.com)', 'empty-text'],
    ['whitespace label', '[   ](https://example.com)', 'empty-text'],
    ['Markdown title', '[Docs](https://example.com "Example docs")', 'whitespace-in-url'],
    ['raw URL parentheses', '[Spec](https://example.com/path(foo))', 'parens-in-url'],
    ['internal whitespace in URL', '[Docs](https://exa mple.com)', 'whitespace-in-url'],
    ['leading whitespace', ' [Docs](https://example.com)', 'surrounding-whitespace'],
    ['trailing whitespace', '[Docs](https://example.com) ', 'surrounding-whitespace'],
    ['missing url parens', '[Docs]https://example.com', 'missing-url-parens'],
    ['unterminated text', '[Docs(https://example.com)', 'unterminated-text'],
    ['empty URL', '[Docs]()', 'empty-url'],
  ])('rejects %s', (_label, value, expectedReason) => {
    const result = parseExternalLink(value);
    expect(result.kind).toBe('invalid');
    if (result.kind !== 'invalid') return;
    expect(result.reason).toBe(expectedReason);
  });
});

describe('parseExternalLink — scheme allowlist', () => {
  it('rejects javascript: by default', () => {
    const result = parseExternalLink('[click](javascript:alert(1))');
    expect(result.kind).toBe('invalid');
  });

  it('rejects file: by default', () => {
    const result = parseExternalLink('[file](file:///etc/passwd)');
    expect(result.kind).toBe('invalid');
  });

  it('accepts ftp: when added to allowed schemes', () => {
    const result = parseExternalLink('[ftp](ftp://example.com/path)', ['http', 'https', 'ftp']);
    expect(result.kind).toBe('valid');
  });

  it('reports disallowed-scheme reason with the scheme name', () => {
    const result = parseExternalLink('[x](gopher://example.com)');
    expect(result.kind).toBe('invalid');
    if (result.kind !== 'invalid') return;
    expect(result.reason).toBe('disallowed-scheme:gopher');
  });
});

describe('parseExternalLink — URL parse', () => {
  it.each([
    '[x](https://exa[mple.com)',
    '[x](https://%zz/)',
    '[x](http://)',
  ])('rejects unparseable %s', (value) => {
    const result = parseExternalLink(value);
    expect(result.kind).toBe('invalid');
    if (result.kind !== 'invalid') return;
    expect(result.reason).toBe('unparseable-url');
  });

  it('accepts mailto: without running it through URL constructor', () => {
    // `new URL('mailto:user@example.com')` works but `mailto:plain` may not —
    // the contract says shape + scheme is enough for mailto.
    const result = parseExternalLink('[mail](mailto:user@example.com)');
    expect(result.kind).toBe('valid');
  });
});

describe('parseExternalLink — non-string input', () => {
  it.each([
    null,
    undefined,
    42,
    { text: 'x' },
    ['[x](https://a.b)'],
  ])('rejects non-string input', (value) => {
    const result = parseExternalLink(value);
    expect(result.kind).toBe('invalid');
    if (result.kind !== 'invalid') return;
    expect(result.reason).toBe('not-a-string');
  });
});
