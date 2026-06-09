import type { ValidationConfig, IntegrationName, UntypedDocumentBehavior } from '../validation.js';

export type ResolvedConfig = {
  typeDeclarationKey: string;
  untypedDocumentBehavior: UntypedDocumentBehavior;
  referentialValidation: boolean;
  allowedUrlSchemes: string[];
  integration: IntegrationName | undefined;
};

export function resolveConfig(config: ValidationConfig): ResolvedConfig {
  return {
    typeDeclarationKey: config.typeDeclarationKey ?? '_type',
    untypedDocumentBehavior: config.untypedDocumentBehavior ?? 'skip',
    referentialValidation: config.referentialValidation ?? false,
    allowedUrlSchemes: (config.allowedUrlSchemes ?? ['http', 'https', 'mailto']).map((s) =>
      s.toLowerCase(),
    ),
    integration: config.integration,
  };
}
