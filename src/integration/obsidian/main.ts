import { Notice, Plugin, type WorkspaceLeaf } from 'obsidian';

import {
  type ActiveFileValidationState,
  renderActiveFileStatus,
  validateActiveFile,
} from './active-validation.js';
import { ObsidianVaultTypeRegistry, registerObsidianTypeRegistryEvents } from './discovery.js';
import { ObsidianBasenameIndex, registerObsidianBasenameIndexEvents } from './lookup.js';
import { normalizeObsidianPluginSettings, type ObsidianPluginSettings } from './settings.js';
import { QuoinSettingTab } from './settings-tab.js';
import { QUOIN_VIEW_TYPE, QuoinSidebarView } from './view.js';

export default class QuoinPlugin extends Plugin {
  settings: ObsidianPluginSettings = normalizeObsidianPluginSettings(undefined);
  typeRegistry: ObsidianVaultTypeRegistry | null = null;
  basenameIndex: ObsidianBasenameIndex | null = null;
  activeFileValidationState: ActiveFileValidationState = { kind: 'hidden' };
  private statusBarEl: HTMLElement | null = null;
  private activeFileValidationTimer: number | null = null;
  private activeFileValidationGeneration = 0;
  private statusBarClickTarget: 'validation' | 'types' = 'validation';

  async onload(): Promise<void> {
    await this.loadSettings();
    this.typeRegistry = new ObsidianVaultTypeRegistry(this.app, () => this.settings);
    this.basenameIndex = new ObsidianBasenameIndex();
    registerObsidianTypeRegistryEvents(this, this.typeRegistry);
    registerObsidianBasenameIndexEvents(this, this.basenameIndex);

    this.statusBarEl = this.addStatusBarItem();
    this.statusBarEl.setAttr('aria-label', 'Quoin validation status');
    this.statusBarEl.onClickEvent(() => {
      void this.activateView(this.statusBarClickTarget);
    });
    this.renderStatusBar();

    this.registerView(QUOIN_VIEW_TYPE, (leaf: WorkspaceLeaf) => new QuoinSidebarView(leaf));
    this.addSettingTab(new QuoinSettingTab(this));
    this.registerCommands();
    this.registerActiveFileValidationEvents();
  }

  onunload(): void {
    this.clearActiveFileValidationTimer();
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
  }

  private registerCommands(): void {
    this.addCommand({
      id: 'create-document-of-type',
      name: 'Create document of type...',
      callback: () => {
        new Notice('Quoin create flow is not implemented yet.');
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
        void this.activateView('validation');
        new Notice('Quoin vault validation is not implemented yet.');
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

  private async activateView(_tab: 'validation' | 'types'): Promise<void> {
    const existing = this.app.workspace.getLeavesOfType(QUOIN_VIEW_TYPE)[0];
    if (existing !== undefined) {
      this.app.workspace.revealLeaf(existing);
      return;
    }

    const leaf = this.app.workspace.getRightLeaf(false);
    if (leaf === null) return;

    await leaf.setViewState({
      type: QUOIN_VIEW_TYPE,
      active: true,
    });
    this.app.workspace.revealLeaf(leaf);
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
          return;
        }

        if (this.shouldRevalidateForTypeDefinitionChange(file.path)) {
          this.scheduleActiveFileValidation(this.settings.debounce.typeDefCascade);
        }
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

    if (options.notify) {
      new Notice(this.activeValidationNoticeText());
    }
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
