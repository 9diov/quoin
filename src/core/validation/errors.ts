import type { ValidationError, ValidationErrorKind, ValidationLocation } from '../validation.js';
import type { ValidationWarning, ValidationWarningKind } from '../validation.js';

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
