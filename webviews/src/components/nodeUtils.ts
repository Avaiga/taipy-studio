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
} from "@projectstorm/react-diagrams";
import { BaseEvent, BaseEntityEvent } from "@projectstorm/react-canvas-core";
import { debounce } from "debounce";

import { Positions } from "../../../shared/messages";
import { DataNode, Pipeline, Scenario, Task } from "../../../shared/names";
import { getNodeColor } from "./config";
import { postActionMessage, postLinkCreation, postLinkDeletion, postNodeCreation, postPositionsMessage } from "./postUtils";
import { Select } from "../../../shared/commands";
import { TaipyPortModel } from "../projectstorm/models";
import { getDescendants } from "../../../shared/toml";
import { TaipyNodeFactory, TaipyPortFactory } from "../projectstorm/factories";
import { nodeTypes } from "./config";

export const initEngine = () => {
  const engine = createEngine();
  nodeTypes.forEach((nodeType) => engine.getNodeFactories().registerFactory(new TaipyNodeFactory(nodeType)));
  engine.getPortFactories().registerFactory(new TaipyPortFactory());
  const state = engine.getStateMachine().getCurrentState();
  if (state instanceof DefaultDiagramState) {
    state.dragNewLink.config.allowLooseLinks = false;
  }
  return engine;
};

const openPerspective: Record<string, boolean> = {
  [Scenario]: true,
  [Pipeline]: true,
};

export const shouldOpenPerspective = (nodeType: string) => !!(nodeType && openPerspective[nodeType]);

export const getNewName = (model: DiagramModel, nodeType: string) => {
  return model
    .getNodes()
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
};

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
  const pos = model.getNodes().reduce((ps, node) => {
    const pNode = node as DefaultNodeModel;
    const nodeName = getNodeId(pNode);
    const pos = pNode.getPosition();
    if (nodeName && pos) {
      ps[nodeName] = [[pos.x, pos.y]];
    }
    return ps;
  }, {} as Positions);
  const posL = model.getLinks().reduce((ps, link) => {
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
