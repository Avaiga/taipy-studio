import * as vscode from "vscode";
import { ConfigFilesView } from "./views/ConfigFilesView";
import { DataNodesProvider } from "./providers/DataNodesProvider";
import { ConfigDetailsView } from "./providers/ConfigDetails";
import { Constants } from "./constants";
import { parse } from "@iarna/toml";

export class Context {
  static create(vsContext: vscode.ExtensionContext): void {
    new Context(vsContext);
  }
  private configFileUri: vscode.Uri | null = null;
  private configContent: object = null;
  private configFilesView: ConfigFilesView;
  private dataNodesProvider: DataNodesProvider;
  private configDetailsView: ConfigDetailsView;

  private constructor(vsContext: vscode.ExtensionContext)
  {
    // Configuration files
    this.configFilesView = new ConfigFilesView(this, "taipy-configs");
    vscode.commands.registerCommand('taipy.refreshConfigs', () => this.configFilesView.refresh(this));
    vscode.commands.registerCommand("taipy.selectConfigFile",
      (uri: vscode.Uri) => this.selectUri(uri));
    // Data Nodes
    this.dataNodesProvider = new DataNodesProvider(this);
    vscode.commands.registerCommand('taipy.refreshDataNodes', () => this.dataNodesProvider.refresh(this));
    vscode.window.registerTreeDataProvider("taipy-config-datanodes", this.dataNodesProvider);
    vscode.commands.registerCommand("taipy.selectDataNode",
      (name: string, dataNode: object) => this.selectDataNode(name, dataNode));
    // Details
    this.configDetailsView = new ConfigDetailsView(vsContext?.extensionUri, {});
    vsContext.subscriptions.push(vscode.window.registerWebviewViewProvider(
      Constants.CONFIG_DETAILS_ID,
      this.configDetailsView
    ));
   }

  getDataNodes(): object[]
  {
    const dataNodes = this.configContent ? this.configContent["DATA_NODE"] : null;
    if (!dataNodes) {
      return [];
    }
    let result = [];
    // Sort keys so that 'default' is always the first entry.
    const keys = Object.keys(dataNodes).sort((a, b) =>
      (a === b) ? 0
        : ((a === "default") ? -1 : ((b === "default") ? 1 : ((a > b) ? 1 : -1))));
    keys.forEach(key => {
      result.push([key, dataNodes[key]])
    })
    return result;
  }

  async selectUri(uri: vscode.Uri): Promise<void>
  {
    if (this.configFileUri == uri) {
      return;
    }
    this.configFileUri = uri;
    if (uri) {
      const toml = await vscode.workspace.fs.readFile(uri);
      this.configContent = parse(toml.toString());
    }
    this.dataNodesProvider.refresh(this);
  }

  async selectDataNode(name: string, dataNode: object): Promise<void>
  {
    this.configDetailsView.setDataNodeContent(name, dataNode[1]["storage_type"], dataNode[1]["scope"]);
  }
} 
