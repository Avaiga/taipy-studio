import { commands, EventEmitter, l10n, ProviderResult, TreeDataProvider, TreeItem, TreeItemCollapsibleState, TreeView, Uri, window, workspace } from "vscode";

import { selectConfigFileCmd } from "../utils/commands";
import { Context } from "../context";
import { configFileExt, configFilePattern } from "../utils/utils";

class ConfigFileItem extends TreeItem {
  public constructor(baseName: string, readonly resourceUri: Uri, readonly tooltip: string, readonly description: string | null = null) {
    super(baseName, TreeItemCollapsibleState.None);
    this.command = {
      command: selectConfigFileCmd,
      title: l10n.t("Select file"),
      arguments: [resourceUri],
    };
  }
}

class ConfigFilesProvider implements TreeDataProvider<ConfigFileItem> {
  private _onDidChangeTreeData = new EventEmitter<ConfigFileItem | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  items: ConfigFileItem[] = [];

  constructor() {}

  getTreeItem(element: ConfigFileItem): TreeItem {
    return element;
  }

  getChildren(element?: ConfigFileItem): Thenable<ConfigFileItem[]> {
    return Promise.resolve(element ? [] : this.items);
  }

  getParent(element: ConfigFileItem): ProviderResult<ConfigFileItem> {
    return undefined;
  }

  treeDataChanged(): void {
    this._onDidChangeTreeData.fire(undefined);
  }
}

interface FileDesc {
  uri: Uri;
  label: string;
  path: string;
  dir: string;
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

  constructor(private readonly context: Context, id: string, lastSelectedUri?: string) {
    this.dataProvider = new ConfigFilesProvider();
    this.view = window.createTreeView(id, {
      treeDataProvider: this.dataProvider,
    });
    this.refresh(lastSelectedUri);
    
    commands.registerCommand("taipy.config.revealInExplorer", this.revealInExplorer, this);
  }
  
  private revealInExplorer(fileItem: ConfigFileItem) {
    commands.executeCommand("revealInExplorer", fileItem.resourceUri);
  }

  async refresh(lastSelectedUri?: string): Promise<void> {
    const configItems: ConfigFileItem[] = [];
    const uris: Uri[] = await workspace.findFiles(configFilePattern, "**/node_modules/**");
    const baseDescs: Record<string, Array<FileDesc>> = {};
    uris.forEach((uri) => {
      let path = uri.path;
      let lastSepIndex = path.lastIndexOf("/");
      const baseName = path.substring(lastSepIndex + 1, path.length - configFileExt.length);
      // Drop first workspace folder name
      // TODO: Note that this works properly only when the workspace has
      // a single folder, and that the configuration files are located
      // within these folders.
      const rootFolder: string = workspace.workspaceFolders[0].uri.path;
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
      .forEach((base) => {
        const desc = baseDescs[base];
        if (desc.length > 1) {
          // Find common prefix to all paths for that base
          const dirs = desc.map((d) => d.dir);
          let prefix = dirs[0];
          dirs.slice(1).forEach((d) => {
            while (prefix && d.substring(0, prefix.length) != prefix) {
              prefix = prefix.substring(0, prefix.length - 1);
              if (!prefix) {
                break;
              }
            }
          });
          const pl = prefix.length;
          desc.forEach((d) => {
            const dir = d.dir.substring(pl);
            configItems.push(new ConfigFileItem(base, d.uri, d.path, dir));
          });
        } else {
          configItems.push(new ConfigFileItem(base, desc[0].uri, desc[0].path));
        }
      });
    this.dataProvider.items = configItems;
    commands.executeCommand("setContext", "taipy:numberOfConfigFiles", configItems.length);
    this.dataProvider.treeDataChanged();
    if (lastSelectedUri && this.view.visible) {
      setTimeout(() => {
        const sel = configItems.find((item) => item.resourceUri.toString() == lastSelectedUri);
        if (sel) {
          this.view.reveal(sel, { select: true });
          this.context.selectUri(Uri.parse(lastSelectedUri));
        }
      }, 1);
    }
  }
}
