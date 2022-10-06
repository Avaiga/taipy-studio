import { commands, ExtensionContext, Range, TextEditorRevealType, TreeDataProvider, TreeItem, TreeView, Uri, window, workspace } from "vscode";
import { parse } from "@iarna/toml";

import { ConfigFilesView } from "./views/ConfigFilesView";
import { revealConfigNodeCmd, selectConfigFileCmd, selectConfigNodeCmd } from "./commands";
import { CONFIG_DETAILS_ID, TaipyStudioSettingsName } from "./constants";
import { ConfigDetailsView } from "./providers/ConfigDetails";
import { configFileExt } from "./utils";
import {
  ConfigItem,
  ConfigNodesProvider,
  DataNodeItem,
  getCommandIdFromType,
  getTreeViewIdFromType,
  PipelineItem,
  ScenarioItem,
  TaskItem,
  TreeNodeCtor,
} from "./providers/ConfigNodesProvider";
import { PerspectiveContentProvider, PerspectiveScheme, isUriEqual, getOriginalUri } from "./contentProviders/PerpectiveContentProvider";
import { ConfigEditorProvider } from "./editors/ConfigEditor";

const configNodeKeySort = (a: string, b: string) => (a == b ? 0 : a == "default" ? -1 : b == "default" ? 1 : a > b ? 1 : -1);

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
  private configContent: object = null;
  private configFilesView: ConfigFilesView;
  private treeProviders: ConfigNodesProvider<ConfigItem>[] = [];
  private treeViews: TreeView<TreeItem>[] = [];
  private configDetailsView: ConfigDetailsView;
  private selectionCache: NodeSelectionCache;

  private constructor(private readonly vsContext: ExtensionContext) {
    this.selectionCache = vsContext.workspaceState.get(Context.cacheName, {} as NodeSelectionCache);
    // Configuration files
    this.configFilesView = new ConfigFilesView(this, "taipy-configs", this.selectionCache.fileUri);
    commands.registerCommand("taipy.refreshConfigs", this.configFilesView.refresh, this.configFilesView);
    commands.registerCommand(selectConfigFileCmd, this.selectUri, this);
    // global Commands
    commands.registerCommand(selectConfigNodeCmd, this.selectConfigNode, this);
    commands.registerCommand(revealConfigNodeCmd, this.revealConfigNodeInEditors, this);
    commands.registerCommand("taipy.show.perpective", this.showPerspective, this);
    // Perspective Provider
    vsContext.subscriptions.push(workspace.registerTextDocumentContentProvider(PerspectiveScheme, new PerspectiveContentProvider()));
    // Create Tree Views
    this.treeViews.push(this.createTreeView(DataNodeItem));
    this.treeViews.push(this.createTreeView(TaskItem));
    this.treeViews.push(this.createTreeView(PipelineItem));
    this.treeViews.push(this.createTreeView(ScenarioItem));
    // Dispose when finished
    vsContext.subscriptions.push(...this.treeViews);
    // Details
    this.configDetailsView = new ConfigDetailsView(vsContext?.extensionUri);
    vsContext.subscriptions.push(window.registerWebviewViewProvider(CONFIG_DETAILS_ID, this.configDetailsView));

    const fileSystemWatcher = workspace.createFileSystemWatcher(`**/*${configFileExt}`);
    fileSystemWatcher.onDidChange(this.onFileChange, this);
    fileSystemWatcher.onDidCreate(this.onFileCreateDelete, this);
    fileSystemWatcher.onDidDelete(this.onFileCreateDelete, this);
    vsContext.subscriptions.push(fileSystemWatcher);
  }

  private createTreeView<T extends ConfigItem>(nodeCtor: TreeNodeCtor<T>) {
    const provider = new ConfigNodesProvider(this, nodeCtor);
    const nodeType = provider.getNodeType();
    commands.registerCommand(getCommandIdFromType(nodeType), () => provider.refresh(this, this.configFileUri), this);
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
      await this.readConfig(uri);
      this.treeProviders.forEach((p) => p.refresh(this, uri));
    }
  }

  private async onFileCreateDelete(uri: Uri): Promise<void> {
    this.configFilesView.refresh(this.selectUri?.toString());
  }

  getConfigUri() {
    return this.configFileUri;
  }

  getConfigNodes(nodeType: string): object[] {
    const configNodes = this.configContent ? this.configContent[nodeType] : null;
    const result = [];
    if (configNodes) {
      // Sort keys so that 'default' is always the first entry.
      const keys = Object.keys(configNodes).sort(configNodeKeySort);
      keys.forEach((key) => result.push([key, configNodes[key]]));
    }
    return result;
  }

  async selectUri(uri: Uri): Promise<void> {
    if (isUriEqual(uri, this.configFileUri)) {
      return;
    }
    this.configFileUri = uri;
    await this.readConfig(uri);
    this.treeProviders.forEach((p) => p.refresh(this, uri));
    if (this.selectionCache.fileUri != uri.toString()) {
      this.selectionCache.fileUri = uri.toString();
      this.vsContext.workspaceState.update(Context.cacheName, this.selectionCache);
    }
    this.revealConfigNodesInTrees();
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

  private async readConfig(uri: Uri): Promise<void> {
    if (uri) {
      const toml = await workspace.fs.readFile(getOriginalUri(uri));
      try {
        this.configContent = parse(toml.toString());
      } catch (e) {
        window.showWarningMessage("TOML parsing", e.message);
      }
    } else {
      this.configContent = null;
    }
  }
}
