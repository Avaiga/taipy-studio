import { useEffect, useRef, useState } from "react";
import createEngine, {
  DefaultNodeModel,
  DefaultLinkModel,
  DiagramModel,
  DagreEngine,
  PathFindingLinkFactory,
  DefaultPortModel,
  DefaultNodeModelOptions,
  NodeModelListener,
} from "@projectstorm/react-diagrams";
import { CanvasWidget } from "@projectstorm/react-canvas-core";
import * as deepEqual from "fast-deep-equal";
import { getDiff } from "recursive-diff";

import { ConfigEditorProps } from "../../../shared/views";
import { postActionMessage } from "./utils";
import { DataNode, Pipeline, Scenario, Task, TaskInputs, TaskOutputs } from "../../../shared/names";

const InPortName = "In";
const OutPortName = "Out";

const getNodeColor = (nodeType: string) => {
  switch (nodeType) {
    case DataNode:
      return "red";
    case Pipeline:
      return "purple";
    case Scenario:
      return "blue";
    case Task:
      return "green";
    default:
      return "pink";
  }
};

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

const getDescendants = (nodeType: string) => {
  switch (nodeType) {
    case Scenario:
      return ["", "pipelines"];
    case Pipeline:
      return ["", "tasks"];
    case Task:
      return [TaskInputs, TaskOutputs];
  }
  return ["", ""];
};
const getNodeByName = (model: DiagramModel, name: string) => model.getNodes().filter((n) => (n.getOptions() as DefaultNodeModelOptions).name == name);
const getParentType = (nodeType: string) => {
  switch (nodeType) {
    case DataNode:
      return Task;
    case Task:
      return Pipeline;
    case Pipeline:
      return Scenario;
  }
  return "";
};
const getChildType = (nodeType: string) => {
  switch (nodeType) {
    case Task:
      return DataNode;
    case Pipeline:
      return Task;
    case Scenario:
      return Pipeline;
  }
  return "";
};
const getChildTypeWithBackLink = (nodeType: string) => (nodeType == DataNode ? Task : "");
const getChildrenNodes = (toml: any, parentType: string, filter?: string) => {
  const nodes = toml[parentType];
  if (nodes) {
    const parents = Object.keys(nodes);
    let childrenKey = "";
    switch (parentType) {
      case Task:
        childrenKey = "outputs";
        break;
      case Pipeline:
        childrenKey = "tasks";
        break;
      case Scenario:
        childrenKey = "pipelines";
        break;
    }
    const res = childrenKey
      ? parents.reduce((pv, cv) => {
          pv[cv] = nodes[cv][childrenKey];
          return pv;
        }, {} as any)
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

const getParentNames = (content: any, ...paths: string[]) => {
  if (paths.length && paths[0] == Task) {
    paths.push(TaskInputs);
    const node = paths.reduce((pv, cv) => {
      if (pv) {
        return pv[cv];
      }
    }, content);
    return ((node || []) as string[]).map((p) => DataNode + "." + p);
  }
  return [];
};

const fireNodeSelected = (name: string) => postActionMessage(name, undefined, "select");

const Editor = ({ toml }: ConfigEditorProps) => {
  const [model, setModel] = useState(new DiagramModel());
  const oldToml = useRef<Record<string, any>>();

  useEffect(() => {
    if (!toml || deepEqual(oldToml.current, toml)) {
      return;
    }
    if (toml && oldToml.current) {
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
                  node.registerListener({ selectionChanged: () => fireNodeSelected(diff[addI].path.join(".")) } as NodeModelListener);

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
                      parentNames.push(
                        ...Object.keys(nodes)
                          .filter((p) => nodes[p].length)
                          .map((p) => parentType + "." + p)
                      );
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
                      const children = toml[childType];
                      if (children) {
                        const childrenNames: string[] = [];
                        const nodeName = diff[addI].path[pathLen - 1] as string;
                        Object.keys(children).filter((t) => {
                          const inputs = ((children[t][TaskInputs] || []) as string[]).filter((n) => n == nodeName);
                          if (inputs.length) {
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
        node.registerListener({ selectionChanged: () => fireNodeSelected(name) } as NodeModelListener);
        nodeModels[name] = node;
      });
    });

    // create links Tasks-DataNodes, Pipeline-Tasks, Scenario-Pipelines
    const nodeTypes = [Task, Pipeline, Scenario];
    Object.keys(nodeModels).forEach((key) => {
      nodeTypes.forEach((nodeType) => {
        if (key.startsWith(nodeType + ".")) {
          const nameLen = nodeType.length + 1;
          const childType = getChildType(nodeType);
          if (childType) {
            const descendants = getDescendants(nodeType);
            if (descendants[0]) {
              (toml[nodeType][key.substring(nameLen)][descendants[0]] || []).forEach((dnKey: string) => {
                const node = nodeModels[childType + "." + dnKey];
                if (node) {
                  linkModels.push(
                    (node.getPort(OutPortName) as DefaultPortModel).link<DefaultLinkModel>(nodeModels[key].getPort(InPortName) as DefaultPortModel)
                  );
                }
              });
            }
            if (descendants[1]) {
              (toml[nodeType][key.substring(nameLen)][descendants[1]] || []).forEach((dnKey: string) => {
                const node = nodeModels[childType + "." + dnKey];
                if (node) {
                  linkModels.push(
                    (nodeModels[key].getPort(OutPortName) as DefaultPortModel).link<DefaultLinkModel>(node.getPort(InPortName) as DefaultPortModel)
                  );
                }
              });
            }
          }
        }
      });
    });

    const dModel = new DiagramModel();
    dModel.addAll(...Object.values(nodeModels), ...linkModels);
    setModel(dModel);

    setTimeout(() => {
      dagreEngine.redistribute(dModel);
      engine.getLinkFactories().getFactory<PathFindingLinkFactory>(PathFindingLinkFactory.NAME).calculateRoutingMatrix();
      engine.repaintCanvas();
    }, 500);
  }, [toml]);

  engine.setModel(model);

  return <CanvasWidget engine={engine} className="diagram-root" />;
};

export default Editor;