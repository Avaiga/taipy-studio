import { Context } from '../context';
import * as vscode from 'vscode';

class DataNodeItem extends vscode.TreeItem {
  private dataNode: object;
  constructor(name: string, dataNode: object) {
    super(name, vscode.TreeItemCollapsibleState.None);
    // TODO:Extract info from dataNode (like Scope)
    this.dataNode = dataNode;
    this.command = {
      command: "taipy.selectDataNode",
      title: "Select data node",
      arguments: [name, dataNode]
    };
  }
}

export class DataNodesProvider implements vscode.TreeDataProvider<DataNodeItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<DataNodeItem | undefined> = new vscode.EventEmitter<DataNodeItem | undefined>();
  readonly onDidChangeTreeData: vscode.Event<DataNodeItem | undefined> = this._onDidChangeTreeData.event;
  private dataNodes: DataNodeItem[] = [];

  constructor(context: Context) {
    this.refresh(context);
  }

  async refresh(context: Context): Promise<void> {
    const dataNodeEntries: object[] = context.getDataNodes();
    vscode.commands.executeCommand('setContext', 'taipy.numberOfDataNodes', dataNodeEntries.length);
    let dataNodes: DataNodeItem[] = [];
    dataNodeEntries.forEach(entry => {
      dataNodes.push(new DataNodeItem(entry[0], entry));
    });
    this.dataNodes = dataNodes;
    this._onDidChangeTreeData.fire(undefined);
  }

  getTreeItem(element: DataNodeItem): vscode.TreeItem {
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
