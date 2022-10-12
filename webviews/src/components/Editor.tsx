import { DragEvent, MouseEvent, useCallback, useEffect, useRef, useState } from "react";
import {
  DefaultNodeModel,
  DefaultLinkModel,
  DagreEngine,
  PathFindingLinkFactory,
  DefaultPortModel,
  DefaultNodeModelOptions,
} from "@projectstorm/react-diagrams";
import { CanvasWidget } from "@projectstorm/react-canvas-core";
import * as deepEqual from "fast-deep-equal";
import { getDiff } from "recursive-diff";

import { ConfigEditorProps, perspectiveRootId } from "../../../shared/views";
import { postGetNodeName, postRefreshMessage } from "./postUtils";
import { applyPerspective, getChildTypeWithBackLink, getNodeTypes, getParentNames, getParentType } from "./tomlUtils";
import { Pipeline, PipelineTasks, Scenario, ScenarioPipelines, Task, TaskInputs, TaskOutputs } from "../../../shared/names";
import { EditorAddNodeMessage } from "../../../shared/messages";
import { getNodeIcon } from "./config";
import {
  cachePositions,
  createLink,
  createNode,
  diagramListener,
  getLinkId,
  getNewName,
  getNodeId,
  initEngine,
  InPortName,
  OutPortName,
  shouldOpenPerspective,
} from "./nodeUtils";
import { getChildType, getDescendants } from "../../../shared/toml";
import { TaipyDiagramModel, TaipyPortModel } from "../projectstorm/models";

const engine = initEngine();
const dagreEngine = new DagreEngine({
  graph: {
    rankdir: "LR",
    ranker: "longest-path",
    marginx: 25,
    marginy: 25,
  },
  includeLinks: true,
});

const getNodeByName = (model: TaipyDiagramModel, paths: string[]) => {
  const [nodeType, ...parts] = paths;
  const name = parts.join(".");
  return name ? model.getNodes().filter((n) => n.getType() == nodeType && (n.getOptions() as DefaultNodeModelOptions).name == name) : [];
};
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

const getVsCodeContext = (node: DefaultNodeModel, baseUri: string) =>
  '{"preventDefaultContextMenuItems": true' +
  (shouldOpenPerspective(node.getType()) ? ', "webviewSection": "taipy.node", "baseUri": "' + baseUri + '", "perspective": "' + getNodeId(node) + '"' : "") +
  "}";

const Editor = ({ toml, positions, perspectiveId, baseUri }: ConfigEditorProps) => {
  const [model, setModel] = useState(new TaipyDiagramModel());
  const oldToml = useRef<Record<string, any>>();
  const oldPerspId = useRef<string>();

  const relayout = useCallback(
    // @ts-ignore
    (evt: any, dModel?: TaipyDiagramModel) => {
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

  const onCreateNode = useCallback(
    (evt: MouseEvent<HTMLDivElement>) => {
      const nodeType = evt.currentTarget.dataset.nodeType;
      if (nodeType) {
        postGetNodeName(nodeType, getNewName(model, nodeType));
      }
    },
    [model]
  );

  useEffect(() => {
    // Manage Post Message reception
    const messageListener = (event: MessageEvent) => {
      if (event.data.editorMessage) {
        const message = event.data as EditorAddNodeMessage;
        let node = model.getNodes().find((n) => n.getType() == message.nodeType && (n as DefaultNodeModel).getOptions().name == message.nodeName);
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
      }
    };
    window.addEventListener("message", messageListener);
    return () => window.removeEventListener("message", messageListener);
  }, [model]);

  toml = applyPerspective(toml, perspectiveId);

  useEffect(() => {
    model.getNodes().forEach((node) => engine.getNodeElement(node).setAttribute("data-vscode-context", getVsCodeContext(node as DefaultNodeModel, baseUri)));
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
                const oldNodes = getNodeByName(model, diff[delI].path as string[]);
                if (oldNodes.length == 1) {
                  const [nodeType, ...parts] = diff[addI].path as string[];
                  const name = parts.join(".");
                  const node = createNode(nodeType, name, false);
                  node.setPosition(oldNodes[0].getPosition());

                  const inPort = oldNodes[0].getPort(InPortName);
                  if (inPort) {
                    const port = node.addPort(TaipyPortModel.createInPort());
                    model
                      .getLinks()
                      .filter((l) => l.getTargetPort() === inPort)
                      .forEach((l) => model.removeLink(l));
                    const parentType = getParentType(nodeType);
                    const parentNames = [];
                    if (parentType) {
                      const nodes = getChildrenNodes(toml, parentType, name);
                      if (nodes) {
                        parentNames.push(
                          ...Object.entries(nodes)
                            .filter(([_, node]) => node.length)
                            .map(([p]) => [parentType, p])
                        );
                      }
                    }
                    parentNames.push(...getParentNames(toml, nodeType, parts));
                    if (parentNames.length) {
                      parentNames.forEach((p) => {
                        const pNodes = getNodeByName(model, p);
                        if (pNodes.length == 1) {
                          model.addLink(createLink(pNodes[0].getPort(OutPortName) as DefaultPortModel, port));
                        }
                      });
                    }
                  }

                  const outPort = oldNodes[0].getPort(OutPortName);
                  if (outPort) {
                    const port = node.addPort(TaipyPortModel.createOutPort());
                    const childType = getChildTypeWithBackLink(nodeType);
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
                        Object.entries(children).forEach(([t, c]) => {
                          if ((c[TaskInputs] || []).some((n) => n == name)) {
                            childrenNames.push(t);
                          }
                        });
                        childrenNames.forEach((t) => {
                          const pNodes = getNodeByName(model, [childType, t]);
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

    const dModel = new TaipyDiagramModel();
    Object.values(nodeModels).forEach((nm) => dModel.addAll(...Object.values(nm)));
    dModel.addAll(...linkModels);
    dModel.registerListener(diagramListener);
    setModel(dModel);

    if (positions && Object.keys(positions).length) {
      dModel.getNodes().forEach((node) => {
        const dNode = node as DefaultNodeModel;
        const pos = positions[getNodeId(dNode)];
        if (pos && Array.isArray(pos[0])) {
          dNode.setPosition(pos[0][0], pos[0][1]);
        }
      });
      dModel.getLinks().forEach((link) => {
        const linkName = getLinkId(link);
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
  }, [toml, positions, baseUri]);

  engine.setModel(model);

  return (
    <div className="diagram-root">
      <div className="diagram-icon-group">
        <div className="diagram-button icon" title="re-layout" onClick={relayout}>
          <i className="codicon codicon-layout"></i>
        </div>
        <div className="diagram-button icon" title="refresh" onClick={postRefreshMessage}>
          <i className="codicon codicon-refresh"></i>
        </div>
      </div>
      <div>{perspectiveId != perspectiveRootId ? <h2>{perspectiveId}</h2> : ""}</div>
      <div className="diagram-icon-group">
        {getNodeTypes(perspectiveId).map((nodeType) => (
          <div className={"diagram-button icon " + nodeType.toLowerCase()} title={nodeType} key={nodeType} data-node-type={nodeType} onClick={onCreateNode}>
            <i className={"codicon codicon-" + getNodeIcon(nodeType)}></i>
          </div>
        ))}
      </div>
      <div onDrop={onDrop} className="diagram-widget">
        <CanvasWidget engine={engine} />
      </div>
    </div>
  );
};

export default Editor;
