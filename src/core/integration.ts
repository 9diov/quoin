import type { ParsedTypeDefinitionDocument } from './parser.js';
import type { Document } from './types.js';

export type ResolveWikiLinkResult =
  | { kind: 'found'; document: Document }
  | { kind: 'not-found'; wikiLink: string }
  | { kind: 'invalid-link'; wikiLink: string; reason: string }
  | { kind: 'ambiguous'; wikiLink: string; candidates: Document[] }
  | { kind: 'unavailable'; wikiLink: string; reason: string };

export type Resolver = (wikiLink: string) => ResolveWikiLinkResult;

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
