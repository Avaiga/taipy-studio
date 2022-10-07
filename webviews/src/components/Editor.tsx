import { DragEvent, useCallback, useEffect, useRef, useState } from "react";
import createEngine, {
  DefaultNodeModel,
  DefaultLinkModel,
  DiagramModel,
  DagreEngine,
  PathFindingLinkFactory,
  DefaultPortModel,
  DefaultNodeModelOptions,
  NodeModelListener,
  LinkModel,
  NodeModel,
} from "@projectstorm/react-diagrams";
import { CanvasWidget, BaseEvent, BaseEntityEvent } from "@projectstorm/react-canvas-core";
import * as deepEqual from "fast-deep-equal";
import { getDiff } from "recursive-diff";

import { ConfigEditorProps, perspectiveRootId } from "../../../shared/views";
import { postActionMessage, postPositionsMessage, postRefreshMessage } from "./utils";
import { applyPerspective, getChildType, getChildTypeWithBackLink, getDescendants, getParentNames, getParentType } from "./tomlUtils";
import { Pipeline, PipelineTasks, Scenario, ScenarioPipelines, Task, TaskInputs, TaskOutputs } from "../../../shared/names";
import { Select } from "../../../shared/commands";
import { Positions } from "../../../shared/messages";
import { getNodeColor } from "./config";

const InPortName = "In";
const OutPortName = "Out";

const engine = createEngine();
const dagreEngine = new DagreEngine({
  graph: {
    rankdir: "LR",
    ranker: "longest-path",
    marginx: 25,
    marginy: 25,
  },
  includeLinks: true,
});

const getNodeByName = (model: DiagramModel, name: string) => model.getNodes().filter((n) => (n.getOptions() as DefaultNodeModelOptions).name == name);
const childrenNodesKey: Record<string, string> = {
  [Task]: TaskOutputs,
  [Pipeline]: PipelineTasks,
  [Scenario]: ScenarioPipelines,
};
const getChildrenNodes = (toml: any, parentType: string, filter?: string) => {
  const nodes = toml[parentType];
  if (nodes) {
    const parents = Object.keys(nodes);
    const childrenKey = childrenNodesKey[parentType];
    const res = childrenKey
      ? parents.reduce((pv, cv) => {
          pv[cv] = nodes[cv][childrenKey];
          return pv;
        }, {} as Record<string, string[]>)
      : {};
    if (filter) {
      parents.forEach((p) => {
        if (res[p]) {
          res[p] = (res[p] as string[]).filter((n) => n == filter);
        }
      });
    }
    return res;
  }
};
const getLinkName = (link: LinkModel) =>
  "LINK." +
  (link.getSourcePort().getNode() as DefaultNodeModel).getOptions().name +
  "." +
  (link.getTargetPort().getNode() as DefaultNodeModel).getOptions().name;

const getNodeAndLinksPositions = (node: DefaultNodeModel, positions: Positions = {}) => {
  const nodeName = node.getOptions().name;
  const pos = node.getPosition();
  if (nodeName && pos) {
    positions[nodeName] = [[pos.x, pos.y]];
  }
  Object.values(node.getPorts()).forEach((port) =>
    Object.values(port.getLinks()).forEach((l) => {
      const linkName = getLinkName(l);
      const points = l.getPoints();
      if (linkName && points) {
        positions[linkName] = points.map((p) => [p.getPosition().x, p.getPosition().y]);
      }
    })
  );
  return positions;
};

const fireNodeSelected = (nodeType: string, name: string) => postActionMessage(nodeType, name, Select);
const cachePositions = (model: DiagramModel) => {
  const pos = model.getNodes().reduce((ps, node) => {
    const pNode = node as DefaultNodeModel;
    const nodeName = pNode.getOptions().name;
    const pos = pNode.getPosition();
    if (nodeName && pos) {
      ps[nodeName] = [[pos.x, pos.y]];
    }
    return ps;
  }, {} as Positions);
  const posL = model.getLinks().reduce((ps, link) => {
    const linkName = getLinkName(link);
    const points = link.getPoints();
    if (linkName && points) {
      ps[linkName] = points.map((p) => [p.getPosition().x, p.getPosition().y]);
    }
    return ps;
  }, pos);
  postPositionsMessage(posL);
};

const nodeListener = {
  selectionChanged: (e: BaseEvent) => {
    const parts = (e as BaseEntityEvent<DefaultNodeModel>).entity.getOptions().name?.split(".", 2) || [];
    if (parts.length > 1) {
      fireNodeSelected(parts[0], parts[1]);
    }
  },
  positionChanged: (e: BaseEvent) => postPositionsMessage(getNodeAndLinksPositions((e as BaseEntityEvent<DefaultNodeModel>).entity)),
} as NodeModelListener;

const Editor = ({ toml, positions, perspectiveId }: ConfigEditorProps) => {
  const [model, setModel] = useState(new DiagramModel());
  const oldToml = useRef<Record<string, any>>();
  const oldPerspId = useRef<string>();

  const relayout = useCallback(
    // @ts-ignore
    (evt: any, dModel?: DiagramModel) => {
      dModel = dModel || model;
      dagreEngine.redistribute(dModel);
      engine.getLinkFactories().getFactory<PathFindingLinkFactory>(PathFindingLinkFactory.NAME).calculateRoutingMatrix();
      engine.repaintCanvas();
      cachePositions(dModel);
    },
    [model]
  );

  const onDrop = useCallback((evt: DragEvent) => {
    evt.preventDefault();
    console.log("editor.onDrop", evt, evt.dataTransfer);
  }, []);

  toml = applyPerspective(toml, perspectiveId);

  useEffect(() => {
    model.getNodes().forEach(node => engine.getNodeElement(node).setAttribute("data-vscode-context", '{"webviewSection": "taipy.node", "preventDefaultContextMenuItems": false}'));
    if (!toml || (perspectiveId == oldPerspId.current && deepEqual(oldToml.current, toml))) {
      return;
    }
    if (toml && oldToml.current && perspectiveId == oldPerspId.current) {
      const diff = getDiff(oldToml.current, toml, true);
      // try to be clever ...
      if (diff.length == 2) {
        const ops = diff.map((d) => d.op);
        const delI = ops.indexOf("delete");
        const addI = ops.indexOf("add");
        if (delI > -1 && addI > -1) {
          const pathLen = diff[addI].path.length;
          if (pathLen == diff[delI].path.length) {
            if (diff[addI].path.every((p, i) => i == pathLen - 1 || p == diff[delI].path[i])) {
              if (diff[addI].path[pathLen - 1] == diff[delI].path[pathLen - 1]) {
                // Change in links
              } else {
                // Change in name
                const oldNodes = getNodeByName(model, diff[delI].path.join("."));
                if (oldNodes.length == 1) {
                  const node = new DefaultNodeModel({
                    name: diff[addI].path.join("."),
                    color: getNodeColor(diff[addI].path[0] as string),
                  });
                  node.setPosition(oldNodes[0].getPosition());
                  node.registerListener({
                    selectionChanged: () => fireNodeSelected(diff[addI].path[0] as string, diff[addI].path[pathLen - 1] as string),
                  } as NodeModelListener);

                  const inPort = oldNodes[0].getPort(InPortName);
                  if (inPort) {
                    const port = node.addInPort(InPortName);
                    model
                      .getLinks()
                      .filter((l) => l.getTargetPort() === inPort)
                      .forEach((l) => model.removeLink(l));
                    const parentType = getParentType(diff[addI].path[0] as string);
                    const parentNames = [];
                    if (parentType) {
                      const nodes = getChildrenNodes(toml, parentType, diff[addI].path[pathLen - 1] as string);
                      if (nodes) {
                        parentNames.push(
                          ...Object.entries(nodes)
                            .filter(([_, node]) => node.length)
                            .map(([p]) => parentType + "." + p)
                        );
                      }
                    }
                    parentNames.push(...getParentNames(toml, ...(diff[addI].path as string[])));
                    if (parentNames.length) {
                      parentNames.forEach((p) => {
                        const pNodes = getNodeByName(model, p);
                        if (pNodes.length == 1) {
                          model.addLink((pNodes[0].getPort(OutPortName) as DefaultPortModel).link(port));
                        }
                      });
                    }
                  }

                  const outPort = oldNodes[0].getPort(OutPortName);
                  if (outPort) {
                    const port = node.addOutPort(OutPortName);
                    const childType = getChildTypeWithBackLink(diff[addI].path[0] as string);
                    model
                      .getLinks()
                      .filter((l) => l.getSourcePort() === outPort)
                      .forEach((l) => {
                        if (childType) {
                          model.removeLink(l);
                        } else {
                          l.setSourcePort(port);
                        }
                      });
                    if (childType) {
                      const children = toml[childType] as Record<string, Record<string, string[]>>;
                      if (children) {
                        const childrenNames: string[] = [];
                        const nodeName = diff[addI].path[pathLen - 1] as string;
                        Object.entries(children).forEach(([t, c]) => {
                          if ((c[TaskInputs] || []).some((n) => n == nodeName)) {
                            childrenNames.push(t);
                          }
                        });
                        childrenNames.forEach((t) => {
                          const pNodes = getNodeByName(model, childType + "." + t);
                          if (pNodes.length == 1) {
                            model.addLink(port.link(pNodes[0].getPort(InPortName) as DefaultPortModel));
                          }
                        });
                      }
                    }
                  }
                  model.removeNode(oldNodes[0]);
                  model.addNode(node);

                  oldToml.current = toml;
                  return;
                }
              }
            }
          }
        }
      }
    }

    oldToml.current = toml;
    oldPerspId.current = perspectiveId;

    const linkModels: DefaultLinkModel[] = [];
    const nodeModels: Record<string, DefaultNodeModel> = {};

    Object.keys(toml).forEach((nodeType, tIdx) => {
      if (nodeType == "TAIPY" || nodeType == "JOB") {
        return;
      }
      Object.keys(toml[nodeType]).forEach((key, nIdx) => {
        if (key == "default") {
          return;
        }
        const name = `${nodeType}.${key}`;
        const node = new DefaultNodeModel({
          name: name,
          color: getNodeColor(nodeType),
        });
        
        node.setPosition(150, 100 + 100 * tIdx + 10 * nIdx);
        node.addInPort(InPortName);
        node.addOutPort(OutPortName);
        node.registerListener(nodeListener);
        nodeModels[name] = node;
      });
    });

    // create links Tasks-DataNodes, Pipeline-Tasks, Scenario-Pipelines
    const nodeTypes = [Task, Pipeline, Scenario];
    Object.entries(nodeModels).forEach(([key, nodeModel]) => {
      nodeTypes
        .filter((nt) => key.startsWith(nt + "."))
        .forEach((nodeType) => {
          const parentNode = toml[nodeType][key.split(".", 2)[1]];
          const childType = getChildType(nodeType);
          if (childType) {
            const descendants = getDescendants(nodeType);
            if (descendants[0]) {
              (parentNode[descendants[0]] || []).forEach((dnKey: string) => {
                const node = nodeModels[childType + "." + dnKey];
                if (node) {
                  linkModels.push((node.getPort(OutPortName) as DefaultPortModel).link<DefaultLinkModel>(nodeModel.getPort(InPortName) as DefaultPortModel));
                }
              });
            }
            if (descendants[1]) {
              (parentNode[descendants[1]] || []).forEach((dnKey: string) => {
                const node = nodeModels[childType + "." + dnKey];
                if (node) {
                  linkModels.push((nodeModel.getPort(OutPortName) as DefaultPortModel).link<DefaultLinkModel>(node.getPort(InPortName) as DefaultPortModel));
                }
              });
            }
          }
        });
    });

    const dModel = new DiagramModel();
    dModel.addAll(...Object.values(nodeModels), ...linkModels);
    setModel(dModel);

    if (positions && Object.keys(positions).length) {
      dModel.getNodes().forEach((node) => {
        const dNode = node as DefaultNodeModel;
        const nodeName = dNode.getOptions().name;
        if (nodeName) {
          const pos = positions[nodeName];
          if (pos && Array.isArray(pos[0])) {
            dNode.setPosition(pos[0][0], pos[0][1]);
          }
        }
      });
      dModel.getLinks().forEach((link) => {
        const linkName = getLinkName(link);
        if (linkName) {
          const pos = positions[linkName];
          if (pos) {
            link.setPoints(pos.map((p) => link.point(p[0], p[1])));
          }
        }
      });
    } else {
      setTimeout(() => {
        relayout(undefined, dModel);
      }, 500);
    }
  }, [toml, positions]);

  engine.setModel(model);

  return (
    <div className="diagram-root">
      <div className="diagram-button icon" title="re-layout" onClick={relayout}>
        <i className="codicon codicon-layout"></i>
      </div>
      <div className="diagram-button icon" title="refresh" onClick={postRefreshMessage}>
        <i className="codicon codicon-refresh"></i>
      </div>
      <div>{perspectiveId != perspectiveRootId ? <h2>{perspectiveId}</h2> : ""}</div>
      <div onDrop={onDrop} className="diagram-widget">
        <CanvasWidget engine={engine} />
      </div>
    </div>
  );
};

export default Editor;
