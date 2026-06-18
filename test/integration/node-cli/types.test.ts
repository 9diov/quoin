import { rm } from 'node:fs/promises';
import { describe, expect, it, vi } from 'vitest';

import {
  formatTypesHuman,
  formatTypesJson,
  runTypes,
} from '../../../src/integration/node-cli/types.js';
import { binding, createTempProject, defaultConfig } from './helpers.js';

const CONCEPT = `---\n_type: type\n---\n\n## Schema\n\n\`\`\`yaml\nproperties:\n  title:\n    type: text\n    required: true\n  tags:\n    type: list<text>\n\`\`\`\n\n## Template\n\n\`\`\`markdown\n## Summary <!-- required -->\n\`\`\`\n`;

const SKILL = `---\n_type: type\n---\n\n## Schema\n\n\`\`\`yaml\nproperties:\n  name:\n    type: text\n\`\`\`\n`;

function expectTimingShape(
  timing: { totalMs: number; phases: { name: string; ms: number }[] },
  names: string[],
): void {
  expect(Number.isInteger(timing.totalMs)).toBe(true);
  expect(timing.totalMs).toBeGreaterThanOrEqual(0);
  expect(timing.phases.map((phase) => phase.name)).toEqual(names);
  for (const phase of timing.phases) {
    expect(Number.isInteger(phase.ms)).toBe(true);
    expect(phase.ms).toBeGreaterThanOrEqual(0);
  }
}

describe('runTypes', () => {
  it('lists discovered type summaries sorted by id', async () => {
    const dir = await createTempProject({
      'types/Skill.md': SKILL,
      'types/Concept.md': CONCEPT,
    });
    try {
      const result = await runTypes(defaultConfig(dir));
      expect(result.exitCode).toBe(0);
      expectTimingShape(result.timing, ['universe']);
      expect(result.types.map((t) => t.id)).toEqual(['types/Concept.md', 'types/Skill.md']);
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

  it('includes configured bindings in the result', async () => {
    const dir = await createTempProject({
      'types/Concept.md': CONCEPT,
    });
    try {
      const result = await runTypes(
        defaultConfig(dir, {
          bindings: [binding('concept', 'notes/**/*.md')],
        }),
      );
      expect(result.bindings).toEqual([binding('concept', 'notes/**/*.md')]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('groups bindings by target type and labels undiscovered targets', async () => {
    const dir = await createTempProject({
      'types/Concept.md': CONCEPT,
    });
    try {
      const result = await runTypes(
        defaultConfig(dir, {
          bindings: [
            binding('concept', 'notes/**/*.md'),
            binding('concept', 'ideas/**/*.md'),
            binding('article', 'posts/**/*.md'),
          ],
        }),
      );
      expect(result.bindingSummaries).toEqual([
        {
          typeName: 'concept',
          status: 'found',
          typeId: 'types/Concept.md',
          bindings: [binding('concept', 'notes/**/*.md'), binding('concept', 'ideas/**/*.md')],
        },
        {
          typeName: 'article',
          status: 'not-found',
          bindings: [binding('article', 'posts/**/*.md')],
        },
      ]);
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
        const title = result.detail.detail.properties.find((p) => p.name === 'title');
        expect(title).toMatchObject({ type: 'text', required: true });
        const tags = result.detail.detail.properties.find((p) => p.name === 'tags');
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
        expect(result.detail.candidateIds).toEqual(['a/Concept.md', 'b/Concept.md']);
      }
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe('types formatters', () => {
  it('appends timing to human output', async () => {
    const output = await import('../../../src/integration/node-cli/output.js');
    const spy = vi.spyOn(output, 'printHuman').mockImplementation(() => {});

    formatTypesHuman({
      types: [],
      bindings: [],
      bindingSummaries: [],
      ambiguousNames: [],
      parseFailures: [],
      detail: null,
      exitCode: 0,
      timing: {
        totalMs: 3,
        phases: [{ name: 'universe', ms: 1 }],
      },
    });

    expect(spy).toHaveBeenLastCalledWith('Time taken: 3ms (universe: 1ms)');
    spy.mockRestore();
  });

  it('includes timing in JSON output', async () => {
    const output = await import('../../../src/integration/node-cli/output.js');
    const spy = vi.spyOn(output, 'printJson').mockImplementation(() => {});

    formatTypesJson(
      {
        types: [],
        bindings: [],
        bindingSummaries: [],
        ambiguousNames: [],
        parseFailures: [],
        detail: null,
        exitCode: 0,
        timing: {
          totalMs: 3,
          phases: [{ name: 'universe', ms: 1 }],
        },
      },
      defaultConfig('/test'),
    );

    expect(spy).toHaveBeenCalledTimes(1);
    const payload = spy.mock.calls[0]![0] as Record<string, unknown>;
    expect(payload.timing).toEqual({
      totalMs: 3,
      phases: [{ name: 'universe', ms: 1 }],
    });
    spy.mockRestore();
  });
});
