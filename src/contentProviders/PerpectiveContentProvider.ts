import { CancellationToken, EventEmitter, ProviderResult, TextDocumentContentProvider, Uri, workspace } from "vscode";

import { perspectiveRootId } from "../../shared/views";

export const PerspectiveScheme = "taipy.perspective";
const OriginalSchemeKey = "originalscheme";
const perspectiveKey = "perspective";

export const getPerspectiveUri = (uri: Uri, perspectiveId: string): Uri =>
  uri || Uri.from({
    ...uri,
    scheme: PerspectiveScheme,
    query: OriginalSchemeKey + "=" + uri.scheme + "&" + perspectiveKey + "=" + perspectiveId + (uri.query ? "&" + uri.query : ""),
  });

const getOriginalScheme = (uri: Uri) =>
  uri.query
    .split("&")
    .find((p) => p.startsWith(OriginalSchemeKey + "="))
    ?.split("=")[1] || "file";

export const getOriginalUri = (uri: Uri): Uri => {
  if (uri.scheme == PerspectiveScheme) {
    const query = uri.query
      .split("&")
      .filter((p) => !p.startsWith(OriginalSchemeKey + "=") && !p.startsWith(perspectiveKey + "="))
      .join("&");
    return Uri.from({ ...uri, scheme: getOriginalScheme(uri), query: query });
  }
  return uri;
};

export const isUriEqual = (uri: Uri, otherUri?: Uri): boolean => {
  if (uri && otherUri) {
    return uri.scheme == otherUri.scheme ? uri.toString() == otherUri.toString() : getOriginalUri(uri).toString() == getOriginalUri(otherUri).toString();
  }
  return false;
}
  
export const getPerspectiveFromUri = (uri: Uri): string =>
  uri.scheme == PerspectiveScheme
    ? uri.query
        .split("&")
        .find((p) => p.startsWith(perspectiveKey + "="))
        ?.split("=")[1]
    : perspectiveRootId;

export class PerspectiveContentProvider implements TextDocumentContentProvider {
  onDidChangeEmitter = new EventEmitter<Uri>();
  onDidChange = this.onDidChangeEmitter.event;

  provideTextDocumentContent(uri: Uri, token: CancellationToken): ProviderResult<string> {
    return new Promise<string>((resolve) => workspace.openTextDocument(getOriginalUri(uri)).then((doc) => resolve(doc.getText())));
  }
}
