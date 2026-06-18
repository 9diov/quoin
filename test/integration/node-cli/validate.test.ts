import { rm } from 'node:fs/promises';
import { describe, expect, it, vi } from 'vitest';

import {
  expandTargets,
  formatValidateHuman,
  formatValidateJson,
  runValidate,
} from '../../../src/integration/node-cli/validate.js';
import { binding, createTempProject, defaultConfig } from './helpers.js';

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

describe('expandTargets', () => {
  it('resolves explicit file target', async () => {
    const dir = await createTempProject({ 'doc.md': '# Hello' });
    try {
      const result = await expandTargets(dir, ['doc.md'], []);
      expect(result.paths).toEqual(['doc.md']);
      expect(result.diagnostics).toHaveLength(0);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('expands directory target', async () => {
    const dir = await createTempProject({
      'notes/a.md': 'a',
      'notes/sub/b.md': 'b',
      'other/c.md': 'c',
    });
    try {
      const result = await expandTargets(dir, ['notes'], []);
      expect(result.paths.sort()).toEqual(['notes/a.md', 'notes/sub/b.md']);
      expect(result.diagnostics).toHaveLength(0);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('reports outside-root target', async () => {
    const dir = await createTempProject({ 'doc.md': '' });
    try {
      const result = await expandTargets(dir, ['../outside.md'], []);
      expect(result.paths).toHaveLength(0);
      expect(result.diagnostics[0]?.kind).toBe('target:outside-root');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('reports not-found target', async () => {
    const dir = await createTempProject({});
    try {
      const result = await expandTargets(dir, ['missing.md'], []);
      expect(result.paths).toHaveLength(0);
      expect(result.diagnostics[0]?.kind).toBe('target:not-found');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('reports unsupported-kind target', async () => {
    const dir = await createTempProject({ 'readme.txt': 'text' });
    try {
      const result = await expandTargets(dir, ['readme.txt'], []);
      expect(result.paths).toHaveLength(0);
      expect(result.diagnostics[0]?.kind).toBe('target:unsupported-kind');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('reports excluded file target', async () => {
    const dir = await createTempProject({ 'node_modules/pkg.md': 'pkg' });
    try {
      const result = await expandTargets(dir, ['node_modules/pkg.md'], ['node_modules/**']);
      expect(result.paths).toHaveLength(0);
      expect(result.diagnostics[0]?.kind).toBe('target:excluded');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('filters excluded files from directory expansion', async () => {
    const dir = await createTempProject({
      'notes/a.md': 'a',
      'notes/drafts/b.md': 'b',
    });
    try {
      const result = await expandTargets(dir, ['notes'], ['notes/drafts/**']);
      expect(result.paths).toEqual(['notes/a.md']);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('de-duplicates and sorts targets', async () => {
    const dir = await createTempProject({
      'z.md': '',
      'a.md': '',
    });
    try {
      const result = await expandTargets(dir, ['a.md', 'a.md', 'z.md'], []);
      expect(result.paths).toEqual(['a.md', 'z.md']);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('normalizes paths to POSIX', async () => {
    const dir = await createTempProject({ 'sub/dir/file.md': '' });
    try {
      const result = await expandTargets(dir, ['sub/dir/file.md'], []);
      expect(result.paths).toEqual(['sub/dir/file.md']);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe('runValidate', () => {
  it('validates a document that passes', async () => {
    const dir = await createTempProject({
      'types/Concept.md': `---\n_type: type\n---\n\n## Schema\n\n\`\`\`yaml\nproperties:\n  title:\n    type: text\n\`\`\`\n`,
      'doc.md': `---\n_type: "[[Concept]]"\ntitle: Hello\n---\n\nBody.`,
    });
    try {
      const config = defaultConfig(dir);
      const result = await runValidate(config, []);
      expect(result.exitCode).toBe(0);
      expectTimingShape(result.timing, ['discovery', 'ingestion', 'parsing', 'validation']);
      expect(result.targets).toHaveLength(1);
      expect(result.targets[0]!.kind).toBe('validated');
      if (result.targets[0]!.kind === 'validated') {
        expect(result.targets[0]!.result.passed).toBe(true);
      }
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('fails validation for missing required property', async () => {
    const dir = await createTempProject({
      'types/Concept.md': `---\n_type: type\n---\n\n## Schema\n\n\`\`\`yaml\nproperties:\n  title:\n    type: text\n    required: true\n\`\`\`\n`,
      'doc.md': `---\n_type: "[[Concept]]"\n---\n\nBody.`,
    });
    try {
      const config = defaultConfig(dir);
      const result = await runValidate(config, []);
      expect(result.exitCode).toBe(1);
      expect(result.targets).toHaveLength(1);
      expect(result.targets[0]!.kind).toBe('validated');
      if (result.targets[0]!.kind === 'validated') {
        expect(result.targets[0]!.result.passed).toBe(false);
      }
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('skips untyped documents by default', async () => {
    const dir = await createTempProject({
      'doc.md': '# No frontmatter',
    });
    try {
      const result = await runValidate(defaultConfig(dir), []);
      expect(result.targets).toHaveLength(1);
      expect(result.targets[0]!.kind).toBe('skipped-untyped');
      expect(result.exitCode).toBe(0);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('warns for untyped documents when configured', async () => {
    const dir = await createTempProject({
      'doc.md': '# No frontmatter',
    });
    try {
      const config = defaultConfig(dir, { untypedDocumentBehavior: 'warn' });
      const result = await runValidate(config, []);
      expect(result.targets).toHaveLength(1);
      expect(result.targets[0]!.kind).toBe('warn-untyped');
      expect(result.exitCode).toBe(0);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('validates an untyped document through a matching binding', async () => {
    const dir = await createTempProject({
      'types/Concept.md': `---\n_type: type\n---\n\n## Schema\n\n\`\`\`yaml\nproperties:\n  title:\n    type: text\n    required: true\n\`\`\`\n`,
      'notes/doc.md': `---\ntitle: Hello\n---\n\nBody.`,
    });
    try {
      const config = defaultConfig(dir, {
        bindings: [binding('concept', 'notes/**/*.md')],
      });
      const result = await runValidate(config, []);
      expect(result.exitCode).toBe(0);
      expect(result.targets).toHaveLength(1);
      expect(result.targets[0]!.kind).toBe('validated');
      if (result.targets[0]!.kind === 'validated') {
        expect(result.targets[0]!.typeName).toBe('concept');
        expect(result.targets[0]!.result.passed).toBe(true);
      }
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('prefers frontmatter declaration over matching bindings', async () => {
    const dir = await createTempProject({
      'types/Concept.md': `---\n_type: type\n---\n\n## Schema\n\n\`\`\`yaml\nproperties:\n  title:\n    type: text\n\`\`\`\n`,
      'types/Article.md': `---\n_type: type\n---\n\n## Schema\n\n\`\`\`yaml\nproperties:\n  summary:\n    type: text\n\`\`\`\n`,
      'notes/doc.md': `---\n_type: "[[Article]]"\nsummary: Hi\n---\n\nBody.`,
    });
    try {
      const config = defaultConfig(dir, {
        bindings: [binding('concept', 'notes/**/*.md')],
      });
      const result = await runValidate(config, []);
      expect(result.targets).toHaveLength(1);
      expect(result.targets[0]!.kind).toBe('validated');
      if (result.targets[0]!.kind === 'validated') {
        expect(result.targets[0]!.typeName).toBe('article');
      }
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('reports invalid-type-declaration for non-Wiki-Link value', async () => {
    const dir = await createTempProject({
      'doc.md': '---\n_type: 123\n---\n\nBody.',
    });
    try {
      const result = await runValidate(defaultConfig(dir), []);
      expect(result.targets).toHaveLength(1);
      expect(result.targets[0]!.kind).toBe('invalid-type-declaration');
      expect(result.exitCode).toBe(1);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('reports type-not-found for unknown type', async () => {
    const dir = await createTempProject({
      'doc.md': '---\n_type: "[[Unknown]]"\n---\n\nBody.',
    });
    try {
      const result = await runValidate(defaultConfig(dir), []);
      expect(result.targets).toHaveLength(1);
      expect(result.targets[0]!.kind).toBe('type-not-found');
      expect(result.exitCode).toBe(1);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('reports binding-type-not-found for unknown bound type', async () => {
    const dir = await createTempProject({
      'notes/doc.md': '# No frontmatter',
    });
    try {
      const result = await runValidate(
        defaultConfig(dir, {
          bindings: [binding('concept', 'notes/**/*.md')],
        }),
        [],
      );
      expect(result.targets).toHaveLength(1);
      expect(result.targets[0]!.kind).toBe('binding-type-not-found');
      expect(result.exitCode).toBe(1);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('reports type-ambiguous for duplicate type names', async () => {
    const dir = await createTempProject({
      'a/Concept.md': `---\n_type: type\n---\n\n## Schema\n\n\`\`\`yaml\nproperties:\n  a:\n    type: text\n\`\`\`\n`,
      'b/Concept.md': `---\n_type: type\n---\n\n## Schema\n\n\`\`\`yaml\nproperties:\n  b:\n    type: text\n\`\`\`\n`,
      'doc.md': '---\n_type: "[[Concept]]"\n---\n\nBody.',
    });
    try {
      const result = await runValidate(defaultConfig(dir), []);
      expect(result.targets).toHaveLength(1);
      expect(result.targets[0]!.kind).toBe('type-ambiguous');
      expect(result.exitCode).toBe(1);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('reports binding-type-ambiguous for duplicate bound type names', async () => {
    const dir = await createTempProject({
      'a/Concept.md': `---\n_type: type\n---\n\n## Schema\n\n\`\`\`yaml\nproperties:\n  a:\n    type: text\n\`\`\`\n`,
      'b/Concept.md': `---\n_type: type\n---\n\n## Schema\n\n\`\`\`yaml\nproperties:\n  b:\n    type: text\n\`\`\`\n`,
      'notes/doc.md': '# No frontmatter',
    });
    try {
      const result = await runValidate(
        defaultConfig(dir, {
          bindings: [binding('concept', 'notes/**/*.md')],
        }),
        [],
      );
      expect(result.targets).toHaveLength(1);
      expect(result.targets[0]!.kind).toBe('binding-type-ambiguous');
      expect(result.exitCode).toBe(1);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('reports ambiguous-binding for different matching bindings', async () => {
    const dir = await createTempProject({
      'notes/doc.md': '# No frontmatter',
    });
    try {
      const config = defaultConfig(dir, {
        bindings: [binding('concept', 'notes/**/*.md'), binding('article', '**/*.md')],
      });
      const result = await runValidate(config, []);
      expect(result.targets).toHaveLength(1);
      expect(result.targets[0]!.kind).toBe('ambiguous-binding');
      expect(result.exitCode).toBe(1);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('uses the first same-type binding as the matched binding', async () => {
    const dir = await createTempProject({
      'notes/doc.md': '# No frontmatter',
    });
    try {
      const config = defaultConfig(dir, {
        bindings: [binding('concept', 'notes/**/*.md'), binding('concept', '**/*.md')],
      });
      const result = await runValidate(config, []);
      expect(result.targets).toHaveLength(1);
      expect(result.targets[0]!.kind).toBe('binding-type-not-found');
      if (result.targets[0]!.kind === 'binding-type-not-found') {
        expect(result.targets[0]!.matchedBinding).toEqual(binding('concept', 'notes/**/*.md'));
      }
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('dispatches an explicit type definition target via frontmatter even when its path matches a binding', async () => {
    const dir = await createTempProject({
      'types/Concept.md': `---\n_type: type\n---\n\n## Schema\n\n\`\`\`yaml\nproperties:\n  title:\n    type: text\n\`\`\`\n`,
    });
    try {
      const result = await runValidate(
        defaultConfig(dir, {
          bindings: [binding('concept', 'types/**/*.md')],
        }),
        ['types/Concept.md'],
      );
      expect(result.targets).toHaveLength(1);
      expect(result.targets[0]!.kind).toBe('type-not-found');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('excludes type definition documents from default targets', async () => {
    const dir = await createTempProject({
      'types/Concept.md': `---\n_type: type\n---\n\n## Schema\n\n\`\`\`yaml\nproperties:\n  title:\n    type: text\n\`\`\`\n`,
    });
    try {
      const result = await runValidate(defaultConfig(dir), []);
      expect(result.targets).toHaveLength(0);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('supports explicit file targets', async () => {
    const dir = await createTempProject({
      'types/Concept.md': `---\n_type: type\n---\n\n## Schema\n\n\`\`\`yaml\nproperties:\n  title:\n    type: text\n\`\`\`\n`,
      'a.md': '---\n_type: "[[Concept]]"\ntitle: A\n---\n\nBody.',
      'b.md': '---\n_type: "[[Concept]]"\ntitle: B\n---\n\nBody.',
    });
    try {
      const result = await runValidate(defaultConfig(dir), ['a.md']);
      expect(result.targets).toHaveLength(1);
      expect(result.targets[0]!.kind).toBe('validated');
      if (result.targets[0]!.kind === 'validated') {
        expect(result.targets[0]!.path).toBe('a.md');
      }
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('fails globally on discovery ingest failure', async () => {
    const dir = await createTempProject({
      'bad.md': '---\nunclosed',
    });
    try {
      const result = await runValidate(defaultConfig(dir), []);
      expect(result.exitCode).toBe(1);
      expect(result.ingestFailures).toHaveLength(1);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('fails globally on type parse failure', async () => {
    const dir = await createTempProject({
      'types/Broken.md': '---\n_type: type\n---\n\n# No schema block',
    });
    try {
      const result = await runValidate(defaultConfig(dir), []);
      expect(result.exitCode).toBe(1);
      expect(result.typeParseFailures).toHaveLength(1);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('reports binding-type-unavailable for broken bound type candidates', async () => {
    const dir = await createTempProject({
      'types/Concept.md': '---\n_type: type\n---\n\n# No schema block',
      'notes/doc.md': '# No frontmatter',
    });
    try {
      const result = await runValidate(
        defaultConfig(dir, {
          bindings: [binding('concept', 'notes/**/*.md')],
        }),
        [],
      );
      expect(result.targets).toHaveLength(1);
      expect(result.targets[0]!.kind).toBe('binding-type-unavailable');
      expect(result.exitCode).toBe(1);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('fails on target diagnostic', async () => {
    const dir = await createTempProject({});
    try {
      const result = await runValidate(defaultConfig(dir), ['../outside.md']);
      expect(result.exitCode).toBe(1);
      expect(result.targetDiagnostics).toHaveLength(1);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('references type by path in declaration', async () => {
    const dir = await createTempProject({
      'types/Concept.md': `---\n_type: type\n---\n\n## Schema\n\n\`\`\`yaml\nproperties:\n  title:\n    type: text\n\`\`\`\n`,
      'doc.md': '---\n_type: "[[types/Concept]]"\ntitle: Hi\n---\n\nBody.',
    });
    try {
      const result = await runValidate(defaultConfig(dir), []);
      expect(result.targets).toHaveLength(1);
      expect(result.targets[0]!.kind).toBe('validated');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('passes with warnings only (exit 0)', async () => {
    const dir = await createTempProject({
      'types/Concept.md': `---\n_type: type\n---\n\n## Schema\n\n\`\`\`yaml\nproperties:\n  title:\n    type: text\n\`\`\`\n\n## Template\n\n\`\`\`markdown\n## Summary <!-- required -->\n\`\`\`\n`,
      'doc.md': '---\n_type: "[[Concept]]"\n---\n\n# Just a heading.',
    });
    try {
      const result = await runValidate(defaultConfig(dir), []);
      expect(result.exitCode).toBe(0);
      expect(result.targets).toHaveLength(1);
      if (result.targets[0]!.kind === 'validated') {
        expect(result.targets[0]!.result.passed).toBe(true);
        expect(result.targets[0]!.result.warnings.length).toBeGreaterThan(0);
      }
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('ingests and validates explicit targets outside global include', async () => {
    const dir = await createTempProject({
      'types/Concept.md': `---\n_type: type\n---\n\n## Schema\n\n\`\`\`yaml\nproperties:\n  title:\n    type: text\n\`\`\`\n`,
      'special/note.md': `---\n_type: "[[Concept]]"\ntitle: Special\n---\n\nBody.`,
    });
    try {
      const config = defaultConfig(dir, { include: ['types/**/*.md'] });
      const result = await runValidate(config, ['special/note.md']);
      expect(result.targets).toHaveLength(1);
      expect(result.targets[0]!.kind).toBe('validated');
      if (result.targets[0]!.kind === 'validated') {
        expect(result.targets[0]!.path).toBe('special/note.md');
      }
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('does not include broken type candidates in default targets', async () => {
    const dir = await createTempProject({
      'types/Broken.md': `---\n_type: type\n---\n\n## Schema\n\n\`\`\`yaml\ninvalid: [\n\`\`\`\n`,
      'regular.md': '# Just a markdown file',
    });
    try {
      const result = await runValidate(defaultConfig(dir), []);
      expect(result.typeParseFailures).toHaveLength(1);
      const targets = result.targets.filter(
        (t) => t.kind === 'validated' || t.kind === 'skipped-untyped' || t.kind === 'warn-untyped',
      );
      const regularTarget = targets.find((t) => t.path === 'regular.md');
      expect(regularTarget).toBeDefined();
      const brokenTarget = targets.find((t) => t.path === 'types/Broken.md');
      expect(brokenTarget).toBeUndefined();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe('formatValidateJson', () => {
  it('includes summary counts and effectiveConfig in JSON output', async () => {
    const output = await import('../../../src/integration/node-cli/output.js');
    const spy = vi.spyOn(output, 'printJson').mockImplementation(() => {});

    const config = defaultConfig('/test');
    const result = {
      targets: [],
      targetDiagnostics: [],
      ingestFailures: [],
      typeParseFailures: [],
      exitCode: 0,
      timing: {
        totalMs: 3,
        phases: [{ name: 'discovery', ms: 1 }],
      },
    };

    formatValidateJson(result, config);

    expect(spy).toHaveBeenCalledTimes(1);
    const payload = spy.mock.calls[0]![0] as Record<string, unknown>;

    expect(payload.summary).toBeDefined();
    expect(payload.effectiveConfig).toBeDefined();
    expect(payload.timing).toEqual({
      totalMs: 3,
      phases: [{ name: 'discovery', ms: 1 }],
    });
    expect((payload.summary as Record<string, unknown>).targets).toBe(0);
    expect((payload.effectiveConfig as Record<string, unknown>).root).toBe('/test');
    expect((payload.effectiveConfig as Record<string, unknown>).bindings).toEqual([]);

    spy.mockRestore();
  });

  it('appends timing to human output', async () => {
    const output = await import('../../../src/integration/node-cli/output.js');
    const spy = vi.spyOn(output, 'printHuman').mockImplementation(() => {});

    formatValidateHuman({
      targets: [],
      targetDiagnostics: [],
      ingestFailures: [],
      typeParseFailures: [],
      exitCode: 0,
      timing: {
        totalMs: 3,
        phases: [{ name: 'discovery', ms: 1 }],
      },
    });

    expect(spy).toHaveBeenLastCalledWith('Time taken: 3ms (discovery: 1ms)');
    spy.mockRestore();
  });
});
