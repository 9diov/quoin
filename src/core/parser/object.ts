/**
 * @quoin-terms Property, Parser, Validation
 * @quoin-docs docs/design/D2-type-and-schema-contracts.md
 */

export function isMapping(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
