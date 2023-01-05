import {
  CancellationToken,
  commands,
  CompletionContext,
  CompletionItem,
  CompletionItemProvider,
  CompletionTriggerKind,
  DocumentSymbol,
  l10n,
  Position,
  Range,
  SnippetString,
  SymbolKind,
  TextDocument,
  TextEdit,
  Uri,
  workspace,
} from "vscode";

import { DataNode, Job, Pipeline, Scenario, Taipy, Task } from "../../shared/names";
import { getChildType } from "../../shared/childtype";
import { Context } from "../context";
import { calculatePythonSymbols, getEnum, getEnumProps, getProperties, isClass, isFunction } from "../schema/validation";
import { TAIPY_STUDIO_SETTINGS_NAME } from "../utils/constants";
import { getDescendantProperties, getSectionName, getSymbol, getSymbolArrayValue, getUnsuffixedName } from "../utils/symbols";
import { getOriginalUri } from "./PerpectiveContentProvider";
import { getMainPythonUri } from "../utils/utils";

const nodeTypes = [DataNode, Task, Pipeline, Scenario];
const validLinks = nodeTypes.reduce((vl, nt) => {
  getDescendantProperties(nt)
    .filter((p) => p)
    .forEach((p) => vl.push(p));
  return vl;
}, [] as string[]);

export class ConfigCompletionItemProvider implements CompletionItemProvider<CompletionItem> {
  static register(taipyContext: Context) {
    return new ConfigCompletionItemProvider(taipyContext);
  }

  private constructor(private readonly taipyContext: Context) {}

  async provideCompletionItems(document: TextDocument, position: Position, token: CancellationToken, context: CompletionContext) {
    if (context.triggerKind !== CompletionTriggerKind.Invoke) {
      return [];
    }
    const lineStart = document.getText(new Range(position.with({ character: 0 }), position)).trimEnd();
    const lineText = document.lineAt(position.line).text;

    if ((position.character === 0 || !lineText.trim()) && position.line && !document.lineAt(position.line - 1).isEmptyOrWhitespace) {
      // propose new property to current entity
      const symbols = this.taipyContext.getSymbols(getOriginalUri(document.uri).toString());
      // find 2nd level symbol (name) holding last line
      const searchPos = position.with({ line: position.line - 1, character: 0 });
      const typeSymbol = symbols.find((s) => s.range.contains(searchPos));
      const nameSymbol = typeSymbol?.children.find((s) => s.range.contains(searchPos));
      const currentProps = nameSymbol?.children.map((s) => s.name);
      if (currentProps) {
        const possibleProps = await getProperties(typeSymbol.name);
        const proposedProps = possibleProps.filter((p) => !currentProps.includes(p));
        if (proposedProps.length) {
          const enumProps = await getEnumProps();
          return proposedProps.map((p) => {
            const enums = enumProps.includes(p) && getEnum(p);
            const ci = new CompletionItem(p);
            const si = new SnippetString(p + ' = "');
            enums ? si.appendChoice(enums) : si.appendTabstop();
            si.appendText('"\n');
            ci.insertText = si;
            return ci;
          });
        }
      }
    }

    if (!lineStart || lineStart.trimStart() === "[") {
      // propose new entity
      const symbols = this.taipyContext.getSymbols(getOriginalUri(document.uri).toString());
      const props = getSymbol(symbols, Taipy) ? [] : [Taipy];
      getSymbol(symbols, Job) || props.push(Job);
      props.push(...nodeTypes);
      return props.map((nodeType) => {
        const ci = new CompletionItem(nodeType);
        ci.insertText = lineStart
          ? new SnippetString(nodeType + ".").appendPlaceholder("element name")
          : new SnippetString("[" + nodeType + ".").appendPlaceholder("element name").appendText("]\n");
        return ci;
      });
    }
    const lineSplit = lineStart.split(/\s+|=/);
    const linkProp = validLinks.find((l) => lineSplit.includes(l));
    if (linkProp) {
      const symbols = this.taipyContext.getSymbols(getOriginalUri(document.uri).toString());
      for (const typeSymbol of symbols) {
        const childType = getChildType(typeSymbol.name);
        const childTypeSymbol = childType && getSymbol(symbols, childType);
        if (!childTypeSymbol) {
          continue;
        }
        for (const nameSymbol of typeSymbol.children) {
          for (const propSymbol of nameSymbol.children.filter((s) => s.name === linkProp)) {
            if (propSymbol.range.contains(position)) {
              const links = ["default", ...getSymbolArrayValue(document, propSymbol).map((name) => getUnsuffixedName(name).toLowerCase())];
              const addTypeSuffix = workspace.getConfiguration(TAIPY_STUDIO_SETTINGS_NAME).get("editor.type.suffix.enabled", true);
              return childTypeSymbol.children
                .map((s) => s.name)
                .filter((nodeName) => !links.includes(nodeName.toLowerCase()))
                .map((nodeName) => getCompletionItemInArray(nodeName, lineText, position, addTypeSuffix));
            }
          }
        }
      }
    } else {
      const enumProps = await getEnumProps();
      const enumProp = enumProps.find((l) => lineSplit.includes(l));
      if (enumProp) {
        return (getEnum(enumProp) || []).map((v) => getCompletionItemInString(v, lineText, position));
      } else {
        await calculatePythonSymbols();
        if (lineSplit.some((l) => isFunction(l))) {
          return getPythonSymbols(true, lineText, position);
        } else if (lineSplit.some((l) => isClass(l))) {
          return getPythonSymbols(false, lineText, position);
        }
      }
    }
    return [];
  }
}

const getPythonSymbols = async (isFunction: boolean, lineText: string, position: Position) => {
  // get python symbols in repository
  const pythonUris = await workspace.findFiles("**/*.py");
  const mainUri = await getMainPythonUri();
  const symbolsByUri = await Promise.all(
    pythonUris.map(
      (uri) =>
        new Promise<{ uri: Uri; symbols: DocumentSymbol[] }>((resolve, reject) => {
          commands.executeCommand("vscode.executeDocumentSymbolProvider", uri).then((symbols: DocumentSymbol[]) => resolve({ uri, symbols }), reject);
        })
    )
  );
  const symbolsWithModule = [] as string[];
  const modulesByUri = pythonUris.reduce((pv, uri) => {
    const uriStr = uri.path;
    if (uriStr === mainUri?.path) {
      pv[uriStr] = "__main__";
    } else {
      const paths = workspace.asRelativePath(uri).split("/");
      const file = paths.at(-1);
      paths.pop();
      const fileMod = `${file.split(".", 2)[0]}`;
      const module = paths.length ? `${paths.join(".")}.${fileMod}` : fileMod;
      pv[uriStr] = module;
    }
    return pv;
  }, {} as Record<string, string>);
  symbolsByUri.forEach((su) => {
    su.symbols.forEach((symbol) => {
      if ((isFunction && symbol.kind === SymbolKind.Function) || (!isFunction && symbol.kind === SymbolKind.Class)) {
        symbolsWithModule.push(`${modulesByUri[su.uri.path]}.${symbol.name}`);
      }
    });
  });
  const cis = symbolsWithModule.map((v) => getCompletionItemInString(v, lineText, position));
  const modules = Object.values(modulesByUri);
  modules.push(l10n.t("New module name"));
  cis.push(
    getCompletionItemInString(isFunction ? l10n.t("create a new function") : l10n.t("create a new class"), lineText, position, [
      modules.length === 1 ? modules[0] : modules,
      isFunction ? l10n.t("function name") : l10n.t("class name"),
    ])
  );
  return cis;
};

const listRe = /(\w+)?\s*(=)?\s*(\[)?\s*(("[-\:\w]+"(\s*,\s*)?)*)\s*(.*)/; // inputs = ["DATA_NODE-1", "DATA_NODE-2", ]: gr1 inputs | gr2 = | gr3 [ | gr4 "DATA_NODE-1", "DATA_NODE-2", | gr5 "DATA_NODE-2", | gr6 , | gr7 ]
const getCompletionItemInArray = (value: string, line: string, position: Position, addTypeSuffix: boolean) => {
  const ci = new CompletionItem(value);
  value = getSectionName(value, addTypeSuffix);
  const matches = line.match(listRe);
  const matchPos = getPosFromMatches(matches, line);
  const matchIdx = matchPos.findIndex((pos, idx) => position.character >= pos && position.character <= pos + (matches[idx] ? matches[idx].length : -1));
  if (matchIdx === 7) {
    // replace last bit with choice
    let startPos = matchPos[7];
    let startVal = "";
    let quotePos = matches[7].substring(0, position.character).lastIndexOf('"');
    if (quotePos > -1) {
      startPos += quotePos;
    } else {
      startVal = '"';
    }
    let endPos = matchPos[7];
    let endVal = "";
    quotePos = matches[7].substring(position.character).indexOf('"');
    const rsqbPos = matches[7].substring(position.character).indexOf("]");
    if (quotePos > -1 && quotePos < rsqbPos) {
      endPos += quotePos;
    } else {
      endVal = '"';
      if (rsqbPos > -1) {
        endPos += rsqbPos;
      } else {
        endPos += matches[7].length;
        endVal += "]";
      }
    }
    ci.additionalTextEdits = [TextEdit.replace(new Range(position.with(undefined, startPos), position.with(undefined, endPos)), startVal + value + endVal)];
    ci.insertText = "";
  } else {
    // insert after the last comma
    let idx = matchIdx || matches.length - 2;
    for (; idx > 0; idx--) {
      if (matches[idx]) {
        break;
      }
    }
    let startVal = "";
    if (matches[6] || !matches[4]) {
      if (matches[6] && !matches[6].endsWith(" ")) {
        startVal = " ";
      }
      startVal += '"';
    } else {
      startVal = ', "';
    }
    ci.additionalTextEdits = [TextEdit.insert(position.with(undefined, matchPos[idx] + matches[idx].length), startVal + value + '"')];
    ci.insertText = "";
  }
  return ci;
};

const stringRe = /(\w+)?\s*(=)?\s*(")?(\w*)(")?/; // storage_type = "toto": gr1 storage_type | gr2 = | gr3 " | gr4 toto | gr5 "
const getCompletionItemInString = (value: string, line: string, position: Position, placeHolders?: [string[] | string, string]) => {
  const ci = new CompletionItem(value);
  const matches = line.match(listRe);
  const matchPos = getPosFromMatches(matches, line);
  let val = "";
  let startPos = 0;
  let endPos = line.length - 1;
  const si = new SnippetString();
  if (!matches[2]) {
    startPos = matchPos[1] + matches[1].length;
    val = ' = "' + value + '"';
    si.appendText(' = "');
    appendPlaceHolders(si, placeHolders);
    si.appendText('"');
  } else {
    if (!matches[3]) {
      startPos = matchPos[2] + matches[2].length;
      val = ' "' + value + '"';
      si.appendText(' "');
      appendPlaceHolders(si, placeHolders);
      si.appendText('"');
    } else {
      startPos = matchPos[3] + matches[3].length;
      if (!matches[5]) {
        val = value + '"';
        appendPlaceHolders(si, placeHolders);
        si.appendText('"');
      } else {
        val = value;
        appendPlaceHolders(si, placeHolders);
        endPos = matchPos[5];
      }
    }
  }
  const rng = new Range(position.with(undefined, startPos), position.with(undefined, endPos + 1));
  ci.additionalTextEdits = [TextEdit.replace(rng, placeHolders ? "" : val)];
  ci.insertText = placeHolders ? si : "";
  ci.sortText = placeHolders ? "ZZZ" + value : value;
  return ci;
};

const appendPlaceHolders = (si: SnippetString, placeHolders?: [string[] | string, string]) => {
  Array.isArray(placeHolders) &&
    placeHolders.forEach((ph, idx) => {
      if (idx > 0) {
        si.appendText(".");
      }
      if (Array.isArray(ph)) {
        si.appendChoice(ph);
      } else {
        si.appendPlaceholder(ph);
      }
  });
};

const getPosFromMatches = (matches: string[], line: string) => {
  let lastPos = 0;
  return matches.map((m) => {
    if (m) {
      lastPos = line.indexOf(m, lastPos);
    }
    return lastPos;
  });
};
