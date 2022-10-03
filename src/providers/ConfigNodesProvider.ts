
import { JsonMap, stringify } from "@iarna/toml";
import {
  CancellationToken,
  DataTransfer,
  DataTransferItem,
  Event,
  EventEmitter,
  ProviderResult,
  TreeDataProvider,
  TreeDragAndDropController,
  TreeItem,
  TreeItemCollapsibleState,
  Uri,
} from "vscode";
import { config, MessageFormat } from "vscode-nls";

import { selectConfigNodeCmd } from "../commands";
import { Context } from "../context";
import { getPerspectiveUri } from "../contentProviders/PerpectiveContentProvider";
import { DataNode, Pipeline, Scenario, Task } from "../../shared/names";

const localize = config({ messageFormat: MessageFormat.file })();

const titles = {
  [DataNode]: localize("DataNodeItem.title", "Select data node"),
  [Task]: localize("TaskItem.title", "Select task"),
  [Pipeline]: localize("PipelineItem.title", "Select pipeline"),
  [Scenario]: localize("ScenarioItem.title", "Select scenario")
}
const getTitleFromType = (nodeType: string) => titles[nodeType] || "Select Something";

const mimeTypes = {
  [DataNode]: ["text/url-list"],
  [Task]: ["text/url-list"],
  [Pipeline]: ["text/url-list"],
}
const getMimeTypeFromType = (nodeType: string) => mimeTypes[nodeType] || [];

export abstract class ConfigItem extends TreeItem {
  getNodeType = () => "";
  node: JsonMap;
  constructor(name: string, node: JsonMap) {
    super(name, TreeItemCollapsibleState.None);
    this.contextValue = this.getNodeType();
    this.node = node;
    this.command = {
      command: selectConfigNodeCmd,
      title: getTitleFromType(this.getNodeType()),
      arguments: [this.getNodeType(), name, node],
    };
  }
  setResourceUri = (uri: Uri) => {
    this.resourceUri = getPerspectiveUri(uri, this.getNodeType() + "." + this.label, stringify(this.node));
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

type TreeNodeCtor<T extends ConfigItem> = new (name: string, node: object) => T;

export class ConfigNodesProvider<T extends ConfigItem> implements TreeDataProvider<T>, TreeDragAndDropController<T> {
  private _onDidChangeTreeData: EventEmitter<T | undefined> =
    new EventEmitter<T | undefined>();
  readonly onDidChangeTreeData: Event<T | undefined> =
    this._onDidChangeTreeData.event;
  
  private nodeType: string;
  private nodeCtor: TreeNodeCtor<T>;
  private configItems: T[] = [];

  constructor(context: Context, nodeCtor: TreeNodeCtor<T>) {
    this.nodeType = new nodeCtor(undefined, undefined).getNodeType();
    this.nodeCtor = nodeCtor;
    this.dragMimeTypes = getMimeTypeFromType(this.nodeType);
    this.refresh(context, context.getConfigUri());
  }

  dropMimeTypes: readonly string[];
  dragMimeTypes: readonly string[];
  handleDrag?(source: T[], treeDataTransfer: DataTransfer, token: CancellationToken): ProviderResult<void> {
    const uris: Uri[] = [];
    source.forEach(s => {
      if (s.resourceUri) {
        uris.push(s.resourceUri);
      }
    })
		treeDataTransfer.set("text/url-list", new DataTransferItem(uris.map(u => u.toString()).join("\n")));
	}
  handleDrop?(target: T, dataTransfer: DataTransfer, token: CancellationToken): ProviderResult<void> {
  }

  async refresh(context: Context, uri: Uri): Promise<void> {
    const configNodeEntries: object[] = context.getConfigNodes(this.nodeType);
    const configNodes: T[] = configNodeEntries.map(
      (entry) => {
        const item = new this.nodeCtor(entry[0], entry[1]);
        item.setResourceUri(uri);
        return item;
      }
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
