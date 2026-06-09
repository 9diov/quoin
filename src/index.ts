export type { Document } from './core/types.js';

export type {
  PrimitiveTypeName,
  CollectionTypeName,
  PropertyTypeName,
  PropertySchema,
  Schema,
  Section,
  TemplateBlock,
  TypeDefinitionDocumentIdentity,
  ParserConfig,
  ParsedTypeDefinitionDocument,
  ParseErrorKind,
  ParseLocation,
  ParseError,
  ParseResult,
} from './core/parser.js';
export { parseTypeDefinitionDocument } from './core/parser.js';

export type {
  IntegrationName,
  UntypedDocumentBehavior,
  ValidationConfig,
  ValidationErrorKind,
  ValidationWarningKind,
  ValidationLocation,
  ValidationError,
  ValidationWarning,
  ValidationResult,
} from './core/validation.js';
export { validate } from './core/validation.js';

export type { ScaffoldingResult } from './core/scaffold.js';
export { scaffold } from './core/scaffold.js';

export type { TemplatingResult } from './core/template.js';
export { template } from './core/template.js';

export type {
  ResolveWikiLinkResult,
  Resolver,
  TypeReferenceLookupResult,
  TypeDeclarationLookupResult,
  TypeRegistry,
} from './core/integration.js';

