import { JsonMap, parse, stringify } from "@iarna/toml";
import {
  CancellationToken,
  commands,
  CustomTextEditorProvider,
  Disposable,
  ExtensionContext,
  Range,
  TextDocument,
  Uri,
  Webview,
  WebviewPanel,
  window,
  workspace,
  WorkspaceEdit,
} from "vscode";

import { ConfigEditorId, ConfigEditorProps, containerId, webviewsLibraryDir, webviewsLibraryName } from "../../shared/views";
import { Refresh, Select, SetPositions } from "../../shared/commands";
import { getCspScriptSrc, getNonce } from "../utils";
import { Positions, ViewMessage } from "../../shared/messages";
import { revealConfigNodeCmd, showPerspectiveEditorCmd } from "../commands";
import { getOriginalUri, getPerspectiveFromUri } from "../contentProviders/PerpectiveContentProvider";

interface EditorCache {
  positions: Positions;
  [key: string]: unknown;
}
interface ProviderCache {
  [key: string]: EditorCache;
}
export class ConfigEditorProvider implements CustomTextEditorProvider {
  public static register(context: ExtensionContext): Disposable {
    const provider = new ConfigEditorProvider(context, context.extensionUri);
    const providerRegistration = window.registerCustomEditorProvider(ConfigEditorProvider.viewType, provider);
    commands.registerCommand("taipy.clearConfigCache", provider.clearCache, provider);
    commands.registerCommand(showPerspectiveEditorCmd, provider.showPerspective, provider);

    return providerRegistration;
  }

  private static readonly cacheName = "taipy.editor.cache.";
  static readonly viewType = "taipy.config.editor.diagram";

  private readonly extensionPath: Uri;
  private readonly vsContext: ExtensionContext;
  private cache: ProviderCache;
  private tomlByUri: Record<string, JsonMap> = {};
  private panelsByUri: Record<string, WebviewPanel[]> = {};

  constructor(private readonly context: ExtensionContext, private readonly uri: Uri) {
    this.vsContext = context;
    this.extensionPath = context.extensionUri;
    this.cache = context.workspaceState.get(ConfigEditorProvider.cacheName, {} as ProviderCache);
  }

  clearCache() {
    this.cache = {};
    this.vsContext.workspaceState.update(ConfigEditorProvider.cacheName, this.cache);
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
      console.error("Could not get document as toml. Content is not valid toml", e);
      throw new Error("Could not get document as toml. Content is not valid toml");
    }
  }

  private getToml(uri: string) {
    return this.tomlByUri[uri] || {};
  }

  private async updateWebview(uri: Uri) {
    console.log("updateWebview", uri.scheme, uri.query);
    const uriStr = uri.toString();
    const originalUri = getOriginalUri(uri).toString();
    const panels = this.panelsByUri[uriStr];
    if (panels) {
      const perspectiveId = getPerspectiveFromUri(uri);
      console.log("updateWebview: perspectiveId", perspectiveId);
      const positions = this.getCache(uriStr).positions;
      const toml = this.getToml(originalUri);
      panels.forEach((p) =>
        p.webview.postMessage({
          viewId: ConfigEditorId,
          props: { toml: toml, perspectiveId: perspectiveId, positions: positions } as ConfigEditorProps,
        } as ViewMessage)
      );
    }
  }

  private showPerspective(uri: Uri, nodeType: string, nodeName: string) {
    this.updateWebview(uri);
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
    const uri = document.uri.toString();
    let panels = this.panelsByUri[uri];
    if (!panels) {
      panels = [];
      this.panelsByUri[uri] = panels;
    }
    panels.push(webviewPanel);
    webviewPanel.onDidDispose(() => this.panelsByUri[uri] || (this.panelsByUri[uri] = this.panelsByUri[uri].filter(p => p !== webviewPanel)));
    webviewPanel.webview.html = this.getHtmlForWebview(webviewPanel.webview);

    // Hook up event handlers so that we can synchronize the webview with the text document.
    //
    // The text document acts as our model, so we have to sync change in the document to our
    // editor and sync changes in the editor back to the document.
    //
    // Remember that a single text document can also be shared between multiple custom
    // editors (this happens for example when you split a custom editor)

    const changeDocumentSubscription = workspace.onDidChangeTextDocument((e) => {
      if (e.document.uri.toString() === uri) {
        this.setToml(document);
        this.updateWebview(document.uri);
      }
    }, this);

    // Receive message from the webview.
    const receiveMessageSubscription = webviewPanel.webview.onDidReceiveMessage((e) => {
      //console.log("onDidReceiveMessage", e);
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

    // Make sure we get rid of the listener when our editor is closed.
    webviewPanel.onDidDispose(() => {
      document.isClosed && changeDocumentSubscription.dispose();
      receiveMessageSubscription.dispose();
    });
  }

  private async setPositions(docUri: Uri, positions: Positions) {
    let modified = false;
    const id = getPerspectiveFromUri(docUri);
    let pos = this.setPositionsCache(docUri.toString());
    if (positions) {
      pos = Object.keys(positions).reduce((pv, cv) => {
        modified = true;
        pv[cv] = positions[cv];
        return pv;
      }, pos);
    }
    if (modified) {
      await this.context.workspaceState.update(ConfigEditorProvider.cacheName, this.cache);
    }
  }

  private joinPaths(...pathSegments: string[]): Uri {
    // TODO remove dist from production ?
    return Uri.joinPath(this.extensionPath, "dist", ...pathSegments);
  }

  private getHtmlForWebview(webview: Webview) {
    // Get the local path to main script run in the webview, then convert it to a uri we can use in the webview.
    // Script to handle user action
    const scriptUri = webview.asWebviewUri(this.joinPaths(webviewsLibraryDir, webviewsLibraryName));
    // CSS file to handle styling
    const styleUri = webview.asWebviewUri(this.joinPaths(webviewsLibraryDir, "config-editor.css"));

    const codiconsUri = webview.asWebviewUri(this.joinPaths("@vscode/codicons", "dist", "codicon.css"));

    const config = workspace.getConfiguration("taipyStudio");
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
