/**
 * @quoin-terms Validation Config, Untyped Document, Referential Validation, Integration
 * @quoin-docs docs/design/D3-validation-semantics.md
 */

import type { IntegrationName, UntypedDocumentBehavior, ValidationConfig } from '../validation.js';

export type ResolvedConfig = {
  typeDeclarationKey: string;
  untypedDocumentBehavior: UntypedDocumentBehavior;
  referentialValidation: boolean;
  integration: IntegrationName | undefined;
};

export function resolveConfig(config: ValidationConfig): ResolvedConfig {
  return {
    typeDeclarationKey: config.typeDeclarationKey ?? '_type',
    untypedDocumentBehavior: config.untypedDocumentBehavior ?? 'skip',
    referentialValidation: config.referentialValidation ?? false,
    integration: config.integration,
  };
}
