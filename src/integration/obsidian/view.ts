/**
 * @quoin-terms Integration, Validation Result, TypeRegistry, Document
 * @quoin-docs docs/design/D8-obsidian-plugin-integration.md
 */

import { ItemView, type WorkspaceLeaf } from 'obsidian';

import type { ActiveFileValidationState } from './active-validation.js';
import type { ObsidianTypeRegistryState } from './discovery.js';
import type QuoinPlugin from './main.js';

export const QUOIN_VIEW_TYPE = 'quoin-sidebar';

export type QuoinSidebarTab = 'validation' | 'types';

export type VaultValidationRow = {
  path: string;
  state: ActiveFileValidationState;
};

export type VaultValidationState =
  | { kind: 'never'; lastRun: null; rows: VaultValidationRow[] }
  | {
      kind: 'running';
      lastRun: Date | null;
      completed: number;
      total: number;
      rows: VaultValidationRow[];
    }
  | { kind: 'completed'; lastRun: Date; rows: VaultValidationRow[] }
  | {
      kind: 'cancelled';
      lastRun: Date;
      completed: number;
      total: number;
      rows: VaultValidationRow[];
    };

export class QuoinSidebarView extends ItemView {
  private activeTab: QuoinSidebarTab = 'validation';

  constructor(
    leaf: WorkspaceLeaf,
    private readonly plugin: QuoinPlugin,
  ) {
    super(leaf);
  }

  getViewType(): string {
    return QUOIN_VIEW_TYPE;
  }

  getDisplayText(): string {
    return 'Quoin';
  }

  async onOpen(): Promise<void> {
    this.plugin.registerSidebarView(this);
    this.render();
  }

  async onClose(): Promise<void> {
    this.plugin.unregisterSidebarView(this);
    this.contentEl.empty();
  }

  selectTab(tab: QuoinSidebarTab): void {
    this.activeTab = tab;
    this.render();
  }

  render(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl('h2', { text: 'Quoin' });

    const tabs = contentEl.createDiv({ cls: 'quoin-tabs' });
    this.renderTabButton(tabs, 'validation', 'Validation');
    this.renderTabButton(tabs, 'types', 'Types');

    if (this.activeTab === 'validation') {
      this.renderValidationTab(contentEl);
    } else {
      this.renderTypesTab(contentEl);
    }
  }

  private renderTabButton(parent: HTMLElement, tab: QuoinSidebarTab, text: string): void {
    const button = parent.createEl('button', {
      text,
      cls: this.activeTab === tab ? 'mod-cta is-active' : '',
    });
    button.onClickEvent(() => {
      this.selectTab(tab);
    });
  }

  private renderValidationTab(parent: HTMLElement): void {
    const current = parent.createDiv({ cls: 'quoin-section' });
    current.createEl('h3', { text: 'Current file' });
    this.renderActiveFileState(current, this.plugin.activeFileValidationState);

    const vaultWide = parent.createDiv({ cls: 'quoin-section' });
    vaultWide.createEl('h3', { text: 'Vault-wide' });
    this.renderVaultValidationControls(vaultWide, this.plugin.vaultValidationState);

    for (const row of this.plugin.vaultValidationState.rows) {
      const rowEl = vaultWide.createDiv({ cls: 'quoin-validation-row' });
      rowEl.createEl('strong', { text: row.path });
      this.renderActiveFileState(rowEl, row.state);
    }
  }

  private renderVaultValidationControls(parent: HTMLElement, state: VaultValidationState): void {
    const meta = parent.createDiv({ cls: 'quoin-meta' });
    meta.createEl('span', { text: `Last run: ${formatLastRun(state.lastRun)}` });

    if (state.kind === 'running') {
      meta.createEl('span', { text: `Progress: ${state.completed}/${state.total}` });
      const cancel = parent.createEl('button', { text: 'Cancel' });
      cancel.onClickEvent(() => {
        this.plugin.cancelVaultValidation();
      });
      return;
    }

    if (state.kind === 'cancelled') {
      meta.createEl('span', { text: `Cancelled at ${state.completed}/${state.total}` });
    }

    const run = parent.createEl('button', { text: 'Validate vault' });
    run.onClickEvent(() => {
      void this.plugin.startVaultValidation();
    });
  }

  private renderActiveFileState(parent: HTMLElement, state: ActiveFileValidationState): void {
    switch (state.kind) {
      case 'hidden':
        parent.createEl('p', { text: 'No active Markdown file.' });
        return;
      case 'validated':
        parent.createEl('p', {
          text: `${state.typeName}: ${state.result.errors.length} error(s), ${state.result.warnings.length} warning(s)`,
        });
        renderMessages(parent, 'Errors', state.result.errors);
        renderMessages(parent, 'Warnings', state.result.warnings);
        return;
      case 'type-definition':
        parent.createEl('p', { text: `Type definition: ${state.typeName}` });
        return;
      case 'untyped':
        parent.createEl('p', { text: 'Untyped document.' });
        return;
      case 'read-failure':
      case 'frontmatter-failure':
      case 'type-unavailable':
      case 'binding-type-unavailable':
        parent.createEl('p', { text: state.reason });
        return;
      case 'ambiguous-binding':
        parent.createEl('p', {
          text: `Ambiguous bindings: ${state.candidates.map((candidate) => `${candidate.type}:${candidate.match}`).join(', ')}`,
        });
        return;
      case 'invalid-type-declaration':
        parent.createEl('p', { text: `Invalid type declaration: ${JSON.stringify(state.value)}` });
        return;
      case 'type-not-found':
      case 'binding-type-not-found':
        parent.createEl('p', { text: `Type not found: ${state.typeName}` });
        return;
      case 'type-ambiguous':
      case 'binding-type-ambiguous':
        parent.createEl('p', {
          text: `Ambiguous type: ${state.typeName} (${state.candidateIds.join(', ')})`,
        });
        return;
    }
  }

  private renderTypesTab(parent: HTMLElement): void {
    const state = this.plugin.typeRegistry?.getState();
    if (state === undefined) {
      parent.createEl('p', { text: 'Type registry is not ready.' });
      return;
    }

    renderTypes(parent, state, (path) => {
      void this.plugin.openMarkdownFile(path);
    });
  }
}

function renderTypes(
  parent: HTMLElement,
  state: ObsidianTypeRegistryState,
  openPath: (path: string) => void,
): void {
  const types = parent.createDiv({ cls: 'quoin-section' });
  types.createEl('h3', { text: 'Discovered types' });
  for (const typeDef of [...state.parsedTypes].sort(compareTypeRows)) {
    const button = types.createEl('button', { text: `${typeDef.name} - ${typeDef.id}` });
    button.onClickEvent(() => {
      openPath(typeDef.id);
    });
  }
  if (state.parsedTypes.length === 0) types.createEl('p', { text: 'No discovered types.' });

  const failures = parent.createDiv({ cls: 'quoin-section' });
  failures.createEl('h3', { text: 'Parse failures' });
  for (const failure of state.typeParseFailures) {
    const row = failures.createDiv({ cls: 'quoin-diagnostic-row' });
    row.createEl('strong', { text: failure.path });
    for (const error of failure.errors) row.createEl('p', { text: error.message });
  }
  if (state.typeParseFailures.length === 0) failures.createEl('p', { text: 'No parse failures.' });

  const ambiguous = parent.createDiv({ cls: 'quoin-section' });
  ambiguous.createEl('h3', { text: 'Ambiguous names' });
  for (const entry of state.ambiguousNames) {
    ambiguous.createEl('strong', { text: entry.name });
    for (const candidate of entry.candidates) ambiguous.createEl('p', { text: candidate.id });
  }
  if (state.ambiguousNames.length === 0) ambiguous.createEl('p', { text: 'No ambiguous names.' });

  const diagnostics = parent.createDiv({ cls: 'quoin-section' });
  diagnostics.createEl('h3', { text: 'Ingestion diagnostics' });
  for (const diagnostic of state.ingestionDiagnostics) {
    diagnostics.createEl('p', {
      text: `${diagnostic.path} (${diagnostic.stage}): ${diagnostic.reason}`,
    });
  }
  if (state.ingestionDiagnostics.length === 0) {
    diagnostics.createEl('p', { text: 'No ingestion diagnostics.' });
  }
}

function renderMessages(
  parent: HTMLElement,
  title: string,
  messages: { kind: string; message: string }[],
): void {
  if (messages.length === 0) return;
  parent.createEl('strong', { text: title });
  for (const message of messages) {
    parent.createEl('p', { text: `${message.kind}: ${message.message}` });
  }
}

function compareTypeRows(
  a: ObsidianTypeRegistryState['parsedTypes'][number],
  b: ObsidianTypeRegistryState['parsedTypes'][number],
): number {
  return a.name.localeCompare(b.name) || a.id.localeCompare(b.id);
}

function formatLastRun(value: Date | null): string {
  return value === null ? 'never' : value.toLocaleString();
}
