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

  const matches = bindings.filter((binding) => isGlobMatch(rootRelativePath, binding.match));

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

export function bindingMatchEscapesVault(match: string): boolean {
  const normalized = normalizeVaultPath(match);
  return normalized.startsWith('/') || normalized === '..' || normalized.startsWith('../');
}

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
