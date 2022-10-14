import { Action, CreateLink, CreateNode, DeleteLink, GetNodeName, Refresh, SetPositions } from "../../../shared/commands";
import { Positions } from "../../../shared/messages";

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
export const postLinkCreation = (nodeType: string, nodeName: string, property: string, targetName: string) =>
  getVsCodeApi()?.postMessage({ command: CreateLink, nodeType, nodeName, property, targetName });
export const postGetNodeName = (nodeType: string, nodeName: string) => getVsCodeApi()?.postMessage({ command: GetNodeName, nodeType, nodeName });
export const postLinkDeletion = (nodeType: string, nodeName: string, property: string, targetName: string) =>
  getVsCodeApi()?.postMessage({ command: DeleteLink, nodeType, nodeName, property, targetName });
