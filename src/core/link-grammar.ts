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
