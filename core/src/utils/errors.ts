import { commands, Diagnostic, DiagnosticSeverity, DocumentSymbol, l10n, languages, Range, SymbolKind, TextDocument, Uri, window, workspace } from "vscode";
import { ErrorObject } from "ajv";

import { getOriginalUri } from "../providers/PerpectiveContentProvider";
import { EXTRACT_STRINGS_RE, getDescendantProperties, getSymbol, getUnsuffixedName } from "./symbols";
import { getChildType } from "../../shared/childtype";
import { DataNode, Pipeline, Task } from "../../shared/names";
import { getPythonReferences } from "../schema/validation";
import { getMainPythonUri } from "./utils";

const diagnoticsCollection = languages.createDiagnosticCollection("taipy-config-symbol");

const linkNodeTypes = [DataNode, Task, Pipeline];

export const reportInconsistencies = async (doc: TextDocument, symbols: Array<DocumentSymbol>, schemaErrors: ErrorObject[] | null) => {
  const nodeIds = new Set<string>();
  const diagnostics = [] as Diagnostic[];
  if (Array.isArray(symbols)) {
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
                      source: "Consistency checker",
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
              message: l10n.t("No reference to element '{0}.{1}'.", typeSymbol.name, nameSymbol.name),
              source: "Consistency checker",
            });
          })
      );
  }
  // check python function or class references
  const pythonReferences = await getPythonReferences();
  const pythonSymbol2TomlSymbols = {} as Record<string, { uri?: Uri; symbols: Array<DocumentSymbol>; isFunction: boolean }>;
  symbols
    .filter((typeSymbol) => !!pythonReferences[typeSymbol.name])
    .forEach((typeSymbol) =>
      typeSymbol.children.forEach((nameSymbol) =>
        nameSymbol.children
          .filter((propSymbol) => pythonReferences[typeSymbol.name][propSymbol.name] !== undefined)
          .forEach((propSymbol) => {
            const pythonSymbol = doc.getText(propSymbol.range).slice(1, -1);
            if (pythonSymbol) {
              const parts = pythonSymbol.split(".");
              if (parts.length < 2) {
                diagnostics.push({
                  severity: DiagnosticSeverity.Error,
                  range: propSymbol.range,
                  message: l10n.t("Python reference should include a module '{0}.{1}.{2}'.", typeSymbol.name, nameSymbol.name, propSymbol.name),
                  source: "Python reference checker",
                });
              } else {
                pythonSymbol2TomlSymbols[pythonSymbol] = pythonSymbol2TomlSymbols[pythonSymbol] || {
                  symbols: [],
                  isFunction: !!pythonReferences[typeSymbol.name][propSymbol.name],
                };
                pythonSymbol2TomlSymbols[pythonSymbol].symbols.push(propSymbol);
              }
            }
          })
      )
    );
  const pythonSymbols = Object.keys(pythonSymbol2TomlSymbols);
  const pythonUris = [] as Uri[];
  if (!workspace.workspaceFolders?.length) {
    console.warn("No symbol detection as we are not in the context of a workspace.");
  }
  if (pythonSymbols.length && workspace.workspaceFolders?.length) {
    const mainUri = await getMainPythonUri();
    // check module availability
    for (const ps of pythonSymbols) {
      const parts = ps.split(".");
      parts.pop();
      const uris = parts[0] === "__main__" ? [mainUri] : await workspace.findFiles(`${parts.join("/")}.py`, null, 1);
      if (!uris.length) {
        pythonSymbol2TomlSymbols[ps].symbols.forEach((propSymbol) =>
          diagnostics.push({
            severity: DiagnosticSeverity.Error,
            range: propSymbol.range,
            message: l10n.t("Cannot find file for Python {0}: '{1}'.", pythonSymbol2TomlSymbols[ps].isFunction ? "function" : "class", ps),
            source: "Python reference checker",
          })
        );
        pythonSymbol2TomlSymbols[ps].uri = null;
      } else {
        pythonSymbol2TomlSymbols[ps].uri = uris[0];
        pythonUris.push(uris[0]);
      }
    }
    // read python symbols for selected uris
    const symbolsByUri = await Promise.all(
      pythonUris.map(
        (uri) =>
          new Promise<{ uri: Uri; symbols: DocumentSymbol[] }>((resolve, reject) => {
            commands.executeCommand("vscode.executeDocumentSymbolProvider", uri).then((symbols: DocumentSymbol[]) => resolve({ uri, symbols }), reject);
          })
      )
    );
    // check availability of python symbols
    for (const ps of pythonSymbols) {
      const parts = ps.split(".");
      const fn = parts.at(-1);
      let found = pythonSymbol2TomlSymbols[ps].uri === null;
      if (!found) {
        const symbols = symbolsByUri.find(({ uri }) => uri.toString() === pythonSymbol2TomlSymbols[ps].uri.toString());
        found =
          Array.isArray(symbols?.symbols) &&
          symbols.symbols.some(
            (pySymbol) => pySymbol.kind === (pythonSymbol2TomlSymbols[ps].isFunction ? SymbolKind.Function : SymbolKind.Class) && pySymbol.name === fn
          );
      }
      if (!found) {
        pythonSymbol2TomlSymbols[ps].symbols.forEach((propSymbol) =>
          diagnostics.push({
            severity: DiagnosticSeverity.Error,
            range: propSymbol.range,
            message: l10n.t("Cannot find Python {0}: '{1}'.", pythonSymbol2TomlSymbols[ps].isFunction ? "function" : "class", ps),
            source: "python reference checker",
            code: {
              target: pythonSymbol2TomlSymbols[ps].uri.with({
                query: `taipy-config=${pythonSymbol2TomlSymbols[ps].isFunction ? "function" : "class"}&name=${ps}`,
              }),
              value: workspace.asRelativePath(pythonSymbol2TomlSymbols[ps].uri),
            },
          } as Diagnostic)
        );
      }
    }
  }
  // schema validation
  Array.isArray(schemaErrors) &&
    schemaErrors.forEach((err) => {
      const paths = err.instancePath.split("/").filter((p) => p);
      const symbol = getSymbol(symbols, ...paths);
      diagnostics.push({
        severity: DiagnosticSeverity.Warning,
        range: symbol.range,
        message: `${paths.join(".")} ${err.message}${err.keyword === "enum" ? `: ${err.params.allowedValues}` : ""}.`,
        source: "Schema validation",
      });
    });
  if (diagnostics.length) {
    diagnoticsCollection.set(getOriginalUri(doc.uri), diagnostics);
  }
};

export const cleanDocumentDiagnostics = (uri: Uri) => diagnoticsCollection.delete(getOriginalUri(uri));
