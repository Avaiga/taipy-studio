import {
  WebviewViewProvider,
  WebviewView,
  Webview,
  Uri,
  window,
  ExtensionContext,
  QuickPickItem,
  workspace,
  Range,
  TextEdit,
  WorkspaceEdit,
  TextDocument,
  l10n,
  SymbolKind,
  Position,
} from "vscode";

import { getCspScriptSrc, getDefaultConfig, getNonce, joinPaths } from "../utils/utils";
import { DataNodeDetailsId, NoDetailsId, webviewsLibraryDir, webviewsLibraryName, containerId, DataNodeDetailsProps, NoDetailsProps } from "../../shared/views";
import { Action, EditProperty, Refresh } from "../../shared/commands";
import { ViewMessage } from "../../shared/messages";
import { Context } from "../context";
import { getOriginalUri, isUriEqual } from "./PerpectiveContentProvider";
import { getEnum, getEnumProps, getProperties } from "../schema/validation";
import { getDescendantProperties, getNodeFromSymbol, getSectionName, getSymbol, getUnsuffixedName } from "../utils/symbols";
import { getChildType } from "../../shared/childtype";
import { stringify } from "@iarna/toml";

export class ConfigDetailsView implements WebviewViewProvider {
  private _view: WebviewView;
  private readonly extensionUri: Uri;
  private configUri: Uri;
  private nodeType: string;
  private nodeName: string;

  constructor(private readonly context: ExtensionContext, private readonly taipyContext: Context) {
    this.extensionUri = context.extensionUri;
    this.setEmptyContent();
  }

  setEmptyContent(): void {
    this._view?.webview.postMessage({
      viewId: NoDetailsId,
      props: { message: l10n.t("No selected element.") } as NoDetailsProps,
    } as ViewMessage);
  }

  setConfigNodeContent(nodeType: string, name: string, node: any, uri: Uri): void {
    this.configUri = getOriginalUri(uri);
    this.nodeType = nodeType;
    this.nodeName = name;
    this._view?.webview.postMessage({
      viewId: DataNodeDetailsId,
      props: { nodeType, nodeName: name, node } as DataNodeDetailsProps,
    } as ViewMessage);
  }

  //called when a view first becomes visible
  resolveWebviewView(webviewView: WebviewView): void | Thenable<void> {
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.extensionUri],
      enableCommandUris: true,
    };
    webviewView.webview.html = this.getHtmlForWebview(webviewView.webview);
    this._view = webviewView;
    this._view.webview.onDidReceiveMessage(
      (e) => {
        switch (e.command) {
          case "SHOW_WARNING_LOG":
            window.showWarningMessage(e.data.message);
            break;
          case Refresh:
            this.setEmptyContent();
            break;
          case Action:
            window.showErrorMessage("Action from webview", e.id, e.msg);
            break;
          case EditProperty:
            this.editProperty(e.nodeType, e.nodeName, e.propertyName, e.propertyValue);
            break;
          default:
            break;
        }
      },
      this,
      this.context.subscriptions
    );

    this.taipyContext.registerDocChangeListener(this.docListener, this);
    this._view.onDidDispose(() => {
      this.taipyContext.unregisterDocChangeListener(this.docListener, this);
    });
  }

  private docListener(textDocument: TextDocument) {
    if (isUriEqual(this.configUri, textDocument.uri)) {
      const symbols = this.taipyContext.getSymbols(this.configUri.toString());
      if (!symbols) {
        this.setEmptyContent();
      }
      const nameSymbol = getSymbol(symbols, this.nodeType, this.nodeName);
      const node = getNodeFromSymbol(textDocument, nameSymbol);
      this._view?.webview.postMessage({
        viewId: DataNodeDetailsId,
        props: { nodeType: this.nodeType, nodeName: this.nodeName, node: node } as DataNodeDetailsProps,
      } as ViewMessage);
    }
  }

  private async editProperty(nodeType: string, nodeName: string, propertyName?: string, propertyValue?: string | string[]) {
    const symbols = this.taipyContext.getSymbols(this.configUri.toString());
    if (!symbols) {
      return;
    }
    const insert = !propertyName;
    let propertyRange: Range;
    if (insert) {
      const nameSymbol = getSymbol(symbols, nodeType, nodeName);
      propertyRange = nameSymbol.range;
      const currentProps = nameSymbol.children.map(s => s.name.toLowerCase());
      const properties = (await getProperties(nodeType)).filter((p) => !currentProps.includes(p.toLowerCase()));
      propertyName = await window.showQuickPick(properties, { canPickMany: false, title: l10n.t("Select property for {0}.", nodeType) });
      if (!propertyName) {
        return;
      }
    } else {
      propertyRange = getSymbol(symbols, nodeType, nodeName, propertyName).range;
    }
    let newVal: string | string[];
    const linksProp = getDescendantProperties(nodeType).find((p) => p.toLowerCase() === propertyName?.toLowerCase());
    if (linksProp) {
      const childType = getChildType(nodeType);
      const values = ((propertyValue || []) as string[]).map((v) => getUnsuffixedName(v.toLowerCase()));
      const childNames = getSymbol(symbols, childType).children.map(
        s => ({ label: getSectionName(s.name), picked: values.includes(getUnsuffixedName(s.name.toLowerCase())) } as QuickPickItem)
      );
      if (!childNames.length) {
        window.showInformationMessage(l10n.t("No {0} entity in toml.", childType));
        return;
      }
      const res = await window.showQuickPick(childNames, {
        canPickMany: true,
        title: l10n.t("Select {0} entities for {1}.{2}", childType, nodeType, propertyName),
      });
      if (!res) {
        return;
      }
      newVal = res.map((q) => q.label);
    } else {
      const enumProps = await getEnumProps();
      const enumProp = enumProps.find((p) => p.toLowerCase() === propertyName?.toLowerCase());
      const res = enumProp
        ? await window.showQuickPick(
            getEnum(enumProp).map((v) => ({ label: v, picked: v === propertyValue })),
            { canPickMany: false, title: l10n.t("Select value for {0}.{1}", nodeType, propertyName) }
          )
        : await window.showInputBox({ title: l10n.t("Enter value for {0}.{1}", nodeType, propertyName), value: propertyValue as string });
      if (res === undefined) {
        return;
      }
      newVal = typeof res === "string" ? res : res.label;
    }
    if (insert) {
      propertyRange = propertyRange.with({ end: propertyRange.end.with({ character: 0 }) });
    }
    const we = new WorkspaceEdit();
    we.set(this.configUri, [
      insert
        ? TextEdit.insert(propertyRange.end, `${propertyName} = ${stringify.value(newVal).trim()}\n`)
        : TextEdit.replace(propertyRange, stringify.value(newVal).trim()),
    ]);
    return workspace.applyEdit(we);
}

  private getHtmlForWebview(webview: Webview) {
    // Get the local path to main script run in the webview, then convert it to a uri we can use in the webview.
    // Script to handle user action
    const scriptUri = webview.asWebviewUri(joinPaths(this.extensionUri, webviewsLibraryDir, webviewsLibraryName));
    // CSS file to handle styling
    const styleUri = webview.asWebviewUri(joinPaths(this.extensionUri, webviewsLibraryDir, "config-panel.css"));

    const codiconsUri = webview.asWebviewUri(joinPaths(this.extensionUri, "@vscode/codicons", "dist", "codicon.css"));

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
          <script nonce="${nonce}" type="text/javascript">window.taipyConfig=${JSON.stringify(getDefaultConfig(webview, this.extensionUri))};</script>
				</head>
				<body>
					<div id="${containerId}"></div>
				</body>
      </html>`;
  }
}
