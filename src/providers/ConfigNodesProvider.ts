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

export interface ConfigNode {
  getType: () => string;
}
export class DataNodeItem extends TreeItem implements ConfigNode {
  private dataNode: object;
  constructor(name: string, dataNode: object) {
    super(name, TreeItemCollapsibleState.None);
    // TODO:Extract info from dataNode (like Scope)
    this.dataNode = dataNode;
    this.command = {
      command: selectConfigNodeCmd,
      title: dataNodeItemTitle,
      arguments: [this.getType(), name, dataNode],
    };
  }
  getType() {
    return DataNode;
  }
}

export class TaskItem extends TreeItem implements ConfigNode {
  private task: object;
  constructor(name: string, task: object) {
    super(name, TreeItemCollapsibleState.None);
    // TODO:Extract info from task (like Scope)
    this.task = task;
    this.command = {
      command: selectConfigNodeCmd,
      title: taskItemTitle,
      arguments: [this.getType(), name, task],
    };
  }
  getType() {
    return Task;
  }
}

export class PipelineItem extends TreeItem implements ConfigNode {
  private pipeline: object;
  constructor(name: string, pipeline: object) {
    super(name, TreeItemCollapsibleState.None);
    // TODO:Extract info from task (like Scope)
    this.pipeline = pipeline;
    this.command = {
      command: selectConfigNodeCmd,
      title: pipelineItemTitle,
      arguments: [this.getType(), name, pipeline],
    };
  }
  getType() {
    return Pipeline;
  }
}

export class ScenarioItem extends TreeItem implements ConfigNode {
  private scenario: object;
  constructor(name: string, scenario: object) {
    super(name, TreeItemCollapsibleState.None);
    // TODO:Extract info from task (like Scope)
    this.scenario = scenario;
    this.command = {
      command: selectConfigNodeCmd,
      title: scenarioItemTitle,
      arguments: [this.getType(), name, scenario],
    };
  }
  getType() {
    return Scenario;
  }
}

type TreeNodeCtor<T extends TreeItem & ConfigNode> = new (name: string, node: object) => T;

export class ConfigNodesProvider<T extends TreeItem & ConfigNode> implements TreeDataProvider<T> {
  private _onDidChangeTreeData: EventEmitter<T | undefined> =
    new EventEmitter<T | undefined>();
  readonly onDidChangeTreeData: Event<T | undefined> =
    this._onDidChangeTreeData.event;
  
  private nodeType: string;
  private nodeCtor: TreeNodeCtor<T>;
  private configItems: T[] = [];

  constructor(context: Context, nodeCtor: TreeNodeCtor<T>) {
    this.nodeType = new nodeCtor("", {}).getType();
    this.nodeCtor = nodeCtor;
    this.refresh(context);
  }

  async refresh(context: Context): Promise<void> {
    const configNodeEntries: object[] = context.getConfigNodes(this.nodeType);
    commands.executeCommand(
      "setContext",
      "taipy:numberOfDataNodes",
      configNodeEntries.length
    );
    const configNodes: T[] = configNodeEntries.map(
      (entry) => new this.nodeCtor(entry[0], entry[1])
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
