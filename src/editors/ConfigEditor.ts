import { JsonMap, parse, stringify } from "@iarna/toml";
import {
  CancellationToken,
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

import {
  ConfigEditorId,
  containerId,
  webviewsLibraryDir,
  webviewsLibraryName,
} from "../../shared/views";
import { getCspScriptSrc, getNonce } from "../utils";

export class ConfigEditorProvider implements CustomTextEditorProvider {
  public static register(context: ExtensionContext): Disposable {
    const provider = new ConfigEditorProvider(context, context.extensionUri);
    const providerRegistration = window.registerCustomEditorProvider(
      ConfigEditorProvider.viewType,
      provider
    );
    return providerRegistration;
  }

  private static readonly viewType = "taipy.config.editor.diagram";

  private readonly extensionPath: Uri;

  constructor(
    private readonly context: ExtensionContext,
    private readonly uri: Uri
  ) {
    this.extensionPath = uri;
  }

  /**
   * Called when our custom editor is opened.
   *
   *
   */
  public async resolveCustomTextEditor(
    document: TextDocument,
    webviewPanel: WebviewPanel,
    _token: CancellationToken
  ): Promise<void> {
    // Setup initial content for the webview
    webviewPanel.webview.options = {
      enableScripts: true,
    };
    webviewPanel.webview.html = this.getHtmlForWebview(webviewPanel.webview);
    const self = this;
    const updateWebview = () => {
      webviewPanel.webview.postMessage({
        name: ConfigEditorId,
        props: {content: self.getDocumentAsToml(document)},
      });
    }

    // Hook up event handlers so that we can synchronize the webview with the text document.
    //
    // The text document acts as our model, so we have to sync change in the document to our
    // editor and sync changes in the editor back to the document.
    //
    // Remember that a single text document can also be shared between multiple custom
    // editors (this happens for example when you split a custom editor)

    const changeDocumentSubscription = workspace.onDidChangeTextDocument(
      (e) => {
        if (e.document.uri.toString() === document.uri.toString()) {
          updateWebview();
        }
      }
    );

    // Make sure we get rid of the listener when our editor is closed.
    webviewPanel.onDidDispose(() => {
      changeDocumentSubscription.dispose();
    });

    // Receive message from the webview.
    webviewPanel.webview.onDidReceiveMessage((e) => {
      switch (e.command) {
        case "add":
          //this.addNewScratch(document);
          return;

        case "delete":
          //this.deleteScratch(document, e.id);
          return;
        case "refresh":
          updateWebview();
          break;
      }
    });
  }

  private joinPaths(...pathSegments: string[]): Uri {
    // TODO remove dist from production
    return Uri.joinPath(this.extensionPath, "dist", ...pathSegments);
  }

  private getHtmlForWebview(webview: Webview) {
    // Get the local path to main script run in the webview, then convert it to a uri we can use in the webview.
    // Script to handle user action
    const scriptUri = webview.asWebviewUri(
      this.joinPaths(webviewsLibraryDir, webviewsLibraryName)
    );
    // CSS file to handle styling
    const styleUri = webview.asWebviewUri(
      this.joinPaths(webviewsLibraryDir, "config-editor.css")
    );

    const codiconsUri = webview.asWebviewUri(
      this.joinPaths("@vscode/codicons", "dist", "codicon.css")
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

    try {
      return parse(text);
    } catch {
      throw new Error(
        "Could not get document as toml. Content is not valid toml"
      );
    }
  }

  /**
   * Write out the json to a given document.
   */
  private updateTextDocument(document: TextDocument, content: any) {
    const edit = new WorkspaceEdit();

    // Just replace the entire document every time for this example extension.
    // A more complete extension should compute minimal edits instead.
    edit.replace(
      document.uri,
      new Range(0, 0, document.lineCount, 0),
      stringify(content)
    );

    return workspace.applyEdit(edit);
  }
}
