/**
 * @quoin-terms Integration, Document, Type Declaration, Type Reference, Type Binding, Effective Type Declaration
 * @quoin-docs docs/design/D6-path-glob-type-bindings.md
 */

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
    isMatch: isGlobMatch,
  });
}

export function bindingMatchEscapesVault(match: string): boolean {
  const normalized = normalizeVaultPath(match);
  return normalized.startsWith('/') || normalized === '..' || normalized.startsWith('../');
}

function isGlobMatch(path: string, glob: string): boolean {
  return globToRegExp(normalizeVaultPath(glob)).test(normalizeVaultPath(path));
}

function globToRegExp(glob: string): RegExp {
  let pattern = '^';

  for (let index = 0; index < glob.length; index += 1) {
    const char = glob[index];
    const next = glob[index + 1];
    const afterNext = glob[index + 2];

    if (char === '*' && next === '*' && afterNext === '/') {
      pattern += '(?:.*/)?';
      index += 2;
    } else if (char === '*' && next === '*') {
      pattern += '.*';
      index += 1;
    } else if (char === '*') {
      pattern += '[^/]*';
    } else if (char === '?') {
      pattern += '[^/]';
    } else {
      pattern += escapeRegExp(char ?? '');
    }
  }

  pattern += '$';
  return new RegExp(pattern);
}

function normalizeVaultPath(path: string): string {
  const absolute = path.trim().startsWith('/');
  const segments: string[] = [];

  for (const segment of path.trim().replaceAll('\\', '/').split('/')) {
    if (segment.length === 0 || segment === '.') continue;
    if (segment === '..') {
      if (segments.length === 0 || segments[segments.length - 1] === '..') {
        segments.push(segment);
      } else {
        segments.pop();
      }
      continue;
    }
    segments.push(segment);
  }

  const normalized = segments.join('/');
  return absolute ? `/${normalized}` : normalized;
}

function escapeRegExp(value: string): string {
  return value.replace(/[\\^$+?.()|[\]{}]/g, '\\$&');
}
