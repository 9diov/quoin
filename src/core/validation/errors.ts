/**
 * @quoin-terms Validation Error, Validation Warning, Validation Result
 * @quoin-docs docs/design/D3-validation-semantics.md
 */

import type {
  ValidationError,
  ValidationErrorKind,
  ValidationLocation,
  ValidationWarning,
  ValidationWarningKind,
} from '../validation.js';

export function validationError(
  kind: ValidationErrorKind,
  message: string,
  location: ValidationLocation,
  details?: Record<string, unknown>,
): ValidationError {
  return { kind, message, location, ...(details ? { details } : {}) };
}

export function validationWarning(
  kind: ValidationWarningKind,
  message: string,
  location: ValidationLocation,
  details?: Record<string, unknown>,
): ValidationWarning {
  return { kind, message, location, ...(details ? { details } : {}) };
}
