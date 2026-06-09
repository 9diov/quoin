export type PrimitiveTypeName =
  | 'text'
  | 'number'
  | 'boolean'
  | 'date'
  | 'datetime'
  | 'wiki-link'
  | 'url';

export type CollectionTypeName =
  | { kind: 'list'; of: string }
  | { kind: 'choice'; of: string };

export type PropertyTypeName = PrimitiveTypeName | CollectionTypeName;

export type PropertySchema = {
  type: PropertyTypeName;
  required?: boolean;
  'allow-empty'?: boolean;
  default?: unknown;
};

export type Schema = {
  properties: Record<string, PropertySchema>;
};

export type Section = {
  level: number;
  heading: string;
  required: boolean;
  defaultContent: string;
};

export type TemplateBlock = {
  sections: Section[];
};

export type TypeDefinitionDocumentIdentity = {
  id: string;
  name: string;
};

export type ParserConfig = {
  allowedUrlSchemes?: string[];
};

export type ParsedTypeDefinitionDocument = {
  id: string;
  name: string;
  schema: Schema;
  templateBlock?: TemplateBlock;
};

export type ParseErrorKind =
  | 'parser:missing-schema-block'
  | 'parser:duplicate-schema-block'
  | 'parser:invalid-schema-block'
  | 'parser:invalid-schema-yaml'
  | 'parser:missing-properties'
  | 'parser:unknown-schema-key'
  | 'parser:invalid-property-key'
  | 'parser:unknown-property-type'
  | 'parser:invalid-type-reference'
  | 'parser:invalid-property-schema'
  | 'parser:invalid-default'
  | 'parser:duplicate-template-block'
  | 'parser:invalid-template-block'
  | 'parser:duplicate-required-section'
  | 'parser:invalid-type-definition-identity';

export type ParseLocation =
  | { scope: 'document' }
  | { scope: 'block'; block: 'Schema' | 'Template' }
  | { scope: 'property'; property: string }
  | { scope: 'section'; section: string; level: number };

export type ParseError = {
  kind: ParseErrorKind;
  message: string;
  location: ParseLocation;
  details?: Record<string, unknown>;
};

export type ParseResult =
  | { kind: 'ok'; typeDef: ParsedTypeDefinitionDocument }
  | { kind: 'error'; errors: ParseError[] };

export function parseTypeDefinitionDocument(
  _raw: string,
  _identity: TypeDefinitionDocumentIdentity,
  _config?: ParserConfig,
): ParseResult {
  throw new Error('not implemented');
}
