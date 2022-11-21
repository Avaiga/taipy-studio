import {
  Action,
  CreateLink,
  CreateNode,
  DeleteLink,
  GetNodeName,
  SaveAsPngUrl,
  Refresh,
  RemoveExtraEntities,
  RemoveNode,
  SaveDocument,
  SetExtraEntities,
  SetPositions,
  UpdateExtraEntities,
  EditProperty,
} from "../../../shared/commands";
import { Positions } from "../../../shared/diagram";

type vscodeApiRet = { postMessage: (pl: Record<string, unknown>) => void };

declare global {
  interface Window {
    acquireVsCodeApi: () => vscodeApiRet;
    __webpack_nonce__: string;
  }
}

let vsCodeApi: vscodeApiRet;

export const getVsCodeApi = () => {
  if (!vsCodeApi) {
    vsCodeApi = window.acquireVsCodeApi();
  }
  return vsCodeApi;
};

export const postActionMessage = (id: string, msg?: string, command = Action) => getVsCodeApi()?.postMessage({ command, id, msg });
export const postRefreshMessage = () => getVsCodeApi()?.postMessage({ command: Refresh });
export const postPositionsMessage = (positions: Positions) => getVsCodeApi()?.postMessage({ command: SetPositions, positions });
export const postNodeCreation = (nodeType: string, nodeName: string) => getVsCodeApi()?.postMessage({ command: CreateNode, nodeType, nodeName });
export const postNodeRemoval = (nodeType: string, nodeName: string) => getVsCodeApi()?.postMessage({ command: RemoveNode, nodeType, nodeName });
export const postLinkCreation = (sourceType: string, sourceName: string, targetType: string, targetName: string) =>
  getVsCodeApi()?.postMessage({ command: CreateLink, sourceType, sourceName, targetType, targetName });
export const postLinkDeletion = (sourceType: string, sourceName: string, targetType: string, targetName: string) =>
  getVsCodeApi()?.postMessage({ command: DeleteLink, sourceType, sourceName, targetType, targetName });
export const postGetNodeName = (nodeType: string) => getVsCodeApi()?.postMessage({ command: GetNodeName, nodeType });
export const postSetExtraEntities = (extraEntities: string) => getVsCodeApi()?.postMessage({ command: SetExtraEntities, extraEntities });
export const postUpdateExtraEntities = (extraEntities: string) => getVsCodeApi()?.postMessage({ command: UpdateExtraEntities, extraEntities });
export const postRemoveExtraEntities = (extraEntities: string) => getVsCodeApi()?.postMessage({ command: RemoveExtraEntities, extraEntities });
export const postSaveMessage = () => getVsCodeApi()?.postMessage({ command: SaveDocument });
export const postSaveAsPngUrl = (pngAsUrl: string) => getVsCodeApi()?.postMessage({ command: SaveAsPngUrl, url: pngAsUrl });
export const postEditProperty = (nodeType: string, nodeName: string, propertyName?: string, propertyValue?: string | string[]) => getVsCodeApi()?.postMessage({ command: EditProperty, nodeType, nodeName, propertyName, propertyValue });
