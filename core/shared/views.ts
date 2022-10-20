import { DisplayModel } from "./diagram";

export const NoDetailsId = "NoDetails";
export interface NoDetailsProps {
  message: string;
}

export const DataNodeDetailsId = "DataNodeDetails";
export interface DataNodeDetailsProps {
  nodeType: string;
  nodeName: string;
  node: Record<string, string | string[]>;
}

export const ConfigEditorId = "ConfigEditor";

export interface ConfigEditorProps {
  displayModel: DisplayModel;
  perspectiveId: string;
  baseUri: string;
  extraEntities?: string;
  isDirty?: boolean;
}

export const perspectiveRootId = "__root__";

export const webviewsLibraryDir = "webviews";
export const webviewsLibraryName = "taipy-webviews.js";
export const containerId = "taipy-web-root";
