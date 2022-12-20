import {
    CancellationToken,
    CodeAction,
    CodeActionContext,
    CodeActionKind,
    CodeActionProvider,
    Diagnostic,
    ExtensionContext,
    languages,
    Position,
    Range,
    Selection,
    TextDocument,
    WorkspaceEdit,
} from "vscode";

import { DiagnosticCode } from "./diagnostics";
import { markdownDocumentFilter, pythonDocumentFilter } from "./utils";

export class MarkdownActionProvider implements CodeActionProvider {
    public static readonly providedCodeActionKinds = [CodeActionKind.QuickFix];
    private readonly codeActionMap: Record<string, (document: TextDocument, diagnostic: Diagnostic) => CodeAction> = {
        [DiagnosticCode.missCSyntax]: this.createMCSCodeAction,
    };

    static register(context: ExtensionContext): void {
        context.subscriptions.push(
            languages.registerCodeActionsProvider(markdownDocumentFilter, new MarkdownActionProvider(), {
                providedCodeActionKinds: MarkdownActionProvider.providedCodeActionKinds,
            })
        );
        context.subscriptions.push(
            languages.registerCodeActionsProvider(pythonDocumentFilter, new MarkdownActionProvider(), {
                providedCodeActionKinds: MarkdownActionProvider.providedCodeActionKinds,
            })
        );
    }

    provideCodeActions(
        document: TextDocument,
        range: Range | Selection,
        context: CodeActionContext,
        token: CancellationToken
    ): CodeAction[] {
        const codeActions: CodeAction[] = [];
        context.diagnostics.forEach((v) => {
            const codeAction = this.createCodeAction(document, v);
            codeAction !== null && codeActions.push(codeAction);
        });
        return codeActions;
    }

    private createCodeAction(document: TextDocument, diagnostic: Diagnostic): CodeAction | null {
        const codeActionGenerator = this.codeActionMap[diagnostic.code as string];
        if (codeActionGenerator !== null) {
            return codeActionGenerator(document, diagnostic);
        }
        return null;
    }

    private createMCSCodeAction(document: TextDocument, diagnostic: Diagnostic): CodeAction {
        const action = new CodeAction("Add closing tag", CodeActionKind.QuickFix);
        action.diagnostics = [diagnostic];
        action.isPreferred = true;
        action.edit = new WorkspaceEdit();
        const diagnosticText = document.getText(diagnostic.range);
        if (diagnosticText.endsWith("|")) {
            action.edit.insert(document.uri, diagnostic.range.end, ">");
        } else if (diagnosticText.endsWith(">")) {
            action.edit.insert(document.uri, diagnostic.range.end.translate(0, -1), "|");
        } else {
            action.edit.insert(document.uri, diagnostic.range.end, "|>");
        }
        return action;
    }
}
