import * as vscode from "vscode";
import { Context } from "./context";

export async function activate(vsContext: vscode.ExtensionContext) {

	vsContext.subscriptions.push(vscode.commands.registerCommand(
		"taipy.hello",
		() => {
			const rootPath =
				vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0
					? vscode.workspace.workspaceFolders[0].uri.fsPath
					: undefined;
			vscode.window.showInformationMessage("Hello Taipy!")
			console.log(`### FLE ###: RootPath=${rootPath}`)
		}
	));
	vscode.commands.executeCommand('setContext', 'taipy.numberOfConfigs', 0);
	Context.create(vsContext);
}

// Extension is deactivated
export function deactivate() {}
