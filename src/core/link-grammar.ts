const DEFAULT_ALLOWED_SCHEMES = ['http', 'https', 'mailto'];

export function isValidWikiLinkShape(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  if (value !== value.trim()) return false;
  if (!value.startsWith('[[') || !value.endsWith(']]')) return false;
  const inner = value.slice(2, -2);
  if (inner.length === 0) return false;
  if (inner.includes('[[') || inner.includes(']]')) return false;

  const hashIdx = inner.indexOf('#');
  const pipeIdx = inner.indexOf('|');
  let targetEnd: number;
  if (hashIdx === -1 && pipeIdx === -1) {
    targetEnd = inner.length;
  } else if (hashIdx === -1) {
    targetEnd = pipeIdx;
  } else if (pipeIdx === -1) {
    targetEnd = hashIdx;
  } else {
    targetEnd = Math.min(hashIdx, pipeIdx);
  }

  const target = inner.slice(0, targetEnd);
  return target.length > 0;
}

export type ExternalLinkResult =
  | { kind: 'valid'; text: string; url: string; scheme: string }
  | { kind: 'invalid'; reason: string };

export function parseExternalLink(
  value: unknown,
  allowedSchemes: string[] = DEFAULT_ALLOWED_SCHEMES,
): ExternalLinkResult {
  if (typeof value !== 'string') {
    return { kind: 'invalid', reason: 'not-a-string' };
  }
  if (value !== value.trim()) {
    return { kind: 'invalid', reason: 'surrounding-whitespace' };
  }
  if (!value.startsWith('[')) {
    return { kind: 'invalid', reason: 'missing-text-bracket' };
  }

  let closeIdx = -1;
  for (let i = 1; i < value.length; i++) {
    const ch = value[i];
    if (ch === ']' && value[i - 1] !== '\\') {
      closeIdx = i;
      break;
    }
  }
  if (closeIdx === -1) {
    return { kind: 'invalid', reason: 'unterminated-text' };
  }

  const text = value.slice(1, closeIdx);
  if (text.trim().length === 0) {
    return { kind: 'invalid', reason: 'empty-text' };
  }

  const rest = value.slice(closeIdx + 1);
  if (!rest.startsWith('(') || !rest.endsWith(')')) {
    return { kind: 'invalid', reason: 'missing-url-parens' };
  }

  const url = rest.slice(1, -1);
  if (url.length === 0) {
    return { kind: 'invalid', reason: 'empty-url' };
  }
  if (/\s/.test(url)) {
    return { kind: 'invalid', reason: 'whitespace-in-url' };
  }
  if (url.includes('(') || url.includes(')')) {
    return { kind: 'invalid', reason: 'parens-in-url' };
  }

  const schemeMatch = /^([a-zA-Z][a-zA-Z0-9+.-]*):/.exec(url);
  if (!schemeMatch?.[1]) {
    return { kind: 'invalid', reason: 'missing-scheme' };
  }
  const scheme = schemeMatch[1].toLowerCase();
  if (!allowedSchemes.includes(scheme)) {
    return { kind: 'invalid', reason: `disallowed-scheme:${scheme}` };
  }

  // mailto: is not URL-parseable in the same way as http(s) — accept on shape alone.
  if (scheme !== 'mailto') {
    try {
      // Throws on malformed authority/host/escapes.
      new URL(url);
    } catch {
      return { kind: 'invalid', reason: 'unparseable-url' };
    }
  }

  return { kind: 'valid', text, url, scheme };
}

export function isValidExternalLinkShape(
  value: unknown,
  allowedSchemes: string[] = DEFAULT_ALLOWED_SCHEMES,
): boolean {
  return parseExternalLink(value, allowedSchemes).kind === 'valid';
}
