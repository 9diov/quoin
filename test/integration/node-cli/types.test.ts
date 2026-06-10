import { describe, expect, it } from 'vitest';
import { rm } from 'node:fs/promises';

import { runTypes } from '../../../src/integration/node-cli/types.js';
import { defaultConfig, createTempProject } from './helpers.js';

const CONCEPT = `---\n_type: type\n---\n\n## Schema\n\n\`\`\`yaml\nproperties:\n  title:\n    type: text\n    required: true\n  tags:\n    type: list<text>\n\`\`\`\n\n## Template\n\n\`\`\`markdown\n## Summary <!-- required -->\n\`\`\`\n`;

const SKILL = `---\n_type: type\n---\n\n## Schema\n\n\`\`\`yaml\nproperties:\n  name:\n    type: text\n\`\`\`\n`;

describe('runTypes', () => {
  it('lists discovered type summaries sorted by id', async () => {
    const dir = await createTempProject({
      'types/Skill.md': SKILL,
      'types/Concept.md': CONCEPT,
    });
    try {
      const result = await runTypes(defaultConfig(dir));
      expect(result.exitCode).toBe(0);
      expect(result.types.map((t) => t.id)).toEqual([
        'types/Concept.md',
        'types/Skill.md',
      ]);
      const concept = result.types.find((t) => t.name === 'concept');
      expect(concept).toMatchObject({
        name: 'concept',
        propertyCount: 2,
        sectionCount: 1,
        hasTemplate: true,
      });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('returns no types for an empty project (exit 0)', async () => {
    const dir = await createTempProject({ 'note.md': '# just a note' });
    try {
      const result = await runTypes(defaultConfig(dir));
      expect(result.types).toHaveLength(0);
      expect(result.exitCode).toBe(0);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('reports ambiguous canonical names', async () => {
    const dir = await createTempProject({
      'a/Concept.md': CONCEPT,
      'b/Concept.md': CONCEPT,
    });
    try {
      const result = await runTypes(defaultConfig(dir));
      expect(result.ambiguousNames).toHaveLength(1);
      expect(result.ambiguousNames[0]).toMatchObject({
        name: 'concept',
        ids: ['a/Concept.md', 'b/Concept.md'],
      });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('surfaces type parse failures and fails exit status', async () => {
    const dir = await createTempProject({
      'types/Broken.md': '---\n_type: type\n---\n\n# No schema block',
    });
    try {
      const result = await runTypes(defaultConfig(dir));
      expect(result.parseFailures).toHaveLength(1);
      expect(result.parseFailures[0]!.path).toBe('types/Broken.md');
      expect(result.exitCode).toBe(1);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('does not fail exit status on ordinary document ingest failure', async () => {
    const dir = await createTempProject({
      'types/Concept.md': CONCEPT,
      'bad.md': '---\nunclosed',
    });
    try {
      const result = await runTypes(defaultConfig(dir));
      expect(result.parseFailures).toHaveLength(0);
      expect(result.exitCode).toBe(0);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('shows detail for a single resolved type', async () => {
    const dir = await createTempProject({
      'types/Concept.md': CONCEPT,
    });
    try {
      const result = await runTypes(defaultConfig(dir), 'concept');
      expect(result.detail?.kind).toBe('detail');
      if (result.detail?.kind === 'detail') {
        expect(result.detail.detail.name).toBe('concept');
        const title = result.detail.detail.properties.find(
          (p) => p.name === 'title',
        );
        expect(title).toMatchObject({ type: 'text', required: true });
        const tags = result.detail.detail.properties.find(
          (p) => p.name === 'tags',
        );
        expect(tags?.type).toBe('list<text>');
        expect(result.detail.detail.sections).toHaveLength(1);
        expect(result.detail.detail.sections[0]).toMatchObject({
          heading: 'Summary',
          required: true,
        });
      }
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('reports detail-not-found for an unknown type', async () => {
    const dir = await createTempProject({ 'types/Concept.md': CONCEPT });
    try {
      const result = await runTypes(defaultConfig(dir), 'missing');
      expect(result.detail?.kind).toBe('detail-not-found');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('reports detail-ambiguous for duplicate type names', async () => {
    const dir = await createTempProject({
      'a/Concept.md': CONCEPT,
      'b/Concept.md': CONCEPT,
    });
    try {
      const result = await runTypes(defaultConfig(dir), 'concept');
      expect(result.detail?.kind).toBe('detail-ambiguous');
      if (result.detail?.kind === 'detail-ambiguous') {
        expect(result.detail.candidateIds).toEqual([
          'a/Concept.md',
          'b/Concept.md',
        ]);
      }
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
