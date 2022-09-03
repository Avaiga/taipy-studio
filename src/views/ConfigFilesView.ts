import { Context } from '../context';
import * as vscode from 'vscode';

const configFileExt = ".toml";

class ConfigFileItem extends vscode.TreeItem
{
  private uri: vscode.Uri;

  public constructor(context: Context, uri: vscode.Uri)
  {
    super("", vscode.TreeItemCollapsibleState.None);
    this.setUri(uri);
  }
  public setUri(uri: vscode.Uri)
  {
    this.label = uri.path.substring(uri.path.lastIndexOf("/") + 1)
    this.uri = uri;
    this.command = {
      command: "taipy.selectConfigFile",
      title: "Select file",
      arguments: [uri]
    };
  }
  public getUri(): vscode.Uri
  {
    return this.uri;
  }
}

class ConfigFilesProvider implements vscode.TreeDataProvider<ConfigFileItem>
{
  private _onDidChangeTreeData: vscode.EventEmitter<ConfigFileItem | undefined> = new vscode.EventEmitter<ConfigFileItem | undefined>();
	readonly onDidChangeTreeData: vscode.Event<ConfigFileItem | undefined> = this._onDidChangeTreeData.event;

  public items: ConfigFileItem[] = [];

  public constructor()
  {
  }

  public getTreeItem(element: ConfigFileItem): vscode.TreeItem
  {
    return element;
  }

  public getChildren(element?: ConfigFileItem): Thenable<ConfigFileItem[]>
  {
    /*
    if (!this.configUris) {
      vscode.window.showInformationMessage('No configuration files in empty workspace');
      return Promise.resolve([]);
    }
    */

    if (element) {
      return Promise.resolve([]);
    } else {
      return Promise.resolve(this.items);
    }
  }

  public treeDataChanged(): void
  {
    this._onDidChangeTreeData.fire(undefined);
  }

  public addUri(vscode.Uri uri): void
  {
    const item = mew 
  }
}

export class ConfigFilesView
{
  private view: vscode.TreeView<ConfigFileItem>;
  private dataProvider: ConfigFilesProvider;

  constructor(context: Context, id: string)
  {
    this.dataProvider = new ConfigFilesProvider();
    this.view = vscode.window.createTreeView(id, { treeDataProvider: this.dataProvider });
    vscode.workspace.onDidCreateFiles(this._onDidCreateFiles, this);
    vscode.workspace.onDidDeleteFiles(this._onDidDeleteFiles, this);
    vscode.workspace.onDidRenameFiles(this._onDidRenameFiles, this);
    this.refresh(context);
  }

  async refresh(context: Context): Promise<void>
  {
    let configUris: ConfigFileItem[] = []
    const uris: vscode.Uri[] = await vscode.workspace.findFiles(`**/*${configFileExt}`, "**/node_modules/**");
    /* TODO
     * Sort and spot duplicates(in different folders)
     * File may have the same name, in different folders.
     * Item label will then differ:
     *   - config.tom        : in root_folder
     *   - config.tmp (src/) : in root_folder/src
     * Tooltip may reveal the actual file path (relative to root folder)
     */
    uris.forEach(uri => {
      configUris.push(new ConfigFileItem(context, uri))
    });
    this.dataProvider.items = configUris;
    vscode.commands.executeCommand('setContext', 'taipy:numberOfConfigFiles', configUris.length);
    this.dataProvider.treeDataChanged();
  }

  private _onDidCreateFiles(event: vscode.FileCreateEvent): void {
    /* TODO
    let updateData = false;
    for (let f of event.files) {
      if (f.path.endsWith(configFileExt)) {
        this.dataProvider.addUri(f);
        updateData = true;
      }
    }
    if (updateData) {
      this.dataProvider.treeDataChanged();
    }
    */
  }

  private _onDidRenameFiles(event: vscode.FileRenameEvent): void
  {
    /* TODO
     * Renaming may add or remove config files from lookup
     */
    let updateData = false;
    for (let f of event.files) {
      const uriPath = f.oldUri.path
      this.dataProvider.items.forEach(item => {
        if (item.getUri().path == uriPath) {
          item.setUri(f.newUri);
          updateData = true;
        }
      });
    }
    if (updateData) {
      this.dataProvider.treeDataChanged();
    }
  }

}

