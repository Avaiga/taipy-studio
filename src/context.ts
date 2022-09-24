import {
  commands,
  ExtensionContext,
  FileSystemWatcher,
  Uri,
  window,
  workspace,
} from "vscode";
import { parse } from "@iarna/toml";

import { ConfigFilesView } from "./views/ConfigFilesView";
import { selectConfigFileCmd, selectDataNodeCmd } from "./commands";
import { CONFIG_DETAILS_ID } from "./constants";
import { DataNodesProvider } from "./providers/DataNodesProvider";
import { ConfigDetailsView } from "./providers/ConfigDetails";
import { configFileExt } from "./utils";

const dataNodeKeySort = (a: string, b: string) => a == b ? 0 : a == "default" ? -1 : b == "default" ? 1 : a > b ? 1 : -1;

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

  private constructor(vsContext: ExtensionContext) {
    // Configuration files
    this.configFilesView = new ConfigFilesView(this, "taipy-configs");
    commands.registerCommand("taipy.refreshConfigs", this.configFilesView.refresh, this.configFilesView);
    commands.registerCommand(selectConfigFileCmd, this.selectUri, this);
    // Data Nodes
    this.dataNodesProvider = new DataNodesProvider(this);
    commands.registerCommand("taipy.refreshDataNodes", () =>
      this.dataNodesProvider.refresh(this)
    );
    window.registerTreeDataProvider(
      "taipy-config-datanodes",
      this.dataNodesProvider
    );
    commands.registerCommand(selectDataNodeCmd, this.selectDataNode, this);
    // Details
    this.configDetailsView = new ConfigDetailsView(vsContext?.extensionUri, {});
    vsContext.subscriptions.push(
      window.registerWebviewViewProvider(
        CONFIG_DETAILS_ID,
        this.configDetailsView
      )
    );

    this.fileSystemWatcher = workspace.createFileSystemWatcher(
      `**/*${configFileExt}`
    );
    this.fileSystemWatcher.onDidChange(this.onFileChange, this);
    this.fileSystemWatcher.onDidCreate(this.onFileCreateDelete, this);
    this.fileSystemWatcher.onDidDelete(this.onFileCreateDelete, this);
  }

  private async onFileChange(uri: Uri): Promise<void> {
    if (uri && this.configFileUri?.toString() == uri.toString()) {
      await this.readConfig(uri);
      this.dataNodesProvider.refresh(this);
    }
  }

  private async onFileCreateDelete(uri: Uri): Promise<void> {
    this.configFilesView.refresh();
  }

  getDataNodes(): object[] {
    const dataNodes = this.configContent
      ? this.configContent["DATA_NODE"]
      : null;
    const result = [];
    if (dataNodes) {
      // Sort keys so that 'default' is always the first entry.
      const keys = Object.keys(dataNodes).sort(dataNodeKeySort);
      keys.forEach((key) => result.push([key, dataNodes[key]]));
    }
    return result;
  }

  async selectUri(uri: Uri): Promise<void> {
    if (this.configFileUri?.toString() == uri?.toString()) {
      return;
    }
    this.configFileUri = uri;
    await this.readConfig(uri);
    this.dataNodesProvider.refresh(this);
  }

  private async selectDataNode(name: string, dataNode: object): Promise<void> {
    this.configDetailsView.setDataNodeContent(
      name,
      dataNode[1]["storage_type"],
      dataNode[1]["scope"]
    );
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
