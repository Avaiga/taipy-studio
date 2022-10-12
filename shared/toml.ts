import { DataNode, Pipeline, PipelineTasks, Scenario, ScenarioPipelines, Task, TaskInputs, TaskOutputs } from "./names";

const childType: Record<string, string> = {
  [Task]: DataNode,
  [Pipeline]: Task,
  [Scenario]: Pipeline,
};
export const getChildType = (nodeType: string) => childType[nodeType] || "";

const descendants: Record<string, [string, string]> = {
  [Scenario]: ["", ScenarioPipelines],
  [Pipeline]: ["", PipelineTasks],
  [Task]: [TaskInputs, TaskOutputs],
};
export const getDescendants = (nodeType: string) => descendants[nodeType] || ["", ""];

const dropByTypes: Record<string, string[]> = {
  [DataNode]: [TaskInputs, TaskOutputs],
  [Task]: [PipelineTasks],
  [Pipeline]: [ScenarioPipelines],
};
export const getPropertyToDropType = (nodeType: string) => dropByTypes[nodeType] || [];

const defaultContents: Record<string, Record<string, string | string[]>> = {
  [DataNode]: { storage_type: "", scope: "", cacheable: "False:bool" },
  [Task]: { [TaskInputs]: [], [TaskOutputs]: [], function: "" },
  [Pipeline]: { [PipelineTasks]: [] },
  [Scenario]: { [ScenarioPipelines]: [] },
};
export const getDefaultContent = (nodeType: string, nodeName: string) => ({ [nodeType]: { [nodeName]: defaultContents[nodeType] || {} } });
