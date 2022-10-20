import { DataNode, Pipeline, Scenario, Task } from "../../../shared/names";

const nodeColor: Record<string, string> = {
  [DataNode]: "var(--taipy-datanode-color)",
  [Task]: "var(--taipy-task-color)",
  [Pipeline]: "var(--taipy-pipeline-color)",
  [Scenario]: "var(--taipy-scenario-color)",
};
export const getNodeColor = (nodeType: string) => nodeColor[nodeType] || "pink";

const nodeIcon: Record<string, string> = {
  [DataNode]: window.taipyConfig?.icons?.datanode,
  [Task]: window.taipyConfig?.icons?.task,
  [Pipeline]: window.taipyConfig?.icons?.pipeline,
  [Scenario]: window.taipyConfig?.icons?.scenario,
};
export const getNodeIcon = (nodeType: string) => nodeIcon[nodeType];

export const nodeTypes = [DataNode, Pipeline, Scenario, Task];
