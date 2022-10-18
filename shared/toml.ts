import { DataNode, Pipeline, Scenario, Task } from "./names";

const childType: Record<string, string> = {
  [Task]: DataNode,
  [Pipeline]: Task,
  [Scenario]: Pipeline,
};
export const getChildType = (nodeType: string) => childType[nodeType] || "";
