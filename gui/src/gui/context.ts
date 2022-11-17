import { Diagnostic, DocumentFilter, ExtensionContext, languages, TextDocument, window, workspace } from "vscode";
import { GenerateGuiCommand } from "./command";
import { GuiCompletionItemProvider } from "./completion";
import { refreshDiagnostics } from "./diagnostics";

export class GuiContext {
    static register(vsContext: ExtensionContext): void {
        new GuiContext(vsContext);
    }

    private constructor(readonly context: ExtensionContext) {
        this.registerMarkdownDiagnostics(context);
        this.registerCompletionItemProvider(context);
        this.registerGenerateElementCommand(context);
    }

    private registerMarkdownDiagnostics(context: ExtensionContext): void {
        const mdDiagnosticCollection = languages.createDiagnosticCollection("gui-markdown");

        if (window.activeTextEditor) {
            window.activeTextEditor && refreshDiagnostics(window.activeTextEditor.document, mdDiagnosticCollection);
        }

        const didOpen = workspace.onDidOpenTextDocument((doc) => refreshDiagnostics(doc, mdDiagnosticCollection));
        const didChange = workspace.onDidChangeTextDocument((e) => refreshDiagnostics(e.document, mdDiagnosticCollection));
        const didClose = workspace.onDidCloseTextDocument((doc) => mdDiagnosticCollection.delete(doc.uri));

        context.subscriptions.push(mdDiagnosticCollection, didOpen, didChange, didClose);
    }

    private registerCompletionItemProvider(context: ExtensionContext): void {
        const markdownFilter: DocumentFilter = { language: "markdown" };
        const pythonFilter: DocumentFilter = { language: "python" };
        context.subscriptions.push(
            languages.registerCompletionItemProvider(markdownFilter, new GuiCompletionItemProvider(), "|")
        );
        context.subscriptions.push(
            languages.registerCompletionItemProvider(pythonFilter, new GuiCompletionItemProvider(), "|", "{")
        );
    }

    private registerGenerateElementCommand(context: ExtensionContext): void {
        GenerateGuiCommand.register(context);
    }
}
