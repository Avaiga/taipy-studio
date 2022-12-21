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
import { defaultElementList, defaultElementProperties, defaultOnFunctionList, LanguageId } from "./constant";
import { markdownDocumentFilter, pythonDocumentFilter } from "./utils";

const RE_LINE = /<(([\|]{1})([^\|]*)){1,2}/;

export class GuiCompletionItemProvider implements CompletionItemProvider {
    static register(context: ExtensionContext) {
        context.subscriptions.push(
            languages.registerCompletionItemProvider(
                markdownDocumentFilter,
                new GuiCompletionItemProvider(LanguageId.md),
                "|",
                "{",
                "="
            )
        );
        context.subscriptions.push(
            languages.registerCompletionItemProvider(
                pythonDocumentFilter,
                new GuiCompletionItemProvider(LanguageId.py),
                "|",
                "{",
                "="
            )
        );
    }

    private constructor(private readonly language: LanguageId) {
    }

    public async provideCompletionItems(
        document: TextDocument,
        position: Position,
        token: CancellationToken
    ): Promise<CompletionItem[]> {
        const line = document.lineAt(position).text;
        const linePrefix = line.slice(0, position.character);
        // md completion
        if (this.language === LanguageId.md) {
            return this.getMarkdownCompletion(document, linePrefix);
        }
        // python completion
        if (this.language === LanguageId.py) {
            return this.getPythonCompletion(document, linePrefix);
        }
        return [];
    }

    private async getMarkdownCompletion(document: TextDocument, linePrefix: string): Promise<CompletionItem[]> {
        const potentialPythonFile = path.join(path.dirname(document.uri.fsPath), path.parse(document.fileName).name + ".py");
        // variable name completion
        if (existsSync(potentialPythonFile)) {
            if (linePrefix.endsWith("{")) {
                return await this.getSymbols(Uri.file(potentialPythonFile), SymbolKind.Variable, CompletionItemKind.Variable);
            }
            // function name for 'on_*' properties
            if (linePrefix.endsWith("=") && defaultOnFunctionList.some((v) => linePrefix.endsWith(v + "="))) {
                return await this.getSymbols(Uri.file(potentialPythonFile), SymbolKind.Function, CompletionItemKind.Function);
            }
        }
        return this.getCommonCompletion(document, linePrefix);
    }

    private async getPythonCompletion(document: TextDocument, linePrefix: string): Promise<CompletionItem[]> {
        // variable name completion
        if (linePrefix.endsWith("{")) {
            return await this.getSymbols(document.uri, SymbolKind.Variable, CompletionItemKind.Variable);
        }
        // function name for 'on_*' properties
        if (linePrefix.endsWith("=") && defaultOnFunctionList.some((v) => linePrefix.endsWith(v + "="))) {
            return await this.getSymbols(document.uri, SymbolKind.Function, CompletionItemKind.Function);
        }
        return this.getCommonCompletion(document, linePrefix);
    }

    private async getCommonCompletion(document: TextDocument, linePrefix: string): Promise<CompletionItem[]> {
        if (linePrefix.endsWith("|")) {
            const foundElements = defaultElementList.reduce((p: string[], c: string) => {
                linePrefix.includes(`|${c}`) && p.push(c);
                return p;
            }, []);
            // element type completion
            if (linePrefix.match(RE_LINE) && foundElements.length === 0) {
                return defaultElementList.map((v) => new CompletionItem(v, CompletionItemKind.Keyword));
            }
            // element property completion
            if (linePrefix.match(RE_LINE) && foundElements.length > 0) {
                const latestElement = foundElements[foundElements.length - 1];
                const properties = defaultElementProperties[latestElement as keyof typeof defaultElementProperties];
                if (properties !== undefined) {
                    return Object.keys(properties)
                        .reduce((p: string[], c: string) => {
                            !linePrefix.includes(`|${c}`) && p.push(c);
                            return p;
                        }, [])
                        .map((v) => {
                            let completionItem = new CompletionItem(v, CompletionItemKind.Property);
                            completionItem.documentation = new MarkdownString(properties[v as keyof typeof properties]);
                            return completionItem;
                        });
                }
            }
        }
        return [];
    }

    private async getSymbols(
        uri: Uri,
        symbolKind: SymbolKind,
        completionItemKind: CompletionItemKind
    ): Promise<CompletionItem[]> {
        const symbols = (await commands.executeCommand("vscode.executeDocumentSymbolProvider", uri)) as SymbolInformation[];
        return symbols.filter((v) => v.kind === symbolKind).map((v) => new CompletionItem(v.name, completionItemKind));
    }
}
