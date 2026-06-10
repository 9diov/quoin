import type { EffectiveConfig } from './config.js';
import {
  runValidate,
  formatValidateHuman,
  formatValidateJson,
} from './validate.js';
import {
  runCreate,
  createExitCode,
  formatCreateHuman,
  formatCreateJson,
} from './create.js';
import { runTypes, formatTypesHuman, formatTypesJson } from './types.js';

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
