type vscodeApiRet = {postMessage: (pl: Record<string, unknown>) => void}

declare global {
    interface Window {
        acquireVsCodeApi: () => vscodeApiRet;
    }
}

let vscodeApi: vscodeApiRet;

export const getVsCodeApi = () => {
    if (!vscodeApi) {
        vscodeApi = window.acquireVsCodeApi();
    }
    return vscodeApi;
}

export const postActionMessage = (id: string, msg?: string) => getVsCodeApi()?.postMessage({command: "action", id: id, msg: msg});
