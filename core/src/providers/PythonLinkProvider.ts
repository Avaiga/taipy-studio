import {
  DocumentLinkProvider,
  DocumentLink,
  CancellationToken,
  TextDocument,
  ExtensionContext,
  languages,
  Uri,
  DocumentSymbol,
  workspace,
  commands,
  Position,
} from "vscode";

import { Context } from "../context";
import { getPythonReferences } from "../schema/validation";
import { getMainPythonUri } from "../utils/utils";

export class PythonLinkProvider implements DocumentLinkProvider<DocumentLink> {
  static register(vsContext: ExtensionContext, context: Context): void {
    vsContext.subscriptions.push(languages.registerDocumentLinkProvider({ language: "toml" }, new PythonLinkProvider(context)));
  }

  private constructor(private readonly taipyContext: Context) {}

  async provideDocumentLinks(document: TextDocument, token: CancellationToken) {
    const mainUri = await getMainPythonUri();
    const links = [] as DocumentLink[];
    const pythonReferences = await getPythonReferences();
    const pythonSymbol2TomlSymbols = {} as Record<string, { uri?: Uri; symbols: Array<DocumentSymbol>; isFunction: boolean }>;
    const symbols = this.taipyContext.getSymbols(document.uri.toString());
    symbols
      .filter((typeSymbol) => !!pythonReferences[typeSymbol.name])
      .forEach((typeSymbol) =>
        typeSymbol.children.forEach((nameSymbol) =>
          nameSymbol.children
            .filter((propSymbol) => pythonReferences[typeSymbol.name][propSymbol.name] !== undefined)
            .forEach((propSymbol) => {
              const pythonSymbol = document.getText(propSymbol.range).slice(1, -1);
              if (pythonSymbol) {
                const parts = pythonSymbol.split(".");
                if (parts.length > 1) {
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
    if (pythonSymbols.length) {
      // check module availability
      for (const ps of pythonSymbols) {
        const parts = ps.split(".");
        parts.pop();
        const uris = parts[0] === "__main__" ? [mainUri] : await workspace.findFiles(`${parts.join("/")}.py`, null, 1);
        if (uris.length) {
          pythonSymbol2TomlSymbols[ps].uri = uris[0];
          pythonUris.push(uris[0]);
        }
      }
      // read python symbols for selected uris
      const symbolsByUri = await Promise.all(
        pythonUris.map(
          (uri) =>
            new Promise<{ uri: Uri; symbols: DocumentSymbol[] }>((resolve, reject) => {
              commands
                .executeCommand("vscode.executeDocumentSymbolProvider", uri)
                .then((symbols) => resolve({ uri, symbols: symbols as DocumentSymbol[] }), reject);
            })
        )
      );
      // check availability of python symbols
      for (const ps of pythonSymbols) {
        const fn = ps.split(".").at(-1);
        const pyUri = pythonSymbol2TomlSymbols[ps].uri;
        if (pyUri) {
          const symbols = symbolsByUri.find(({ uri }) => uri.toString() === pyUri.toString());
          const pySymbol = Array.isArray(symbols?.symbols) && symbols?.symbols.find((pySymbol) => pySymbol.name === fn);
          if (pySymbol) {
            links.push(
              ...pythonSymbol2TomlSymbols[ps].symbols.map(
                (s) => new DocumentLink(s.range, pyUri.with({ fragment: getPositionFragment(pySymbol.range.start) }))
              )
            );
          }
        }
      }
    }
    return links;
  }
}

const getPositionFragment = (pos: Position) => `L${pos.line}C${pos.character}`;
