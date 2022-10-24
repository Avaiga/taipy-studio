import { DisplayModel, Link, Nodes } from "../../../shared/diagram";
import { Scenario } from "../../../shared/names";
import { getChildType } from "../../../shared/toml";
import { perspectiveRootId } from "../../../shared/views";

const applyNode = (displayModel: DisplayModel, nodeType: string, nodeName: string) => {
  const nodes = {} as Nodes;
  const links = [] as Link[];
  if (!displayModel.nodes || !Array.isArray(displayModel.links)) {
    return displayModel;
  }
  const queue: Array<[string, string]> = [];
  const doneNodes: Set<string> = new Set();
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
        displayModel.links.forEach((link) => {
          const [[sourceType, sourceName, targetType, targetName], _] = link;
          if (sourceType == nodeType && sourceName == nodeName) {
            queue.push([targetType, targetName]);
            links.push(link);
          } else if (targetType == nodeType && targetName == nodeName) {
            queue.push([sourceType, sourceName]);
            links.push(link);
          }
        });
      }
    }
    [nodeType, nodeName] = queue.shift() || ["", ""];
  }
  return { nodes, links };
};

export const applyPerspective = (displayModel: DisplayModel, perspectiveId: string, extraEntities?: string): [any, string | undefined] => {
  if (displayModel && perspectiveId != perspectiveRootId) {
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
              Object.entries(e).forEach(([n, d]) => {
                if (!res.nodes[t][n]) {
                  res.nodes[t][n] = d;
                } else {
                  console.log("Issue applying node in perspective ...", t, n);
                }
              });
            }
          });
          res.links.push(...nodeRes.links);
        }
      });
    if (Object.keys(res.nodes).length) {
      return [res, appliedEntities.length ? appliedEntities.join(";") : undefined];
    }
  }
  return [displayModel, undefined];
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
