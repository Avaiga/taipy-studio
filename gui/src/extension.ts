// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import { GuiContext } from "./gui";
import { ExtensionContext } from "vscode";

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export async function activate(context: ExtensionContext) {
    GuiContext.register(context);
}

// This method is called when your extension is deactivated
export function deactivate() {}
