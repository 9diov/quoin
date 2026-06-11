import mm from 'micromatch';

import type { Document } from '../../core/types.js';

export type TypeBinding = {
  type: string;
  match: string;
};

export type EffectiveTypeDeclaration =
  | { kind: 'frontmatter'; value: unknown }
  | { kind: 'binding'; typeName: string; matchedBinding: TypeBinding }
  | { kind: 'untyped' }
  | { kind: 'ambiguous-binding'; candidates: TypeBinding[] };

function firstBindingPerType(bindings: TypeBinding[]): TypeBinding[] {
  const seen = new Set<string>();
  const result: TypeBinding[] = [];

  for (const binding of bindings) {
    if (seen.has(binding.type)) continue;
    seen.add(binding.type);
    result.push(binding);
  }

  return result;
}

export function resolveEffectiveTypeDeclaration(
  document: Document,
  rootRelativePath: string,
  bindings: TypeBinding[],
  typeDeclarationKey: string,
): EffectiveTypeDeclaration {
  if (document.frontmatter[typeDeclarationKey] !== undefined) {
    return {
      kind: 'frontmatter',
      value: document.frontmatter[typeDeclarationKey],
    };
  }

  const matches = bindings.filter((binding) =>
    mm.isMatch(rootRelativePath, binding.match),
  );

  if (matches.length === 0) {
    return { kind: 'untyped' };
  }

  if (matches.length === 1) {
    const matchedBinding = matches[0]!;
    return {
      kind: 'binding',
      typeName: matchedBinding.type,
      matchedBinding,
    };
  }

  const distinctMatches = firstBindingPerType(matches);
  if (distinctMatches.length === 1) {
    const matchedBinding = distinctMatches[0]!;
    return {
      kind: 'binding',
      typeName: matchedBinding.type,
      matchedBinding,
    };
  }

  return {
    kind: 'ambiguous-binding',
    candidates: distinctMatches,
  };
}
