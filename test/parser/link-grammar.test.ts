import { describe, expect, it } from 'vitest';

import { isValidWikiLinkShape } from '../../src/core/link-grammar.js';

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
