import { Diagnostic, DiagnosticSeverity, Range, TextDocument } from "vscode";

export const getMdDiagnostics = async (doc: TextDocument): Promise<Diagnostic[]> => {
    const text = doc.getText().split(/\r?\n/);
    const diagnostics = new Array<Diagnostic>();
    text.forEach((s, i) => {
        if (s.includes("<|") && !s.includes("|>")) {
            diagnostics.push(
                createInfoDiagnostic(
                    "Missing closing syntax `|>'",
                    "missing-closing-tag",
                    new Range(i, s.indexOf("<|"), i, s.length)
                )
            );
        }
        if (s.includes("|>") && !s.includes("<|")) {
            diagnostics.push(
                createInfoDiagnostic("Missing opening syntax `<|'", "missing-opening-tag", new Range(i, 0, i, s.indexOf("|>")))
            );
        }
    });
    return diagnostics;
};

export const getPyDiagnostics = async (doc: TextDocument): Promise<Diagnostic[]> => {
    const text = doc.getText().split(/\r?\n/);
    const diagnostics = new Array<Diagnostic>();
    text.forEach((s, i) => {
        if (s.includes("<|") && !s.includes("|>")) {
            diagnostics.push(
                createInfoDiagnostic(
                    "Missing closing syntax `|>'",
                    "missing-closing-tag",
                    new Range(i, s.indexOf("<|"), i, s.length)
                )
            );
        }
        if (s.includes("|>") && !s.includes("<|")) {
            diagnostics.push(
                createInfoDiagnostic("Missing opening syntax `<|'", "missing-opening-tag", new Range(i, 0, i, s.indexOf("|>")))
            );
        }
    });
    return diagnostics;
};

const createInfoDiagnostic = (message: string, code: string, range: Range): Diagnostic => {
    return {
        severity: DiagnosticSeverity.Information,
        message: message,
        code: code,
        source: "taipy-studio-gui",
        range: range,
    };
};
