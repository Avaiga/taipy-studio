import { Diagnostic, DiagnosticSeverity, languages, Range, TextDocument, ThemeColor, window, workspace } from "vscode";

import { TaipyStudioSettingsName } from "./constants";
import { getOriginalUri } from "../contentProviders/PerpectiveContentProvider";
import { getTomlError } from "./l10n";

const DiagnoticsCollection = languages.createDiagnosticCollection("toml");

interface TomlInfo {
  line: number;
  col: number;
  fromTOML: boolean;
}

export const handleTomlParseError = (doc: TextDocument, e: Error & TomlInfo) => {
  const uri = getOriginalUri(doc.uri);
  const line = e.fromTOML ? e.line: 0;
  const col = e.fromTOML ? e.col: 0;
  const diagnostic: Diagnostic = {
    severity: DiagnosticSeverity.Warning,
    range: new Range(line, col, line, col),
    message: e.message,
    source: "toml parser",
  };
  DiagnoticsCollection.set(uri, [diagnostic]);
  const sbi = window.createStatusBarItem();
  sbi.text = getTomlError(doc.uri.path);
  sbi.backgroundColor = new ThemeColor("statusBarItem.warningBackground");
  sbi.tooltip = e.message;
  sbi.command = { title: "Open Editor", command: "vscode.open", arguments: [uri.with({ fragment: `L${line}C${col}` })] };
  sbi.show();
  setTimeout(() => sbi.dispose(), workspace.getConfiguration(TaipyStudioSettingsName).get("status.timeout", 2000));
};

export const cleanTomlParseError = (doc: TextDocument) => {
  DiagnoticsCollection.delete(getOriginalUri(doc.uri));
};
