import { existsSync } from "fs";
import path from "path";
import {
    CancellationToken,
    commands,
    CompletionItem,
    CompletionItemKind,
    CompletionItemProvider,
    ExtensionContext,
    languages,
    MarkdownString,
    Position,
    SymbolInformation,
    SymbolKind,
    TextDocument,
    Uri,
} from "vscode";
import { defaultElementList, defaultElementProperties, defaultOnFunctionList } from "./constant";
import { markdownDocumentFilter, pythonDocumentFilter } from "./utils";

const RE_LINE = /<(([\|]{1})([^\|]*)){1,2}/;

export class GuiCompletionItemProvider implements CompletionItemProvider {
    static register(context: ExtensionContext) {
        context.subscriptions.push(
            languages.registerCompletionItemProvider(markdownDocumentFilter, new GuiCompletionItemProvider(), "|")
        );
        context.subscriptions.push(
            languages.registerCompletionItemProvider(pythonDocumentFilter, new GuiCompletionItemProvider(), "|", "{", "=")
        );
    }

    public async provideCompletionItems(
        document: TextDocument,
        position: Position,
        token: CancellationToken
    ): Promise<CompletionItem[]> {
        const line = document.lineAt(position).text;
        const linePrefix = line.slice(0, position.character);
        let completionList: CompletionItem[] = [];
        if ((document.fileName.endsWith(".md") || document.languageId === "markdown") && linePrefix.endsWith("{")) {
            const potentialPythonFile = path.join(path.dirname(document.uri.fsPath), path.parse(document.fileName).name + ".py");
            if (existsSync(potentialPythonFile)) {
                let symbols = (await commands.executeCommand(
                    "vscode.executeDocumentSymbolProvider",
                    Uri.file(potentialPythonFile)
                )) as SymbolInformation[];
                symbols = symbols.filter((v) => v.kind === SymbolKind.Variable);
                return symbols.map((v) => new CompletionItem(v.name, CompletionItemKind.Variable));
            }
        }
        if ((document.fileName.endsWith(".py") || document.languageId === "python") && linePrefix.endsWith("{")) {
            let symbols = (await commands.executeCommand(
                "vscode.executeDocumentSymbolProvider",
                document.uri
            )) as SymbolInformation[];
            symbols = symbols.filter((v) => v.kind === SymbolKind.Variable);
            return symbols.map((v) => new CompletionItem(v.name, CompletionItemKind.Variable));
        }
        if (
            (document.fileName.endsWith(".py") || document.languageId === "python") &&
            linePrefix.endsWith("=") &&
            defaultOnFunctionList.some((v) => linePrefix.endsWith(v + "="))
        ) {
            let symbols = (await commands.executeCommand(
                "vscode.executeDocumentSymbolProvider",
                document.uri
            )) as SymbolInformation[];
            symbols = symbols.filter((v) => v.kind === SymbolKind.Function);
            return symbols.map((v) => new CompletionItem(v.name, CompletionItemKind.Function));
        } else if (linePrefix.endsWith("|")) {
            const foundElements = defaultElementList.reduce((p: string[], c: string) => {
                linePrefix.includes(`|${c}`) && p.push(c);
                return p;
            }, []);
            if (linePrefix.match(RE_LINE) && foundElements.length === 0) {
                completionList = defaultElementList.map((v) => new CompletionItem(v, CompletionItemKind.Keyword));
            } else if (foundElements.length > 0) {
                const latestElement = foundElements[foundElements.length - 1];
                const properties = defaultElementProperties[latestElement as keyof typeof defaultElementProperties];
                const reducedPropertyList = Object.keys(properties).reduce((p: string[], c: string) => {
                    !linePrefix.includes(`|${c}`) && p.push(c);
                    return p;
                }, []);
                completionList = reducedPropertyList.map((v) => {
                    let completionItem = new CompletionItem(v, CompletionItemKind.Property);
                    completionItem.documentation = new MarkdownString(properties[v as keyof typeof properties]);
                    return completionItem;
                });
            }
        }
        return completionList;
    }
}
