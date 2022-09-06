import { commands, ExtensionContext, FileSystemWatcher, Uri, window, workspace } from "vscode";
import { ConfigFilesView } from "./views/ConfigFilesView";
import { DataNodesProvider } from "./providers/DataNodesProvider";
import { ConfigDetailsView } from "./providers/ConfigDetails";
import { CONFIG_DETAILS_ID } from "./constants";
import { parse } from "@iarna/toml";

export class Context {
  static create(vsContext: ExtensionContext): void {
    new Context(vsContext);
  }
  private configFileUri: Uri | null = null;
  private configContent: object = null;
  private configFilesView: ConfigFilesView;
  private dataNodesProvider: DataNodesProvider;
  private configDetailsView: ConfigDetailsView;
  private fileSystemWatcher: FileSystemWatcher;

  private constructor(vsContext: ExtensionContext)
  {
    // Configuration files
    this.configFilesView = new ConfigFilesView(this, "taipy-configs");
    commands.registerCommand('taipy.refreshConfigs', () => this.configFilesView.refresh(this));
    commands.registerCommand("taipy.selectConfigFile", (uri: Uri) => this.selectUri(uri));
    // Data Nodes
    this.dataNodesProvider = new DataNodesProvider(this);
    commands.registerCommand('taipy.refreshDataNodes', () => this.dataNodesProvider.refresh(this));
    window.registerTreeDataProvider("taipy-config-datanodes", this.dataNodesProvider);
    commands.registerCommand("taipy.selectDataNode",
      (name: string, dataNode: object) => this.selectDataNode(name, dataNode));
    // Details
    this.configDetailsView = new ConfigDetailsView(vsContext?.extensionUri, {});
    vsContext.subscriptions.push(window.registerWebviewViewProvider(
      CONFIG_DETAILS_ID,
      this.configDetailsView
    ));
    this.fileSystemWatcher = workspace.createFileSystemWatcher("**/*.toml");
    const self = this;
    this.fileSystemWatcher.onDidChange(uri => this.onFileChange(uri));
    this.fileSystemWatcher.onDidCreate(uri => this.onFileCreateDelete(uri));
    this.fileSystemWatcher.onDidDelete(uri => this.onFileCreateDelete(uri));
   }

  private async onFileChange(uri: Uri): Promise<void> {
    if (uri && this.configFileUri?.toString() == uri.toString()) {
      await this.readConfig(uri);
      this.dataNodesProvider.refresh(this);
    }
  }

  private async onFileCreateDelete(uri: Uri): Promise<void> {
    this.configFilesView.refresh(this);
  }

  getDataNodes(): object[]
  {
    const dataNodes = this.configContent ? this.configContent["DATA_NODE"] : null;
    if (!dataNodes) {
      if (dataNodes === undefined) {
        window.showWarningMessage(`Toml file should have a "DATA_NODE" section`)
      }
      return [];
    }
    const result = [];
    // Sort keys so that 'default' is always the first entry.
    const keys = Object.keys(dataNodes).sort((a, b) =>
      (a === b) ? 0
        : ((a === "default") ? -1 : ((b === "default") ? 1 : ((a > b) ? 1 : -1))));
    keys.forEach(key => {
      result.push([key, dataNodes[key]])
    })
    return result;
  }

  private async readConfig(uri: Uri): Promise<void> {
    if (uri) {
      const toml = await workspace.fs.readFile(uri);
      try {
        this.configContent = parse(toml.toString());
      } catch (e) {
        window.showWarningMessage("TOML parsing", e.message);
      }
    }
  }

  async selectUri(uri: Uri): Promise<void>
  {
    if (this.configFileUri == uri) {
      return;
    }
    this.configFileUri = uri;
    await this.readConfig(uri);
    this.dataNodesProvider.refresh(this);
  }

  async selectDataNode(name: string, dataNode: object): Promise<void>
  {
    this.configDetailsView.setDataNodeContent(name, dataNode[1]["storage_type"], dataNode[1]["scope"]);
  }
} 
