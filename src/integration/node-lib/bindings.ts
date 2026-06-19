/**
 * @quoin-terms Integration, Document, Type Declaration, Type Reference, Type Binding, Effective Type Declaration
 * @quoin-docs docs/design/D6-path-glob-type-bindings.md
 */

import mm from 'micromatch';

import type { Document } from '../../core/types.js';
import type { EffectiveTypeDeclaration, TypeBinding } from '../common/bindings.js';
import { resolveEffectiveTypeDeclaration as resolveSharedEffectiveTypeDeclaration } from '../common/bindings.js';

export type { EffectiveTypeDeclaration, TypeBinding } from '../common/bindings.js';

export function resolveEffectiveTypeDeclaration(
  document: Document,
  rootRelativePath: string,
  bindings: TypeBinding[],
  typeDeclarationKey: string,
): EffectiveTypeDeclaration {
  return resolveSharedEffectiveTypeDeclaration({
    document,
    rootRelativePath,
    bindings,
    typeDeclarationKey,
    isMatch: (path, glob) => mm.isMatch(path, glob),
  });
}
