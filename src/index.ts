export type {
  ResolveDocReferenceInput,
  ResolveDocReferenceResult,
  Resolver,
  TypeDeclarationLookupResult,
  TypeReferenceLookupResult,
  TypeRegistry,
} from './core/integration.js';

export type {
  CollectionTypeName,
  DocReference,
  DocRefFormat,
  ParsedTypeDefinitionDocument,
  ParseError,
  ParseErrorKind,
  ParseLocation,
  ParseResult,
  ParserConfig,
  PrimitiveTypeName,
  PropertySchema,
  PropertyTypeName,
  Schema,
  Section,
  TemplateBlock,
  TypeDefinitionDocumentIdentity,
} from './core/parser.js';
export { parseTypeDefinitionDocument } from './core/parser.js';
export type { ScaffoldingResult } from './core/scaffold.js';
export { scaffold } from './core/scaffold.js';
export type { TemplatingResult } from './core/template.js';
export { template } from './core/template.js';
export type { Document } from './core/types.js';
export type {
  IntegrationName,
  UntypedDocumentBehavior,
  ValidationConfig,
  ValidationError,
  ValidationErrorKind,
  ValidationLocation,
  ValidationResult,
  ValidationWarning,
  ValidationWarningKind,
} from './core/validation.js';
export { validate } from './core/validation.js';
