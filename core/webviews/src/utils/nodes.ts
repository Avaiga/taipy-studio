import { DisplayModel, Link, Nodes } from "../../../shared/diagram";
import { DataNode, Scenario } from "../../../shared/names";
import { getChildType } from "../../../shared/childtype";
import { perspectiveRootId } from "../../../shared/views";

const applyNode = (displayModel: DisplayModel, nodeType: string, nodeName: string) => {
  if (!displayModel.nodes || !Array.isArray(displayModel.links)) {
    return displayModel;
  }
  const nodes = {} as Nodes;
  const links = [] as Link[];
  const queue: Array<[string, string, boolean]> = [];
  const doneNodes: Set<string> = new Set();
  const modelLinks = [...displayModel.links];
  let follow = true;
  while (true) {
    if (!nodeType || !nodeName) {
      break;
    }
    if (!doneNodes.has(`${nodeType}.${nodeName}`)) {
      doneNodes.add(`${nodeType}.${nodeName}`);
      const node = displayModel.nodes[nodeType] && displayModel.nodes[nodeType][nodeName];
      if (node) {
        nodes[nodeType] = nodes[nodeType] || {};
        nodes[nodeType][nodeName] = node;
        if (!follow) {
          continue;
        }
        const foundLinks = [] as number[];
        modelLinks.forEach((link, idx) => {
          const [[sourceType, sourceName, targetType, targetName], _] = link;
          if (sourceType === nodeType && sourceName === nodeName) {
            queue.push([targetType, targetName, DataNode !== targetType]);
            links.push(link);
            foundLinks.push(idx);
          } else if (sourceType === DataNode && targetType === nodeType && targetName === nodeName) {
            queue.push([sourceType, sourceName, false]);
            links.push(link);
            foundLinks.push(idx);
          }
        });
        foundLinks.sort().reverse().forEach(idx => modelLinks.splice(idx, 1));
      }
    }
    [nodeType, nodeName, follow] = queue.shift() || ["", "", false];
  }
  return { nodes, links };
};

export const applyPerspective = (displayModel: DisplayModel, perspectiveId: string, extraEntities?: string): [any, string | undefined] => {
  if (!displayModel || perspectiveId === perspectiveRootId) {
    return [displayModel, undefined];
  }
  const appliedEntities: string[] = [];
  const [nodeType, nodeName] = perspectiveId.split(".");
  const res = applyNode(displayModel, nodeType, nodeName);
  delete res.nodes[perspectiveId.split(".")[0]];
  extraEntities &&
    extraEntities.split(";").forEach((e) => {
      const [nt, nn] = e.split(".", 2);
      if (nt && nn && !(res.nodes[nt] && res.nodes[nt][nn])) {
        appliedEntities.push(e);
        const nodeRes = applyNode(displayModel, nt, nn);
        Object.entries(nodeRes.nodes).forEach(([t, e]) => {
          if (!res.nodes[t]) {
            res.nodes[t] = e;
          } else {
            Object.entries(e).forEach(([n, d]) => res.nodes[t][n] = d);
          }
        });
        res.links.push(...nodeRes.links);
      }
    });
  return [res, appliedEntities.length ? appliedEntities.join(";") : undefined];
};

export const getNodeTypes = (perspectiveId: string) => {
  const [nodeType, name] = perspectiveId.split(".", 2);
  let childType = name ? nodeType : Scenario;
  const res = name ? [] : [Scenario];
  while ((childType = getChildType(childType))) {
    res.push(childType);
  }
  return res.reverse();
};
