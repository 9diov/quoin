import { Command } from 'commander';
import { resolve } from 'node:path';

import {
  findConfigFile,
  loadConfigFile,
  resolveEffectiveConfig,
  type NodeCliConfig,
  type OutputFormat,
} from './config.js';
import { setOutputFormat } from './output.js';
import { handleValidate, handleCreate, handleTypes } from './commands.js';

const program = new Command();

program
  .name('quoin')
  .description(
    'Validate and scaffold Markdown files with typed frontmatter schemas',
  )
  .version('0.1.0');

program
  .option('--config <path>', 'path to config file (quoin.config.jsonc)')
  .option('--root <path>', 'project root directory (overrides config root)')
  .option(
    '--format <format>',
    'output format: human (default) or json',
  )
  .option('--no-referential-validation', 'disable referential validation');

program
  .command('validate [files...]')
  .description('Validate Markdown files against their type schemas')
  .action(async (files: string[], _opts, cmd) => {
    const effective = await loadAndResolveConfig(cmd);
    const intent = await handleValidate(effective, files);
    process.exit(intent.exitCode);
  });

program
  .command('create')
  .description('Create a new Markdown document from a type')
  .requiredOption('-t, --type <type>', 'type name to create')
  .requiredOption('-o, --output <path>', 'output path for the new document')
  .action(async (opts, cmd) => {
    const effective = await loadAndResolveConfig(cmd);
    const intent = await handleCreate(opts.type, opts.output, effective);
    process.exit(intent.exitCode);
  });

program
  .command('types')
  .description('List discovered type definition documents')
  .argument('[type]', 'show detail for a single type by canonical name')
  .action(async (type: string | undefined, _opts, cmd) => {
    const effective = await loadAndResolveConfig(cmd);
    const intent = await handleTypes(effective, type);
    process.exit(intent.exitCode);
  });

async function loadAndResolveConfig(
  cmd: Command,
): Promise<ReturnType<typeof resolveEffectiveConfig>> {
  const globals = cmd.optsWithGlobals<{
    config?: string;
    root?: string;
    format?: string;
    referentialValidation?: boolean;
  }>();

  const cwd = process.cwd();

  let config: NodeCliConfig | null = null;
  let configFilePath: string | null = null;

  if (globals.config !== undefined) {
    configFilePath = resolve(cwd, globals.config);
    config = await loadConfigFile(configFilePath);
  } else {
    configFilePath = await findConfigFile(cwd);
    if (configFilePath !== null) {
      config = await loadConfigFile(configFilePath);
    }
  }

  const overrides: {
    root?: string;
    format?: OutputFormat;
    referentialValidation?: boolean;
  } = {};
  if (globals.root !== undefined) overrides.root = globals.root;
  if (globals.format !== undefined) {
    overrides.format = globals.format === 'json' ? 'json' : 'human';
  }
  if (process.argv.includes('--no-referential-validation')) {
    overrides.referentialValidation = false;
  }

  const effective = resolveEffectiveConfig(
    config,
    configFilePath,
    cwd,
    overrides,
  );
  setOutputFormat(effective.outputFormat);
  return effective;
}

program.parse();
