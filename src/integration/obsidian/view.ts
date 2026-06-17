import { ItemView } from 'obsidian';

export const QUOIN_VIEW_TYPE = 'quoin-sidebar';

export class QuoinSidebarView extends ItemView {
  getViewType(): string {
    return QUOIN_VIEW_TYPE;
  }

  getDisplayText(): string {
    return 'Quoin';
  }

  async onOpen(): Promise<void> {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl('h2', { text: 'Quoin' });

    const tabs = contentEl.createDiv({ cls: 'quoin-tabs' });
    tabs.createEl('button', { text: 'Validation', cls: 'mod-cta' });
    tabs.createEl('button', { text: 'Types' });

    const validation = contentEl.createDiv({ cls: 'quoin-placeholder-section' });
    validation.createEl('h3', { text: 'Current file' });
    validation.createEl('p', { text: 'Validation results will appear here.' });

    const vaultWide = contentEl.createDiv({ cls: 'quoin-placeholder-section' });
    vaultWide.createEl('h3', { text: 'Vault-wide' });
    vaultWide.createEl('button', { text: 'Validate vault' });
  }

  async onClose(): Promise<void> {
    this.contentEl.empty();
  }
}
