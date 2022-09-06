import { ExtensionContext, workspace, commands, window } from "vscode";
import { Context } from "./context";

export async function activate(vsContext: ExtensionContext) {

	vsContext.subscriptions.push(commands.registerCommand(
		"taipy.hello",
		() => {
			const rootPath =
				workspace.workspaceFolders && workspace.workspaceFolders.length > 0
					? workspace.workspaceFolders[0].uri.fsPath
					: undefined;
			window.showInformationMessage("Hello Taipy!")
			console.log(`### FLE ###: RootPath=${rootPath}`)
		}
	));
	commands.executeCommand('setContext', 'taipy.numberOfConfigs', 0);
	Context.create(vsContext);
}

// Extension is deactivated
export function deactivate() {}
