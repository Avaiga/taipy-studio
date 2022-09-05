
declare global {
    interface Window {
        acquireVsCodeApi: () => unknown;
    }
}

let vscodeApi = null;

export const getVsCodeApi = () => {
    if (vscodeApi) {
        return vscodeApi;
    }
    vscodeApi = window.acquireVsCodeApi();
}

export const postActionMessage = (id: string, msg?: string) => getVsCodeApi().postMessage({command: "action", id: id, msg: msg});
