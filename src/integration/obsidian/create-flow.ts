import {
  type App,
  FuzzySuggestModal,
  MarkdownView,
  Modal,
  Notice,
  normalizePath,
  Setting,
  TFile,
  TFolder,
} from 'obsidian';
import { stringify as stringifyYaml } from 'yaml';

import type { ParsedTypeDefinitionDocument } from '../../core/parser.js';
import { scaffold } from '../../core/scaffold.js';
import { template } from '../../core/template.js';
import type { Document } from '../../core/types.js';
import { type ValidationResult, validate } from '../../core/validation.js';
import type { ObsidianTypeRegistryState } from './discovery.js';
import type { ObsidianBasenameIndex } from './lookup.js';
import { createObsidianResolver } from './lookup.js';
import type QuoinPlugin from './main.js';

export type CreateFlowContext = {
  folderPath?: string;
  typeDef?: ParsedTypeDefinitionDocument;
};

export type TypePickerItem = {
  typeDef: ParsedTypeDefinitionDocument;
  title: string;
  subtitle: string;
};

export type DiscoveryHealth = { ok: true } | { ok: false; reasons: string[] };

export type OutputPathValidation = { ok: true; path: string } | { ok: false; reason: string };

export type CreatedDocumentCandidate = {
  document: Document;
  contents: string;
  frontmatterEndOffset: number;
  validation: ValidationResult;
};

export function registerCreateFlowMenus(plugin: QuoinPlugin): void {
  plugin.registerEvent(
    plugin.app.workspace.on('file-menu', (menu, file) => {
      if (file instanceof TFolder) {
        menu.addItem((item) => {
          item.setTitle('New Quoin document...');
          item.onClick(() => {
            void startCreateFlow(plugin, { folderPath: file.path });
          });
        });
        return;
      }

      if (!(file instanceof TFile) || plugin.typeRegistry === null) return;
      const state = plugin.typeRegistry.getState();
      const typeDef = state.parsedTypes.find((candidate) => candidate.id === file.path);
      if (typeDef === undefined || evaluateDiscoveryHealth(state).ok === false) return;

      menu.addItem((item) => {
        item.setTitle('New document of this type');
        item.onClick(() => {
          void startCreateFlow(plugin, {
            typeDef,
            folderPath: activeFolderPath(plugin.app),
          });
        });
      });
    }),
  );
}

export async function startCreateFlow(
  plugin: QuoinPlugin,
  context: CreateFlowContext = {},
): Promise<void> {
  if (plugin.typeRegistry === null || plugin.basenameIndex === null) {
    new Notice('Quoin type registry is not ready yet.');
    return;
  }

  const registryState = plugin.typeRegistry.getState();
  const health = evaluateDiscoveryHealth(registryState);
  if (!health.ok) {
    new Notice(`Quoin create is blocked: ${health.reasons[0]}`);
    await plugin.showTypesView();
    return;
  }

  const selectedType = context.typeDef ?? (await pickType(plugin.app, registryState));
  if (selectedType === null) return;

  const initialPath = defaultOutputPath(context.folderPath ?? activeFolderPath(plugin.app));
  const outputPath = await promptForOutputPath(plugin.app, initialPath, (value) =>
    validateOutputPath(plugin.app, value),
  );
  if (outputPath === null) return;

  const candidate = buildCreatedDocumentCandidate({
    app: plugin.app,
    basenameIndex: plugin.basenameIndex,
    outputPath,
    registryState,
    settings: plugin.settings,
    typeDef: selectedType,
  });

  if (candidate.validation.errors.length > 0) {
    plugin.recordCreateValidationErrors(outputPath, selectedType, candidate.validation);
    new Notice(
      `Quoin create is blocked by ${candidate.validation.errors.length} validation error(s).`,
    );
    await plugin.showValidationView();
    return;
  }

  let created: TFile;
  try {
    const createFile = plugin.app.vault.create;
    if (createFile === undefined) {
      new Notice('Obsidian vault create API is not available.');
      return;
    }
    created = await createFile.call(plugin.app.vault, outputPath, candidate.contents);
  } catch (error) {
    new Notice(error instanceof Error ? error.message : 'Quoin could not create the document.');
    return;
  }

  await openCreatedFile(plugin.app, created, candidate.frontmatterEndOffset);
  plugin.scheduleActiveValidationFromCreate();
}

export function evaluateDiscoveryHealth(state: ObsidianTypeRegistryState): DiscoveryHealth {
  const reasons: string[] = [];

  if (state.ingestionDiagnostics.length > 0) {
    reasons.push(`${state.ingestionDiagnostics.length} ingestion diagnostic(s)`);
  }
  if (state.typeParseFailures.length > 0) {
    reasons.push(`${state.typeParseFailures.length} type parse failure(s)`);
  }
  if (state.ambiguousNames.length > 0) {
    reasons.push(`${state.ambiguousNames.length} ambiguous type name(s)`);
  }

  return reasons.length === 0 ? { ok: true } : { ok: false, reasons };
}

export function createTypePickerItems(state: ObsidianTypeRegistryState): TypePickerItem[] {
  const ambiguousNames = new Set(state.ambiguousNames.map((entry) => entry.name));
  return state.parsedTypes
    .filter((typeDef) => !ambiguousNames.has(typeDef.name))
    .map((typeDef) => ({
      typeDef,
      title: typeDef.name,
      subtitle: typeDef.id,
    }))
    .sort((a, b) => a.title.localeCompare(b.title) || a.subtitle.localeCompare(b.subtitle));
}

export function validateOutputPath(app: App, input: string): OutputPathValidation {
  const trimmed = input.trim();
  if (trimmed.length === 0) return { ok: false, reason: 'Enter a vault-relative path.' };
  if (trimmed.startsWith('/') || /^[A-Za-z]:[\\/]/.test(trimmed)) {
    return { ok: false, reason: 'Path must stay inside the active vault.' };
  }

  const path = normalizePath(trimmed);
  const segments = path.split('/');
  if (segments.some((segment) => segment === '..')) {
    return { ok: false, reason: 'Path must stay inside the active vault.' };
  }
  if (segments.some((segment) => segment.length === 0 || segment === '.')) {
    return { ok: false, reason: 'Path contains an invalid segment.' };
  }
  if (!path.toLowerCase().endsWith('.md')) {
    return { ok: false, reason: 'Path must end in .md.' };
  }
  const existing =
    app.vault.getAbstractFileByPath?.(path) ??
    app.vault.getMarkdownFiles().find((file) => file.path === path) ??
    null;
  if (existing !== null) {
    return { ok: false, reason: 'A file already exists at that path.' };
  }

  return { ok: true, path };
}

export function buildCreatedDocumentCandidate(args: {
  app: App;
  basenameIndex: ObsidianBasenameIndex;
  outputPath: string;
  registryState: ObsidianTypeRegistryState;
  settings: Pick<
    QuoinPlugin['settings'],
    'referentialValidation' | 'typeDeclarationKey' | 'untypedDocumentBehavior'
  >;
  typeDef: ParsedTypeDefinitionDocument;
}): CreatedDocumentCandidate {
  const typeDeclaration = `[[${basenameWithoutExtension(args.typeDef.id)}]]`;
  const initialFrontmatter: Record<string, unknown> = {
    [args.settings.typeDeclarationKey]: typeDeclaration,
  };
  const scaffolded = scaffold(initialFrontmatter, args.typeDef);
  const frontmatter = { ...initialFrontmatter, ...scaffolded.properties };
  const templated = template(args.typeDef);
  const contents = serializeDocument(frontmatter, templated.body);
  const frontmatterEndOffset = frontmatterBlockLength(frontmatter);
  const document: Document = {
    path: args.outputPath,
    frontmatter,
    body: templated.body,
  };
  const validation = validate(
    document,
    args.typeDef,
    {
      typeDeclarationKey: args.settings.typeDeclarationKey,
      untypedDocumentBehavior: args.settings.untypedDocumentBehavior,
      referentialValidation: args.settings.referentialValidation,
      integration: 'obsidian',
    },
    createObsidianResolver(args.app, args.basenameIndex),
    args.registryState.typeRegistry,
  );

  return { document, contents, frontmatterEndOffset, validation };
}

export function serializeDocument(frontmatter: Record<string, unknown>, body: string): string {
  const frontmatterBlock = serializeFrontmatter(frontmatter);
  if (body.length === 0) return frontmatterBlock;
  return `${frontmatterBlock}\n${body}`;
}

export function defaultOutputPath(folderPath: string | undefined): string {
  const folder = normalizePath(folderPath ?? '');
  return folder.length === 0 || folder === '/' ? 'Untitled.md' : `${folder}/Untitled.md`;
}

function serializeFrontmatter(frontmatter: Record<string, unknown>): string {
  const yaml = stringifyYaml(frontmatter, {
    lineWidth: 0,
    sortMapEntries: false,
  });
  return `---\n${yaml}---\n`;
}

function frontmatterBlockLength(frontmatter: Record<string, unknown>): number {
  return serializeFrontmatter(frontmatter).length;
}

function pickType(
  app: App,
  registryState: ObsidianTypeRegistryState,
): Promise<ParsedTypeDefinitionDocument | null> {
  const items = createTypePickerItems(registryState);
  if (items.length === 0) {
    new Notice('No Quoin types are available.');
    return Promise.resolve(null);
  }

  return new Promise((resolve) => {
    const modal = new TypeSuggestModal(app, items, resolve);
    modal.open();
  });
}

function promptForOutputPath(
  app: App,
  initialPath: string,
  validatePath: (value: string) => OutputPathValidation,
): Promise<string | null> {
  return new Promise((resolve) => {
    const modal = new OutputPathModal(app, initialPath, validatePath, resolve);
    modal.open();
  });
}

class TypeSuggestModal extends FuzzySuggestModal<TypePickerItem> {
  private didResolve = false;

  constructor(
    app: App,
    private readonly items: TypePickerItem[],
    private readonly resolveSelection: (typeDef: ParsedTypeDefinitionDocument | null) => void,
  ) {
    super(app);
    this.setPlaceholder('Select a Quoin type');
  }

  getItems(): TypePickerItem[] {
    return this.items;
  }

  getItemText(item: TypePickerItem): string {
    return `${item.title} ${item.subtitle}`;
  }

  renderSuggestion(item: TypePickerItem, el: HTMLElement): void {
    el.createEl('div', { text: item.title });
    el.createEl('small', { text: item.subtitle });
  }

  onChooseItem(item: TypePickerItem): void {
    this.didResolve = true;
    this.resolveSelection(item.typeDef);
  }

  onClose(): void {
    if (this.didResolve) return;
    this.resolveSelection(null);
  }
}

class OutputPathModal extends Modal {
  private inputValue: string;
  private errorEl: HTMLElement | null = null;
  private didResolve = false;

  constructor(
    app: App,
    initialPath: string,
    private readonly validatePath: (value: string) => OutputPathValidation,
    private readonly resolvePath: (path: string | null) => void,
  ) {
    super(app);
    this.inputValue = initialPath;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl('h2', { text: 'New Quoin document' });

    new Setting(contentEl).setName('Path').addText((text) => {
      text.setValue(this.inputValue);
      text.onChange((value) => {
        this.inputValue = value;
        this.clearError();
      });
      window.setTimeout(() => {
        text.inputEl.focus();
        text.inputEl.select();
      }, 0);
    });

    this.errorEl = contentEl.createEl('p', { cls: 'quoin-error' });
    const actions = contentEl.createDiv({ cls: 'quoin-actions' });
    const create = actions.createEl('button', { text: 'Create', cls: 'mod-cta' });
    create.onClickEvent(() => {
      this.submit();
    });
    const cancel = actions.createEl('button', { text: 'Cancel' });
    cancel.onClickEvent(() => {
      this.close();
    });
  }

  onClose(): void {
    this.contentEl.empty();
    if (!this.didResolve) this.resolvePath(null);
  }

  private submit(): void {
    const result = this.validatePath(this.inputValue);
    if (!result.ok) {
      this.showError(result.reason);
      return;
    }

    this.didResolve = true;
    this.resolvePath(result.path);
    this.close();
  }

  private clearError(): void {
    this.errorEl?.setText('');
  }

  private showError(message: string): void {
    this.errorEl?.setText(message);
  }
}

async function openCreatedFile(app: App, file: TFile, frontmatterEndOffset: number): Promise<void> {
  const leaf = app.workspace.getLeaf?.(false) ?? app.workspace.getRightLeaf(false);
  await leaf?.openFile(file);

  const view = app.workspace.getActiveViewOfType?.(MarkdownView);
  const editor = view?.editor;
  if (editor === undefined) return;

  editor.setCursor(editor.offsetToPos(frontmatterEndOffset));
}

function activeFolderPath(app: App): string {
  const active = app.workspace.getActiveFile();
  return active === null ? '' : parentFolderPath(active.path);
}

function parentFolderPath(path: string): string {
  const index = path.lastIndexOf('/');
  return index === -1 ? '' : path.slice(0, index);
}

function basenameWithoutExtension(path: string): string {
  const normalized = path.replaceAll('\\', '/');
  const filename = normalized.slice(normalized.lastIndexOf('/') + 1);
  const dot = filename.lastIndexOf('.');
  return dot <= 0 ? filename : filename.slice(0, dot);
}
