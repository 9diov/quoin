/**
 * @quoin-terms Type Definition Document, Type Reference, Parser
 * @quoin-docs docs/design/D2-type-and-schema-contracts.md
 */

import type { ParseError, TypeDefinitionDocumentIdentity } from '../parser.js';
import { documentError } from './errors.js';
import { isCanonicalIdentifier } from './property-schema.js';

export function validateIdentity(identity: TypeDefinitionDocumentIdentity): ParseError[] {
  const errors: ParseError[] = [];

  if (typeof identity.id !== 'string' || identity.id.trim().length === 0) {
    errors.push(
      documentError(
        'parser:invalid-type-definition-identity',
        'Type Definition Document identity `id` must be a non-empty string.',
        { id: identity.id },
      ),
    );
  }

  if (typeof identity.name !== 'string' || !isCanonicalIdentifier(identity.name)) {
    errors.push(
      documentError(
        'parser:invalid-type-definition-identity',
        'Type Definition Document identity `name` must be a canonical lowercase identifier.',
        { name: identity.name },
      ),
    );
  }

  return errors;
}
