import { ExtensionContext, workspace, commands, window } from "vscode";
import { Context } from "./context";
import { ConfigEditorProvider } from "./editors/ConfigEditor";

export async function activate(vsContext: ExtensionContext) {
	vsContext.subscriptions.push(commands.registerCommand(
		"taipy.hello",
		() => {
			const rootPath =
				workspace.workspaceFolders && workspace.workspaceFolders.length > 0
					? workspace.workspaceFolders[0].uri.fsPath
					: undefined;
			window.showInformationMessage("Hello Taipy!")
			console.log(`### Info ###: RootPath=${rootPath}`)
		}
	));
	commands.executeCommand('setContext', 'taipy.numberOfConfigs', 0);
	Context.create(vsContext);
	// add editor
	vsContext.subscriptions.push(ConfigEditorProvider.register(vsContext));
}

// Extension is deactivated
export function deactivate() {}
