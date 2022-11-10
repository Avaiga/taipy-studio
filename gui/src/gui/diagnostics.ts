import { Diagnostic, DiagnosticSeverity, Position, Range, TextDocument } from "vscode";

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
    const diagnostics = new Array<Diagnostic>();
    const textByLine = diagnosticSection.content.split(/\r?\n/);
    const initialPosition = diagnosticSection.initialPosition || new Position(0, 0);
    textByLine.forEach((s, i) => {
        if (s.includes("<|") && !s.includes("|>")) {
            diagnostics.push(
                createWarningDiagnostic(
                    "Missing closing syntax `|>'",
                    "missing-closing-tag",
                    getRangeFromPosition(initialPosition, new Range(i, s.indexOf("<|"), i, s.length))
                )
            );
        }
        if (s.includes("|>") && !s.includes("<|")) {
            diagnostics.push(
                createWarningDiagnostic(
                    "Missing opening syntax `<|'",
                    "missing-opening-tag",
                    getRangeFromPosition(initialPosition, new Range(i, 0, i, s.indexOf("|>")))
                )
            );
        }
    });
    return diagnostics;
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
