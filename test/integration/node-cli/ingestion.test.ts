import { describe, expect, it } from 'vitest';
import { mkdtemp, writeFile, rm, symlink, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';

import {
  discoverMarkdownFiles,
  ingestMarkdownFiles,
  discoverAndIngest,
  isTypeDefinitionCandidate,
  filterTypeDefinitionCandidates,
  type IngestedMarkdown,
} from '../../../src/integration/node-cli/ingestion.js';

async function createTempProject(
  files: Record<string, string | null>,
): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'mts-ingest-'));
  for (const [relPath, content] of Object.entries(files)) {
    const fullPath = join(dir, relPath);
    await mkdir(dirname(fullPath), { recursive: true });
    await writeFile(fullPath, content ?? '', 'utf-8');
  }
  return dir;
}

function expectDocument(
  result: IngestedMarkdown,
  expectedPath: string,
  expectedFrontmatter: Record<string, unknown>,
  expectedBodyStart?: string,
): void {
  expect(result.kind).toBe('document');
  if (result.kind !== 'document') return;
  expect(result.document.path).toBe(expectedPath);
  expect(result.document.frontmatter).toEqual(expectedFrontmatter);
  if (expectedBodyStart !== undefined) {
    expect(result.document.body).toContain(expectedBodyStart);
  }
}

function expectIngestFailure(
  result: IngestedMarkdown,
  expectedPath: string,
  expectedStage: 'read' | 'frontmatter',
): void {
  expect(result.kind).toBe('ingest-failure');
  if (result.kind !== 'ingest-failure') return;
  expect(result.path).toBe(expectedPath);
  expect(result.stage).toBe(expectedStage);
}

describe('discoverMarkdownFiles', () => {
  it('finds .md files under root', async () => {
    const dir = await createTempProject({
      'a.md': 'content',
      'b.md': 'content',
      'notes/c.md': 'content',
      'notes/d.md': 'content',
      'readme.txt': 'text',
      'image.png': 'png',
    });
    try {
      const paths = await discoverMarkdownFiles(dir, ['**/*.md'], []);
      expect(paths).toEqual(['a.md', 'b.md', 'notes/c.md', 'notes/d.md']);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('respects exclude patterns', async () => {
    const dir = await createTempProject({
      'a.md': 'content',
      'node_modules/pkg.md': 'content',
      '.git/config.md': 'content',
      'dist/bundle.md': 'content',
    });
    try {
      const paths = await discoverMarkdownFiles(dir, ['**/*.md'], [
        'node_modules/**',
        '.git/**',
        'dist/**',
      ]);
      expect(paths).toEqual(['a.md']);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('returns paths in sorted lexical order', async () => {
    const dir = await createTempProject({
      'z.md': '',
      'a.md': '',
      'm.md': '',
    });
    try {
      const paths = await discoverMarkdownFiles(dir, ['**/*.md'], []);
      expect(paths).toEqual(['a.md', 'm.md', 'z.md']);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('ignores symlinks', async () => {
    const dir = await createTempProject({
      'real.md': 'content',
    });
    try {
      await symlink(join(dir, 'real.md'), join(dir, 'link.md'));
      const paths = await discoverMarkdownFiles(dir, ['**/*.md'], []);
      expect(paths).toEqual(['real.md']);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('respects custom include patterns', async () => {
    const dir = await createTempProject({
      'a.md': '',
      'b.mdx': '',
      'c.md': '',
    });
    try {
      const paths = await discoverMarkdownFiles(dir, ['**/*.mdx'], []);
      expect(paths).toEqual(['b.mdx']);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('normalizes paths to POSIX', async () => {
    const dir = await createTempProject({
      'sub/dir/file.md': '',
    });
    try {
      const paths = await discoverMarkdownFiles(dir, ['**/*.md'], []);
      expect(paths).toEqual(['sub/dir/file.md']);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('discovers dotfiles and files in dot-directories', async () => {
    const dir = await createTempProject({
      '.hidden.md': '',
      '.config/note.md': '',
      'visible.md': '',
    });
    try {
      const paths = await discoverMarkdownFiles(dir, ['**/*.md'], []);
      expect(paths).toEqual(['.config/note.md', '.hidden.md', 'visible.md']);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe('ingestMarkdownFiles', () => {
  it('ingests a file with valid frontmatter', async () => {
    const dir = await createTempProject({
      'doc.md': '---\ntitle: Hello\n---\n\nBody content.',
    });
    try {
      const results = await ingestMarkdownFiles(dir, ['doc.md']);
      expect(results).toHaveLength(1);
      expectDocument(results[0]!, 'doc.md', { title: 'Hello' }, 'Body content.');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('accepts --- with trailing whitespace as frontmatter opening', async () => {
    const dir = await createTempProject({
      'doc.md': '---   \ntitle: Hello\n---\n\nBody content.',
    });
    try {
      const results = await ingestMarkdownFiles(dir, ['doc.md']);
      expect(results).toHaveLength(1);
      expectDocument(results[0]!, 'doc.md', { title: 'Hello' }, 'Body content.');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('treats ---- as body, not frontmatter', async () => {
    const dir = await createTempProject({
      'doc.md': '----\n\nThis is a horizontal rule, not frontmatter.',
    });
    try {
      const results = await ingestMarkdownFiles(dir, ['doc.md']);
      expect(results).toHaveLength(1);
      expectDocument(
        results[0]!,
        'doc.md',
        {},
        '----\n\nThis is a horizontal rule, not frontmatter.',
      );
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('treats --- title as body, not frontmatter', async () => {
    const dir = await createTempProject({
      'doc.md': '--- title\n\n## Body content.',
    });
    try {
      const results = await ingestMarkdownFiles(dir, ['doc.md']);
      expect(results).toHaveLength(1);
      expectDocument(
        results[0]!,
        'doc.md',
        {},
        '--- title\n\n## Body content.',
      );
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('ingests a file with no frontmatter as empty object', async () => {
    const dir = await createTempProject({
      'doc.md': '# Just a heading\n\nSome content.',
    });
    try {
      const results = await ingestMarkdownFiles(dir, ['doc.md']);
      expect(results).toHaveLength(1);
      expectDocument(
        results[0]!,
        'doc.md',
        {},
        '# Just a heading',
      );
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('ingests empty frontmatter as empty object', async () => {
    const dir = await createTempProject({
      'doc.md': '---\n---\n\nBody.',
    });
    try {
      const results = await ingestMarkdownFiles(dir, ['doc.md']);
      expect(results).toHaveLength(1);
      expectDocument(results[0]!, 'doc.md', {}, 'Body.');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('ingests frontmatter with whitespace-only content as empty', async () => {
    const dir = await createTempProject({
      'doc.md': '---\n   \n---\n\nBody.',
    });
    try {
      const results = await ingestMarkdownFiles(dir, ['doc.md']);
      expect(results).toHaveLength(1);
      expectDocument(results[0]!, 'doc.md', {}, 'Body.');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('preserves body exactly after frontmatter split', async () => {
    const body = '## Section\n\nSome text with --- dashes\n\nMore content.';
    const dir = await createTempProject({
      'doc.md': `---\ntitle: Test\n---\n${body}`,
    });
    try {
      const results = await ingestMarkdownFiles(dir, ['doc.md']);
      expect(results).toHaveLength(1);
      expectDocument(results[0]!, 'doc.md', { title: 'Test' }, body);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('preserves CRLF line endings in body', async () => {
    const body = '## Section\r\n\r\nSome text with --- dashes\r\n\r\nMore content.';
    const dir = await createTempProject({
      'doc.md': `---\r\ntitle: Test\r\n---\r\n${body}`,
    });
    try {
      const results = await ingestMarkdownFiles(dir, ['doc.md']);
      expect(results).toHaveLength(1);
      if (results[0]!.kind === 'document') {
        expect(results[0]!.document.body).toBe(body);
      } else {
        expect.unreachable('Expected a document');
      }
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('handles frontmatter containing --- within string values', async () => {
    const dir = await createTempProject({
      'doc.md': '---\ntitle: "--- separator ---"\ndesc: text\n---\n\nBody.',
    });
    try {
      const results = await ingestMarkdownFiles(dir, ['doc.md']);
      expect(results).toHaveLength(1);
      expectDocument(
        results[0]!,
        'doc.md',
        { title: '--- separator ---', desc: 'text' },
        'Body.',
      );
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('reports ingestion failure for unclosed frontmatter', async () => {
    const dir = await createTempProject({
      'doc.md': '---\ntitle: Hello\n',
    });
    try {
      const results = await ingestMarkdownFiles(dir, ['doc.md']);
      expect(results).toHaveLength(1);
      expectIngestFailure(results[0]!, 'doc.md', 'frontmatter');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('reports ingestion failure for non-object YAML frontmatter (array)', async () => {
    const dir = await createTempProject({
      'doc.md': '---\n- item1\n- item2\n---\n\nBody.',
    });
    try {
      const results = await ingestMarkdownFiles(dir, ['doc.md']);
      expect(results).toHaveLength(1);
      expectIngestFailure(results[0]!, 'doc.md', 'frontmatter');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('reports ingestion failure for non-object YAML frontmatter (scalar)', async () => {
    const dir = await createTempProject({
      'doc.md': '---\njust a string\n---\n\nBody.',
    });
    try {
      const results = await ingestMarkdownFiles(dir, ['doc.md']);
      expect(results).toHaveLength(1);
      expectIngestFailure(results[0]!, 'doc.md', 'frontmatter');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('reports ingestion failure for invalid YAML in frontmatter', async () => {
    const dir = await createTempProject({
      'doc.md': '---\nkey: {{ invalid\n---\n\nBody.',
    });
    try {
      const results = await ingestMarkdownFiles(dir, ['doc.md']);
      expect(results).toHaveLength(1);
      expectIngestFailure(results[0]!, 'doc.md', 'frontmatter');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('ingests multiple files mixed with failures', async () => {
    const dir = await createTempProject({
      'good.md': '---\ntitle: OK\n---\n\nBody.',
      'bad.md': '---\nunclosed',
      'plain.md': '# No frontmatter',
    });
    try {
      const results = await ingestMarkdownFiles(dir, [
        'good.md',
        'bad.md',
        'plain.md',
      ]);
      expect(results).toHaveLength(3);
      expectDocument(results[0]!, 'good.md', { title: 'OK' }, 'Body.');
      expectIngestFailure(results[1]!, 'bad.md', 'frontmatter');
      expectDocument(results[2]!, 'plain.md', {}, '# No frontmatter');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('preserves raw content on successful documents', async () => {
    const raw = '---\ntitle: Test\n---\n\nBody content.';
    const dir = await createTempProject({ 'doc.md': raw });
    try {
      const results = await ingestMarkdownFiles(dir, ['doc.md']);
      expect(results).toHaveLength(1);
      if (results[0]!.kind === 'document') {
        expect(results[0]!.raw).toBe(raw);
      } else {
        expect.unreachable('Expected a document');
      }
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe('isTypeDefinitionCandidate', () => {
  it('returns true when frontmatter has type sentinel', () => {
    const doc = { path: 'types/Concept.md', frontmatter: { _type: 'type' }, body: '' };
    expect(isTypeDefinitionCandidate(doc, '_type')).toBe(true);
  });

  it('returns true with custom type declaration key', () => {
    const doc = { path: 'types/Concept.md', frontmatter: { kind: 'type' }, body: '' };
    expect(isTypeDefinitionCandidate(doc, 'kind')).toBe(true);
  });

  it('returns false for non-sentinel value', () => {
    const doc = { path: 'doc.md', frontmatter: { _type: '[[Concept]]' }, body: '' };
    expect(isTypeDefinitionCandidate(doc, '_type')).toBe(false);
  });

  it('returns false when key is missing', () => {
    const doc = { path: 'doc.md', frontmatter: { title: 'Hello' }, body: '' };
    expect(isTypeDefinitionCandidate(doc, '_type')).toBe(false);
  });

  it('returns false for empty frontmatter', () => {
    const doc = { path: 'doc.md', frontmatter: {}, body: '' };
    expect(isTypeDefinitionCandidate(doc, '_type')).toBe(false);
  });
});

describe('filterTypeDefinitionCandidates', () => {
  it('filters ingested results to type definition candidates only', () => {
    const results: IngestedMarkdown[] = [
      {
        kind: 'document',
        path: 'types/Concept.md',
        raw: '---\n_type: type\n---\n\nbody',
        document: { path: 'types/Concept.md', frontmatter: { _type: 'type' }, body: 'body' },
      },
      {
        kind: 'document',
        path: 'doc.md',
        raw: '---\n_type: "[[Concept]]"\n---\n\nbody',
        document: { path: 'doc.md', frontmatter: { _type: '[[Concept]]' }, body: 'body' },
      },
      {
        kind: 'ingest-failure',
        path: 'bad.md',
        stage: 'frontmatter',
        reason: 'unclosed',
      },
      {
        kind: 'document',
        path: 'types/Skill.md',
        raw: '---\n_type: type\n---\n\nbody',
        document: { path: 'types/Skill.md', frontmatter: { _type: 'type' }, body: 'body' },
      },
    ];

    const candidates = filterTypeDefinitionCandidates(results, '_type');
    expect(candidates).toHaveLength(2);
    expect(candidates.map((c) => c.path)).toEqual([
      'types/Concept.md',
      'types/Skill.md',
    ]);
  });

  it('returns empty array when no candidates', () => {
    const results: IngestedMarkdown[] = [
      {
        kind: 'document',
        path: 'doc.md',
        raw: 'body',
        document: { path: 'doc.md', frontmatter: {}, body: 'body' },
      },
    ];

    const candidates = filterTypeDefinitionCandidates(results, '_type');
    expect(candidates).toHaveLength(0);
  });
});

describe('discoverAndIngest', () => {
  it('discovers and ingests all markdown files in one call', async () => {
    const dir = await createTempProject({
      'one.md': '---\ntitle: First\n---\n\nContent one.',
      'two.md': '# No frontmatter here',
      'three.md': '---\nbroken',
    });
    try {
      const results = await discoverAndIngest(dir, ['**/*.md'], []);
      expect(results).toHaveLength(3);
      const paths = results
        .filter((r) => r.kind === 'document')
        .map((r) => (r as Extract<IngestedMarkdown, { kind: 'document' }>).path);
      expect(paths).toEqual(['one.md', 'two.md']);
      const failures = results.filter((r) => r.kind === 'ingest-failure');
      expect(failures).toHaveLength(1);
      expect((failures[0]!).path).toBe('three.md');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
