import { Diagnostic, DocumentFilter, ExtensionContext, languages, TextDocument, window, workspace } from "vscode";
import { GenerateGuiCommand } from "./command";
import { GuiCompletionItemProvider } from "./completion";
import { getMdDiagnostics, getPyDiagnostics } from "./diagnostics";

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
        const markdownDiagnosticCollection = languages.createDiagnosticCollection("gui-markdown");

        const handler = (doc: TextDocument) => {
            let diagnostics: Diagnostic[] | undefined = undefined;
            if (doc.fileName.endsWith(".md")) {
                diagnostics = getMdDiagnostics(doc);
            } else if (doc.fileName.endsWith(".py")) {
                diagnostics = getPyDiagnostics(doc);
            }
            diagnostics && markdownDiagnosticCollection.set(doc.uri, diagnostics);
        };

        // handle active text editor
        if (window.activeTextEditor) {
            (async () => window.activeTextEditor && (await handler(window.activeTextEditor.document)))();
        }

        const didOpen = workspace.onDidOpenTextDocument((doc) => handler(doc));
        const didChange = workspace.onDidChangeTextDocument((e) => handler(e.document));

        context.subscriptions.push(markdownDiagnosticCollection, didOpen, didChange);
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
