import { Diagnostic, DiagnosticSeverity, languages, Range, StatusBarItem, TextDocument, ThemeColor, window, workspace } from "vscode";
import { TaipyStudioSettingsName } from "./constants";
import { getOriginalUri } from "./contentProviders/PerpectiveContentProvider";
import { getTomlError } from "./l10n";

const DiagnoticsCollection = languages.createDiagnosticCollection("toml");
const ErrorRe = /(at\s*row\s*)(\d+)(,\s*col\s*)(\d+)/;

export const handleTomlParseError = (doc: TextDocument, e: Error) => {
  const uri = getOriginalUri(doc.uri);
  const [_0, _1, rowStr, _2, colStr] = ErrorRe.exec(e.message);
  const row = rowStr ? parseInt(rowStr, 10) - 1 : 0;
  const col = colStr ? parseInt(colStr, 10) - 1 : 0;
  const diagnostic: Diagnostic = {
    severity: DiagnosticSeverity.Warning,
    range: new Range(row, col, row, col),
    message: e.message,
    source: "toml parser",
  };
  DiagnoticsCollection.set(uri, [diagnostic]);
  const sbi = window.createStatusBarItem();
  sbi.text = getTomlError(doc.uri.path);
  sbi.backgroundColor = new ThemeColor("statusBarItem.warningBackground");
  sbi.tooltip = e.message;
  sbi.command = { title: "Open Editor", command: "vscode.open", arguments: [uri.with({ fragment: `L${rowStr}C${colStr}` })] };
  sbi.show();
  setTimeout(() => sbi.dispose(), workspace.getConfiguration(TaipyStudioSettingsName).get("status.timeout", 2000));
};

export const cleanTomlParseError = (doc: TextDocument) => {
  DiagnoticsCollection.delete(getOriginalUri(doc.uri));
};
