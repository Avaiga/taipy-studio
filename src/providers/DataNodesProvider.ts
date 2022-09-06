import { Context } from '../context';
import { commands, Event, EventEmitter, TreeDataProvider, TreeItem, TreeItemCollapsibleState } from 'vscode';

class DataNodeItem extends TreeItem {
  private dataNode: object;
  constructor(name: string, dataNode: object) {
    super(name, TreeItemCollapsibleState.None);
    // TODO:Extract info from dataNode (like Scope)
    this.dataNode = dataNode;
    this.command = {
      command: "taipy.selectDataNode",
      title: "Select data node",
      arguments: [name, dataNode]
    };
  }
}

export class DataNodesProvider implements TreeDataProvider<DataNodeItem> {
  private _onDidChangeTreeData: EventEmitter<DataNodeItem | undefined> = new EventEmitter<DataNodeItem | undefined>();
  readonly onDidChangeTreeData: Event<DataNodeItem | undefined> = this._onDidChangeTreeData.event;
  private dataNodes: DataNodeItem[] = [];

  constructor(context: Context) {
    this.refresh(context);
  }

  async refresh(context: Context): Promise<void> {
    const dataNodeEntries: object[] = context.getDataNodes();
    commands.executeCommand('setContext', 'taipy.numberOfDataNodes', dataNodeEntries.length);
    const dataNodes: DataNodeItem[] = dataNodeEntries.map(entry => new DataNodeItem(entry[0], entry));
    this.dataNodes = dataNodes;
    this._onDidChangeTreeData.fire(undefined);
  }

  getTreeItem(element: DataNodeItem): TreeItem {
    return element;
  }

  getChildren(element?: DataNodeItem): Thenable<DataNodeItem[]> {

    if (element || !this.dataNodes) {
      return Promise.resolve([]);
    } else {
      return Promise.resolve(this.dataNodes);
    }
  }
}
