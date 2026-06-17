import { isMapping } from '../../core/parser/object.js';
import { isCanonicalIdentifier } from '../../core/parser/property-schema.js';
import type { UntypedDocumentBehavior } from '../../core/validation.js';

export type TypeBinding = {
  type: string;
  match: string;
};

export type ObsidianPluginSettings = {
  typeDeclarationKey: string;
  allowedUrlSchemes: string[];
  untypedDocumentBehavior: UntypedDocumentBehavior;
  referentialValidation: boolean;
  debounce: {
    activeFile: number;
    typeDefCascade: number;
  };
  bindings: TypeBinding[];
};

export type SettingsValidationIssue = {
  path: string;
  message: string;
};

export const DEFAULT_OBSIDIAN_PLUGIN_SETTINGS: ObsidianPluginSettings = {
  typeDeclarationKey: '_type',
  allowedUrlSchemes: ['http', 'https', 'mailto'],
  untypedDocumentBehavior: 'skip',
  referentialValidation: true,
  debounce: {
    activeFile: 300,
    typeDefCascade: 1500,
  },
  bindings: [],
};

function stringOrDefault(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback;
}

function booleanOrDefault(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function numberOrDefault(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function stringArrayOrDefault(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) return [...fallback];
  return value.filter((entry): entry is string => typeof entry === 'string');
}

function untypedBehaviorOrDefault(
  value: unknown,
  fallback: UntypedDocumentBehavior,
): UntypedDocumentBehavior {
  return value === 'skip' || value === 'warn' ? value : fallback;
}

function bindingsOrDefault(value: unknown, fallback: TypeBinding[]): TypeBinding[] {
  if (!Array.isArray(value)) return fallback.map((binding) => ({ ...binding }));

  return value.flatMap((entry): TypeBinding[] => {
    if (!isMapping(entry)) return [];
    const { type, match } = entry;
    if (typeof type !== 'string' || typeof match !== 'string') return [];
    return [{ type, match }];
  });
}

export function normalizeObsidianPluginSettings(saved: unknown): ObsidianPluginSettings {
  const defaults = DEFAULT_OBSIDIAN_PLUGIN_SETTINGS;
  if (!isMapping(saved)) {
    return {
      ...defaults,
      allowedUrlSchemes: [...defaults.allowedUrlSchemes],
      debounce: { ...defaults.debounce },
      bindings: [],
    };
  }

  const savedDebounce = isMapping(saved.debounce) ? saved.debounce : {};

  return {
    typeDeclarationKey: stringOrDefault(saved.typeDeclarationKey, defaults.typeDeclarationKey),
    allowedUrlSchemes: stringArrayOrDefault(saved.allowedUrlSchemes, defaults.allowedUrlSchemes),
    untypedDocumentBehavior: untypedBehaviorOrDefault(
      saved.untypedDocumentBehavior,
      defaults.untypedDocumentBehavior,
    ),
    referentialValidation: booleanOrDefault(
      saved.referentialValidation,
      defaults.referentialValidation,
    ),
    debounce: {
      activeFile: numberOrDefault(savedDebounce.activeFile, defaults.debounce.activeFile),
      typeDefCascade: numberOrDefault(
        savedDebounce.typeDefCascade,
        defaults.debounce.typeDefCascade,
      ),
    },
    bindings: bindingsOrDefault(saved.bindings, defaults.bindings),
  };
}

export function validateObsidianPluginSettings(
  settings: ObsidianPluginSettings,
): SettingsValidationIssue[] {
  const issues: SettingsValidationIssue[] = [];

  if (settings.typeDeclarationKey.trim().length === 0) {
    issues.push({
      path: 'typeDeclarationKey',
      message: 'Type declaration key must not be empty.',
    });
  }

  settings.allowedUrlSchemes.forEach((scheme, index) => {
    if (scheme.trim().length === 0) {
      issues.push({
        path: `allowedUrlSchemes[${index}]`,
        message: 'Allowed URL schemes must not contain empty values.',
      });
    }
  });

  if (settings.debounce.activeFile < 0) {
    issues.push({
      path: 'debounce.activeFile',
      message: 'Active file debounce must be zero or greater.',
    });
  }

  if (settings.debounce.typeDefCascade < 0) {
    issues.push({
      path: 'debounce.typeDefCascade',
      message: 'Type definition cascade debounce must be zero or greater.',
    });
  }

  const seen = new Set<string>();

  settings.bindings.forEach((binding, index) => {
    if (!isCanonicalIdentifier(binding.type)) {
      issues.push({
        path: `bindings[${index}].type`,
        message: 'Binding type must be a canonical type name.',
      });
    }

    if (binding.match.trim().length === 0) {
      issues.push({
        path: `bindings[${index}].match`,
        message: 'Binding match must not be empty.',
      });
    }

    const duplicateKey = JSON.stringify([binding.type, binding.match]);
    if (seen.has(duplicateKey)) {
      issues.push({
        path: `bindings[${index}]`,
        message: 'Binding duplicates an earlier row.',
      });
    }
    seen.add(duplicateKey);
  });

  return issues;
}

export function updateBinding(
  settings: ObsidianPluginSettings,
  index: number,
  patch: Partial<TypeBinding>,
): void {
  const current = settings.bindings[index];
  if (current === undefined) return;
  settings.bindings[index] = { ...current, ...patch };
}

export function createPlaceholderBinding(existing: TypeBinding[]): TypeBinding {
  const used = new Set(existing.map((binding) => JSON.stringify([binding.type, binding.match])));

  for (let index = 1; ; index += 1) {
    const suffix = index === 1 ? '' : `-${index}`;
    const candidate = {
      type: `new-binding${suffix}`,
      match: `new-binding${suffix}/**/*.md`,
    };

    if (!used.has(JSON.stringify([candidate.type, candidate.match]))) {
      return candidate;
    }
  }
}
