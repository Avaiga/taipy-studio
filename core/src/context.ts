import {
  commands,
  ExtensionContext,
  Range,
  TextDocument,
  TextDocumentChangeEvent,
  TextEditorRevealType,
  TreeItem,
  TreeView,
  Uri,
  window,
  workspace,
} from "vscode";
import { JsonMap, parse } from "@iarna/toml";

import { ConfigFilesView } from "./views/ConfigFilesView";
import { revealConfigNodeCmd, selectConfigFileCmd, selectConfigNodeCmd } from "./utils/commands";
import { CONFIG_DETAILS_ID, TaipyStudioSettingsName } from "./utils/constants";
import { ConfigDetailsView } from "./providers/ConfigDetails";
import { configFilePattern } from "./utils/utils";
import {
  ConfigItem,
  ConfigNodesProvider,
  DataNodeItem,
  getCreateCommandIdFromType,
  getRefreshCommandIdFromType,
  getTreeViewIdFromType,
  PipelineItem,
  ScenarioItem,
  TaskItem,
  TreeNodeCtor,
} from "./providers/ConfigNodesProvider";
import { PerspectiveContentProvider, PerspectiveScheme, isUriEqual, getOriginalUri, getPerspectiveUri } from "./providers/PerpectiveContentProvider";
import { ConfigEditorProvider } from "./editors/ConfigEditor";
import { cleanTomlParseError, handleTomlParseError, reportInconsistencies } from "./utils/errors";
import { parseAsync } from "./iarna-toml/AsyncParser";

const configNodeKeySort = ([a]: [string, unknown], [b]: [string, unknown]) => (a == b ? 0 : a == "default" ? -1 : b == "default" ? 1 : a > b ? 1 : -1);

interface NodeSelectionCache {
  fileUri?: string;
  [key: string]: string;
}

export class Context {
  static create(vsContext: ExtensionContext): void {
    new Context(vsContext);
  }
  private static readonly cacheName = "taipy.selectedNodes.cache";

  private configFileUri: Uri | null = null;
  private readonly configFilesView: ConfigFilesView;
  private readonly treeProviders: ConfigNodesProvider<ConfigItem>[] = [];
  private readonly treeViews: TreeView<TreeItem>[] = [];
  private readonly configDetailsView: ConfigDetailsView;
  private readonly selectionCache: NodeSelectionCache;
  // original Uri => toml
  private readonly tomlByUri: Record<string, JsonMap> = {};
  // docChanged listeners
  private readonly docChangedListener: Array<[ConfigEditorProvider, (document: TextDocument) => void]> = [];
  // editors
  private readonly configEditorProvider: ConfigEditorProvider;

  private constructor(private readonly vsContext: ExtensionContext) {
    this.selectionCache = vsContext.workspaceState.get(Context.cacheName, {} as NodeSelectionCache);
    // Configuration files
    this.configFilesView = new ConfigFilesView(this, "taipy-configs", this.selectionCache.fileUri);
    commands.registerCommand("taipy.config.refresh", this.configFilesView.refresh, this.configFilesView);
    commands.registerCommand(selectConfigFileCmd, this.selectUri, this);
    // global Commands
    commands.registerCommand(selectConfigNodeCmd, this.selectConfigNode, this);
    commands.registerCommand(revealConfigNodeCmd, this.revealConfigNodeInEditors, this);
    commands.registerCommand("taipy.perspective.show", this.showPerspective, this);
    commands.registerCommand("taipy.perspective.showFromDiagram", this.showPerspectiveFromDiagram, this);
    // Perspective Provider
    vsContext.subscriptions.push(workspace.registerTextDocumentContentProvider(PerspectiveScheme, new PerspectiveContentProvider()));
    // Create Tree Views
    this.treeViews.push(this.createTreeView(DataNodeItem));
    this.treeViews.push(this.createTreeView(TaskItem));
    this.treeViews.push(this.createTreeView(PipelineItem));
    this.treeViews.push(this.createTreeView(ScenarioItem));
    // Dispose when finished
    vsContext.subscriptions.push(...this.treeViews);
    // Config editor
    this.configEditorProvider = ConfigEditorProvider.register(vsContext, this);
    // Details
    this.configDetailsView = new ConfigDetailsView(vsContext?.extensionUri);
    vsContext.subscriptions.push(window.registerWebviewViewProvider(CONFIG_DETAILS_ID, this.configDetailsView));
    // Document change listener
    workspace.onDidChangeTextDocument(this.onDocumentChanged, this, vsContext.subscriptions);
    // file system watcher
    const fileSystemWatcher = workspace.createFileSystemWatcher(configFilePattern);
    fileSystemWatcher.onDidChange(this.onFileChange, this);
    fileSystemWatcher.onDidCreate(this.onFileCreateDelete, this);
    fileSystemWatcher.onDidDelete(this.onFileCreateDelete, this);
    vsContext.subscriptions.push(fileSystemWatcher);
    // directory watcher
    const directoriesWatcher = workspace.createFileSystemWatcher("**/");
    directoriesWatcher.onDidChange(this.onFileChange, this);
    directoriesWatcher.onDidCreate(this.onFileCreateDelete, this);
    directoriesWatcher.onDidDelete(this.onFileCreateDelete, this);
    vsContext.subscriptions.push(directoriesWatcher);
  }

  private async onDocumentChanged(e: TextDocumentChangeEvent) {
    if (this.tomlByUri[getOriginalUri(e.document.uri).toString()]) {
      const dirty = e.document.isDirty;
      await this.refreshToml(e.document);
      this.docChangedListener.forEach(([t, l]) => l.call(t, e.document));
    }
    if (isUriEqual(this.configFileUri, e.document.uri)) {
      this.treeProviders.forEach((p) => p.refresh(this, e.document.uri));
      this.revealConfigNodesInTrees();
    }
  }

  registerDocChangeListener<T extends ConfigEditorProvider>(listener: (document: TextDocument) => void, thisArg: T) {
    this.docChangedListener.push([thisArg, listener]);
  }
  unregisterDocChangeListener<T extends ConfigEditorProvider>(listener: (document: TextDocument) => void, thisArg: T) {
    const idx = this.docChangedListener.findIndex(([t, l]) => t === thisArg && l === listener);
    idx > -1 && this.docChangedListener.splice(idx, 1);
  }

  private createNewElement(nodeType: string) {
    this.configEditorProvider.createNewElement(this.configFileUri, nodeType);
  }

  private createTreeView<T extends ConfigItem>(nodeCtor: TreeNodeCtor<T>) {
    const provider = new ConfigNodesProvider(this, nodeCtor);
    const nodeType = provider.getNodeType();
    commands.registerCommand(getRefreshCommandIdFromType(nodeType), () => provider.refresh(this, this.configFileUri), this);
    commands.registerCommand(getCreateCommandIdFromType(nodeType), () => this.createNewElement(nodeType), this);
    this.treeProviders.push(provider);
    const treeView = window.createTreeView(getTreeViewIdFromType(nodeType), { treeDataProvider: provider, dragAndDropController: provider });
    return treeView;
  }

  private revealConfigNodesInTrees() {
    this.treeProviders.forEach((p, idx) => {
      const nodeType = p.getNodeType();
      const lastSelectedUri = this.selectionCache[nodeType];
      if (lastSelectedUri) {
        const self = this;
        setTimeout(() => {
          const item = p.getNodeForUri(lastSelectedUri);
          if (item && this.treeViews[idx].visible) {
            this.treeViews[idx].reveal(item, { select: true });
            self.selectConfigNode(nodeType, item.label as string, item.getNode(), item.resourceUri);
          }
        }, 1);
      }
    });
  }
  private async onFileChange(uri: Uri): Promise<void> {
    if (uri && this.configFileUri?.toString() == uri.toString()) {
      if (await this.readToml(await this.getDocFromUri(uri))) {
        this.treeProviders.forEach((p) => p.refresh(this, uri));
      }
    }
  }

  private async onFileCreateDelete(uri: Uri): Promise<void> {
    this.configFilesView.refresh(this.selectUri?.toString());
  }

  getConfigUri() {
    return this.configFileUri;
  }

  getConfigNodes(nodeType: string): Array<[string, any]> {
    const toml = this.getToml(this.configFileUri?.toString());
    const configNodes = toml && toml[nodeType];
    // Sort keys so that 'default' is always the first entry.
    return Object.entries(configNodes || {})
      .sort(configNodeKeySort)
      .map((a) => a);
  }

  async selectUri(uri: Uri): Promise<void> {
    if (isUriEqual(uri, this.configFileUri)) {
      return;
    }
    this.configFileUri = uri;
    if (!this.tomlByUri[uri.toString()]) {
      await this.readToml(await this.getDocFromUri(uri));
    }
    this.treeProviders.forEach((p) => p.refresh(this, uri));
    this.revealConfigNodesInTrees();

    if (this.selectionCache.fileUri != uri.toString()) {
      this.selectionCache.fileUri = uri.toString();
      this.vsContext.workspaceState.update(Context.cacheName, this.selectionCache);
    }
  }

  private getDocFromUri(uri: Uri): Thenable<TextDocument> {
    return workspace.openTextDocument(getOriginalUri(uri));
  }

  private async selectConfigNode(nodeType: string, name: string, configNode: object, uri: Uri, reveal = true): Promise<void> {
    this.configDetailsView.setConfigNodeContent(nodeType, name, configNode);
    if (this.selectionCache[nodeType] != uri.toString()) {
      this.selectionCache[nodeType] = uri.toString();
      this.vsContext.workspaceState.update(Context.cacheName, this.selectionCache);
    }
    if (reveal) {
      this.revealConfigNodeInEditors(uri, nodeType, name);
    }
  }

  private revealConfigNodeInEditors(docUri: Uri, nodeType: string, name: string) {
    if (!workspace.getConfiguration(TaipyStudioSettingsName).get("editor.reveal.enabled", true)) {
      return;
    }
    if (isUriEqual(docUri, this.configFileUri)) {
      const providerIndex = this.treeProviders.findIndex((p) => p.getNodeType() == nodeType);
      if (providerIndex > -1) {
        const item = this.treeProviders[providerIndex].getItem(name);
        if (item) {
          this.treeViews[providerIndex].reveal(item, { select: true });
          this.selectConfigNode(nodeType, name, item.getNode(), docUri, false);
        }
      }
    }
    const editors = window.visibleTextEditors.filter((te) => isUriEqual(docUri, te.document.uri));
    if (editors.length) {
      const doc = editors[0].document;
      const section = nodeType + "." + name;
      for (let i = 0; i < doc.lineCount; i++) {
        const line = doc.lineAt(i);
        const p = line.text.indexOf(section);
        if (p > -1) {
          const range = new Range(line.range.start.translate(0, p), line.range.start.translate(0, p + section.length));
          editors.forEach((editor) => {
            editor.revealRange(range, TextEditorRevealType.InCenter);
          });
          return;
        }
      }
    }
  }

  private showPerspective(item: TreeItem) {
    commands.executeCommand("vscode.openWith", item.resourceUri, ConfigEditorProvider.viewType);
  }

  private showPerspectiveFromDiagram(item: { baseUri: string; perspective: string }) {
    commands.executeCommand("vscode.openWith", getPerspectiveUri(Uri.parse(item.baseUri, true), item.perspective), ConfigEditorProvider.viewType);
  }

  getToml(uri: string) {
    return (uri && this.tomlByUri[uri]) || {};
  }

  private async refreshToml(document: TextDocument) {
    const uri = document.uri.toString();
    if (this.tomlByUri[uri]) {
      await this.readToml(document);
    }
  }

  async readTomlIfNeeded(document: TextDocument) {
    const uri = document.uri.toString();
    if (!this.tomlByUri[uri]) {
      await this.readToml(document);
    }
  }

  private async readToml(document: TextDocument) {
    try {
      const toml = (this.tomlByUri[document.uri.toString()] = workspace.getConfiguration(TaipyStudioSettingsName).get("parser.usePositions", true)
        ? await parseAsync(document.getText())
        : await parse.async(document.getText()));
      cleanTomlParseError(document);
      reportInconsistencies(document, toml);
      return true;
    } catch (e) {
      handleTomlParseError(document, e);
    }
    return false;
  }
}
