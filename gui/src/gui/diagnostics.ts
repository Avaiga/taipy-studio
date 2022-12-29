import {
    commands,
    Diagnostic,
    DiagnosticCollection,
    DiagnosticSeverity,
    ExtensionContext,
    l10n,
    languages,
    Position,
    Range,
    SymbolInformation,
    SymbolKind,
    TextDocument,
    window,
    workspace,
} from "vscode";
import { findBestMatch } from "string-similarity";
import { defaultElementList, defaultBlockElementList, defaultElementProperties, LanguageId } from "./constant";

const CONTROL_RE = /<\|(.*?)\|>/;
const OPENING_TAG_RE = /<([0-9a-zA-Z\_\.]*)\|((?:(?!\|>).)*)\s*$/;
const CLOSING_TAG_RE = /^\s*\|([0-9a-zA-Z\_\.]*)>/;
const SPLIT_RE = /(?<!\\\\)\|/;
export const PROPERTY_RE = /((?:don'?t|not)\s+)?([a-zA-Z][\.a-zA-Z_$0-9]*(?:\[(?:.*?)\])?)\s*(?:=(.*))?$/;
export const PROPERTY_NAME_RE = /([a-zA-Z][\.a-zA-Z_$0-9]*)(?:\[(.*?)\])?/;
const BEST_MATCH_THRESHOLD = 0.8;

interface DiagnosticSection {
    content: string;
    initialPosition?: Position;
    symbols?: SymbolInformation[];
}

interface TaipyElementProperty {
    name: string;
    value: string;
}

interface TaipyElement {
    value: string;
    type: string;
    properties: TaipyElementProperty[];
}

const buildEmptyTaipyElement = (): TaipyElement => {
    return { value: "", type: "", properties: [] };
};

export enum DiagnosticCode {
    missCSyntax = "MCS",
    missOTag = "MOT",
    missCTag = "MCT",
    missOTagId = "MOTI",
    missCTagId = "MCTI",
    unmatchedOTagId = "UOTI",
    unmatchedCTagId = "UCTI",
    invalidPropertyFormat = "PE01",
    invalidPropertyName = "PE02",
    ignoreNegatedValue = "PE03",
    functionNotFound = "FNF",
}

export const registerDiagnostics = async (context: ExtensionContext): Promise<void> => {
    const mdDiagnosticCollection = languages.createDiagnosticCollection("taipy-gui-markdown");
    const didOpen = workspace.onDidOpenTextDocument(async (doc) => await refreshDiagnostics(doc, mdDiagnosticCollection));
    const didChange = workspace.onDidChangeTextDocument(
        async (e) => await refreshDiagnostics(e.document, mdDiagnosticCollection)
    );
    const didClose = workspace.onDidCloseTextDocument((doc) => mdDiagnosticCollection.delete(doc.uri));
    window.activeTextEditor && (await refreshDiagnostics(window.activeTextEditor.document, mdDiagnosticCollection));
    context.subscriptions.push(mdDiagnosticCollection, didOpen, didChange, didClose);
};

const refreshDiagnostics = async (doc: TextDocument, diagnosticCollection: DiagnosticCollection) => {
    let diagnostics: Diagnostic[] | undefined = undefined;
    const uri = doc.uri;
    if (uri.path.endsWith(".md") || doc.languageId === LanguageId.md) {
        diagnostics = getMdDiagnostics(doc);
    } else if (uri.path.endsWith(".py") || doc.languageId === LanguageId.py) {
        diagnostics = await getPyDiagnostics(doc);
    }
    diagnostics && diagnosticCollection.set(uri, diagnostics);
};

const getMdDiagnostics = (doc: TextDocument): Diagnostic[] => {
    return getSectionDiagnostics({ content: doc.getText() });
};

const getPyDiagnostics = async (doc: TextDocument): Promise<Diagnostic[]> => {
    const text = doc.getText();
    const d: Diagnostic[] = [];
    const symbols = (await commands.executeCommand("vscode.executeDocumentSymbolProvider", doc.uri)) as SymbolInformation[];
    const quotePositions: Position[] = text.split(/\r?\n/).reduce<Position[]>((obj: Position[], v: string, i: number) => {
        return [...obj, ...Array.from(v.matchAll(new RegExp('"""', "g")), (a) => new Position(i, a.index || 0))];
    }, []);
    if (quotePositions.length % 2 !== 0) {
        return [];
    }
    for (let i = 0; i < quotePositions.length; i += 2) {
        d.push(
            ...getSectionDiagnostics({
                content: getTextFromPositions(text, quotePositions[i], quotePositions[i + 1]),
                initialPosition: quotePositions[i].translate(0, 3),
                symbols: symbols,
            })
        );
    }
    return d;
};

const getSectionDiagnostics = (diagnosticSection: DiagnosticSection): Diagnostic[] => {
    const diagnostics: Diagnostic[] = [];
    const textByLine = diagnosticSection.content.split(/\r?\n/);
    const initialPosition = diagnosticSection.initialPosition || new Position(0, 0);
    const tagQueue: [TaipyElement, Range, Position, string][] = [];
    textByLine.forEach((line, lineCount) => {
        // Opening tags (<|)
        const openingTagSearch = OPENING_TAG_RE.exec(line);
        if (openingTagSearch) {
            let element = buildEmptyTaipyElement();
            element.type = "part";
            const openingTagProperty = openingTagSearch[2];
            if (openingTagProperty) {
                const [d, e] = processElement(
                    openingTagProperty,
                    new Position(lineCount, line.indexOf(openingTagProperty)),
                    initialPosition
                );
                element = e;
                diagnostics.push(...d);
            }
            if (defaultBlockElementList.includes(element.type)) {
                tagQueue.push([
                    element,
                    getRangeOfStringInline(line, openingTagSearch[0], new Position(lineCount, 0)),
                    initialPosition,
                    openingTagSearch[1],
                ]);
            } else {
                diagnostics.push(
                    createWarningDiagnostic(
                        l10n.t("Missing closing syntax"),
                        DiagnosticCode.missCSyntax,
                        getRangeFromPosition(
                            initialPosition,
                            getRangeOfStringInline(line, openingTagSearch[0], new Position(lineCount, 0))
                        )
                    )
                );
            }
        }
        // Other Elements (<||>)
        for (const elementMatch of line.matchAll(new RegExp(CONTROL_RE, "g"))) {
            const [d, _] = processElement(
                elementMatch[1],
                new Position(lineCount, line.indexOf(elementMatch[1])),
                initialPosition,
                diagnosticSection.symbols
            );
            diagnostics.push(...d);
        }
        // Closing tags (|>)
        const closingTagSearch = CLOSING_TAG_RE.exec(line);
        if (closingTagSearch && tagQueue.length >= 0) {
            const openTag = tagQueue.pop();
            if (!openTag) {
                diagnostics.push(
                    createWarningDiagnostic(
                        l10n.t("Missing opening tag"),
                        DiagnosticCode.missOTag,
                        getRangeFromPosition(
                            initialPosition,
                            getRangeOfStringInline(line, closingTagSearch[0], new Position(lineCount, 0))
                        )
                    )
                );
                return;
            }
            const [_, inlineP, p, tagId] = openTag;
            const closeTagId = closingTagSearch[1];
            if (closeTagId && !tagId) {
                diagnostics.push(
                    createWarningDiagnostic(
                        l10n.t("Missing matching opening tag identifier '{0}'", closeTagId),
                        DiagnosticCode.missOTagId,
                        getRangeFromPosition(
                            initialPosition,
                            getRangeOfStringInline(line, closingTagSearch[0], new Position(lineCount, 0))
                        )
                    )
                );
            }
            if (tagId && !closeTagId) {
                diagnostics.push(
                    createWarningDiagnostic(
                        l10n.t("Missing matching closing tag identifier '{0}'", tagId),
                        DiagnosticCode.missCTagId,
                        getRangeFromPosition(p, inlineP)
                    )
                );
            }
            if (closeTagId && tagId && tagId !== closeTagId) {
                diagnostics.push(
                    createWarningDiagnostic(
                        l10n.t("Unmatched opening tag identifier '{0}'", tagId),
                        DiagnosticCode.unmatchedOTagId,
                        getRangeFromPosition(
                            initialPosition,
                            getRangeOfStringInline(line, closingTagSearch[0], new Position(lineCount, 0))
                        )
                    )
                );
                diagnostics.push(
                    createWarningDiagnostic(
                        l10n.t("Unmatched closing tag identifier '{0}'", closeTagId),
                        DiagnosticCode.unmatchedCTagId,
                        getRangeFromPosition(p, inlineP)
                    )
                );
            }
        }
    });
    for (const tag of tagQueue) {
        const [_, inlineP, p, tagId] = tag;
        if (tagId) {
            diagnostics.push(
                createWarningDiagnostic(
                    l10n.t("Missing closing tag with tag identifier '{0}'", tagId),
                    DiagnosticCode.missCTagId,
                    getRangeFromPosition(p, inlineP)
                )
            );
        } else {
            diagnostics.push(
                createWarningDiagnostic(
                    l10n.t("Missing closing tag", tagId),
                    DiagnosticCode.missCTag,
                    getRangeFromPosition(p, inlineP)
                )
            );
        }
    }
    return diagnostics;
};

const processElement = (
    s: string,
    inlinePosition: Position,
    initialPosition: Position,
    symbols: SymbolInformation[] | undefined = undefined
): [Diagnostic[], TaipyElement] => {
    const d: Diagnostic[] = [];
    const fragments = s.split(SPLIT_RE).filter((v) => !!v);
    const e = buildEmptyTaipyElement();
    fragments.forEach((fragment) => {
        if (!e.type && defaultElementList.includes(fragment)) {
            e.type = fragment;
            return;
        }
        if (!e.type && !e.value) {
            e.value = fragment;
            return;
        }
        const propMatch = PROPERTY_RE.exec(fragment);
        if (!propMatch) {
            d.push(
                createWarningDiagnostic(
                    l10n.t("Invalid property format"),
                    DiagnosticCode.invalidPropertyFormat,
                    getRangeFromPosition(initialPosition, getRangeOfStringInline(s, fragment, inlinePosition))
                )
            );
            return;
        }
        const notPrefix = propMatch[1];

        const propNameMatch = PROPERTY_NAME_RE.exec(propMatch[2]);
        const propName = propNameMatch ? propNameMatch[1] : propMatch[2];
        const val = propMatch[3];
        const validPropertyList = Object.keys(defaultElementProperties[e.type] || []);
        if (validPropertyList.length !== 0 && !validPropertyList.includes(propName)) {
            const bestMatch = findBestMatch(propName, validPropertyList).bestMatch;
            let dS = l10n.t("Invalid property name '{0}'", propName);
            if (bestMatch.rating >= BEST_MATCH_THRESHOLD) {
                dS += l10n.t(". Do you mean '{0}'?", bestMatch.target);
            }
            d.push(
                createWarningDiagnostic(
                    dS,
                    DiagnosticCode.invalidPropertyName,
                    getRangeFromPosition(
                        initialPosition,
                        getRangeOfStringInline(fragment, propName, inlinePosition.translate(0, s.indexOf(fragment)))
                    )
                )
            );
            return;
        }
        if (notPrefix && val) {
            d.push(
                createWarningDiagnostic(
                    l10n.t("Negated value of property '{0}' will be ignored", propName),
                    DiagnosticCode.ignoreNegatedValue,
                    getRangeFromPosition(
                        initialPosition,
                        getRangeOfStringInline(fragment, notPrefix, inlinePosition.translate(0, s.indexOf(fragment)))
                    )
                )
            );
        }
        if (propName.startsWith("on_") && symbols && !symbols.some((s) => s.name === val && s.kind === SymbolKind.Function)) {
            d.push(
                createWarningDiagnostic(
                    l10n.t("Function '{0}' in property '{1}' is not available", val, propName),
                    DiagnosticCode.functionNotFound,
                    getRangeFromPosition(initialPosition, getRangeOfStringInline(s, fragment, inlinePosition))
                )
            );
        }
        e.properties.push({ name: propName, value: notPrefix ? "False" : val ? val : "True" });
    });
    e.type = e.type ? e.type : "text";
    return [d, e];
};

const getTextFromPositions = (text: string, start: Position, end: Position): string => {
    const textByLine = text.split(/\r?\n/);
    let l: string[] = [textByLine[start.line].slice(start.character + 3)];
    for (let i = start.line + 1; i < end.line; i++) {
        l.push(textByLine[i]);
    }
    l.push(textByLine[end.line].slice(0, end.character));
    return l.join("\n");
};

const getRangeOfStringInline = (s: string, subString: string, initialPosition: Position): Range => {
    return new Range(
        initialPosition.line,
        initialPosition.character + s.indexOf(subString),
        initialPosition.line,
        initialPosition.character + s.indexOf(subString) + subString.length
    );
};

const getRangeFromPosition = (initialPosition: Position, range: Range): Range => {
    return new Range(
        initialPosition.line + range.start.line,
        range.start.line === 0 ? initialPosition.character + range.start.character : range.start.character,
        initialPosition.line + range.end.line,
        range.end.character
    );
};

const createWarningDiagnostic = (message: string, code: string, range: Range): Diagnostic => {
    return {
        severity: DiagnosticSeverity.Warning,
        message: message,
        code: code,
        source: "taipy-studio-gui",
        range: range,
    };
};
