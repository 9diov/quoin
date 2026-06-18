import type { DocRefFormat, ParsedTypeDefinitionDocument } from './parser.js';
import type { Document } from './types.js';

export type ResolveDocReferenceInput = {
  value: string;
  format?: DocRefFormat;
  sourceDocumentPath: string;
};

export type ResolveDocReferenceResult =
  | { kind: 'found'; document: Document }
  | { kind: 'not-found'; value: string; format: DocRefFormat }
  | { kind: 'invalid-link'; value: string; format: DocRefFormat; reason: string }
  | { kind: 'ambiguous'; value: string; format: DocRefFormat; candidates: Document[] }
  | { kind: 'unavailable'; value: string; format: DocRefFormat; reason: string };

export type Resolver = (input: ResolveDocReferenceInput) => ResolveDocReferenceResult;

export type TypeReferenceLookupResult =
  | { kind: 'found'; typeDef: ParsedTypeDefinitionDocument }
  | { kind: 'not-found'; typeName: string }
  | { kind: 'ambiguous'; typeName: string; candidates: ParsedTypeDefinitionDocument[] }
  | { kind: 'unavailable'; reason: string };

export type TypeDeclarationLookupResult =
  | { kind: 'found'; typeDef: ParsedTypeDefinitionDocument }
  | { kind: 'missing-declaration' }
  | { kind: 'invalid-declaration'; value: unknown }
  | { kind: 'not-found'; typeName: string }
  | { kind: 'ambiguous'; typeName: string; candidates: ParsedTypeDefinitionDocument[] }
  | { kind: 'unavailable'; reason: string };

export type TypeRegistry = {
  getByName(typeName: string): TypeReferenceLookupResult;
  getByDeclaration(value: unknown): TypeDeclarationLookupResult;
};
