import { Diagnostic, DiagnosticSeverity, languages, Range, TextDocument, ThemeColor, window, workspace } from "vscode";
import { JsonMap } from "@iarna/toml";

import { TaipyStudioSettingsName } from "./constants";
import { getOriginalUri } from "../providers/PerpectiveContentProvider";
import { getConsistencyWarning, getTomlError, getUnreferencedELement } from "./l10n";
import { CodePos, PosSymbol } from "../iarna-toml/AsyncParser";
import { getDescendantProperties } from "./toml";
import { getChildType } from "../../shared/toml";
import { DataNode, Pipeline, Task } from "../../shared/names";

const DiagnoticsCollection = languages.createDiagnosticCollection("toml");

interface TomlInfo {
  line: number;
  col: number;
  fromTOML: boolean;
}

export const handleTomlParseError = (doc: TextDocument, e: Error & TomlInfo) => {
  const uri = getOriginalUri(doc.uri);
  const line = e.fromTOML ? e.line : 0;
  const col = e.fromTOML ? e.col : 0;
  DiagnoticsCollection.set(uri, [
    {
      severity: DiagnosticSeverity.Error,
      range: new Range(line, col, line, col),
      message: e.message,
      source: "toml parser",
    },
  ]);
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

export const reportInconsistencies = (doc: TextDocument, toml: JsonMap) => {
  // @ts-ignore
  if (!Array.isArray(toml[PosSymbol])) {
    return;
  }
  const nodeIds = new Set<string>();
  const diagnostics = [] as Diagnostic[];
  // Check the existence of the linked elements
  Object.entries(toml).forEach(([nodeType, n]) => {
    const childType = getChildType(nodeType);
    childType &&
      getDescendantProperties(nodeType)
        .filter((p) => p)
        .forEach((prop) => {
          Object.values(n).forEach((e) => {
            const links = e[prop];
            Array.isArray(links) &&
              links.forEach((childName: string, idx: number) => {
                nodeIds.add(`${childType}.${childName}`);
                if (toml[childType] && toml[childType][childName]) {
                  // all good
                  return;
                }
                // @ts-ignore
                if (Array.isArray(links[PosSymbol]) && links[PosSymbol].length > idx + 1) {
                  // @ts-ignore
                  const codePos = links[PosSymbol][idx + 1] as CodePos;
                  diagnostics.push({
                    severity: DiagnosticSeverity.Warning,
                    range: new Range(codePos.line, codePos.col, codePos.line, codePos.col + childName.length),
                    message: getConsistencyWarning(childType, childName),
                    source: "consistency checker",
                  });
                }
              });
          });
        });
  });
  // Check the use of the elements
  [DataNode, Task, Pipeline].forEach(
    (nodeType) =>
      toml[nodeType] &&
      Object.entries(toml[nodeType])
        .filter(([nodeName, _]) => "default" != nodeName && !nodeIds.has(`${nodeType}.${nodeName}`))
        .forEach(([nodeName, element]) => {
          // @ts-ignore
          if (Array.isArray(element[PosSymbol])) {
            // @ts-ignore
            const codePos = element[PosSymbol][0] as CodePos;
            diagnostics.push({
              severity: DiagnosticSeverity.Information,
              range: new Range(codePos.line, codePos.col, codePos.line, codePos.col + nodeName.length),
              message: getUnreferencedELement(nodeType, nodeName),
              source: "consistency checker",
            });
          }
        })
  );
  if (diagnostics.length) {
    DiagnoticsCollection.set(getOriginalUri(doc.uri), diagnostics);
  }
};
