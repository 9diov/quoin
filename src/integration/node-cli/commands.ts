import type { EffectiveConfig } from './config.js';
import { printHuman, printJson } from './output.js';

export type CommandIntent =
  | { kind: 'validate'; config: EffectiveConfig }
  | { kind: 'create'; type: string; output: string; config: EffectiveConfig }
  | { kind: 'types'; config: EffectiveConfig };

export function handleValidate(config: EffectiveConfig): CommandIntent {
  printHuman(`validate: not yet implemented (root: ${config.root})`);
  printJson({
    command: 'validate',
    config: {
      root: config.root,
      include: config.include,
      exclude: config.exclude,
      typeDeclarationKey: config.typeDeclarationKey,
      allowedUrlSchemes: config.allowedUrlSchemes,
      untypedDocumentBehavior: config.untypedDocumentBehavior,
      referentialValidation: config.referentialValidation,
      resolverStrategy: config.resolverStrategy,
      outputFormat: config.outputFormat,
    },
  });
  return { kind: 'validate', config };
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
