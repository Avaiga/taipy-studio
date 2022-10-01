import { DataNode, Pipeline, Scenario, Task } from "../../../shared/names";

export const getNodeColor = (nodeType: string) => {
    switch (nodeType) {
      case DataNode:
        if (window.taipyConfig?.colors?.datanode) {
          return window.taipyConfig.colors.datanode;
        }
        break;
      case Task:
        if (window.taipyConfig?.colors?.task) {
          return window.taipyConfig.colors.task;
        }
        break;
      case Pipeline:
        if (window.taipyConfig?.colors?.pipeline) {
          return window.taipyConfig.colors.pipeline;
        }
        break;
      case Scenario:
        if (window.taipyConfig?.colors?.scenario) {
          return window.taipyConfig.colors.scenario;
        }
        break;
    }
    return "pink";
  };