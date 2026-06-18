import type { EffectiveConfig } from '../node-lib/config.js';
import { createExitCode, formatCreateHuman, formatCreateJson, runCreate } from './create.js';
import { formatTypesHuman, formatTypesJson, runTypes } from './types.js';
import { formatValidateHuman, formatValidateJson, runValidate } from './validate.js';

export type CommandIntent =
  | { kind: 'validate'; config: EffectiveConfig; exitCode: number }
  | { kind: 'create'; config: EffectiveConfig; exitCode: number }
  | { kind: 'types'; config: EffectiveConfig; exitCode: number };

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

export async function handleCreate(
  type: string,
  output: string,
  config: EffectiveConfig,
): Promise<Extract<CommandIntent, { kind: 'create' }>> {
  const result = await runCreate(config, type, output);

  if (config.outputFormat === 'json') {
    formatCreateJson(result, config);
  } else {
    formatCreateHuman(result);
  }

  return { kind: 'create', config, exitCode: createExitCode(result) };
}

export async function handleTypes(
  config: EffectiveConfig,
  detailName?: string,
): Promise<Extract<CommandIntent, { kind: 'types' }>> {
  const result = await runTypes(config, detailName);

  if (config.outputFormat === 'json') {
    formatTypesJson(result, config);
  } else {
    formatTypesHuman(result);
  }

  return { kind: 'types', config, exitCode: result.exitCode };
}
