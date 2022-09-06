import { commands, Event, EventEmitter, FileCreateEvent, FileRenameEvent, TreeDataProvider, TreeItem, TreeItemCollapsibleState, TreeView, Uri, window, workspace } from 'vscode';
import { Context } from '../context';
import { configFileExt } from '../utils';

class ConfigFileItem extends TreeItem
{
  private uri: Uri;

  public constructor(context: Context, uri: Uri)
  {
    super("", TreeItemCollapsibleState.None);
    this.setUri(uri);
  }
  public setUri(uri: Uri)
  {
    this.label = uri.path.substring(uri.path.lastIndexOf("/") + 1)
    this.uri = uri;
    this.command = {
      command: "taipy.selectConfigFile",
      title: "Select file",
      arguments: [uri]
    };
  }
  public getUri(): Uri
  {
    return this.uri;
  }
}

class ConfigFilesProvider implements TreeDataProvider<ConfigFileItem>
{
  private _onDidChangeTreeData: EventEmitter<ConfigFileItem | undefined> = new EventEmitter<ConfigFileItem | undefined>();
	readonly onDidChangeTreeData: Event<ConfigFileItem | undefined> = this._onDidChangeTreeData.event;

  public items: ConfigFileItem[] = [];

  public constructor()
  {
  }

  public getTreeItem(element: ConfigFileItem): TreeItem
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
}

export class ConfigFilesView
{
  private view: TreeView<ConfigFileItem>;
  private dataProvider: ConfigFilesProvider;

  constructor(context: Context, id: string)
  {
    this.dataProvider = new ConfigFilesProvider();
    this.view = window.createTreeView(id, { treeDataProvider: this.dataProvider });
    workspace.onDidCreateFiles(this._onDidCreateFiles, this);
    //vscode.workspace.onDidDeleteFiles(this._onDidDeleteFiles, this);
    workspace.onDidRenameFiles(this._onDidRenameFiles, this);
    this.refresh(context);
  }

  async refresh(context: Context): Promise<void>
  {
    const configUris: ConfigFileItem[] = []
    const uris: Uri[] = await workspace.findFiles(`**/*${configFileExt}`, "**/node_modules/**");
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
    commands.executeCommand('setContext', 'taipy:numberOfConfigFiles', configUris.length);
    this.dataProvider.treeDataChanged();
  }

  private _onDidCreateFiles(event: FileCreateEvent): void {
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

  private _onDidRenameFiles(event: FileRenameEvent): void
  {
    /* TODO
     * Renaming may add or remove config files from lookup
     */
    let updateData = false;
    for (const f of event.files) {
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

