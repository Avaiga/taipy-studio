import { DataNode, Pipeline, Scenario, Task } from "../../../shared/names";

const nodeColor: Record<string, string> = {
  [DataNode]: window.taipyConfig?.colors?.datanode,
  [Task]: window.taipyConfig?.colors?.task,
  [Pipeline]: window.taipyConfig?.colors?.pipeline,
  [Scenario]: window.taipyConfig?.colors?.scenario
}
export const getNodeColor = (nodeType: string) => nodeColor[nodeType] || "pink";

const nodeIcon: Record<string, string> = {
  [DataNode]: window.taipyConfig?.icons?.datanode,
  [Task]: window.taipyConfig?.icons?.task,
  [Pipeline]: window.taipyConfig?.icons?.pipeline,
  [Scenario]: window.taipyConfig?.icons?.scenario
}
export const getNodeIcon = (nodeType: string) => nodeIcon[nodeType];