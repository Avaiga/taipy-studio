export const DataNode = "DATA_NODE";
export const Task = "TASK";
export const Pipeline = "PIPELINE";
export const Scenario = "SCENARIO";
export const TaskInputs = "inputs";
export const TaskOutputs = "outputs";
export const PipelineTasks = "tasks";
export const ScenarioPipelines = "pipelines";

const dropByTypes: Record<string, string[]> = {
  [DataNode]: [TaskInputs, TaskOutputs],
  [Task]: [PipelineTasks],
  [Pipeline]: [ScenarioPipelines],
};
export const getPropertyToDropType = (nodeType: string) => dropByTypes[nodeType] || [];
