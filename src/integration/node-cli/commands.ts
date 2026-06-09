import type { EffectiveConfig } from './config.js';
import { printHuman, printJson, printError } from './output.js';
import {
  runValidate,
  formatValidateHuman,
  formatValidateJson,
} from './validate.js';

export type CommandIntent =
  | { kind: 'validate'; config: EffectiveConfig; exitCode: number }
  | { kind: 'create'; type: string; output: string; config: EffectiveConfig }
  | { kind: 'types'; config: EffectiveConfig };

export async function handleValidate(
  config: EffectiveConfig,
  targets: string[],
): Promise<Extract<CommandIntent, { kind: 'validate' }>> {
  const result = await runValidate(config, targets);

  if (config.outputFormat === 'json') {
    formatValidateJson(result, config);
  } else {
    formatValidateHuman(result);
  }

  return { kind: 'validate', config, exitCode: result.exitCode };
}

export function handleCreate(
  type: string,
  output: string,
  config: EffectiveConfig,
): CommandIntent {
  printHuman(`create: not yet implemented (type: ${type}, output: ${output})`);
  printJson({
    command: 'create',
    type,
    output,
    config: {
      root: config.root,
      include: config.include,
      exclude: config.exclude,
      typeDeclarationKey: config.typeDeclarationKey,
      outputFormat: config.outputFormat,
    },
  });
  return { kind: 'create', type, output, config };
}

export function handleTypes(config: EffectiveConfig): CommandIntent {
  printHuman(`types: not yet implemented (root: ${config.root})`);
  printJson({
    command: 'types',
    config: {
      root: config.root,
      include: config.include,
      exclude: config.exclude,
      typeDeclarationKey: config.typeDeclarationKey,
      outputFormat: config.outputFormat,
    },
  });
  return { kind: 'types', config };
}
