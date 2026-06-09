import type { Document } from './types.js';
import type { ParsedTypeDefinitionDocument } from './parser.js';
import type { Resolver, TypeRegistry } from './integration.js';

export type IntegrationName =
  | 'obsidian'
  | 'hugo'
  | 'jekyll'
  | 'gitbook'
  | 'docusaurus'
  | 'vitepress';

export type UntypedDocumentBehavior = 'skip' | 'warn';

export type ValidationConfig = {
  typeDeclarationKey?: string;
  untypedDocumentBehavior?: UntypedDocumentBehavior;
  referentialValidation?: boolean;
  allowedUrlSchemes?: string[];
  integration?: IntegrationName;
};

export type ValidationErrorKind =
  | 'config:missing-dependency'
  | 'property:missing-required'
  | 'property:wrong-type'
  | 'property:empty-not-allowed'
  | 'resolve:broken-wiki-link'
  | 'resolve:invalid-wiki-link'
  | 'resolve:ambiguous-wiki-link'
  | 'resolve:unavailable'
  | 'type:unknown-reference'
  | 'type:missing-declaration'
  | 'type:invalid-declaration'
  | 'type:ambiguous-reference'
  | 'type:unknown-declaration'
  | 'type:ambiguous-declaration'
  | 'type:unavailable'
  | 'type:referential-mismatch';

export type ValidationWarningKind =
  | 'document:untyped'
  | 'property:reserved-collision'
  | 'section:missing-required';

export type ValidationLocation =
  | { scope: 'config' }
  | { scope: 'property'; property: string; index?: number }
  | { scope: 'section'; section: string; level: number };

export type ValidationError = {
  kind: ValidationErrorKind;
  message: string;
  location: ValidationLocation;
  details?: Record<string, unknown>;
};

export type ValidationWarning = {
  kind: ValidationWarningKind;
  message: string;
  location: ValidationLocation;
  details?: Record<string, unknown>;
};

export type ValidationResult = {
  passed: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
};

export function validate(
  _document: Document,
  _typeDef: ParsedTypeDefinitionDocument,
  _config: ValidationConfig,
  _resolver?: Resolver,
  _typeRegistry?: TypeRegistry,
): ValidationResult {
  throw new Error('not implemented');
}
