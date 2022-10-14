import { DefaultPortModel } from "@projectstorm/react-diagrams";
import { getDiff } from "recursive-diff";

import { TaskInputs } from "../../../shared/names";
import { getParentType } from "../../../shared/toml";
import { TaipyDiagramModel, TaipyPortModel } from "../projectstorm/models";
import { createLink, createNode, getNodeByName, InPortName, OutPortName } from "./diagram";
import { getChildrenNodes, getChildTypeWithBackLink, getParentNames } from "./toml";

export const applySmallChanges = (model: TaipyDiagramModel, toml: any, oldToml: any) => {
  const diff = getDiff(oldToml.current, toml, true);
  if (diff.length != 2) {
    return false;
  }
  const ops = diff.map((d) => d.op);
  const delI = ops.indexOf("delete");
  const addI = ops.indexOf("add");
  if (delI == -1 || addI == -1) {
    return false;
  }
  const pathLen = diff[addI].path.length;
  if (pathLen != diff[delI].path.length || !diff[addI].path.slice(0, -1).every((p, i) => p == diff[delI].path[i])) {
    // only deal with last path changes
    return false;
  }
  if (diff[addI].path[pathLen - 1] == diff[delI].path[pathLen - 1]) {
    // Change in links
    return false;
  }
  // Change in name
  const oldNodes = getNodeByName(model, diff[delI].path as string[]);
  if (oldNodes.length != 1) {
    return false;
  }
  const [nodeType, ...parts] = diff[addI].path as string[];
  const name = parts.join(".");
  const node = createNode(nodeType, name, false);
  node.setPosition(oldNodes[0].getPosition());

  const inPort = oldNodes[0].getPort(InPortName);
  if (inPort) {
    const port = node.addPort(TaipyPortModel.createInPort());
    model.getLinkLayers().forEach(ll => Object.entries(ll.getLinks())
      .filter(([_, l]) => l.getTargetPort() === inPort)
      .forEach(([id]) => ll.removeModel(id)));
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
          model.addLink(createLink(pNodes[0].getPort(OutPortName) as TaipyPortModel, port));
        }
      });
    }
  }

  const outPort = oldNodes[0].getPort(OutPortName);
  if (outPort) {
    const port = node.addPort(TaipyPortModel.createOutPort());
    const childType = getChildTypeWithBackLink(nodeType);
    model.getLinkLayers().forEach(ll => Object.entries(ll.getLinks())
      .filter(([_, l]) => l.getSourcePort() === outPort)
      .forEach(([id, l]) => {
        if (childType) {
          ll.removeModel(id);
        } else {
          l.setSourcePort(port);
        }
      }));
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
  return true;
};
