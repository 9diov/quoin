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
export type {
  CreateResult as NodeCreateResult,
  EffectiveConfig as NodeEffectiveConfig,
  NodeLibConfig,
  TypesResult as NodeTypesResult,
  ValidateResult as NodeValidateResult,
} from './integration/node-lib/index.js';
export {
  createExitCode as createNodeDocumentExitCode,
  defaultEffectiveConfig as defaultNodeConfig,
  findConfigFile as findNodeConfigFile,
  loadConfigFile as loadNodeConfigFile,
  resolveEffectiveConfig as resolveNodeConfig,
  runCreate as runNodeCreate,
  runTypes as runNodeTypes,
  runValidate as runNodeValidate,
} from './integration/node-lib/index.js';
