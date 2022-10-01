import { DataNode, Pipeline, Scenario, Task, TaskInputs, TaskOutputs } from "../../../shared/names";
import { perspectiveRootId } from "../../../shared/views";

export const getChildType = (nodeType: string) => {
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

export const getChildTypeWithBackLink = (nodeType: string) => (nodeType == DataNode ? Task : "");

export const getDescendants = (nodeType: string) => {
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

export const getParentType = (nodeType: string) => {
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
