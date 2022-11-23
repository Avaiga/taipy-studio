import { l10n, Uri, Webview } from "vscode";

export const getNonce = () => {
  const crypto = require("crypto");
  return crypto?.randomBytes(16).toString("base64");
};

export const configFileExt = ".toml";
export const configFilePattern = `**/*${configFileExt}`;

export const getCspScriptSrc = (nonce: string) => {
  return "'nonce-" + nonce + "'" + (process.env.NODE_ENV == "development" ? " 'unsafe-eval'" : "");
};

export const textUriListMime = "text/uri-list";

export const joinPaths = (extensionUri: Uri, ...pathSegments: string[]): Uri => Uri.joinPath(extensionUri, "dist", ...pathSegments);

export const getDefaultConfig = (webview: Webview, extensionUri: Uri) => {
  const bundleName = l10n.uri && l10n.uri.path.split("/").at(-1);
  return { icons: {}, l10nUri: bundleName && webview.asWebviewUri(joinPaths(extensionUri, "l10n", bundleName)).toString() };
};
