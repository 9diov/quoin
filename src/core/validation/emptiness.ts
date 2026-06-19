/**
 * @quoin-terms Property, Constraint, Validation
 * @quoin-docs docs/design/D3-validation-semantics.md
 */

export function isValueEmpty(value: unknown): boolean {
  if (value === null) return true;
  if (typeof value === 'string' && value.trim().length === 0) return true;
  if (Array.isArray(value) && value.length === 0) return true;
  return false;
}
