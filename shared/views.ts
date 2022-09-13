export const NoDetailsId = "NoDetails";
export interface NoDetailsProps {
    message: string;
}

export const DataNodeDetailsId = "DataNodeDetails";
export interface DataNodeDetailsProps {
    name:string;
    storage_type: string;
    scope:string;
}

export const webviewsLibraryDir = "webviews";
export const webviewsLibraryName = "taipy-webviews.js";
export const containerId = "taipy-web-root";