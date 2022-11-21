import { ExtensionContext } from "vscode";
import { MarkdownActionProvider } from "./codeAction";
import { GenerateGuiCommand } from "./command";
import { GuiCompletionItemProvider } from "./completion";
import { registerDiagnostics } from "./diagnostics";

export class GuiContext {
    static register(vsContext: ExtensionContext): void {
        new GuiContext(vsContext);
    }

    private constructor(readonly context: ExtensionContext) {
        registerDiagnostics(context);
        GuiCompletionItemProvider.register(context);
        GenerateGuiCommand.register(context);
        MarkdownActionProvider.register(context);
    }
}
