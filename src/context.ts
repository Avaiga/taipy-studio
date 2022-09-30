import { commands, ExtensionContext, FileSystemWatcher, Range, TextEditorRevealType, TreeItem, TreeView, Uri, window, workspace } from "vscode";
import { parse } from "@iarna/toml";

import { ConfigFilesView } from "./views/ConfigFilesView";
import { revealConfigNodeCmd, selectConfigFileCmd, selectConfigNodeCmd, showPerspectiveEditorCmd } from "./commands";
import { CONFIG_DETAILS_ID } from "./constants";
import { ConfigDetailsView } from "./providers/ConfigDetails";
import { configFileExt } from "./utils";
import { ConfigNode, ConfigNodesProvider, DataNodeItem, PipelineItem, ScenarioItem, TaskItem } from "./providers/ConfigNodesProvider";
import { PerspectiveContentProvider, PerspectiveScheme, getPerspectiveUri } from "./contentProviders/PerpectiveContentProvider";
import { ConfigEditorProvider } from "./editors/ConfigEditor";

const configNodeKeySort = (a: string, b: string) => (a == b ? 0 : a == "default" ? -1 : b == "default" ? 1 : a > b ? 1 : -1);

export class Context {
  static create(vsContext: ExtensionContext): void {
    new Context(vsContext);
  }
  private configFileUri: Uri | null = null;
  private configContent: object = null;
  private configFilesView: ConfigFilesView;
  private treeProviders: ConfigNodesProvider<TreeItem & ConfigNode>[] = [];
  private treeViews: TreeView<TreeItem>[] = [];
  private configDetailsView: ConfigDetailsView;
  private fileSystemWatcher: FileSystemWatcher;

  private constructor(vsContext: ExtensionContext) {
    // Configuration files
    this.configFilesView = new ConfigFilesView(this, "taipy-configs");
    commands.registerCommand("taipy.refreshConfigs", this.configFilesView.refresh, this.configFilesView);
    commands.registerCommand(selectConfigFileCmd, this.selectUri, this);
    // global Commands
    commands.registerCommand(selectConfigNodeCmd, this.selectConfigNode, this);
    commands.registerCommand(revealConfigNodeCmd, this.revealConfigNode, this);
    commands.registerCommand("taipy.show.perpective", this.showPerspective, this);
    // Perspective Provider
    vsContext.subscriptions.push(workspace.registerTextDocumentContentProvider(PerspectiveScheme, new PerspectiveContentProvider()));
    // Data Nodes
    const datanodesProvider = new ConfigNodesProvider(this, DataNodeItem);
    commands.registerCommand("taipy.refreshDataNodes", () => datanodesProvider.refresh(this), this);
    this.treeProviders.push(datanodesProvider);
    this.treeViews.push(window.createTreeView("taipy-config-datanodes", { treeDataProvider: datanodesProvider }));
    // Task
    const tasksProvider = new ConfigNodesProvider(this, TaskItem);
    commands.registerCommand("taipy.refreshTasks", () => tasksProvider.refresh(this), this);
    this.treeProviders.push(tasksProvider);
    this.treeViews.push(window.createTreeView("taipy-config-tasks", { treeDataProvider: tasksProvider }));
    // Pipelines
    const pipelinesProvider = new ConfigNodesProvider(this, PipelineItem);
    commands.registerCommand("taipy.refreshPipelines", () => pipelinesProvider.refresh(this), this);
    this.treeProviders.push(pipelinesProvider);
    this.treeViews.push(window.createTreeView("taipy-config-pipelines", { treeDataProvider: pipelinesProvider }));
    // Scenarii
    const scenariiProvider = new ConfigNodesProvider(this, ScenarioItem);
    commands.registerCommand("taipy.refreshScenarii", () => scenariiProvider.refresh(this), this);
    this.treeProviders.push(scenariiProvider);
    this.treeViews.push(window.createTreeView("taipy-config-scenarii", { treeDataProvider: scenariiProvider }));
    // Details
    this.configDetailsView = new ConfigDetailsView(vsContext?.extensionUri, {});
    vsContext.subscriptions.push(window.registerWebviewViewProvider(CONFIG_DETAILS_ID, this.configDetailsView));

    this.fileSystemWatcher = workspace.createFileSystemWatcher(`**/*${configFileExt}`);
    this.fileSystemWatcher.onDidChange(this.onFileChange, this);
    this.fileSystemWatcher.onDidCreate(this.onFileCreateDelete, this);
    this.fileSystemWatcher.onDidDelete(this.onFileCreateDelete, this);
  }

  private async onFileChange(uri: Uri): Promise<void> {
    if (uri && this.configFileUri?.toString() == uri.toString()) {
      await this.readConfig(uri);
      this.treeProviders.forEach((p) => p.refresh(this));
    }
  }

  private async onFileCreateDelete(uri: Uri): Promise<void> {
    this.configFilesView.refresh();
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
    if (this.configFileUri?.toString() == uri?.toString()) {
      return;
    }
    this.configFileUri = uri;
    await this.readConfig(uri);
    this.treeProviders.forEach((p) => p.refresh(this));
  }

  private async selectConfigNode(nodeType: string, name: string, configNode: object): Promise<void> {
    console.log("selectConfigNode", nodeType, name, configNode);
    this.configDetailsView.setConfigNodeContent(name, configNode["storage_type"], configNode["scope"]);
  }

  private revealConfigNode(docUri: Uri, nodeType: string, name: string) {
    const uriString = docUri.toString();
    if (uriString == this.configFileUri?.toString()) {
      const providerIndex = this.treeProviders.findIndex((p) => p.getNodeType() == nodeType);
      if (providerIndex > -1) {
        const item = this.treeProviders[providerIndex].getItem(name);
        if (item) {
          this.treeViews[providerIndex].reveal(item, { select: true });
        }
      }
  }
    const editors = window.visibleTextEditors.filter((te) => te.document.uri.toString() == uriString);
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

  private showPerspective(item: TreeItem & ConfigNode) {
    commands.executeCommand("vscode.openWith", getPerspectiveUri(this.configFileUri, item.getType() + "." + item.label), ConfigEditorProvider.viewType);
    //commands.executeCommand(showPerspectiveEditorCmd, getPerspectiveUri(this.configFileUri, item.getType() + "." + item.label), item.getType(), item.label)
  }

  private async readConfig(uri: Uri): Promise<void> {
    if (uri) {
      const toml = await workspace.fs.readFile(uri);
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
