declare module 'obsidian' {
  export type Command = {
    id: string;
    name: string;
    callback: () => void;
  };

  export type ViewState = {
    type: string;
    active?: boolean;
  };

  export class WorkspaceLeaf {
    setViewState(state: ViewState): Promise<void>;
  }

  export class Workspace {
    detachLeavesOfType(type: string): void;
    getLeavesOfType(type: string): WorkspaceLeaf[];
    getRightLeaf(split: boolean): WorkspaceLeaf | null;
    revealLeaf(leaf: WorkspaceLeaf): void;
  }

  export class App {
    workspace: Workspace;
  }

  export class Plugin {
    app: App;
    loadData(): Promise<unknown>;
    saveData(data: unknown): Promise<void>;
    addStatusBarItem(): HTMLElement;
    addSettingTab(tab: PluginSettingTab): void;
    addCommand(command: Command): void;
    registerView(type: string, viewCreator: (leaf: WorkspaceLeaf) => ItemView): void;
  }

  export class Notice {
    constructor(message: string);
  }

  export class ItemView {
    contentEl: HTMLElement;
    constructor(leaf: WorkspaceLeaf);
    getViewType(): string;
    getDisplayText(): string;
    onOpen(): Promise<void>;
    onClose(): Promise<void>;
  }

  export class PluginSettingTab {
    app: App;
    containerEl: HTMLElement;
    constructor(app: App, plugin: Plugin);
    display(): void;
  }

  export class Setting {
    settingEl: HTMLElement;
    constructor(containerEl: HTMLElement);
    setName(name: string): this;
    setDesc(desc: string): this;
    addText(callback: (component: TextComponent) => void): this;
    addDropdown(callback: (component: DropdownComponent) => void): this;
    addToggle(callback: (component: ToggleComponent) => void): this;
    addButton(callback: (component: ButtonComponent) => void): this;
  }

  export class TextComponent {
    inputEl: HTMLInputElement;
    setValue(value: string): this;
    setPlaceholder(placeholder: string): this;
    onChange(callback: (value: string) => void | Promise<void>): this;
  }

  export class DropdownComponent {
    addOption(value: string, display: string): this;
    setValue(value: string): this;
    onChange(callback: (value: string) => void | Promise<void>): this;
  }

  export class ToggleComponent {
    setValue(value: boolean): this;
    onChange(callback: (value: boolean) => void | Promise<void>): this;
  }

  export class ButtonComponent {
    setButtonText(text: string): this;
    setDisabled(disabled: boolean): this;
    onClick(callback: () => void | Promise<void>): this;
  }
}

interface HTMLElement {
  empty(): void;
  createEl<K extends keyof HTMLElementTagNameMap>(
    tagName: K,
    options?: { text?: string; cls?: string },
  ): HTMLElementTagNameMap[K];
  createDiv(options?: { cls?: string }): HTMLDivElement;
  setText(text: string): void;
  setAttr(name: string, value: string): void;
  addClass(className: string): void;
  onClickEvent(callback: (event: MouseEvent) => void): void;
}
