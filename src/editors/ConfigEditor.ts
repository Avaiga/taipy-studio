import { JsonMap, parse, stringify } from "@iarna/toml";
import {
  CancellationToken,
  commands,
  CustomTextEditorProvider,
  DataTransfer,
  Disposable,
  DocumentDropEdit,
  DocumentDropEditProvider,
  ExtensionContext,
  languages,
  Position,
  Range,
  TextDocument,
  Uri,
  Webview,
  WebviewPanel,
  window,
  workspace,
  WorkspaceEdit,
} from "vscode";

import { configFileExt, getCspScriptSrc, getNonce, textUriListMime } from "../utils";
import { revealConfigNodeCmd } from "../commands";
import { getNodeFromUri, getOriginalUri, getPerspectiveFromUri, isUriEqual } from "../contentProviders/PerpectiveContentProvider";
import { Refresh, Select, SetPositions } from "../../shared/commands";
import { Positions, ViewMessage } from "../../shared/messages";
import { getPropertyToDropType } from "../../shared/names";
import { ConfigEditorId, ConfigEditorProps, containerId, perspectiveRootId, webviewsLibraryDir, webviewsLibraryName } from "../../shared/views";
import { TaipyStudioSettingsName } from "../constants";

interface EditorCache {
  positions: Positions;
  [key: string]: unknown;
}
interface ProviderCache {
  [key: string]: EditorCache;
}

export class ConfigEditorProvider implements CustomTextEditorProvider, DocumentDropEditProvider {
  public static register(context: ExtensionContext): Disposable {
    const provider = new ConfigEditorProvider(context);
    const providerRegistration = window.registerCustomEditorProvider(ConfigEditorProvider.viewType, provider, {
      webviewOptions: { enableFindWidget: true },
    });
    commands.registerCommand("taipy.clearConfigCache", provider.clearCache, provider);

    return providerRegistration;
  }

  private static readonly cacheName = "taipy.editor.cache";
  static readonly viewType = "taipy.config.editor.diagram";

  private readonly extensionPath: Uri;
  private cache: ProviderCache;
  private tomlByUri: Record<string, JsonMap> = {};
  private panelsByUri: Record<string, WebviewPanel[]> = {};

  constructor(private readonly context: ExtensionContext) {
    this.extensionPath = context.extensionUri;
    this.cache = context.workspaceState.get(ConfigEditorProvider.cacheName, {} as ProviderCache);
    context.subscriptions.push(languages.registerDocumentDropEditProvider({ pattern: "**/*" + configFileExt }, this));
  }

  async provideDocumentDropEdits(document: TextDocument, position: Position, dataTransfer: DataTransfer, token: CancellationToken): Promise<DocumentDropEdit | undefined> {
    const enabled = workspace.getConfiguration(TaipyStudioSettingsName, document).get("editor.drop.enabled", true);
    if (!enabled) {
      return undefined;
    }

    if (!dataTransfer || token.isCancellationRequested) {
      return undefined;
    }
    const urlList = await dataTransfer.get(textUriListMime)?.asString();
    if (!urlList) {
      return undefined;
    }
    const uris: Uri[] = [];
    urlList.split("\n").forEach((u) => {
      try {
        u && uris.push(Uri.parse(u, true));
      } catch {
        console.warn("provideDocumentDropEdits: Cannot parse ", u);
      }
    });
    if (!uris.length) {
      return undefined;
    }
    const dropEdit = new DocumentDropEdit("");
    if (isUriEqual(uris[0], document.uri)) {
      // TODO handle multi-uris case (but you can't drag more than one treeItem ...)
      const [nodeType, nodeName] = getPerspectiveFromUri(uris[0]).split(".", 2);
      const properties = getPropertyToDropType(nodeType);
      if (nodeName) {
        const line = document.lineAt(position.line);
        const lineProperty = line.text.split("=", 2)[0];
        if (properties.some((p) => p == lineProperty.trim())) {
          const endPos = line.text.lastIndexOf("]");
          const startPos = line.text.indexOf("[", lineProperty.length + 1);
          if (position.character <= endPos && position.character > startPos) {
            const lastChar = line.text.substring(0, position.character).trim().at(-1);
            if (lastChar == '"' || lastChar == "'" || lastChar == "[" || lastChar == ",") {
              dropEdit.insertText = (lastChar == '"' || lastChar == "'" ? ", " : "") + '"' + nodeName + '"' + (lastChar == "," ? ", " : "");
            }
          }
        }
      }
    } else {
      const node = getNodeFromUri(uris[0]);
      if (node) {
        const lines: string[] = ["", "[" + getPerspectiveFromUri(uris[0]) + "]"];
        node.split("\n").forEach((l) => lines.push(l && "\t" + l));
        dropEdit.insertText = lines.join("\n");
      }
    }
    return dropEdit;
  }

  clearCache() {
    this.cache = {};
    this.context.workspaceState.update(ConfigEditorProvider.cacheName, this.cache);
  }

  private getCache(docUri: string): EditorCache {
    return this.cache[docUri] || { positions: {} };
  }

  private setPositionsCache(docUri: string): Positions {
    this.cache[docUri] = this.cache[docUri] || { positions: {} };
    return this.cache[docUri].positions;
  }

  private setToml(document: TextDocument) {
    try {
      this.tomlByUri[getOriginalUri(document.uri).toString()] = this.getDocumentAsToml(document);
    } catch (e) {
      console.error("Could not get document as toml. Content is not valid toml");
      //      throw new Error("Could not get document as toml. Content is not valid toml");
    }
  }

  private getToml(uri: string) {
    return this.tomlByUri[uri] || {};
  }

  private async updateWebview(uri: Uri) {
    const uriStr = uri.toString();
    const originalUri = getOriginalUri(uri).toString();
    const panels = this.panelsByUri[originalUri];
    if (panels) {
      const perspectiveId = getPerspectiveFromUri(uri);
      const positions = this.getCache(uriStr).positions;
      const toml = this.getToml(originalUri);
      const panelsToRemove: number[] = [];
      panels.forEach((p, idx) => {
        try {
          p.webview.postMessage({
            viewId: ConfigEditorId,
            props: { toml: toml, perspectiveId: perspectiveId, positions: positions } as ConfigEditorProps,
          } as ViewMessage);
        } catch (e) {
          console.log("Looks like this panelView was disposed.", e.message || e);
          panelsToRemove.push(idx);
        }
      });
      panelsToRemove.reverse().forEach(idx => this.panelsByUri[originalUri].splice(idx));
    }
  }

  /**
   * Called when our custom editor is opened.
   *
   *
   */
  public async resolveCustomTextEditor(document: TextDocument, webviewPanel: WebviewPanel, token: CancellationToken): Promise<void> {
    // Setup initial content for the webview
    webviewPanel.webview.options = {
      enableScripts: true,
    };
    this.setToml(document);
    const originalUri = getOriginalUri(document.uri).toString();
    let panels = this.panelsByUri[originalUri];
    if (!panels) {
      panels = [];
      this.panelsByUri[originalUri] = panels;
    }
    panels.push(webviewPanel);
    webviewPanel.webview.html = this.getHtmlForWebview(webviewPanel.webview, document);

    // Hook up event handlers so that we can synchronize the webview with the text document.
    //
    // The text document acts as our model, so we have to sync change in the document to our
    // editor and sync changes in the editor back to the document.
    //
    // Remember that a single text document can also be shared between multiple custom
    // editors (this happens for example when you split a custom editor)

    const changeDocumentSubscription = workspace.onDidChangeTextDocument((e) => {
      if (isUriEqual(document.uri, e.document.uri)) {
        this.setToml(e.document);
        this.updateWebview(document.uri);
      }
    }, this);

    // Receive message from the webview.
    const receiveMessageSubscription = webviewPanel.webview.onDidReceiveMessage((e) => {
      switch (e.command) {
        case Select:
          this.revealSection(document.uri, e.id, e.msg);
          return;
        case Refresh:
          this.updateWebview(document.uri);
          break;
        case SetPositions:
          this.setPositions(document.uri, e.positions);
          break;
      }
    }, this);

    // clean-up when our editor is closed.
    webviewPanel.onDidDispose(() => {
      this.panelsByUri[originalUri] || (this.panelsByUri[originalUri] = this.panelsByUri[originalUri].filter((p) => p !== webviewPanel));
      document.isClosed && changeDocumentSubscription.dispose();
      receiveMessageSubscription.dispose();
    });
  }

  private setPositions(docUri: Uri, positions: Positions) {
    let modified = false;
    const id = getPerspectiveFromUri(docUri);
    let pos = this.setPositionsCache(docUri.toString());
    if (positions) {
      pos = Object.entries(positions).reduce((pv, [k, v]) => {
        modified = true;
        pv[k] = v;
        return pv;
      }, pos);
    }
    if (modified) {
      this.context.workspaceState.update(ConfigEditorProvider.cacheName, this.cache);
    }
  }

  private joinPaths(...pathSegments: string[]): Uri {
    // TODO remove dist from production ?
    return Uri.joinPath(this.extensionPath, "dist", ...pathSegments);
  }

  private getHtmlForWebview(webview: Webview, document: TextDocument) {
    // Get the local path to main script run in the webview, then convert it to a uri we can use in the webview.
    // Script to handle user action
    const scriptUri = webview.asWebviewUri(this.joinPaths(webviewsLibraryDir, webviewsLibraryName));
    // CSS file to handle styling
    const styleUri = webview.asWebviewUri(this.joinPaths(webviewsLibraryDir, "config-editor.css"));

    const codiconsUri = webview.asWebviewUri(this.joinPaths("@vscode/codicons", "dist", "codicon.css"));

    const config = workspace.getConfiguration(TaipyStudioSettingsName, document);
    const configObj = ["diagram.datanode.color", "diagram.task.color", "diagram.pipeline.color", "diagram.scenario.color"].reduce(
      (pv, cv) => {
        if (cv.endsWith(".color")) {
          pv.colors[cv.split(".")[1]] = config.get(cv, "cyan");
        }
        return pv;
      },
      { colors: {} }
    );

    // Use a nonce to only allow a specific script to be run.
    const nonce = getNonce();
    return `<html>
              <head>
                  <meta charSet="utf-8"/>
                  <meta http-equiv="Content-Security-Policy" 
                        content="default-src 'none';
                        img-src vscode-resource: https:;
                        font-src ${webview.cspSource};
                        style-src ${webview.cspSource} 'unsafe-inline';
                        script-src ${getCspScriptSrc(nonce)};">             
                  <meta name="viewport" content="width=device-width, initial-scale=1.0">
                  <link href="${styleUri}" rel="stylesheet" />
                  <link href="${codiconsUri}" rel="stylesheet" />
                  <script nonce="${nonce}" defer type="text/javascript" src="${scriptUri}"></script>
                  <script nonce="${nonce}" type="text/javascript">window.taipyConfig=${JSON.stringify(configObj)};</script>
              </head>
              <body>
                  <div id="${containerId}"></div>
              </body>
            </html>`;
  }

  /**
   * Try to get a current document as json text.
   */
  private getDocumentAsToml(document: TextDocument): JsonMap {
    const text = document.getText();
    if (text.trim().length === 0) {
      return {};
    }
    return parse(text);
  }

  /**
   * Write out the json to a given document.
   */
  private updateTextDocument(document: TextDocument, content: any) {
    const edit = new WorkspaceEdit();

    // Just replace the entire document every time for this example extension.
    // A more complete extension should compute minimal edits instead.
    edit.replace(document.uri, new Range(0, 0, document.lineCount, 0), stringify(content));

    return workspace.applyEdit(edit);
  }

  private revealSection(uri: Uri, nodeType: string, name: string) {
    commands.executeCommand(revealConfigNodeCmd, getOriginalUri(uri), nodeType, name);
  }
}
