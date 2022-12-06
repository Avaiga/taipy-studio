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
    TextDocument,
} from "vscode";
import { defaultElementList, defaultElementProperties } from "./constant";
import { markdownDocumentFilter, pythonDocumentFilter } from "./utils";

const RE_LINE = /<(([\|]{1})([^\|]*)){1,2}/;

export class GuiCompletionItemProvider implements CompletionItemProvider {
    static register(context: ExtensionContext) {
        context.subscriptions.push(
            languages.registerCompletionItemProvider(markdownDocumentFilter, new GuiCompletionItemProvider(), "|")
        );
        context.subscriptions.push(
            languages.registerCompletionItemProvider(pythonDocumentFilter, new GuiCompletionItemProvider(), "|", "{")
        );
    }

    public async provideCompletionItems(
        document: TextDocument,
        position: Position,
        token: CancellationToken
    ): Promise<CompletionItem[]> {
        const line = document.lineAt(position).text;
        const linePrefix = line.slice(0, position.character);
        if ((document.fileName.endsWith(".py") || document.languageId === "python") && linePrefix.endsWith("{")) {
            const symbols = (await commands.executeCommand(
                "vscode.executeDocumentSymbolProvider",
                document.uri
            )) as SymbolInformation[];
            return symbols.map((v) => new CompletionItem(v.name, CompletionItemKind.Property));
        }
        let completionList: CompletionItem[] = [];
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
        return completionList;
    }
}
