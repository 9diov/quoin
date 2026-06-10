import { describe, expect, it } from 'vitest';
import { readFile, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';

import {
  runCreate,
  createExitCode,
  serializeDocument,
} from '../../../src/integration/node-cli/create.js';
import { defaultConfig, createTempProject } from './helpers.js';

const CONCEPT_NO_TEMPLATE = `---\n_type: type\n---\n\n## Schema\n\n\`\`\`yaml\nproperties:\n  title:\n    type: text\n\`\`\`\n`;

const CONCEPT_WITH_DEFAULT = `---\n_type: type\n---\n\n## Schema\n\n\`\`\`yaml\nproperties:\n  status:\n    type: text\n    default: draft\n\`\`\`\n`;

const CONCEPT_WITH_TEMPLATE = `---\n_type: type\n---\n\n## Schema\n\n\`\`\`yaml\nproperties:\n  title:\n    type: text\n\`\`\`\n\n## Template\n\n\`\`\`markdown\n## Summary\n\nWrite here.\n\`\`\`\n`;

const CONCEPT_REQUIRED = `---\n_type: type\n---\n\n## Schema\n\n\`\`\`yaml\nproperties:\n  title:\n    type: text\n    required: true\n\`\`\`\n`;

describe('runCreate', () => {
  it('creates a frontmatter-only file when the type has no Template Block', async () => {
    const dir = await createTempProject({
      'types/Concept.md': CONCEPT_NO_TEMPLATE,
    });
    try {
      const result = await runCreate(defaultConfig(dir), 'concept', 'notes/a.md');
      expect(result.kind).toBe('created');
      expect(createExitCode(result)).toBe(0);

      const written = await readFile(join(dir, 'notes/a.md'), 'utf-8');
      expect(written).toBe('---\n_type: "[[Concept]]"\n---\n');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('synthesizes the declaration from the type-file basename', async () => {
    const dir = await createTempProject({
      'schemas/deep/Concept.md': CONCEPT_NO_TEMPLATE,
    });
    try {
      const result = await runCreate(defaultConfig(dir), 'concept', 'a.md');
      expect(result.kind).toBe('created');
      if (result.kind === 'created') {
        expect(result.declaration).toBe('[[Concept]]');
      }
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('writes scaffolded defaults into frontmatter', async () => {
    const dir = await createTempProject({
      'types/Concept.md': CONCEPT_WITH_DEFAULT,
    });
    try {
      const result = await runCreate(defaultConfig(dir), 'concept', 'a.md');
      expect(result.kind).toBe('created');

      const written = await readFile(join(dir, 'a.md'), 'utf-8');
      expect(written).toContain('_type: "[[Concept]]"');
      expect(written).toContain('status: draft');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('writes the template body below the frontmatter', async () => {
    const dir = await createTempProject({
      'types/Concept.md': CONCEPT_WITH_TEMPLATE,
    });
    try {
      const result = await runCreate(defaultConfig(dir), 'concept', 'a.md');
      expect(result.kind).toBe('created');

      const written = await readFile(join(dir, 'a.md'), 'utf-8');
      expect(written).toBe(
        '---\n_type: "[[Concept]]"\n---\n\n## Summary\n\nWrite here.\n',
      );
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('creates parent directories', async () => {
    const dir = await createTempProject({
      'types/Concept.md': CONCEPT_NO_TEMPLATE,
    });
    try {
      const result = await runCreate(
        defaultConfig(dir),
        'concept',
        'deeply/nested/dir/a.md',
      );
      expect(result.kind).toBe('created');
      const fileStat = await stat(join(dir, 'deeply/nested/dir/a.md'));
      expect(fileStat.isFile()).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('refuses to overwrite an existing file', async () => {
    const dir = await createTempProject({
      'types/Concept.md': CONCEPT_NO_TEMPLATE,
      'existing.md': 'do not touch',
    });
    try {
      const result = await runCreate(defaultConfig(dir), 'concept', 'existing.md');
      expect(result.kind).toBe('output-exists');
      expect(createExitCode(result)).toBe(1);
      const written = await readFile(join(dir, 'existing.md'), 'utf-8');
      expect(written).toBe('do not touch');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('refuses an out-of-root output path', async () => {
    const dir = await createTempProject({
      'types/Concept.md': CONCEPT_NO_TEMPLATE,
    });
    try {
      const result = await runCreate(
        defaultConfig(dir),
        'concept',
        '../escape.md',
      );
      expect(result.kind).toBe('output-invalid');
      expect(createExitCode(result)).toBe(1);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('aborts when a type definition fails to parse (discovery unhealthy)', async () => {
    const dir = await createTempProject({
      'types/Concept.md': CONCEPT_NO_TEMPLATE,
      'types/Broken.md': '---\n_type: type\n---\n\n# No schema block',
    });
    try {
      const result = await runCreate(defaultConfig(dir), 'concept', 'a.md');
      expect(result.kind).toBe('discovery-unhealthy');
      expect(createExitCode(result)).toBe(1);
      await expect(stat(join(dir, 'a.md'))).rejects.toThrow();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('aborts when a document fails to ingest (discovery unhealthy)', async () => {
    const dir = await createTempProject({
      'types/Concept.md': CONCEPT_NO_TEMPLATE,
      'bad.md': '---\nunclosed',
    });
    try {
      const result = await runCreate(defaultConfig(dir), 'concept', 'a.md');
      expect(result.kind).toBe('discovery-unhealthy');
      expect(createExitCode(result)).toBe(1);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('reports type-not-found for an unknown type', async () => {
    const dir = await createTempProject({
      'types/Concept.md': CONCEPT_NO_TEMPLATE,
    });
    try {
      const result = await runCreate(defaultConfig(dir), 'missing', 'a.md');
      expect(result.kind).toBe('type-not-found');
      expect(createExitCode(result)).toBe(1);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('reports type-ambiguous for duplicate canonical names', async () => {
    const dir = await createTempProject({
      'a/Concept.md': CONCEPT_NO_TEMPLATE,
      'b/Concept.md': CONCEPT_NO_TEMPLATE,
    });
    try {
      const result = await runCreate(defaultConfig(dir), 'concept', 'out.md');
      expect(result.kind).toBe('type-ambiguous');
      expect(createExitCode(result)).toBe(1);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('aborts on validation errors and does not write', async () => {
    const dir = await createTempProject({
      'types/Concept.md': CONCEPT_REQUIRED,
    });
    try {
      const result = await runCreate(defaultConfig(dir), 'concept', 'a.md');
      expect(result.kind).toBe('validation-failed');
      expect(createExitCode(result)).toBe(1);
      await expect(stat(join(dir, 'a.md'))).rejects.toThrow();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe('serializeDocument', () => {
  it('produces a frontmatter-only file when body is empty', () => {
    const out = serializeDocument({ _type: '[[Concept]]' }, '');
    expect(out).toBe('---\n_type: "[[Concept]]"\n---\n');
  });

  it('appends body below a blank line', () => {
    const out = serializeDocument({ _type: '[[Concept]]' }, '## Summary\n');
    expect(out).toBe('---\n_type: "[[Concept]]"\n---\n\n## Summary\n');
  });

  it('preserves key insertion order deterministically', () => {
    const out = serializeDocument(
      { _type: '[[Concept]]', status: 'draft', title: 'Hi' },
      '',
    );
    expect(out).toBe(
      '---\n_type: "[[Concept]]"\nstatus: draft\ntitle: Hi\n---\n',
    );
  });
});
