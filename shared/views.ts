import { Positions } from "./messages";

export const NoDetailsId = "NoDetails";
export interface NoDetailsProps {
  message: string;
}

export const DataNodeDetailsId = "DataNodeDetails";
export interface DataNodeDetailsProps {
  nodeType: string;
  name: string;
  node: NodeType;
}

export const ConfigEditorId = "ConfigEditor";
export interface ConfigEditorProps {
  toml: any;
  perspectiveId: string;
  positions: Positions;
  baseUri: string;
  extraEntities: Array<[string, string]>;
}

export type NodeType = Record<string, string |string[]>;

export const perspectiveRootId = "__root__";

export const webviewsLibraryDir = "webviews";
export const webviewsLibraryName = "taipy-webviews.js";
export const containerId = "taipy-web-root";
