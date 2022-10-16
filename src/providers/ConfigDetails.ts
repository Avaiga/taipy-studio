import { WebviewViewProvider, WebviewView, Webview, Uri, window } from "vscode";

import { getCspScriptSrc, getNonce } from "../utils/utils";
import { DataNodeDetailsId, NoDetailsId, webviewsLibraryDir, webviewsLibraryName, containerId, DataNodeDetailsProps, NoDetailsProps } from "../../shared/views";
import { Action, Refresh } from "../../shared/commands";
import { ViewMessage } from "../../shared/messages";
import { emptyNodeDetailContent } from "../utils/l10n";

export class ConfigDetailsView implements WebviewViewProvider {
  private _view: WebviewView;

  constructor(private readonly extensionPath: Uri) {
    this.setEmptyContent();
  }

  setEmptyContent(): void {
    this._view?.webview.postMessage({
      viewId: NoDetailsId,
      props: { message: emptyNodeDetailContent } as NoDetailsProps,
    } as ViewMessage);
  }

  setConfigNodeContent(nodeType: string, name: string, node: any): void {
    this._view?.webview.postMessage({
      viewId: DataNodeDetailsId,
      props: { nodeType, nodeName: name, node } as DataNodeDetailsProps,
    } as ViewMessage);
  }

  refresh(context: any): void {
    this._view.webview.html = this._getHtmlForWebview(this._view?.webview);
  }

  //called when a view first becomes visible
  resolveWebviewView(webviewView: WebviewView): void | Thenable<void> {
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.extensionPath],
    };
    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);
    this._view = webviewView;
    this._view.webview.onDidReceiveMessage((message) => {
      switch (message.command) {
        case "SHOW_WARNING_LOG":
          window.showWarningMessage(message.data.message);
          break;
        case Refresh:
          this.setEmptyContent();
          break;
        case Action:
          window.showErrorMessage("Action from webview", message.id, message.msg);
          break;
        default:
          break;
      }
    });
  }

  private joinPaths(...pathSegments: string[]): Uri {
    // TODO remove dist from production
    return Uri.joinPath(this.extensionPath, "dist", ...pathSegments);
  }

  private _getHtmlForWebview(webview: Webview) {
    // Get the local path to main script run in the webview, then convert it to a uri we can use in the webview.
    // Script to handle user action
    const scriptUri = webview.asWebviewUri(this.joinPaths(webviewsLibraryDir, webviewsLibraryName));
    // CSS file to handle styling
    const styleUri = webview.asWebviewUri(this.joinPaths(webviewsLibraryDir, "config-panel.css"));

    const codiconsUri = webview.asWebviewUri(this.joinPaths("@vscode/codicons", "dist", "codicon.css"));

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
}
