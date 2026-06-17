import { Notice, Plugin, type WorkspaceLeaf } from 'obsidian';

import { ObsidianVaultTypeRegistry, registerObsidianTypeRegistryEvents } from './discovery.js';
import { normalizeObsidianPluginSettings, type ObsidianPluginSettings } from './settings.js';
import { QuoinSettingTab } from './settings-tab.js';
import { QUOIN_VIEW_TYPE, QuoinSidebarView } from './view.js';

export default class QuoinPlugin extends Plugin {
  settings: ObsidianPluginSettings = normalizeObsidianPluginSettings(undefined);
  typeRegistry: ObsidianVaultTypeRegistry | null = null;
  private statusBarEl: HTMLElement | null = null;

  async onload(): Promise<void> {
    await this.loadSettings();
    this.typeRegistry = new ObsidianVaultTypeRegistry(this.app, () => this.settings);
    registerObsidianTypeRegistryEvents(this, this.typeRegistry);

    this.statusBarEl = this.addStatusBarItem();
    this.statusBarEl.setText('Quoin');
    this.statusBarEl.setAttr('aria-label', 'Quoin validation status');
    this.statusBarEl.addClass('quoin-status-placeholder');
    this.statusBarEl.onClickEvent(() => {
      void this.activateView('validation');
    });

    this.registerView(QUOIN_VIEW_TYPE, (leaf: WorkspaceLeaf) => new QuoinSidebarView(leaf));
    this.addSettingTab(new QuoinSettingTab(this));
    this.registerCommands();
  }

  onunload(): void {
    this.app.workspace.detachLeavesOfType(QUOIN_VIEW_TYPE);
    this.statusBarEl = null;
  }

  async loadSettings(): Promise<void> {
    this.settings = normalizeObsidianPluginSettings(await this.loadData());
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
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
        new Notice('Quoin active-file validation is not implemented yet.');
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
}
