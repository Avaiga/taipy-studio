import * as vscode from "vscode";
import { ConfigPanelProvider } from "./views/config-panel-provider";
import { Constants } from "./constants";

export function activate(context: vscode.ExtensionContext) {
	const rootPath =
		vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0
			? vscode.workspace.workspaceFolders[0].uri.fsPath
			: undefined;
	context.subscriptions.push(vscode.commands.registerCommand(
		"taipy.hello",    
		() => {
			vscode.window.showInformationMessage("Hello Taipy!")
			console.log(`### FLE ###: RootPath=${rootPath}`)
		}
	));
	context.subscriptions.push(vscode.window.registerWebviewViewProvider(
		Constants.WEBVIEW_PANEL_ID,
		new ConfigPanelProvider(context?.extensionUri, {}),
	));
}

// Extension is deactivated
export function deactivate() {}
