import { CancellationToken, EventEmitter, ProviderResult, TextDocument, TextDocumentContentProvider, Uri, workspace } from "vscode";

import { perspectiveRootId } from "../../shared/views";

export const PERSPECTIVE_SCHEME = "taipy-perspective";
const ORIGINAL_SCHEME_KEY = "taipy-originalscheme";
const PERSPECTIVE_KEY = "taipy-perspective";
const NODE_KEY = "taipy-node";
const schemeParams: Record<string, string[]> = {
  [PERSPECTIVE_SCHEME]: [ORIGINAL_SCHEME_KEY, PERSPECTIVE_KEY, NODE_KEY],
};

export const getCleanPerpsectiveUriString = (uri: Uri) => {
  if (!uri) {
    return "";
  }
  if (uri.scheme !== PERSPECTIVE_SCHEME) {
    uri = getPerspectiveUri(uri, perspectiveRootId);
  }
  return uri
    .with({
      query: uri.query
        ? uri.query
            .split("&")
            .filter((p) => !p.startsWith(NODE_KEY + "="))
            .join("&")
        : uri.query,
    })
    .toString();
};

export const getPerspectiveUri = (uri: Uri, perspectiveId: string, node?: string): Uri =>
  uri &&
  uri.with({
    scheme: PERSPECTIVE_SCHEME,
    query:
      ORIGINAL_SCHEME_KEY +
      "=" +
      getOriginalScheme(uri) +
      "&" +
      PERSPECTIVE_KEY +
      "=" +
      encodeURIComponent(perspectiveId) +
      (node ? "&" + NODE_KEY + "=" + encodeURIComponent(node) : "") +
      (uri.query ? "&" + uri.query : ""),
  });

const getOriginalScheme = (uri: Uri) =>
  (uri &&
    (uri.query
      .split("&")
      .find((p) => p.startsWith(ORIGINAL_SCHEME_KEY + "="))
      ?.split("=")[1] ||
      uri.scheme)) ||
  "file";

export const getOriginalUri = (uri: Uri): Uri => {
  if (uri) {
    const params = schemeParams[uri.scheme];
    if (params) {
      const query = uri.query
        .split("&")
        .filter((p) => !params.some((s) => p.startsWith(s + "=")))
        .join("&");
      return uri.with({ scheme: getOriginalScheme(uri), query: query });
    }
  }
  return uri;
};

export const isUriEqual = (uri: Uri, otherUri?: Uri): boolean => {
  if (uri && otherUri) {
    return uri.scheme === otherUri.scheme ? uri.toString() === otherUri.toString() : getOriginalUri(uri).toString() === getOriginalUri(otherUri).toString();
  }
  return false;
};

const getParamFromUri = (uri: Uri, name: string, defaultValue: string | undefined) => {
  const res =
    (uri &&
      Object.keys(schemeParams).some((s) => s === uri.scheme) &&
      uri.query
        .split("&")
        .find((p) => p.startsWith(name + "="))
        ?.split("=")[1]) ||
    undefined ||
    defaultValue;
  if (res) {
    return decodeURIComponent(res);
  }
  return res;
};

export const getPerspectiveFromUri = (uri: Uri): string => getParamFromUri(uri, PERSPECTIVE_KEY, perspectiveRootId);
export const getNodeFromUri = (uri: Uri): string | undefined => getParamFromUri(uri, NODE_KEY, undefined);

export const getOriginalDocument = (document: TextDocument): ProviderResult<TextDocument> => {
  if (document.uri.scheme === PERSPECTIVE_SCHEME) {
    return workspace.openTextDocument(getOriginalUri(document.uri));
  }
  return document;
};

export class PerspectiveContentProvider implements TextDocumentContentProvider {
  onDidChangeEmitter = new EventEmitter<Uri>();
  onDidChange = this.onDidChangeEmitter.event;

  provideTextDocumentContent(uri: Uri, token: CancellationToken): ProviderResult<string> {
    return uri.toString();
  }
}
