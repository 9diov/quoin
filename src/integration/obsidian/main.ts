/**
 * @quoin-terms Integration, Validation, Resolver, TypeRegistry, Scaffolding
 * @quoin-docs docs/design/D8-obsidian-plugin-integration.md
 */

import { Notice, Plugin, type TFile, type WorkspaceLeaf } from 'obsidian';
import type { ValidationResult } from '../../core/validation.js';
import {
  type ActiveFileValidationState,
  renderActiveFileStatus,
  validateActiveFile,
} from './active-validation.js';
import { registerCreateFlowMenus, startCreateFlow } from './create-flow.js';
import { ObsidianVaultTypeRegistry, registerObsidianTypeRegistryEvents } from './discovery.js';
import { ObsidianBasenameIndex, registerObsidianBasenameIndexEvents } from './lookup.js';
import { normalizeObsidianPluginSettings, type ObsidianPluginSettings } from './settings.js';
import { QuoinSettingTab } from './settings-tab.js';
import { enumerateVaultValidationTargets } from './vault-validation.js';
import {
  QUOIN_VIEW_TYPE,
  type QuoinSidebarTab,
  QuoinSidebarView,
  type VaultValidationState,
} from './view.js';

export default class QuoinPlugin extends Plugin {
  settings: ObsidianPluginSettings = normalizeObsidianPluginSettings(undefined);
  typeRegistry: ObsidianVaultTypeRegistry | null = null;
  basenameIndex: ObsidianBasenameIndex | null = null;
  activeFileValidationState: ActiveFileValidationState = { kind: 'hidden' };
  vaultValidationState: VaultValidationState = { kind: 'never', lastRun: null, rows: [] };
  private statusBarEl: HTMLElement | null = null;
  private activeFileValidationTimer: number | null = null;
  private activeFileValidationGeneration = 0;
  private vaultValidationGeneration = 0;
  private readonly sidebarViews = new Set<QuoinSidebarView>();
  private statusBarClickTarget: 'validation' | 'types' = 'validation';

  async onload(): Promise<void> {
    await this.loadSettings();
    this.typeRegistry = new ObsidianVaultTypeRegistry(this.app, () => this.settings);
    this.basenameIndex = new ObsidianBasenameIndex();
    registerObsidianTypeRegistryEvents(this, this.typeRegistry, () => {
      this.refreshSidebarViews();
    });
    registerObsidianBasenameIndexEvents(this, this.basenameIndex);

    this.statusBarEl = this.addStatusBarItem();
    this.statusBarEl.setAttr('aria-label', 'Quoin validation status');
    this.statusBarEl.onClickEvent(() => {
      void this.activateView(this.statusBarClickTarget);
    });
    this.renderStatusBar();

    this.registerView(QUOIN_VIEW_TYPE, (leaf: WorkspaceLeaf) => new QuoinSidebarView(leaf, this));
    this.addSettingTab(new QuoinSettingTab(this));
    this.registerCommands();
    registerCreateFlowMenus(this);
    this.registerActiveFileValidationEvents();
  }

  onunload(): void {
    this.clearActiveFileValidationTimer();
    this.vaultValidationGeneration += 1;
    this.app.workspace.detachLeavesOfType(QUOIN_VIEW_TYPE);
    this.statusBarEl = null;
  }

  async loadSettings(): Promise<void> {
    this.settings = normalizeObsidianPluginSettings(await this.loadData());
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
    // Keep settings-triggered validation behind the registry rebuild so root dispatch
    // and parser config changes are reflected in the snapshot consumed below.
    await this.typeRegistry?.rebuild();
    this.scheduleActiveFileValidation();
    this.refreshSidebarViews();
  }

  private registerCommands(): void {
    this.addCommand({
      id: 'create-document-of-type',
      name: 'Create document of type...',
      callback: () => {
        void startCreateFlow(this);
      },
    });

    this.addCommand({
      id: 'validate-active-file',
      name: 'Validate active file',
      callback: () => {
        void this.validateActiveFileNow({ notify: true });
      },
    });

    this.addCommand({
      id: 'validate-vault',
      name: 'Validate vault',
      callback: () => {
        void this.activateView('validation').then(() => this.startVaultValidation());
      },
    });

    this.addCommand({
      id: 'show-types',
      name: 'Show types',
      callback: () => {
        void this.activateView('types');
      },
    });

    this.addCommand({
      id: 'open-quoin-view',
      name: 'Open Quoin view',
      callback: () => {
        void this.activateView('validation');
      },
    });
  }

  registerSidebarView(view: QuoinSidebarView): void {
    this.sidebarViews.add(view);
  }

  unregisterSidebarView(view: QuoinSidebarView): void {
    this.sidebarViews.delete(view);
  }

  async startVaultValidation(): Promise<void> {
    if (this.typeRegistry === null || this.basenameIndex === null) return;

    const generation = ++this.vaultValidationGeneration;
    const registryState = this.typeRegistry.getState();
    const targetFiles = this.getVaultValidationTargets(registryState.typeCandidatePaths);

    this.vaultValidationState = {
      kind: 'running',
      lastRun: this.vaultValidationState.lastRun,
      completed: 0,
      total: targetFiles.length,
      rows: [],
    };
    this.refreshSidebarViews();

    const rows: VaultValidationState['rows'] = [];

    for (const file of targetFiles) {
      if (generation !== this.vaultValidationGeneration) {
        this.vaultValidationState = {
          kind: 'cancelled',
          lastRun: new Date(),
          completed: rows.length,
          total: targetFiles.length,
          rows,
        };
        this.refreshSidebarViews();
        return;
      }

      const state = await this.validateMarkdownFile(file);
      rows.push({ path: file.path, state });
      this.vaultValidationState = {
        kind: 'running',
        lastRun: this.vaultValidationState.lastRun,
        completed: rows.length,
        total: targetFiles.length,
        rows: [...rows],
      };
      this.refreshSidebarViews();
      await yieldToObsidian();
    }

    if (generation !== this.vaultValidationGeneration) return;

    this.vaultValidationState = {
      kind: 'completed',
      lastRun: new Date(),
      rows,
    };
    this.refreshSidebarViews();
  }

  cancelVaultValidation(): void {
    if (this.vaultValidationState.kind !== 'running') return;
    this.vaultValidationGeneration += 1;
  }

  async openMarkdownFile(path: string): Promise<void> {
    const file = this.findMarkdownFile(path);
    if (file === null) return;
    const leaf = this.app.workspace.getLeaf?.(false) ?? this.app.workspace.getRightLeaf(false);
    await leaf?.openFile(file);
  }

  async showValidationView(): Promise<void> {
    await this.activateView('validation');
  }

  async showTypesView(): Promise<void> {
    await this.activateView('types');
  }

  recordCreateValidationErrors(
    path: string,
    typeDef: { id: string; name: string },
    result: ValidationResult,
  ): void {
    this.activeFileValidationState = {
      kind: 'validated',
      path,
      typeId: typeDef.id,
      typeName: typeDef.name,
      result,
    };
    this.renderStatusBar();
    this.refreshSidebarViews();
  }

  scheduleActiveValidationFromCreate(): void {
    this.scheduleActiveFileValidation(0);
  }

  private async activateView(tab: QuoinSidebarTab): Promise<void> {
    const existing = this.app.workspace.getLeavesOfType(QUOIN_VIEW_TYPE)[0];
    if (existing !== undefined) {
      this.app.workspace.revealLeaf(existing);
      this.selectSidebarTab(tab);
      return;
    }

    const leaf = this.app.workspace.getRightLeaf(false);
    if (leaf === null) return;

    await leaf.setViewState({
      type: QUOIN_VIEW_TYPE,
      active: true,
    });
    this.app.workspace.revealLeaf(leaf);
    this.selectSidebarTab(tab);
  }

  private registerActiveFileValidationEvents(): void {
    this.app.workspace.onLayoutReady(() => {
      this.scheduleActiveFileValidation();
    });

    this.registerEvent(
      this.app.workspace.on('file-open', () => {
        this.scheduleActiveFileValidation();
      }),
    );

    this.registerEvent(
      this.app.metadataCache.on('changed', (file) => {
        const active = this.app.workspace.getActiveFile();
        if (active?.path === file.path) {
          this.scheduleActiveFileValidation();
        } else if (this.shouldRevalidateForTypeDefinitionChange(file.path)) {
          this.scheduleActiveFileValidation(this.settings.debounce.typeDefCascade);
        }

        void this.refreshVaultValidationRow(file);
        this.refreshSidebarViews();
      }),
    );
  }

  private shouldRevalidateForTypeDefinitionChange(path: string): boolean {
    // NOTE: This only tracks the root type selected for the active file.
    // Full dependency invalidation for referenced types belongs with the P24/P25 sidebar cache work.
    return (
      this.activeFileValidationState.kind === 'validated' &&
      this.activeFileValidationState.typeId === path
    );
  }

  private scheduleActiveFileValidation(delay = this.settings.debounce.activeFile): void {
    this.clearActiveFileValidationTimer();
    this.activeFileValidationTimer = window.setTimeout(
      () => {
        this.activeFileValidationTimer = null;
        void this.validateActiveFileNow();
      },
      Math.max(0, delay),
    );
  }

  private clearActiveFileValidationTimer(): void {
    if (this.activeFileValidationTimer === null) return;
    window.clearTimeout(this.activeFileValidationTimer);
    this.activeFileValidationTimer = null;
  }

  private async validateActiveFileNow(options: { notify?: boolean } = {}): Promise<void> {
    this.clearActiveFileValidationTimer();
    const generation = ++this.activeFileValidationGeneration;

    if (this.typeRegistry === null || this.basenameIndex === null) {
      this.activeFileValidationState = { kind: 'hidden' };
      this.renderStatusBar();
      return;
    }

    const state = await validateActiveFile({
      app: this.app,
      file: this.app.workspace.getActiveFile(),
      settings: this.settings,
      typeRegistry: this.typeRegistry.getState().typeRegistry,
      basenameIndex: this.basenameIndex,
    });

    if (generation !== this.activeFileValidationGeneration) return;

    this.activeFileValidationState = state;
    this.renderStatusBar();
    this.refreshSidebarViews();

    if (options.notify) {
      new Notice(this.activeValidationNoticeText());
    }
  }

  private async validateMarkdownFile(file: TFile): Promise<ActiveFileValidationState> {
    if (this.typeRegistry === null || this.basenameIndex === null) return { kind: 'hidden' };

    return validateActiveFile({
      app: this.app,
      file,
      settings: this.settings,
      typeRegistry: this.typeRegistry.getState().typeRegistry,
      basenameIndex: this.basenameIndex,
    });
  }

  private getVaultValidationTargets(typeCandidatePaths: string[]): TFile[] {
    return enumerateVaultValidationTargets(this.app.vault.getMarkdownFiles(), typeCandidatePaths);
  }

  private async refreshVaultValidationRow(file: TFile): Promise<void> {
    if (
      this.vaultValidationState.kind === 'never' ||
      this.vaultValidationState.kind === 'running'
    ) {
      return;
    }

    const rowIndex = this.vaultValidationState.rows.findIndex((row) => row.path === file.path);
    if (rowIndex === -1) return;

    const state = await this.validateMarkdownFile(file);
    const rows = [...this.vaultValidationState.rows];
    rows[rowIndex] = { path: file.path, state };
    this.vaultValidationState = { ...this.vaultValidationState, rows };
    this.refreshSidebarViews();
  }

  private findMarkdownFile(path: string): TFile | null {
    return this.app.vault.getMarkdownFiles().find((file) => file.path === path) ?? null;
  }

  private selectSidebarTab(tab: QuoinSidebarTab): void {
    for (const view of this.sidebarViews) view.selectTab(tab);
  }

  private refreshSidebarViews(): void {
    for (const view of this.sidebarViews) view.render();
  }

  private activeValidationNoticeText(): string {
    switch (this.activeFileValidationState.kind) {
      case 'hidden':
        return 'No active Markdown file to validate.';
      case 'validated':
        if (this.activeFileValidationState.result.errors.length > 0) {
          return `Quoin found ${this.activeFileValidationState.result.errors.length} error(s).`;
        }
        if (this.activeFileValidationState.result.warnings.length > 0) {
          return `Quoin found ${this.activeFileValidationState.result.warnings.length} warning(s).`;
        }
        return 'Quoin validation passed.';
      case 'type-definition':
        return 'Active file is a Type Definition Document.';
      case 'untyped':
        return 'Active file is untyped.';
      default:
        return 'Quoin could not resolve the active file type.';
    }
  }

  private renderStatusBar(): void {
    if (this.statusBarEl === null) return;

    const render = renderActiveFileStatus(this.activeFileValidationState);

    if (!render.visible) {
      this.statusBarEl.style.display = 'none';
      this.statusBarEl.setText('');
      this.statusBarEl.setAttr('aria-label', 'Quoin validation status');
      this.statusBarEl.setAttr('data-quoin-status', 'hidden');
      this.statusBarClickTarget = 'validation';
      return;
    }

    this.statusBarEl.style.display = '';
    this.statusBarEl.setText(render.text);
    this.statusBarEl.setAttr('aria-label', `Quoin: ${render.tooltip}`);
    this.statusBarEl.setAttr('title', render.tooltip);
    this.statusBarEl.setAttr('data-quoin-status', render.statusKind);
    this.statusBarClickTarget = render.clickTarget;
  }
}

function yieldToObsidian(): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, 0));
}
