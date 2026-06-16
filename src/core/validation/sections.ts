import type { TemplateBlock } from '../parser.js';
import { extractAtxHeadings } from '../section-parser.js';
import type { ValidationWarning } from '../validation.js';
import { validationWarning } from './errors.js';

export function validateSections(
  body: string,
  templateBlock: TemplateBlock | undefined,
): ValidationWarning[] {
  if (!templateBlock) return [];

  const requiredSections = templateBlock.sections.filter((s) => s.required);
  if (requiredSections.length === 0) return [];

  const bodyHeadings = extractAtxHeadings(body);
  const bodyIdentities = new Set(bodyHeadings.map((h) => `${h.level} ${h.heading}`));

  const warnings: ValidationWarning[] = [];

  for (const section of requiredSections) {
    const identity = `${section.level} ${section.heading}`;
    if (!bodyIdentities.has(identity)) {
      warnings.push(
        validationWarning(
          'section:missing-required',
          `Required Section "${section.heading}" (level ${section.level}) is missing.`,
          { scope: 'section', section: section.heading, level: section.level },
        ),
      );
    }
  }

  return warnings;
}
