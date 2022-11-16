import { getDiff } from "recursive-diff";
import { DisplayModel } from "../../../shared/diagram";

import { TaipyDiagramModel, TaipyPortModel } from "../projectstorm/models";
import { createNode, getNodeByName, InPortName, OutPortName } from "./diagram";

export const applySmallChanges = (model: TaipyDiagramModel, displayModel: DisplayModel, oldDisplayModel?: DisplayModel) => {
  if (!oldDisplayModel) {
    return false;
  }
  const diff = getDiff(oldDisplayModel, displayModel, true);
  if (diff.length > 0) {
    // TODO Not Working right now ... Is it needed ?
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
  const oldNode = getNodeByName(model, diff[delI].path as string[]);
  if (!oldNode) {
    return false;
  }
  const [nodeType, ...parts] = diff[addI].path as string[];
  const name = parts.join(".");
  const node = createNode(nodeType, name, false);
  node.setPosition(oldNode.getPosition());

  const inPort = oldNode.getPort(InPortName);
  if (inPort) {
    const port = node.addPort(TaipyPortModel.createInPort());
    model.getLinkLayers().forEach((ll) =>
      Object.entries(ll.getLinks())
        .filter(([_, l]) => l.getTargetPort() === inPort)
        .forEach(([id]) => ll.removeModel(id))
    );
  }

  const outPort = oldNode.getPort(OutPortName);
  if (outPort) {
    const port = node.addPort(TaipyPortModel.createOutPort());
    model.getLinkLayers().forEach((ll) =>
      Object.entries(ll.getLinks())
        .filter(([_, l]) => l.getSourcePort() === outPort)
        .forEach(([_, l]) => {
          l.setSourcePort(port);
        })
    );
  }
  model.removeNode(oldNode);
  model.addNode(node);

  return true;
};
