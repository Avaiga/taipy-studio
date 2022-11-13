import { Diagnostic, DiagnosticSeverity, Position, Range, TextDocument } from "vscode";
import { defaultElementList } from "./constant";

const CONTROL_RE = /<\|(.*?)\|>/;
const OPENING_TAG_RE = /<([0-9a-zA-Z\_\.]*)\|((?:(?!\|>).)*)\s*$/;
const CLOSING_TAG_RE = /^\s*\|([0-9a-zA-Z\_\.]*)>/;
const LINK_RE = /(\[[^\]]*?\]\([^\)]*?\))/;
const SPLIT_RE = /(?<!\\\\)\|/;
const PROPERTY_RE = /((?:don'?t|not)\s+)?([a-zA-Z][\.a-zA-Z_$0-9]*(?:\[(?:.*?)\])?)\s*(?:=(.*))?$/;

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
    const diagnosticsTextList: DiagnosticSection[] = [];
    const quotePositions: Position[] = text.split(/\r?\n/).reduce<Position[]>((obj: Position[], v: string, i: number) => {
        return [...obj, ...[...v.matchAll(new RegExp('"""', "gi"))].map((a) => new Position(i, a.index || 0))];
    }, []);
    if (quotePositions.length % 2 !== 0) {
        return [];
    }
    for (let i = 0; i < quotePositions.length; i += 2) {
        diagnosticsTextList.push({
            content: getTextFromPositions(text, quotePositions[i], quotePositions[i + 1]),
            initialPosition: new Position(quotePositions[i].line, quotePositions[i].character + 3),
        });
    }
    return diagnosticsTextList.reduce<Diagnostic[]>((obj: Diagnostic[], v: DiagnosticSection) => {
        return [...obj, ...getSectionDiagnostics(v)];
    }, []);
};

const getSectionDiagnostics = (diagnosticSection: DiagnosticSection): Diagnostic[] => {
    const diagnostics: Diagnostic[] = [];
    const textByLine = diagnosticSection.content.split(/\r?\n/);
    const initialPosition = diagnosticSection.initialPosition || new Position(0, 0);
    const tagQueue = [];
    textByLine.forEach((line, lineCount) => {
        let lastIndex = 0;
        let e = buildEmptyTaipyElement();
        // Find opening tags
        const openingTagSearch = OPENING_TAG_RE.exec(line);
        if (openingTagSearch) {
            e.type = "part";
            const openingTagProperty = openingTagSearch[2];
            if (openingTagProperty) {
                const [d, e] = processElement(
                    openingTagProperty,
                    new Position(lineCount, line.indexOf(openingTagProperty)),
                    initialPosition
                );
                diagnostics.push(...d);
            }
        }
    });
    return diagnostics;
};

const processElement = (s: string, p: Position, initialPosition: Position): [Diagnostic[], TaipyElement] => {
    const d: Diagnostic[] = [];
    const diagnosticRange = new Range(p.line, p.character, p.line, p.character + s.length);
    const fragments = s.split(SPLIT_RE).filter((v) => !!v);
    const e = buildEmptyTaipyElement();
    fragments.forEach((fragment) => {
        if (!e.type && fragment in defaultElementList) {
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
                createWarningDiagnostic("Invalid property format", "PE01", getRangeFromPosition(initialPosition, diagnosticRange))
            );
            return;
        }
        const notPrefix = propMatch[1];
        const propName = propMatch[2];
        const val = propMatch[3];
        if (notPrefix && val) {
            d.push(
                createWarningDiagnostic(
                    `Negated property ${propName} value will be ignored`,
                    "PE02",
                    getRangeFromPosition(initialPosition, diagnosticRange)
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
