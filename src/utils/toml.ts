import { JsonMap } from "@iarna/toml";
import { TextDocument } from "vscode";
import { DisplayModel, Link, LinkName, Nodes, Positions } from "../../shared/diagram";
import { DataNode, Pipeline, Scenario, Task } from "../../shared/names";
import { getChildType } from "../../shared/toml";

const TaskInputs = "inputs";
const TaskOutputs = "outputs";
const PipelineTasks = "tasks";
const ScenarioPipelines = "pipelines";

const descendantProperties: Record<string, [string, string]> = {
  [Scenario]: ["", ScenarioPipelines],
  [Pipeline]: ["", PipelineTasks],
  [Task]: [TaskInputs, TaskOutputs],
};
export const getDescendantProperties = (nodeType: string) => descendantProperties[nodeType] || ["", ""];

const dropByTypes: Record<string, string[]> = {
  [DataNode]: [TaskInputs, TaskOutputs],
  [Task]: [PipelineTasks],
  [Pipeline]: [ScenarioPipelines],
};
export const getPropertyToDropType = (nodeType: string) => dropByTypes[nodeType] || [];

const parentType: Record<string, string> = {
  [DataNode]: Task,
  [Task]: Pipeline,
  [Pipeline]: Scenario,
};
export const getParentType = (nodeType: string) => parentType[nodeType] || "";

export const getPropertyValue = <T>(toml: any, defaultValue: T, ...names: string[]): [T, boolean] => {
  if (!toml) {
    return [defaultValue, false];
  }
  if (!names || names.length == 0) {
    return [toml, true];
  }
  const res = names.reduce((o, n) => (!o || Array.isArray(o) ? undefined : o[n]), toml);
  return res && Array.isArray(defaultValue) == Array.isArray(res) ? [res as T, true] : [defaultValue, false];
};

const supportedNodeTypes = {
  [DataNode.toLowerCase()]: true,
  [Task.toLowerCase()]: true,
  [Pipeline.toLowerCase()]: true,
  [Scenario.toLowerCase()]: true,
};
const ignoredNodeNames = {
  default: true,
};

export const toDisplayModel = (toml: any, positions?: Positions): DisplayModel => {
  const nodes = {} as Nodes;
  const links = [] as Link[];
  Object.entries(toml).forEach(([nodeType, e]) => {
    if (!supportedNodeTypes[nodeType.toLowerCase()]) {
      return;
    }
    nodes[nodeType] = {};
    const [inputProp, outputProp] = getDescendantProperties(nodeType);
    const childType = getChildType(nodeType);
    Object.entries(e).forEach(([nodeName, n]) => {
      if (ignoredNodeNames[nodeName.toLowerCase()]) {
        return;
      }
      nodes[nodeType][nodeName] = {};
      const nodeId = `${nodeType}.${nodeName}`;
      positions && positions[nodeId] && positions[nodeId].length && (nodes[nodeType][nodeName].position = positions[nodeId][0]);
      if (childType) {
        outputProp &&
          Array.isArray(n[outputProp]) &&
          n[outputProp].forEach((childName: string) => links.push(getLink([nodeType, nodeName, childType, childName] as LinkName, positions)));
        inputProp &&
          Array.isArray(n[inputProp]) &&
          n[inputProp].forEach((childName: string) => links.push(getLink([childType, childName, nodeType, nodeName] as LinkName, positions)));
      }
    });
  });
  return { nodes, links };
};

const getLink = (linkName: LinkName, positions?: Positions) => {
  const linkId = ["LINK", ...linkName].join(".");
  return [linkName, { positions: positions && positions[linkId] ? positions[linkId] : [] }] as Link;
};

const defaultContents: Record<string, Record<string, string | string[]>> = {
  [DataNode]: { storage_type: "", scope: "", cacheable: "False:bool" },
  [Task]: { [TaskInputs]: [], [TaskOutputs]: [], function: "" },
  [Pipeline]: { [PipelineTasks]: [] },
  [Scenario]: { [ScenarioPipelines]: [] },
};
export const getDefaultContent = (nodeType: string, nodeName: string) => ({ [nodeType]: { [nodeName]: defaultContents[nodeType] || {} } });
