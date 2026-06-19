/**
 * @quoin-terms Integration, Document, TypeRegistry
 * @quoin-docs docs/design/D8-obsidian-plugin-integration.md
 */

declare module 'obsidian' {
  export type Command = {
    id: string;
    name: string;
    callback: () => void;
  };

  export type Pos = {
    line: number;
    ch: number;
  };

  export type ViewState = {
    type: string;
    active?: boolean;
  };

  export class WorkspaceLeaf {
    openFile(file: TFile): Promise<void>;
    setViewState(state: ViewState): Promise<void>;
  }

  export class Workspace {
    detachLeavesOfType(type: string): void;
    getActiveFile(): TFile | null;
    getActiveViewOfType?<T>(type: abstract new (...args: never[]) => T): T | null;
    getLeaf?(newLeaf?: boolean): WorkspaceLeaf;
    getLeavesOfType(type: string): WorkspaceLeaf[];
    getRightLeaf(split: boolean): WorkspaceLeaf | null;
    onLayoutReady(callback: () => void): void;
    on(name: 'file-open', callback: (file: TFile | null) => void): EventRef;
    on(name: 'file-menu', callback: (menu: Menu, file: TAbstractFile) => void): EventRef;
    revealLeaf(leaf: WorkspaceLeaf): void;
  }

  export type EventRef = object;

  export class TAbstractFile {
    path: string;
  }

  export class TFile extends TAbstractFile {
    extension: string;
  }

  export class TFolder extends TAbstractFile {
    children: TAbstractFile[];
  }

  export type CachedMetadata = {
    frontmatter?: unknown;
    frontmatterPosition?: {
      start: { offset: number };
      end: { offset: number };
    };
  };

  export class MetadataCache {
    getFileCache(file: TFile): CachedMetadata | null;
    getFirstLinkpathDest(linkpath: string, sourcePath: string): TFile | null;
    on(name: 'resolved', callback: () => void): EventRef;
    on(name: 'changed', callback: (file: TFile) => void): EventRef;
  }

  export class Vault {
    create?(path: string, contents: string): Promise<TFile>;
    getAbstractFileByPath?(path: string): TAbstractFile | null;
    getMarkdownFiles(): TFile[];
    read(file: TFile): Promise<string>;
    on(name: 'create' | 'delete', callback: (file: TAbstractFile) => void): EventRef;
    on(name: 'rename', callback: (file: TAbstractFile, oldPath: string) => void): EventRef;
  }

  export class App {
    metadataCache: MetadataCache;
    vault: Vault;
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
    registerEvent(eventRef: EventRef): void;
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

  export class MarkdownView {
    editor: Editor;
  }

  export class Editor {
    offsetToPos(offset: number): Pos;
    setCursor(pos: Pos): void;
  }

  export class FuzzySuggestModal<T> {
    constructor(app: App);
    setPlaceholder(placeholder: string): void;
    open(): void;
    getItems(): T[];
    getItemText(item: T): string;
    renderSuggestion(item: T, el: HTMLElement): void;
    onChooseItem(item: T, evt: MouseEvent | KeyboardEvent): void;
    onClose(): void;
  }

  export class Modal {
    app: App;
    contentEl: HTMLElement;
    constructor(app: App);
    open(): void;
    close(): void;
    onOpen(): void;
    onClose(): void;
  }

  export class Menu {
    addItem(callback: (item: MenuItem) => void): this;
  }

  export class MenuItem {
    setTitle(title: string): this;
    onClick(callback: () => void): this;
  }

  export function normalizePath(path: string): string;

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
