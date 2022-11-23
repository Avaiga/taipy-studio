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
			window.showInformationMessage("Hello Taipy!");
			console.log(`### Info ###: RootPath=${rootPath}`);
		}
	));
	vsContext.subscriptions.push(commands.registerCommand(
		"taipy.config.showSymbols",
		async () => {
			const uri = window.activeTextEditor?.document?.uri;
			if (uri) {
				const symbols = await commands.executeCommand("vscode.executeDocumentSymbolProvider", uri);
				console.log("symbols", symbols);
			} else {
				window.showInformationMessage("No Active Text Editor");
			}
		}
	));
	commands.executeCommand('setContext', 'taipy.numberOfConfigs', 0);
	Context.create(vsContext);
}

// Extension is deactivated
export function deactivate() {}
