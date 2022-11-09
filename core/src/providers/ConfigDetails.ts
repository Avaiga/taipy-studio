import { WebviewViewProvider, WebviewView, Webview, Uri, window, ExtensionContext, QuickPickItemKind, QuickPickItem, workspace, Range, TextEdit, WorkspaceEdit, TextDocument } from "vscode";

import { getCspScriptSrc, getNonce } from "../utils/utils";
import { DataNodeDetailsId, NoDetailsId, webviewsLibraryDir, webviewsLibraryName, containerId, DataNodeDetailsProps, NoDetailsProps } from "../../shared/views";
import { Action, EditProperty, Refresh } from "../../shared/commands";
import { ViewMessage } from "../../shared/messages";
import { emptyNodeDetailContent, getEnterValueForProperty, getNoTypeEntityFound, getSelectChildEntities, getSelectPropertyTitle, getSelectValueForProperty } from "../utils/l10n";
import { Context } from "../context";
import { getOriginalUri, isUriEqual } from "./PerpectiveContentProvider";
import { getEnum, getEnumProps, getProperties } from "../schema/validation";
import { getDescendantProperties } from "../utils/toml";
import { getChildType } from "../../shared/toml";
import { CodePos, PosSymbol } from "../iarna-toml/AsyncParser";
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
      props: { message: emptyNodeDetailContent } as NoDetailsProps,
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
    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);
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
    })
  }

  private docListener(textDocument: TextDocument) {
    if (isUriEqual(this.configUri, textDocument.uri)) {
      const toml = this.taipyContext.getToml(this.configUri.toString());
      this._view?.webview.postMessage({
        viewId: DataNodeDetailsId,
        props: { nodeType: this.nodeType, nodeName: this.nodeName, node: toml[this.nodeType][this.nodeName] } as DataNodeDetailsProps,
      } as ViewMessage);
  
    }
  };

  private async editProperty(nodeType: string, nodeName: string, propertyName?: string, propertyValue?: string | string[]) {
    const toml = this.taipyContext.getToml(this.configUri.toString());
    let pos: CodePos[];
    const insert = !propertyName;
    if (!propertyName) {
      const entity = toml[nodeType][nodeName];
      pos = entity[PosSymbol];
      const currentProps = Object.keys(entity).map(k => k.toLowerCase());
      const properties = (await getProperties(nodeType)).filter(p => !currentProps.includes(p.toLowerCase()));
      propertyName = await window.showQuickPick(properties, { canPickMany: false, title: getSelectPropertyTitle(nodeType) });
      if (!propertyName) {
        return;
      }
    } else {
      pos = toml[nodeType][nodeName][propertyName][PosSymbol]
    }
    let newVal: string | string[];
    const linksProp = getDescendantProperties(nodeType).find(p => p.toLowerCase() == propertyName?.toLowerCase());
    if (linksProp) {
      const childType = getChildType(nodeType);
      const values = ((propertyValue || []) as string[]).map(v => v.toLowerCase());
      const childNames = Object.keys(toml[childType] || {}).map(k => ({label: k, picked: values.includes(k.toLowerCase())} as QuickPickItem));
      if (!childNames.length) {
        window.showInformationMessage(getNoTypeEntityFound(childType));
        return;
      }
      const res = await window.showQuickPick(childNames, { canPickMany: true, title: getSelectChildEntities(childType, nodeType, propertyName) });
      if (!res) {
        return;
      }
      newVal = res.map(q => q.label);
    } else {
      const enumProps = await getEnumProps();
      const enumProp = enumProps.find((p) => p.toLowerCase() == propertyName?.toLowerCase());
      const res = enumProp
        ? await window.showQuickPick(
            getEnum(enumProp).map((v) => ({ label: v, picked: v == propertyValue })),
            { canPickMany: false, title: getSelectValueForProperty(nodeType, propertyName) }
          )
        : await window.showInputBox({title: getEnterValueForProperty(nodeType, propertyName), value: propertyValue as string});
      if (res === undefined) {
        return;
      }
      newVal = typeof res == "string" ? res : res.label;
    }
    let propertyRange = pos && pos.length && new Range(pos[0].line, pos[0].col, pos.at(-1).line, pos.at(-1).col);
    if (!propertyRange) {
      const doc = await workspace.openTextDocument(this.configUri);
      const search = `[${nodeType}.${nodeName}]`;
      let sectionFound = false;
      for (let i = 0; i < doc.lineCount; i++) {
        const line = doc.lineAt(i);
        if (line.text.includes(search)) {
          sectionFound = true;
          if (insert) {
            propertyRange = new Range(line.range.end.line +1, 0, line.range.end.line +1, 0);
            break;
          }
        } else if (sectionFound) {
          if (line.text.trim().startsWith("[")) {
            break;
          }
          const parts = line.text.split("=", 2);
          if (parts[0].trim() == propertyName) {
            const pos = parts[0].length + (parts.length > 1 ? 1 + (parts[1].length - parts[1].trimStart().length) : 0);
            propertyRange = line.range.with({start: line.range.start.with({character: pos})});
            break;
          }
        }
      }
    } else {
      if (insert) {
        propertyRange = propertyRange.with({end: propertyRange.end.with({character: 0})});
      }
    }
    if (propertyRange) {
      const we = new WorkspaceEdit();
      we.set(this.configUri, [insert ? TextEdit.insert(propertyRange.end, `${propertyName} = ${stringify.value(newVal).trim()}\n`): TextEdit.replace(propertyRange, stringify.value(newVal).trim())]);
      return workspace.applyEdit(we);
    }
  }

  private joinPaths(...pathSegments: string[]): Uri {
    return Uri.joinPath(this.extensionUri, "dist", ...pathSegments);
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
