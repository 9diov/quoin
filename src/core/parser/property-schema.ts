import type {
  ChoiceMember,
  DocReference,
  DocRefFormat,
  ListItemType,
  ParseError,
  PrimitiveTypeName,
  PropertySchema,
  PropertyTypeName,
} from '../parser.js';
import { propertyError } from './errors.js';
import { isMapping } from './object.js';

const PRIMITIVE_TYPES = new Set<PrimitiveTypeName>([
  'text',
  'number',
  'boolean',
  'date',
  'datetime',
]);

const ALLOWED_PROPERTY_SCHEMA_KEYS = new Set([
  'type',
  'format',
  'referenced-type',
  'required',
  'allow-empty',
  'default',
]);

const CANONICAL_KEY = /^[a-z0-9]([a-z0-9_-]*[a-z0-9])?$/;
const WIKI_LINK_RE = /^\[\[\s*([^[\]]*?)\s*\]\]$/;
const MARKDOWN_TYPE_REF_RE = /^\[\s*\]\(\s*([^()]*?)\s*\)$/;
const COLLECTION_RE = /^(list|choice)<([\s\S]*)>$/;
const ALLOWED_FORMATS = new Set<DocRefFormat>(['wiki-link', 'markdown-link']);

export function isCanonicalPropertyKey(key: string): boolean {
  if (key === '_type') return true;
  return CANONICAL_KEY.test(key);
}

export function isCanonicalIdentifier(key: string): boolean {
  return CANONICAL_KEY.test(key);
}

type ParseTypeError = {
  error: 'unknown-property-type' | 'invalid-type-reference' | 'invalid-enum';
  details?: Record<string, unknown>;
};

type ParseTypeResult = { type: PropertyTypeName } | ParseTypeError;

function parseWikiLinkTypeRef(raw: string): { name: string } | ParseTypeError {
  const match = WIKI_LINK_RE.exec(raw);
  if (!match) {
    return { error: 'invalid-type-reference', details: { value: raw } };
  }
  const inner = match[1] ?? '';
  if (inner.length === 0) {
    return {
      error: 'invalid-type-reference',
      details: { value: raw, reason: 'wiki-link-empty' },
    };
  }
  if (inner.includes('|')) {
    return {
      error: 'invalid-type-reference',
      details: { value: raw, reason: 'wiki-link-not-bare' },
    };
  }
  if (inner.includes('#')) {
    return {
      error: 'invalid-type-reference',
      details: { value: raw, reason: 'wiki-link-not-bare' },
    };
  }
  if (inner.includes('/')) {
    return {
      error: 'invalid-type-reference',
      details: { value: raw, reason: 'wiki-link-not-bare' },
    };
  }
  if (!isCanonicalIdentifier(inner)) {
    return {
      error: 'invalid-type-reference',
      details: { value: inner, reason: 'non-canonical-name' },
    };
  }
  return { name: inner };
}

function parseMarkdownLinkTypeRef(raw: string): { name: string } | ParseTypeError {
  const match = MARKDOWN_TYPE_REF_RE.exec(raw);
  if (!match) {
    return { error: 'invalid-type-reference', details: { value: raw } };
  }
  const inner = match[1] ?? '';
  if (inner.length === 0) {
    return {
      error: 'invalid-type-reference',
      details: { value: raw, reason: 'markdown-link-empty' },
    };
  }
  if (!isCanonicalIdentifier(inner)) {
    return {
      error: 'invalid-type-reference',
      details: { value: inner, reason: 'non-canonical-name' },
    };
  }
  return { name: inner };
}

function parseListItemType(inner: string): { type: ListItemType } | ParseTypeError {
  const trimmed = inner.trim();
  if (trimmed.length === 0) {
    return {
      error: 'invalid-enum',
      details: { values: [''] },
    };
  }
  if (trimmed.includes('|')) {
    return {
      error: 'invalid-enum',
      details: { values: trimmed.split('|').map((s) => s.trim()) },
    };
  }
  if (PRIMITIVE_TYPES.has(trimmed as PrimitiveTypeName)) {
    return { type: { kind: 'primitive', name: trimmed as PrimitiveTypeName } };
  }
  if (trimmed === 'wiki-link') {
    // Compatibility alias inside lists: list<wiki-link> -> list<doc-ref<wiki-link>>.
    return { type: { kind: 'doc-ref', format: 'wiki-link' } };
  }
  if (trimmed === 'doc-ref') {
    return { type: { kind: 'doc-ref' } };
  }
  if (trimmed.startsWith('[[')) {
    const ref = parseWikiLinkTypeRef(trimmed);
    if ('error' in ref) return ref;
    return { type: { kind: 'doc-ref', format: 'wiki-link', referencedType: ref.name } };
  }
  if (trimmed.startsWith('[]')) {
    const ref = parseMarkdownLinkTypeRef(trimmed);
    if ('error' in ref) return ref;
    return { type: { kind: 'doc-ref', format: 'markdown-link', referencedType: ref.name } };
  }
  return {
    error: 'invalid-type-reference',
    details: { value: trimmed, reason: 'expected-wiki-link-or-primitive' },
  };
}

function parseQuotedLiteral(segment: string): { value: string } | null {
  if (segment.length < 2) return null;
  const first = segment[0];
  const last = segment[segment.length - 1];
  if ((first !== '"' && first !== "'") || first !== last) return null;
  const inner = segment.slice(1, -1);
  // No escape sequences in v1; the literal must not contain its own quote char.
  if (inner.includes(first)) return null;
  return { value: inner };
}

function parseChoiceEnum(inner: string): { members: ChoiceMember[] } | ParseTypeError {
  const trimmed = inner.trim();
  if (trimmed.length === 0) {
    return { error: 'invalid-enum', details: { values: [] } };
  }
  const rawSegments = trimmed.split('|').map((s) => s.trim());

  // Build the values array used in error details (empty string for empty segments,
  // raw segment for unquoted/malformed segments, parsed value for quoted literals).
  const parsedValues: string[] = [];
  const members: ChoiceMember[] = [];
  let anyMalformed = false;
  for (const seg of rawSegments) {
    if (seg.length === 0) {
      parsedValues.push('');
      anyMalformed = true;
      continue;
    }
    const lit = parseQuotedLiteral(seg);
    if (!lit) {
      parsedValues.push(seg);
      anyMalformed = true;
      continue;
    }
    if (lit.value.length === 0) {
      parsedValues.push('');
      anyMalformed = true;
      continue;
    }
    parsedValues.push(lit.value);
    members.push({ kind: 'literal', value: lit.value });
  }

  if (anyMalformed) {
    return { error: 'invalid-enum', details: { values: parsedValues } };
  }
  if (members.length < 2) {
    return { error: 'invalid-enum', details: { values: parsedValues } };
  }
  const seen = new Set<string>();
  for (const m of members) {
    if (seen.has(m.value)) {
      return { error: 'invalid-enum', details: { values: parsedValues } };
    }
    seen.add(m.value);
  }
  return { members };
}

function parsePropertyType(raw: unknown): ParseTypeResult {
  if (typeof raw !== 'string') {
    return { error: 'unknown-property-type', details: { value: raw } };
  }
  const trimmed = raw.trim();

  if (PRIMITIVE_TYPES.has(trimmed as PrimitiveTypeName)) {
    return { type: trimmed as PrimitiveTypeName };
  }

  if (trimmed === 'doc-ref') {
    return { type: { kind: 'doc-ref' } };
  }

  if (trimmed === 'wiki-link') {
    // Compatibility alias: bare `type: wiki-link` -> doc-ref + format: wiki-link.
    return { type: { kind: 'doc-ref', format: 'wiki-link' } };
  }

  if (trimmed.startsWith('[[')) {
    const ref = parseWikiLinkTypeRef(trimmed);
    if ('error' in ref) return ref;
    return {
      type: { kind: 'doc-ref', format: 'wiki-link', referencedType: ref.name },
    };
  }

  if (trimmed.startsWith('[]')) {
    const ref = parseMarkdownLinkTypeRef(trimmed);
    if ('error' in ref) return ref;
    return {
      type: { kind: 'doc-ref', format: 'markdown-link', referencedType: ref.name },
    };
  }

  const match = COLLECTION_RE.exec(trimmed);
  if (match) {
    const kind = match[1] as 'list' | 'choice';
    const inner = match[2] ?? '';
    if (kind === 'list') {
      const item = parseListItemType(inner);
      if ('error' in item) return item;
      return { type: { kind: 'list', of: item.type } };
    }
    const en = parseChoiceEnum(inner);
    if ('error' in en) return en;
    return { type: { kind: 'choice', members: en.members } };
  }

  return { error: 'unknown-property-type', details: { value: trimmed } };
}

export type PropertySchemaResult = {
  schema?: PropertySchema;
  errors: ParseError[];
};

function isDocRefTopLevel(type: PropertyTypeName): type is DocReference {
  return typeof type === 'object' && (type as { kind?: string }).kind === 'doc-ref';
}

function isDocRefListItem(type: PropertyTypeName): boolean {
  if (typeof type !== 'object') return false;
  if ((type as { kind?: string }).kind !== 'list') return false;
  const list = type as { kind: 'list'; of: ListItemType };
  return list.of.kind === 'doc-ref';
}

function attachDocRefAdditions(
  type: PropertyTypeName,
  format: DocRefFormat | undefined,
  referencedType: string | undefined,
): PropertyTypeName {
  if (isDocRefTopLevel(type)) {
    const next: DocReference = { kind: 'doc-ref' };
    const f = format ?? type.format;
    const r = referencedType ?? type.referencedType;
    if (f !== undefined) next.format = f;
    if (r !== undefined) next.referencedType = r;
    return next;
  }
  if (typeof type === 'object' && type.kind === 'list' && type.of.kind === 'doc-ref') {
    const item = type.of;
    const next: DocReference = { kind: 'doc-ref' };
    const f = format ?? item.format;
    const r = referencedType ?? item.referencedType;
    if (f !== undefined) next.format = f;
    if (r !== undefined) next.referencedType = r;
    return { kind: 'list', of: next };
  }
  return type;
}

export function validatePropertySchema(key: string, raw: unknown): PropertySchemaResult {
  const errors: ParseError[] = [];

  if (!isCanonicalPropertyKey(key)) {
    errors.push(
      propertyError(
        'parser:invalid-property-key',
        key,
        `Property key \`${key}\` is not canonical (lowercase, [a-z0-9_-], no leading/trailing hyphens or underscores; \`_type\` is the only exception).`,
        { key },
      ),
    );
  }

  if (!isMapping(raw)) {
    errors.push(
      propertyError(
        'parser:invalid-property-schema',
        key,
        `Property \`${key}\` must be a mapping.`,
      ),
    );
    return { errors };
  }

  const unknownKeys = Object.keys(raw).filter((k) => !ALLOWED_PROPERTY_SCHEMA_KEYS.has(k));
  if (unknownKeys.length > 0) {
    errors.push(
      propertyError(
        'parser:invalid-property-schema',
        key,
        `Property \`${key}\` has unknown schema keys: ${unknownKeys.join(', ')}.`,
        { unknownKeys },
      ),
    );
  }

  if (!('type' in raw)) {
    errors.push(
      propertyError(
        'parser:invalid-property-schema',
        key,
        `Property \`${key}\` is missing required schema key \`type\`.`,
        { key: 'type', expected: 'PropertyTypeName' },
      ),
    );
    return { errors };
  }

  const typeResult = parsePropertyType(raw.type);
  if ('error' in typeResult) {
    if (typeResult.error === 'unknown-property-type') {
      errors.push(
        propertyError(
          'parser:unknown-property-type',
          key,
          `Property \`${key}\` has unknown type ${JSON.stringify(raw.type)}.`,
          typeResult.details,
        ),
      );
    } else if (typeResult.error === 'invalid-type-reference') {
      errors.push(
        propertyError(
          'parser:invalid-type-reference',
          key,
          `Type Reference must be a bare canonical Wiki Link \`[[name]]\` or Markdown link \`[](name)\`.`,
          typeResult.details,
        ),
      );
    } else {
      errors.push(
        propertyError(
          'parser:invalid-enum',
          key,
          `\`choice<...>\` must contain two or more unique quoted string literals separated by \`|\` (e.g. \`choice<"a"|"b">\`).`,
          typeResult.details,
        ),
      );
    }
    return { errors };
  }

  let parsedType = typeResult.type as PropertyTypeName;
  const isDocRefType = isDocRefTopLevel(parsedType) || isDocRefListItem(parsedType);

  let parsedFormat: DocRefFormat | undefined;
  if ('format' in raw) {
    if (!isDocRefType) {
      errors.push(
        propertyError(
          'parser:invalid-property-schema',
          key,
          `\`format\` is only valid for \`doc-ref\` properties.`,
          { key: 'format' },
        ),
      );
    } else if (typeof raw.format !== 'string' || !ALLOWED_FORMATS.has(raw.format as DocRefFormat)) {
      errors.push(
        propertyError(
          'parser:invalid-property-schema',
          key,
          `\`format\` must be one of: wiki-link, markdown-link.`,
          { key: 'format', value: raw.format },
        ),
      );
    } else {
      parsedFormat = raw.format as DocRefFormat;
    }
  }

  let parsedReferencedType: string | undefined;
  if ('referenced-type' in raw) {
    if (!isDocRefType) {
      errors.push(
        propertyError(
          'parser:invalid-property-schema',
          key,
          `\`referenced-type\` is only valid for \`doc-ref\` properties.`,
          { key: 'referenced-type' },
        ),
      );
    } else {
      const refTypeValue = raw['referenced-type'];
      if (typeof refTypeValue !== 'string' || !isCanonicalIdentifier(refTypeValue)) {
        errors.push(
          propertyError(
            'parser:invalid-type-reference',
            key,
            `\`referenced-type\` must be a canonical type name.`,
            { key: 'referenced-type', value: refTypeValue, reason: 'non-canonical-name' },
          ),
        );
      } else {
        parsedReferencedType = refTypeValue;
      }
    }
  }

  if (isDocRefType && (parsedFormat !== undefined || parsedReferencedType !== undefined)) {
    // Check for conflicts: an inline shorthand already set format/referencedType.
    const currentInfo = isDocRefTopLevel(parsedType)
      ? parsedType
      : ((parsedType as { kind: 'list'; of: DocReference }).of as DocReference);
    if (
      parsedFormat !== undefined &&
      currentInfo.format !== undefined &&
      currentInfo.format !== parsedFormat
    ) {
      errors.push(
        propertyError(
          'parser:invalid-property-schema',
          key,
          `\`format\` conflicts with the format implied by the shorthand type.`,
          { key: 'format', value: parsedFormat, implied: currentInfo.format },
        ),
      );
    }
    if (
      parsedReferencedType !== undefined &&
      currentInfo.referencedType !== undefined &&
      currentInfo.referencedType !== parsedReferencedType
    ) {
      errors.push(
        propertyError(
          'parser:invalid-property-schema',
          key,
          `\`referenced-type\` conflicts with the type referenced by the shorthand type.`,
          {
            key: 'referenced-type',
            value: parsedReferencedType,
            implied: currentInfo.referencedType,
          },
        ),
      );
    }
    parsedType = attachDocRefAdditions(parsedType, parsedFormat, parsedReferencedType);
  }

  const schema: PropertySchema = { type: parsedType };

  if ('required' in raw) {
    if (typeof raw.required !== 'boolean') {
      errors.push(
        propertyError(
          'parser:invalid-property-schema',
          key,
          `\`required\` must be a strict boolean.`,
          { key: 'required', expected: 'boolean' },
        ),
      );
    } else {
      schema.required = raw.required;
    }
  }

  if ('allow-empty' in raw) {
    if (typeof raw['allow-empty'] !== 'boolean') {
      errors.push(
        propertyError(
          'parser:invalid-property-schema',
          key,
          `\`allow-empty\` must be a strict boolean.`,
          { key: 'allow-empty', expected: 'boolean' },
        ),
      );
    } else {
      schema['allow-empty'] = raw['allow-empty'];
    }
  }

  if ('default' in raw) {
    schema.default = raw.default;
  }

  return { schema, errors };
}
