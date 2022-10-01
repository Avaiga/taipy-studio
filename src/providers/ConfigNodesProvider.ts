import {
  commands,
  Event,
  EventEmitter,
  ProviderResult,
  TreeDataProvider,
  TreeItem,
  TreeItemCollapsibleState,
  Uri,
} from "vscode";
import { config, MessageFormat } from "vscode-nls";

import { selectConfigNodeCmd } from "../commands";
import { Context } from "../context";
import { DataNode, Pipeline, Scenario, Task } from "../../shared/names";

const localize = config({ messageFormat: MessageFormat.file })();

const dataNodeItemTitle = localize("DataNodeItem.title", "Select data node");
const taskItemTitle = localize("TaskItem.title", "Select task");
const pipelineItemTitle = localize("PipelineItem.title", "Select pipeline");
const scenarioItemTitle = localize("ScenarioItem.title", "Select scenario");

const getTitleFromType = (nodeType: string) => {
  switch (nodeType) {
    case DataNode:
      return dataNodeItemTitle;
    case Task:
      return taskItemTitle;
    case Pipeline:
      return pipelineItemTitle;
    case Scenario:
      return scenarioItemTitle;
  }
  return "";
}

export abstract class ConfigItem extends TreeItem {
  getNodeType = () => "";
  constructor(name: string, uri: Uri, dataNode: object) {
    super(name, TreeItemCollapsibleState.None);
    this.resourceUri = uri;
    this.contextValue = this.getNodeType();
    this.command = {
      command: selectConfigNodeCmd,
      title: getTitleFromType(this.getNodeType()),
      arguments: [this.getNodeType(), name, dataNode],
    };
  }
}
export class DataNodeItem extends ConfigItem {
  getNodeType = () => DataNode;
}

export class TaskItem extends ConfigItem {
  getNodeType = () => Task;
}

export class PipelineItem extends ConfigItem {
  getNodeType = () => Pipeline;
}

export class ScenarioItem extends ConfigItem {
  getNodeType = () => Scenario;
}

type TreeNodeCtor<T extends ConfigItem> = new (name: string, uri: Uri, node: object) => T;

export class ConfigNodesProvider<T extends ConfigItem> implements TreeDataProvider<T> {
  private _onDidChangeTreeData: EventEmitter<T | undefined> =
    new EventEmitter<T | undefined>();
  readonly onDidChangeTreeData: Event<T | undefined> =
    this._onDidChangeTreeData.event;
  
  private nodeType: string;
  private nodeCtor: TreeNodeCtor<T>;
  private configItems: T[] = [];

  constructor(context: Context, nodeCtor: TreeNodeCtor<T>) {
    this.nodeType = new nodeCtor(undefined, undefined, undefined).getNodeType();
    this.nodeCtor = nodeCtor;
    this.refresh(context, context.getConfigUri());
  }

  async refresh(context: Context, uri: Uri): Promise<void> {
    const configNodeEntries: object[] = context.getConfigNodes(this.nodeType);
    const configNodes: T[] = configNodeEntries.map(
      (entry) => new this.nodeCtor(entry[0], uri, entry[1])
    );
    this.configItems = configNodes;
    this._onDidChangeTreeData.fire(undefined);
  }

  getItem(nodeName: string) {
    return this.configItems.find(n => n.label == nodeName);
  }

  getNodeType() {
    return this.nodeType;
  }

  getTreeItem(element: T): TreeItem {
    return element;
  }

  getChildren(element?: T): Thenable<T[]> {
    if (element || !this.configItems) {
      return Promise.resolve([]);
    } else {
      return Promise.resolve(this.configItems);
    }
  }

  getParent(element: T): ProviderResult<T> {
    return undefined;
  }
}
