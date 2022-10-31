import {
    CancellationToken,
    CompletionItem,
    CompletionItemKind,
    CompletionItemProvider,
    MarkdownString,
    Position,
    TextDocument,
} from "vscode";
import { defaultElementList, defaultElementProperties } from "./constant";

const RE_LINE = /<(([\|]{1})([^\|]*)){1,2}/;

export class GuiCompletionItemProvider implements CompletionItemProvider {
    public provideCompletionItems(
        document: TextDocument,
        position: Position,
        token: CancellationToken
    ): Thenable<CompletionItem[]> {
        const line = document.lineAt(position).text;
        const linePrefix = line.slice(0, position.character);
        let completionList: CompletionItem[] = [];
        let foundElements = defaultElementList.reduce((p: string[], c: string) => {
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
        return Promise.resolve(completionList);
    }
}
