import { DataNode, Pipeline, PipelineTasks, Scenario, ScenarioPipelines, Task, TaskInputs, TaskOutputs } from "../../../shared/names";
import { getChildType, getDescendants } from "../../../shared/toml";
import { perspectiveRootId } from "../../../shared/views";

export const getChildTypeWithBackLink = (nodeType: string) => (nodeType == DataNode ? Task : "");
const parentType: Record<string, string> = {
  [DataNode]: Task,
  [Task]: Pipeline,
  [Pipeline]: Scenario,
};
export const getParentType = (nodeType: string) => parentType[nodeType] || "";
const getParentLinkKey = (nodeType: string) => (nodeType == Task ? TaskInputs : "");

export const getParentNames = (content: any, nodeType: string, names: string[]) => {
  if (nodeType == Task) {
    const node = [nodeType, names.join("."), TaskInputs].reduce((pv, cv) => {
      if (pv) {
        return pv[cv];
      }
    }, content);
    return ((node || []) as string[]).map((p) => [DataNode, p]);
  }
  return [];
};

export const applyPerspective = (toml: any, perspectiveId: string): any => {
  if (perspectiveId != perspectiveRootId) {
    let [nodeType, nodeName] = perspectiveId.split(".");
    const res: any = {};
    const queue: string[] = [];
    const doneNodes: Set<string> = new Set();
    while (true) {
      if (!nodeType || !nodeName) {
        break;
      }
      if (!doneNodes.has(nodeType + "." + nodeName)) {
        doneNodes.add(nodeType + "." + nodeName);
        const node = toml[nodeType] && toml[nodeType][nodeName];
        if (node) {
          res[nodeType] = res[nodeType] || {};
          res[nodeType][nodeName] = node;
          const childType = getChildType(nodeType);
          if (childType) {
            getDescendants(nodeType).forEach(
              (k) =>
                k &&
                node[k] &&
                (node[k] as string[]).forEach((n) => {
                  queue.push(childType + "." + n);
                })
            );
          }
          const childType2 = getChildTypeWithBackLink(nodeType);
          const linkKey = getParentLinkKey(childType2);
          if (childType2 && linkKey) {
            Object.keys(toml[childType2]).forEach((k) => {
              if (((toml[childType2][k][linkKey] || []) as string[]).some((n) => n == nodeName)) {
                queue.push(childType2 + "." + k);
              }
            });
          }
        }
      }
      [nodeType, nodeName] = (queue.shift() || "").split(".");
    }
    delete res[perspectiveId.split(".")[0]];
    if (Object.keys(res).length) {
      return res;
    }
  }
  return toml;
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

const childrenNodesKey: Record<string, string> = {
  [Task]: TaskOutputs,
  [Pipeline]: PipelineTasks,
  [Scenario]: ScenarioPipelines,
};

export const getChildrenNodes = (toml: any, parentType: string, filter?: string) => {
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
