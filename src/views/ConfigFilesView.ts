import {
  commands,
  Event,
  EventEmitter,
  TreeDataProvider,
  TreeItem,
  TreeItemCollapsibleState,
  TreeView,
  Uri,
  window,
  workspace,
} from "vscode";
import { config, MessageFormat } from "vscode-nls";

import { Context } from "../context";

const localize = config({ messageFormat: MessageFormat.file })();

const configFileExt = ".toml";
const configFileItemTitle = localize("ConfigFileItem.title", "Select file");

class ConfigFileItem extends TreeItem {
  public constructor(
    baseName: string,
    uri: Uri,
    path: string,
    dir: string | null = null
  ) {
    super(baseName, TreeItemCollapsibleState.None);
    this.resourceUri = uri;
    this.tooltip = path;
    this.description = dir;
    this.command = {
      command: "taipy.selectConfigFile",
      title: configFileItemTitle,
      arguments: [uri],
    };
  }
}

class ConfigFilesProvider implements TreeDataProvider<ConfigFileItem> {
  private _onDidChangeTreeData: EventEmitter<ConfigFileItem | undefined> =
    new EventEmitter<ConfigFileItem | undefined>();
  readonly onDidChangeTreeData: Event<ConfigFileItem | undefined> =
    this._onDidChangeTreeData.event;

  public items: ConfigFileItem[] = [];

  public constructor() {}

  public getTreeItem(element: ConfigFileItem): TreeItem {
    return element;
  }

  public getChildren(element?: ConfigFileItem): Thenable<ConfigFileItem[]> {
    return Promise.resolve(element ? [] : this.items);
  }

  public treeDataChanged(): void {
    this._onDidChangeTreeData.fire(undefined);
  }
}

export class ConfigFilesView {
  private view: TreeView<ConfigFileItem>;
  private dataProvider: ConfigFilesProvider;
  /* TODO: Timer in place to detect file renaming, that appears
   *  like file creation followed by file removal.
   *  The idea is to delay the creation detection to after a removal
   *  was detected, so we can keep the original file selected, if
   *  it was.
   *  That kind of worked, but not always :-(
  private timeout?: NodeJS.Timer = null;
  private lastCreatedUri?: Uri = null;
  */

  constructor(context: Context, id: string) {
    this.dataProvider = new ConfigFilesProvider();
    this.view = window.createTreeView(id, {
      treeDataProvider: this.dataProvider,
    });
    this.refresh();
  }

  async refresh(): Promise<void> {
    const configItems: ConfigFileItem[] = [];
    const uris: Uri[] = await workspace.findFiles(
      `**/*${configFileExt}`,
      "**/node_modules/**"
    );
    const root: string = workspace.workspaceFolders[0].uri.toString();
    let baseDescs: Record<string, object[]> = {};
    uris.forEach((uri) => {
      let path: string = uri.toString();
      let lastSepIndex: number = path.lastIndexOf("/");
      const baseName: string = path.substring(
        lastSepIndex + 1,
        path.length - configFileExt.length
      );
      // Drop first workspace folder name
      // TODO: Note that this works properly only when the workspace has
      // a single folder, and that the configuration files are located
      // within these folders.
      const rootFolder: string = workspace.workspaceFolders[0].uri.toString();
      if (path.startsWith(rootFolder)) {
        path = path.substring(rootFolder.length);
      }
      lastSepIndex = path.lastIndexOf("/");
      const fileDesc = {
        uri: uri,
        label: baseName,
        path: path,
        dir: lastSepIndex == -1 ? "" : path.substring(0, lastSepIndex),
      };
      if (baseName in baseDescs) {
        baseDescs[baseName].push(fileDesc);
      } else {
        baseDescs[baseName] = [fileDesc];
      }
    });
    Object.keys(baseDescs)
      .sort()
      .forEach((base: string) => {
        const desc = baseDescs[base];
        if (desc.length > 1) {
          // Find common prefix to all paths for that base
          const dirs: string[] = desc.map((d) => d["dir"]);
          let prefix: string = dirs[0];
          dirs.slice(1).forEach((d: string) => {
            while (prefix && d.substring(0, prefix.length) != prefix) {
              prefix = prefix.substring(0, prefix.length - 1);
              if (!prefix) {
                break;
              }
            }
          });
          const pl: number = prefix.length;
          desc.forEach((d) => {
            const dir = d["dir"].substring(pl);
            configItems.push(
              new ConfigFileItem(base, d["uri"], d["path"], dir)
            );
          });
        } else {
          configItems.push(
            new ConfigFileItem(base, desc[0]["uri"], desc[0]["path"])
          );
        }
      });
    this.dataProvider.items = configItems;
    commands.executeCommand(
      "setContext",
      "taipy:numberOfConfigFiles",
      configItems.length
    );
    this.dataProvider.treeDataChanged();
  }
}
