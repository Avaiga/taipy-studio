import { Diagnostic, DiagnosticSeverity, l10n, Position, Range, TextDocument } from "vscode";
import { findBestMatch } from "string-similarity";
import { defaultElementList, defaultBlockElementList, defaultElementProperties } from "./constant";

const CONTROL_RE = /<\|(.*?)\|>/;
const OPENING_TAG_RE = /<([0-9a-zA-Z\_\.]*)\|((?:(?!\|>).)*)\s*$/;
const CLOSING_TAG_RE = /^\s*\|([0-9a-zA-Z\_\.]*)>/;
const SPLIT_RE = /(?<!\\\\)\|/;
const PROPERTY_RE = /((?:don'?t|not)\s+)?([a-zA-Z][\.a-zA-Z_$0-9]*(?:\[(?:.*?)\])?)\s*(?:=(.*))?$/;
const BEST_MATCH_THRESHOLD = 0.8;

interface DiagnosticSection {
    content: string;
    initialPosition?: Position;
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

export const getMdDiagnostics = (doc: TextDocument): Diagnostic[] => {
    return getSectionDiagnostics({ content: doc.getText() });
};

export const getPyDiagnostics = (doc: TextDocument): Diagnostic[] => {
    const text = doc.getText();
    const d: Diagnostic[] = [];
    const quotePositions: Position[] = text.split(/\r?\n/).reduce<Position[]>((obj: Position[], v: string, i: number) => {
        return [...obj, ...[...v.matchAll(new RegExp('"""', "gi"))].map((a) => new Position(i, a.index || 0))];
    }, []);
    if (quotePositions.length % 2 !== 0) {
        return [];
    }
    for (let i = 0; i < quotePositions.length; i += 2) {
        d.push(
            ...getSectionDiagnostics({
                content: getTextFromPositions(text, quotePositions[i], quotePositions[i + 1]),
                initialPosition: new Position(quotePositions[i].line, quotePositions[i].character + 3),
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
                        "MCS",
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
                initialPosition
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
                        "MOT",
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
                        "MOTI",
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
                        "MCTI",
                        getRangeFromPosition(p, inlineP)
                    )
                );
            }
            if (closeTagId && tagId && tagId !== closeTagId) {
                diagnostics.push(
                    createWarningDiagnostic(
                        l10n.t("Unmatched opening tag identifier '{0}'", tagId),
                        "UOTI",
                        getRangeFromPosition(
                            initialPosition,
                            getRangeOfStringInline(line, closingTagSearch[0], new Position(lineCount, 0))
                        )
                    )
                );
                diagnostics.push(
                    createWarningDiagnostic(
                        l10n.t("Unmatched closing tag identifier '{0}'", closeTagId),
                        "UCTI",
                        getRangeFromPosition(p, inlineP)
                    )
                );
            }
        }
    });
    for (const tag of tagQueue) {
        const [_, inlineP, p, tagId] = tag;
        diagnostics.push(
            createWarningDiagnostic(
                l10n.t("Missing closing tag with tag identifier '{0}'", tagId),
                "MCT",
                getRangeFromPosition(p, inlineP)
            )
        );
    }
    return diagnostics;
};

const processElement = (s: string, inlinePosition: Position, initialPosition: Position): [Diagnostic[], TaipyElement] => {
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
                    "PE01",
                    getRangeFromPosition(initialPosition, getRangeOfStringInline(s, fragment, inlinePosition))
                )
            );
            return;
        }
        const notPrefix = propMatch[1];
        const propName = propMatch[2];
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
                    "PE02",
                    getRangeFromPosition(initialPosition, getRangeOfStringInline(s, fragment, inlinePosition))
                )
            );
            return;
        }
        if (notPrefix && val) {
            d.push(
                createWarningDiagnostic(
                    l10n.t("Negated value of property '{0}' will be ignored", propName),
                    "PE03",
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
        range.end.line,
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
