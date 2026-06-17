import { Notice, PluginSettingTab, Setting } from 'obsidian';

import type QuoinPlugin from './main.js';
import {
  createPlaceholderBinding,
  hasBlockingSettingsIssues,
  type ObsidianPluginSettings,
  type SettingsValidationIssue,
  updateBinding,
  validateObsidianPluginSettings,
} from './settings.js';

export class QuoinSettingTab extends PluginSettingTab {
  constructor(private readonly plugin: QuoinPlugin) {
    super(plugin.app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl('h2', { text: 'Quoin' });

    const issues = validateObsidianPluginSettings(this.plugin.settings);
    const issueByPath = new Map(issues.map((issue) => [issue.path, issue]));

    this.renderTypeDeclarationKey(issueByPath.get('typeDeclarationKey'));
    this.renderUntypedDocumentBehavior();
    this.renderReferentialValidation();
    this.renderDebounceNumber(
      'Active file debounce',
      issueByPath.get('debounce.activeFile'),
      'activeFile',
    );
    this.renderDebounceNumber(
      'Type definition cascade debounce',
      issueByPath.get('debounce.typeDefCascade'),
      'typeDefCascade',
    );
    this.renderBindings(issues);
  }

  private async saveIfValid(): Promise<void> {
    const issues = validateObsidianPluginSettings(this.plugin.settings);
    if (hasBlockingSettingsIssues(issues)) {
      new Notice(
        issues.find((issue) => issue.severity === 'error')?.message ??
          'Quoin settings are invalid.',
      );
      this.display();
      return;
    }

    try {
      await this.plugin.saveSettings();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      new Notice(`Failed to save Quoin settings: ${message}`);
    }
  }

  private renderTypeDeclarationKey(issue: SettingsValidationIssue | undefined): void {
    new Setting(this.containerEl)
      .setName('Type declaration key')
      .setDesc(issue?.message ?? 'Frontmatter key used to identify a Document type.')
      .addText((text) => {
        text.setValue(this.plugin.settings.typeDeclarationKey);
        text.onChange(async (value) => {
          this.plugin.settings.typeDeclarationKey = value;
          await this.saveIfValid();
        });
      });
  }

  private renderUntypedDocumentBehavior(): void {
    new Setting(this.containerEl)
      .setName('Untyped document behavior')
      .setDesc('How validation handles Documents without a Type Declaration or binding.')
      .addDropdown((dropdown) => {
        dropdown.addOption('skip', 'Skip');
        dropdown.addOption('warn', 'Warn');
        dropdown.setValue(this.plugin.settings.untypedDocumentBehavior);
        dropdown.onChange(async (value) => {
          this.plugin.settings.untypedDocumentBehavior =
            value === 'warn' || value === 'skip' ? value : 'skip';
          await this.saveIfValid();
        });
      });
  }

  private renderReferentialValidation(): void {
    new Setting(this.containerEl)
      .setName('Referential validation')
      .setDesc(
        'Validate typed Wiki Link targets against their referenced Type Definition Document.',
      )
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.settings.referentialValidation);
        toggle.onChange(async (value) => {
          this.plugin.settings.referentialValidation = value;
          await this.saveIfValid();
        });
      });
  }

  private renderDebounceNumber(
    name: string,
    issue: SettingsValidationIssue | undefined,
    key: keyof ObsidianPluginSettings['debounce'],
  ): void {
    new Setting(this.containerEl)
      .setName(name)
      .setDesc(issue?.message ?? 'Milliseconds.')
      .addText((text) => {
        text.inputEl.type = 'number';
        text.inputEl.min = '0';
        text.setValue(String(this.plugin.settings.debounce[key]));
        text.onChange(async (value) => {
          this.plugin.settings.debounce[key] = Number(value);
          await this.saveIfValid();
        });
      });
  }

  private renderBindings(issues: SettingsValidationIssue[]): void {
    this.containerEl.createEl('h3', { text: 'Bindings' });

    this.plugin.settings.bindings.forEach((binding, index) => {
      const rowIssues = issues.filter((issue) => issue.path.startsWith(`bindings[${index}]`));
      const desc = rowIssues.map((issue) => issue.message).join(' ');

      new Setting(this.containerEl)
        .setName(`Binding ${index + 1}`)
        .setDesc(desc || 'Assign a type by vault-relative path glob.')
        .addText((text) => {
          text.setPlaceholder('type');
          text.setValue(binding.type);
          text.onChange(async (value) => {
            updateBinding(this.plugin.settings, index, { type: value });
            await this.saveIfValid();
          });
        })
        .addText((text) => {
          text.setPlaceholder('match');
          text.setValue(binding.match);
          text.onChange(async (value) => {
            updateBinding(this.plugin.settings, index, { match: value });
            await this.saveIfValid();
          });
        })
        .addButton((button) => {
          button.setButtonText('Up');
          button.setDisabled(index === 0);
          button.onClick(async () => {
            const previous = this.plugin.settings.bindings[index - 1];
            const current = this.plugin.settings.bindings[index];
            if (previous === undefined) return;
            if (current === undefined) return;
            this.plugin.settings.bindings[index - 1] = current;
            this.plugin.settings.bindings[index] = previous;
            await this.saveIfValid();
          });
        })
        .addButton((button) => {
          button.setButtonText('Down');
          button.setDisabled(index === this.plugin.settings.bindings.length - 1);
          button.onClick(async () => {
            const next = this.plugin.settings.bindings[index + 1];
            const current = this.plugin.settings.bindings[index];
            if (next === undefined) return;
            if (current === undefined) return;
            this.plugin.settings.bindings[index + 1] = current;
            this.plugin.settings.bindings[index] = next;
            await this.saveIfValid();
          });
        })
        .addButton((button) => {
          button.setButtonText('Delete');
          button.onClick(async () => {
            this.plugin.settings.bindings.splice(index, 1);
            await this.saveIfValid();
          });
        });
    });

    new Setting(this.containerEl).addButton((button) => {
      button.setButtonText('Add binding');
      button.onClick(async () => {
        this.plugin.settings.bindings.push(createPlaceholderBinding(this.plugin.settings.bindings));
        await this.saveIfValid();
        this.display();
      });
    });
  }
}
