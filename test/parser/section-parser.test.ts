import { describe, expect, it } from 'vitest';

import { extractAtxHeadings, parseTemplateSections } from '../../src/core/section-parser.js';

describe('extractAtxHeadings — levels and order', () => {
  it('returns ATX headings at every level with correct depth', () => {
    const md = `# One\n\n## Two\n\n### Three\n\n#### Four\n\n##### Five\n\n###### Six\n`;
    const headings = extractAtxHeadings(md);
    expect(headings.map((h) => h.level)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(headings.map((h) => h.heading)).toEqual(['One', 'Two', 'Three', 'Four', 'Five', 'Six']);
  });

  it('preserves source order', () => {
    const md = `### Third\n\n## Second\n\n# First\n`;
    const headings = extractAtxHeadings(md);
    expect(headings.map((h) => h.heading)).toEqual(['Third', 'Second', 'First']);
  });

  it('accepts up to three leading spaces (CommonMark)', () => {
    const md = `   ## Indented\n`;
    expect(extractAtxHeadings(md).map((h) => h.heading)).toEqual(['Indented']);
  });
});

describe('extractAtxHeadings — filters', () => {
  it('ignores Setext-style headings', () => {
    const md = `Definitions\n-----------\n\n## ATX Heading\n`;
    const headings = extractAtxHeadings(md);
    expect(headings.map((h) => h.heading)).toEqual(['ATX Heading']);
  });

  it('ignores ATX headings inside fenced code blocks', () => {
    const md = `## Real Heading\n\n\`\`\`markdown\n## Not A Heading\n\`\`\`\n\n## Another Real\n`;
    const headings = extractAtxHeadings(md);
    expect(headings.map((h) => h.heading)).toEqual(['Real Heading', 'Another Real']);
  });
});

describe('extractAtxHeadings — heading text', () => {
  it('strips HTML comments from heading text', () => {
    const md = `## Notes <!-- inline comment -->\n`;
    const headings = extractAtxHeadings(md);
    expect(headings[0]?.heading).toBe('Notes');
  });

  it('includes inlineCode content in heading text', () => {
    const md = `## The \`foo\` field\n`;
    const headings = extractAtxHeadings(md);
    expect(headings[0]?.heading).toBe('The foo field');
  });

  it('records source offsets for each heading', () => {
    const md = `# A\n\n## B\n`;
    const headings = extractAtxHeadings(md);
    expect(md.slice(headings[0]!.startOffset, headings[0]!.endOffset)).toBe('# A');
    expect(md.slice(headings[1]!.startOffset, headings[1]!.endOffset)).toBe('## B');
  });
});

describe('parseTemplateSections — required marker variants', () => {
  it.each([
    ['<!-- required -->', '## Definitions <!-- required -->\n'],
    ['<!--required-->', '## Definitions <!--required-->\n'],
    ['<!--   required   -->', '## Definitions <!--   required   -->\n'],
    ['adjacent', '## Definitions<!-- required -->\n'],
  ])('treats %s as required', (_label, md) => {
    const { sections } = parseTemplateSections(md);
    expect(sections[0]?.required).toBe(true);
  });

  it.each([
    ['Required (uppercase)', '## Definitions <!-- Required -->\n'],
    ['required-section', '## Definitions <!-- required-section -->\n'],
    ['required=true', '## Definitions <!-- required=true -->\n'],
    ['required other', '## Definitions <!-- required other -->\n'],
    ['no comment', '## Definitions\n'],
  ])('does not treat %s as required', (_label, md) => {
    const { sections } = parseTemplateSections(md);
    expect(sections[0]?.required).toBe(false);
  });

  it('strips the required marker from the heading text', () => {
    const { sections } = parseTemplateSections('## Definitions <!-- required -->\n');
    expect(sections[0]?.heading).toBe('Definitions');
  });
});

describe('parseTemplateSections — defaultContent', () => {
  it('captures body content between headings, stripping leading/trailing newlines', () => {
    const md = `## Definitions\n\nThis concept describes...\n\n## References\n`;
    const { sections } = parseTemplateSections(md);
    expect(sections[0]?.heading).toBe('Definitions');
    expect(sections[0]?.defaultContent).toBe('This concept describes...');
    expect(sections[1]?.heading).toBe('References');
    expect(sections[1]?.defaultContent).toBe('');
  });

  it('preserves HTML comments that appear in body content', () => {
    const md = `## Notes\n<!-- required -->\nbody text\n\n## End\n`;
    const { sections } = parseTemplateSections(md);
    expect(sections[0]?.required).toBe(false);
    expect(sections[0]?.defaultContent).toContain('<!-- required -->');
    expect(sections[0]?.defaultContent).toContain('body text');
  });

  it('captures body content up to end of input for the last section', () => {
    const md = `## Last\nfinal text\n`;
    const { sections } = parseTemplateSections(md);
    expect(sections[0]?.defaultContent).toBe('final text');
  });
});

describe('parseTemplateSections — duplicates', () => {
  it('rejects duplicate required Section identity', () => {
    const md = `## Definitions <!-- required -->\n\n## Definitions <!-- required -->\n`;
    const { sections, errors } = parseTemplateSections(md);
    expect(errors).toHaveLength(1);
    expect(errors[0]?.kind).toBe('parser:duplicate-required-section');
    expect(errors[0]?.location).toEqual({
      scope: 'section',
      section: 'Definitions',
      level: 2,
    });
    expect(sections).toHaveLength(1);
  });

  it('allows duplicate non-required Section identity', () => {
    const md = `## Notes\n\n## Notes\n`;
    const { sections, errors } = parseTemplateSections(md);
    expect(errors).toHaveLength(0);
    expect(sections).toHaveLength(2);
  });

  it('distinguishes required Sections at different levels', () => {
    const md = `## Notes <!-- required -->\n\n### Notes <!-- required -->\n`;
    const { sections, errors } = parseTemplateSections(md);
    expect(errors).toHaveLength(0);
    expect(sections).toHaveLength(2);
    expect(sections[0]?.level).toBe(2);
    expect(sections[1]?.level).toBe(3);
  });
});
