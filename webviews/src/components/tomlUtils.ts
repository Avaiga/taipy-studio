import { DataNode, Pipeline, PipelineTasks, Scenario, ScenarioPipelines, Task, TaskInputs, TaskOutputs } from "../../../shared/names";
import { perspectiveRootId } from "../../../shared/views";

const childType: Record<string, string> = {
  [Task]: DataNode,
  [Pipeline]: Task,
  [Scenario]: Pipeline,
};
export const getChildType = (nodeType: string) => childType[nodeType] || "";

export const getChildTypeWithBackLink = (nodeType: string) => (nodeType == DataNode ? Task : "");
const descendants: Record<string, [string, string]> = {
  [Scenario]: ["", ScenarioPipelines],
  [Pipeline]: ["", PipelineTasks],
  [Task]: [TaskInputs, TaskOutputs],
};
export const getDescendants = (nodeType: string) => descendants[nodeType] || ["", ""];
const parentType: Record<string, string> = {
  [DataNode]: Task,
  [Task]: Pipeline,
  [Pipeline]: Scenario,
};
export const getParentType = (nodeType: string) => parentType[nodeType] || "";
const getParentLinkKey = (nodeType: string) => (nodeType == Task ? TaskInputs : "");

export const getParentNames = (content: any, ...paths: string[]) => {
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
