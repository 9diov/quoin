import { describe, expect, it } from 'vitest';

import {
  detectDocRefFormat,
  isValidMarkdownLinkShape,
  isValidWikiLinkShape,
  parseMarkdownLink,
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

describe('isValidMarkdownLinkShape — accepted', () => {
  it.each([
    '[Label](path/to/doc.md)',
    '[Some Label](./sibling.md)',
    '[Up](../shared/x.md)',
    '[Root](/notes/x.md)',
    '[Frag](doc.md#section)',
  ])('accepts %s', (value) => {
    expect(isValidMarkdownLinkShape(value)).toBe(true);
  });
});

describe('isValidMarkdownLinkShape — rejected', () => {
  it.each([
    ['empty label', '[](doc.md)'],
    ['empty target', '[Label]()'],
    ['protocol http', '[Doc](http://example.com/doc.md)'],
    ['protocol https', '[Doc](https://example.com/doc.md)'],
    ['protocol mailto', '[Mail](mailto:a@b.c)'],
    ['unmatched paren', '[Doc](doc.md'],
    ['leading whitespace', ' [Doc](doc.md)'],
    ['plain text', 'doc.md'],
    ['wiki-link', '[[Doc]]'],
  ])('rejects %s', (_label, value) => {
    expect(isValidMarkdownLinkShape(value)).toBe(false);
  });
});

describe('parseMarkdownLink', () => {
  it('parses label and target', () => {
    expect(parseMarkdownLink('[Doc](path/to/x.md)')).toEqual({
      label: 'Doc',
      target: 'path/to/x.md',
    });
  });

  it('returns null on protocol-qualified target', () => {
    expect(parseMarkdownLink('[Doc](https://example.com)')).toBeNull();
  });
});

describe('detectDocRefFormat', () => {
  it('returns wiki-link for wiki-link shapes', () => {
    expect(detectDocRefFormat('[[Doc]]')).toBe('wiki-link');
  });

  it('returns markdown-link for markdown-link shapes', () => {
    expect(detectDocRefFormat('[Doc](doc.md)')).toBe('markdown-link');
  });

  it('returns null for non-doc-ref strings', () => {
    expect(detectDocRefFormat('Doc')).toBeNull();
    expect(detectDocRefFormat('https://example.com')).toBeNull();
  });
});
