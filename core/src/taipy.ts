import { ExtensionContext, commands } from "vscode";
import { Context } from "./context";

export async function activate(vsContext: ExtensionContext) {
	commands.executeCommand('setContext', 'taipy.numberOfConfigs', 0);
	Context.create(vsContext);
}

// Extension is deactivated
export function deactivate() {}
