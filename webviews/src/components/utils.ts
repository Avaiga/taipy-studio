type vscodeApiRet = {postMessage: (pl: Record<string, unknown>) => void}

declare global {
    interface Window {
        acquireVsCodeApi: () => vscodeApiRet;
        VS_NONCE: string;
        __webpack_nonce__: string;
    }
}

let vsCodeApi: vscodeApiRet;

export const getVsCodeApi = () => {
    if (!vsCodeApi) {
        vsCodeApi = window.acquireVsCodeApi();
    }
    return vsCodeApi;
}

export const postActionMessage = (id: string, msg?: string, command = "action") => getVsCodeApi()?.postMessage({command: command, id: id, msg: msg});
export const postRefreshMessage = () => getVsCodeApi()?.postMessage({command: "refresh"});
