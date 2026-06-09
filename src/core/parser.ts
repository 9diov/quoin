import { extractBlocks } from './parser/blocks.js';
import { validateDefault } from './parser/defaults.js';
import { extractAndValidateFrontmatter } from './parser/frontmatter.js';
import { validateIdentity } from './parser/identity.js';
import { parseSchemaYaml } from './parser/schema-yaml.js';
import { parseTemplateSections } from './section-parser.js';

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
  typeDeclarationKey?: string;
};

export type ParsedTypeDefinitionDocument = {
  id: string;
  name: string;
  schema: Schema;
  templateBlock?: TemplateBlock;
};

export type ParseErrorKind =
  | 'parser:missing-type-declaration'
  | 'parser:invalid-type-declaration'
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
  raw: string,
  identity: TypeDefinitionDocumentIdentity,
  config: ParserConfig = {},
): ParseResult {
  const errors: ParseError[] = [];
  errors.push(...validateIdentity(identity));

  const typeDeclarationKey = config.typeDeclarationKey ?? '_type';
  const fm = extractAndValidateFrontmatter(raw, typeDeclarationKey);
  if (fm.kind === 'error') {
    errors.push(...fm.errors);
    return { kind: 'error', errors };
  }

  const blocks = extractBlocks(fm.body);
  errors.push(...blocks.errors);

  if (blocks.schemaYaml === undefined) {
    return { kind: 'error', errors };
  }

  const schemaResult = parseSchemaYaml(blocks.schemaYaml);
  errors.push(...schemaResult.errors);

  if (schemaResult.schema) {
    for (const [propertyKey, propertySchema] of Object.entries(
      schemaResult.schema.properties,
    )) {
      errors.push(...validateDefault(propertyKey, propertySchema, config));
    }
  }

  let templateBlock: TemplateBlock | undefined;
  if (blocks.templateMarkdown !== undefined) {
    const sectionResult = parseTemplateSections(blocks.templateMarkdown);
    errors.push(...sectionResult.errors);
    templateBlock = { sections: sectionResult.sections };
  }

  if (errors.length > 0 || !schemaResult.schema) {
    return { kind: 'error', errors };
  }

  const typeDef: ParsedTypeDefinitionDocument = {
    id: identity.id,
    name: identity.name,
    schema: schemaResult.schema,
  };
  if (templateBlock !== undefined) {
    typeDef.templateBlock = templateBlock;
  }
  return { kind: 'ok', typeDef };
}
