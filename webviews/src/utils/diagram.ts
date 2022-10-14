import createEngine, {
  DefaultLinkModel,
  DefaultNodeModel,
  DefaultPortModel,
  DiagramListener,
  DiagramModel,
  LinkModel,
  LinkModelListener,
  NodeModelListener,
  DefaultDiagramState,
  PortModel,
  LinkModelGenerics,
  DiagramEngine,
  PathFindingLinkFactory,
  DagreEngine,
  DefaultNodeModelOptions,
} from "@projectstorm/react-diagrams";
import { BaseEvent, BaseEntityEvent } from "@projectstorm/react-canvas-core";
import { debounce } from "debounce";

import { EditorAddNodeMessage, Positions } from "../../../shared/messages";
import { DataNode, Pipeline, Scenario, Task } from "../../../shared/names";
import { getNodeColor } from "./config";
import { postActionMessage, postLinkCreation, postLinkDeletion, postNodeCreation, postPositionsMessage } from "./messaging";
import { Select } from "../../../shared/commands";
import { TaipyDiagramModel, TaipyPortModel } from "../projectstorm/models";
import { getChildType, getDescendants } from "../../../shared/toml";
import { TaipyNodeFactory, TaipyPortFactory } from "../projectstorm/factories";
import { nodeTypes } from "./config";

export const initDiagram = (): [DiagramEngine, DagreEngine, TaipyDiagramModel] => {
  const engine = createEngine();
  nodeTypes.forEach((nodeType) => engine.getNodeFactories().registerFactory(new TaipyNodeFactory(nodeType)));
  engine.getPortFactories().registerFactory(new TaipyPortFactory());
  const state = engine.getStateMachine().getCurrentState();
  if (state instanceof DefaultDiagramState) {
    state.dragNewLink.config.allowLooseLinks = false;
  }
  const dagreEngine = new DagreEngine({
    graph: {
      rankdir: "LR",
      ranker: "longest-path",
      marginx: 25,
      marginy: 25,
    },
    includeLinks: true,
  });
  const model = new TaipyDiagramModel();
  engine.setModel(model);
  return [engine, dagreEngine, model];
};

const openPerspective: Record<string, boolean> = {
  [Scenario]: true,
  [Pipeline]: true,
};

export const getModelNodes = (model: TaipyDiagramModel) => Object.values(model.getActiveNodeLayer().getNodes());
export const getModelLinks = (model: TaipyDiagramModel) => Object.values(model.getActiveLinkLayer().getLinks());

export const getNodeByName = (model: TaipyDiagramModel, paths: string[]) => {
  const [nodeType, ...parts] = paths;
  const name = parts.join(".");
  return name ? getModelNodes(model).filter((n) => n.getType() == nodeType && (n.getOptions() as DefaultNodeModelOptions).name == name) : [];
};

export const shouldOpenPerspective = (nodeType: string) => !!(nodeType && openPerspective[nodeType]);

export const getNewName = (model: DiagramModel, nodeType: string) => getModelNodes(model)
    .filter((node) => node.getType() == nodeType)
    .reduce((pv, node) => {
      if ((node as DefaultNodeModel).getOptions().name == pv) {
        const parts = pv.split("-", 2);
        if (parts.length == 1) {
          return parts[0] + "-1";
        } else {
          return parts[0] + "-" + (parseInt(parts[1]) + 1);
        }
      }
      return pv;
    }, nodeType + "-1");

export const InPortName = "In";
export const OutPortName = "Out";

const nodePorts: Record<string, [boolean, boolean]> = {
  [DataNode]: [true, true],
  [Task]: [true, true],
  [Pipeline]: [true, true],
  [Scenario]: [false, true],
};
const setPorts = (node: DefaultNodeModel) => {
  const [inPort, outPort] = nodePorts[node.getType()];
  inPort && node.addPort(TaipyPortModel.createInPort());
  outPort && node.addPort(TaipyPortModel.createOutPort());
};

export const getLinkId = (link: LinkModel) =>
  "LINK." + getNodeId(link.getSourcePort().getNode() as DefaultNodeModel) + "." + getNodeId(link.getTargetPort().getNode() as DefaultNodeModel);
export const getNodeId = (node: DefaultNodeModel) => node.getType() + "." + node.getOptions().name;

const fireNodeSelected = (nodeType: string, name?: string) => name && postActionMessage(nodeType, name, Select);
export const cachePositions = (model: DiagramModel) => {
  const pos = getModelNodes(model).reduce((ps, node) => {
    const pNode = node as DefaultNodeModel;
    const nodeName = getNodeId(pNode);
    const pos = pNode.getPosition();
    if (nodeName && pos) {
      ps[nodeName] = [[pos.x, pos.y]];
    }
    return ps;
  }, {} as Positions);
  const posL = getModelLinks(model).reduce((ps, link) => {
    const linkName = getLinkId(link);
    const points = link.getPoints();
    if (linkName && points) {
      ps[linkName] = points.map((p) => [p.getPosition().x, p.getPosition().y]);
    }
    return ps;
  }, pos);
  postPositionsMessage(posL);
};

const getNodeAndLinksPositions = (node: DefaultNodeModel, positions: Positions = {}) => {
  const nodeId = getNodeId(node);
  const pos = node.getPosition();
  if (nodeId && pos) {
    positions[nodeId] = [[pos.x, pos.y]];
  }
  Object.values(node.getPorts()).forEach((port) =>
    Object.values(port.getLinks()).forEach((l) => {
      const linkName = getLinkId(l);
      const points = l.getPoints();
      if (linkName && points) {
        positions[linkName] = points.map((p) => [p.getPosition().x, p.getPosition().y]);
      }
    })
  );
  return positions;
};

const postPoss = (getPoss: (node: DefaultNodeModel) => Positions, node: DefaultNodeModel) => postPositionsMessage(getPoss(node));
const debouncedPostPoss = debounce(postPoss, 500);

const nodeListener = {
  selectionChanged: (e: BaseEvent) => {
    const node = (e as BaseEntityEvent<DefaultNodeModel>).entity;
    if (node.getType() && node.getOptions().name) {
      fireNodeSelected(node.getType(), node.getOptions().name);
    }
  },
  positionChanged: (e: BaseEvent) => debouncedPostPoss(getNodeAndLinksPositions, (e as BaseEntityEvent<DefaultNodeModel>).entity),
} as NodeModelListener;

const linkListener = {
  targetPortChanged: (e: BaseEvent) => {
    const evt = e as BaseEntityEvent<DefaultLinkModel> & { port: null | PortModel };
    if (evt.port) {
      const link = evt.entity;
      const sourceNode = link.getSourcePort()?.getNode() as DefaultNodeModel;
      const targetNode = evt.port.getNode() as DefaultNodeModel;
      if (sourceNode && targetNode) {
        const fromDataNode = sourceNode.getType() == DataNode;
        const nodeType = (fromDataNode ? targetNode : sourceNode).getType();
        const [inputs, outputs] = getDescendants(nodeType);
        postLinkCreation(
          nodeType,
          (fromDataNode ? targetNode : sourceNode).getOptions().name || "",
          fromDataNode ? inputs : outputs,
          (fromDataNode ? sourceNode : targetNode).getOptions().name || ""
        );
      }
    }
  },
} as LinkModelListener;

export const diagramListener = {
  nodesUpdated: (e: BaseEvent) => {
    const evt = e as BaseEntityEvent<DiagramModel> & { node: DefaultNodeModel; isCreated: boolean };
    if (evt.isCreated) {
      const node = evt.node;
      postNodeCreation(node.getType(), node.getOptions().name || "");
    }
  },
  linksUpdated: (e: BaseEvent) => {
    const evt = e as BaseEntityEvent<DiagramModel> & { link: DefaultLinkModel; isCreated: boolean };
    if (evt.isCreated) {
      evt.link.registerListener(linkListener);
    }
  },
} as DiagramListener;

export const onLinkRemove = (link: LinkModel<LinkModelGenerics>) => {
  const sourceNode = link.getSourcePort()?.getNode() as DefaultNodeModel;
  const targetNode = link.getTargetPort()?.getNode() as DefaultNodeModel;
  if (sourceNode && targetNode) {
    const fromDataNode = sourceNode.getType() == DataNode;
    const nodeType = (fromDataNode ? targetNode : sourceNode).getType();
    const [inputs, outputs] = getDescendants(nodeType);
    postLinkDeletion(
      nodeType,
      (fromDataNode ? targetNode : sourceNode).getOptions().name || "",
      fromDataNode ? inputs : outputs,
      (fromDataNode ? sourceNode : targetNode).getOptions().name || ""
    );
  }
};

export const createNode = (nodeType: string, nodeName: string, createPorts = true) => {
  const node = new DefaultNodeModel({
    type: nodeType,
    name: nodeName,
    color: getNodeColor(nodeType),
  });
  createPorts && setPorts(node);
  node.registerListener(nodeListener);
  return node;
};

export const createLink = (outPort: DefaultPortModel, inPort: DefaultPortModel) => {
  const link = outPort.link<DefaultLinkModel>(inPort);
  return link;
};

export const showNode = (engine: DiagramEngine, message: EditorAddNodeMessage) => {
  const model = engine.getModel();
  let node = getModelNodes(model).find((n) => n.getType() == message.nodeType && (n as DefaultNodeModel).getOptions().name == message.nodeName);
  if (node) {
    const canvas = engine.getCanvas();
    const ratio = model.getZoomLevel() / 100;
    model.setOffset(
      (canvas.offsetWidth - node.width * ratio) / 2 - node.getPosition().x * ratio,
      (canvas.offsetHeight - node.height * ratio) / 2 - node.getPosition().y * ratio
    );
  } else {
    node = model.addNode(createNode(message.nodeType, message.nodeName));
    node.setPosition(-model.getOffsetX(), -model.getOffsetY());
  }
  engine.repaintCanvas();
};

export const relayoutDiagram = (engine: DiagramEngine, dagreEngine: DagreEngine) => {
  const model = engine.getModel();
  dagreEngine.redistribute(model);
  engine.getLinkFactories().getFactory<PathFindingLinkFactory>(PathFindingLinkFactory.NAME).calculateRoutingMatrix();
  engine.repaintCanvas();
  cachePositions(model);
};

export const setNodeContext = (engine: DiagramEngine, node: DefaultNodeModel, baseUri: string) =>
  engine
    .getNodeElement(node)
    .setAttribute(
      "data-vscode-context",
      '{"preventDefaultContextMenuItems": true' +
        (shouldOpenPerspective(node.getType())
          ? ', "webviewSection": "taipy.node", "baseUri": "' + baseUri + '", "perspective": "' + getNodeId(node) + '"'
          : "") +
        "}"
    );

export const populateModel = (toml: any, model: TaipyDiagramModel) => {
  const linkModels: DefaultLinkModel[] = [];
  const nodeModels: Record<string, Record<string, DefaultNodeModel>> = {};

  Object.keys(toml).forEach((nodeType, tIdx) => {
    if (nodeType == "TAIPY" || nodeType == "JOB") {
      return;
    }
    Object.keys(toml[nodeType]).forEach((key, nIdx) => {
      if (key == "default") {
        return;
      }
      const node = createNode(nodeType, key);
      node.setPosition(150, 100 + 100 * tIdx + 10 * nIdx);
      nodeModels[nodeType] = nodeModels[nodeType] || {};
      nodeModels[nodeType][key] = node;
    });
  });

  // create links Tasks-DataNodes, Pipeline-Tasks, Scenario-Pipelines
  [Task, Pipeline, Scenario].forEach((nodeType) => {
    nodeModels[nodeType] &&
      Object.entries(nodeModels[nodeType]).forEach(([name, nodeModel]) => {
        const parentNode = toml[nodeType][name];
        const childType = getChildType(nodeType);
        if (childType) {
          const descendants = getDescendants(nodeType);
          if (descendants[0]) {
            (parentNode[descendants[0]] || []).forEach((dnKey: string) => {
              const node = nodeModels[childType][dnKey];
              if (node) {
                linkModels.push(createLink(node.getPort(OutPortName) as DefaultPortModel, nodeModel.getPort(InPortName) as DefaultPortModel));
              }
            });
          }
          if (descendants[1]) {
            (parentNode[descendants[1]] || []).forEach((dnKey: string) => {
              const node = nodeModels[childType][dnKey];
              if (node) {
                linkModels.push(createLink(nodeModel.getPort(OutPortName) as DefaultPortModel, node.getPort(InPortName) as DefaultPortModel));
              }
            });
          }
        }
      });
  });

  const nodeLayer = model.getActiveNodeLayer();
  Object.values(nodeModels).forEach((nm) => Object.values(nm).forEach(n => nodeLayer.addModel(n)));
  const linkLayer = model.getActiveLinkLayer();
  linkModels.forEach(l => linkLayer.addModel(l));
};
