import type { ParseError, ParseErrorKind, ParseLocation } from '../parser.js';

export function makeError(
  kind: ParseErrorKind,
  message: string,
  location: ParseLocation,
  details?: Record<string, unknown>,
): ParseError {
  if (details !== undefined) {
    return { kind, message, location, details };
  }
  return { kind, message, location };
}

export function documentError(
  kind: ParseErrorKind,
  message: string,
  details?: Record<string, unknown>,
): ParseError {
  return makeError(kind, message, { scope: 'document' }, details);
}

export function schemaBlockError(
  kind: ParseErrorKind,
  message: string,
  details?: Record<string, unknown>,
): ParseError {
  return makeError(kind, message, { scope: 'block', block: 'Schema' }, details);
}

export function templateBlockError(
  kind: ParseErrorKind,
  message: string,
  details?: Record<string, unknown>,
): ParseError {
  return makeError(kind, message, { scope: 'block', block: 'Template' }, details);
}

export function propertyError(
  kind: ParseErrorKind,
  property: string,
  message: string,
  details?: Record<string, unknown>,
): ParseError {
  return makeError(kind, message, { scope: 'property', property }, details);
}

export function sectionError(
  kind: ParseErrorKind,
  section: string,
  level: number,
  message: string,
  details?: Record<string, unknown>,
): ParseError {
  return makeError(kind, message, { scope: 'section', section, level }, details);
}
