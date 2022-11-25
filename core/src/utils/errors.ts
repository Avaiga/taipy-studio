import { Diagnostic, DiagnosticSeverity, DocumentSymbol, l10n, languages, Range, TextDocument, Uri } from "vscode";
import { ErrorObject } from "ajv";

import { getOriginalUri } from "../providers/PerpectiveContentProvider";
import { EXTRACT_STRINGS_RE, getDescendantProperties, getSymbol, getUnsuffixedName } from "./symbols";
import { getChildType } from "../../shared/childtype";
import { DataNode, Pipeline, Task } from "../../shared/names";

const diagnoticsCollection = languages.createDiagnosticCollection("taipy-config-symbol");

const linkNodeTypes = [DataNode, Task, Pipeline];

export const reportInconsistencies = (doc: TextDocument, symbols: Array<DocumentSymbol>, schemaErrors: ErrorObject[] | null) => {
  const nodeIds = new Set<string>();
  const diagnostics = [] as Diagnostic[];
  // Check the existence of the linked elements
  symbols.forEach((symbol) => {
    const childType = getChildType(symbol.name);
    childType &&
      getDescendantProperties(symbol.name)
        .filter((p) => p)
        .forEach((prop) => {
          symbol.children.forEach((s) => {
            const linksSymbol = s.children.find((ss) => ss.name === prop);
            const startOffset = doc.offsetAt(linksSymbol.range.start);
            const value = linksSymbol && doc.getText(linksSymbol.range);
            value &&
              value
                .split(EXTRACT_STRINGS_RE)
                .filter((n) => n)
                .forEach((name: string) => {
                  const childName = getUnsuffixedName(name);
                  nodeIds.add(`${childType}.${childName}`);
                  const sType = getSymbol(symbols, childType);
                  if (sType && sType.children.find((s) => s.name === childName)) {
                    // all good
                    return;
                  }
                  const startPos = doc.positionAt(startOffset + value.indexOf(name));
                  diagnostics.push({
                    severity: DiagnosticSeverity.Warning,
                    range: new Range(startPos, startPos.with({ character: startPos.character + name.length })),
                    message: l10n.t("Element '{0}.{1}' does not exist.", childType, name),
                    source: "consistency checker",
                  });
                });
          });
        });
  });
  // Check the use of the elements
  symbols
    .filter((s) => linkNodeTypes.includes(s.name))
    .forEach((typeSymbol) =>
      typeSymbol.children
        .filter((nameSymbol) => "default" !== nameSymbol.name && !nodeIds.has(`${typeSymbol.name}.${nameSymbol.name}`))
        .forEach((nameSymbol) => {
          diagnostics.push({
            severity: DiagnosticSeverity.Information,
            range: nameSymbol.range,
            message: l10n.t("No reference to Element '{0}.{1}'.", typeSymbol.name, nameSymbol.name),
            source: "consistency checker",
          });
        })
    );
  schemaErrors &&
    schemaErrors.forEach((err) => {
      const paths = err.instancePath.split("/").filter((p) => p);
      const symbol = getSymbol(symbols, ...paths);
      diagnostics.push({
        severity: DiagnosticSeverity.Warning,
        range: symbol.range,
        message: `${paths.join(".")} ${err.message}${err.keyword === "enum" ? `: ${err.params.allowedValues}` : ""}.`,
        source: "schema validation",
      });
    });
  if (diagnostics.length) {
    diagnoticsCollection.set(getOriginalUri(doc.uri), diagnostics);
  }
};

export const cleanDocumentDiagnostics = (uri: Uri) => 
  diagnoticsCollection.delete(getOriginalUri(uri));
