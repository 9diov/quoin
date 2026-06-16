// Shared grammar checks for primitive value shapes.
// Used by both Parser (to validate defaults locally) and Validation (to
// validate runtime document values). Centralised here so a default that
// parses cannot be rejected by Validation, and vice versa.

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isCanonicalDate(s: string): boolean {
  const m = DATE_RE.exec(s);
  if (!m) return false;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (year === undefined || month === undefined || day === undefined) return false;
  if (month < 1 || month > 12) return false;
  const daysInMonth = new Date(year, month, 0).getDate();
  if (day < 1 || day > daysInMonth) return false;
  return true;
}

const ISO_DATETIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

export function isIso8601WithTimezone(s: string): boolean {
  if (!ISO_DATETIME_RE.test(s)) return false;
  const ts = Date.parse(s);
  return !Number.isNaN(ts);
}
