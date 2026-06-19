/**
 * @quoin-terms Scaffolding, Templating, Document, Type Definition Document, Validation
 * @quoin-docs docs/design/D2-type-and-schema-contracts.md
 */

import type { Resolver, TypeRegistry } from '../../core/integration.js';
import type { ParsedTypeDefinitionDocument } from '../../core/parser.js';
import { scaffold } from '../../core/scaffold.js';
import { template } from '../../core/template.js';
import type { Document } from '../../core/types.js';
import type { ValidationConfig, ValidationResult } from '../../core/validation.js';
import { validate } from '../../core/validation.js';

import { frontmatterBlockLength, serializeDocument } from './frontmatter.js';

export type CreateCandidate = {
  declaration: string;
  document: Document;
  contents: string;
  frontmatter: Record<string, unknown>;
  frontmatterEndOffset: number;
  validation: ValidationResult;
};

export function declarationFromTypeId(typeId: string): string {
  const normalized = typeId.replaceAll('\\', '/');
  const filename = normalized.slice(normalized.lastIndexOf('/') + 1);
  const dot = filename.lastIndexOf('.');
  const basename = dot <= 0 ? filename : filename.slice(0, dot);
  return `[[${basename}]]`;
}

export function buildCreateCandidate(args: {
  outputPath: string;
  typeDef: ParsedTypeDefinitionDocument;
  typeDeclarationKey: string;
  validationConfig: ValidationConfig;
  resolver: Resolver;
  typeRegistry: TypeRegistry;
}): CreateCandidate {
  const declaration = declarationFromTypeId(args.typeDef.id);
  const baseFrontmatter = {
    [args.typeDeclarationKey]: declaration,
  };
  const scaffolded = scaffold(baseFrontmatter, args.typeDef);
  const frontmatter: Record<string, unknown> = {
    ...baseFrontmatter,
    ...scaffolded.properties,
  };
  const body = template(args.typeDef).body;
  const document: Document = {
    path: args.outputPath,
    frontmatter,
    body,
  };
  const validation = validate(
    document,
    args.typeDef,
    args.validationConfig,
    args.resolver,
    args.typeRegistry,
  );

  return {
    declaration,
    document,
    contents: serializeDocument(frontmatter, body),
    frontmatter,
    frontmatterEndOffset: frontmatterBlockLength(frontmatter),
    validation,
  };
}
