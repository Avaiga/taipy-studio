import {
  CancellationToken,
  CompletionContext,
  CompletionItem,
  CompletionItemProvider,
  CompletionList,
  CompletionTriggerKind,
  Position,
  ProviderResult,
  Range,
  SnippetString,
  TextDocument,
  TextEdit,
  workspace,
} from "vscode";

import { DataNode, Job, Pipeline, Scenario, Taipy, Task } from "../../shared/names";
import { getChildType } from "../../shared/childtype";
import { Context } from "../context";
import { getEnum, getEnumProps, getProperties } from "../schema/validation";
import { TAIPY_STUDIO_SETTINGS_NAME } from "../utils/constants";
import { getDescendantProperties, getSectionName, getSymbol, getSymbolArrayValue, getUnsuffixedName } from "../utils/symbols";
import { getOriginalUri } from "./PerpectiveContentProvider";

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

  async provideCompletionItems(
    document: TextDocument,
    position: Position,
    token: CancellationToken,
    context: CompletionContext
  ) {
    if (context.triggerKind !== CompletionTriggerKind.Invoke) {
      return [];
    }
    const lineStart = document.getText(new Range(position.with({character: 0}), position)).trimEnd();
    const lineEnd = document.lineAt(position.line).text.substring(position.character).trim();
    const lineText = document.lineAt(position.line).text;

    if ((position.character === 0 || !lineText.trim()) && position.line && !document.lineAt(position.line -1).isEmptyOrWhitespace) {
      // propose new property to current entity
      const symbols = this.taipyContext.getSymbols(getOriginalUri(document.uri).toString());
      // find 2nd level symbol (name) holding last line
      const searchPos = position.with({line: position.line -1, character: 0});
      const typeSymbol = symbols.find(s => s.range.contains(searchPos));
      const nameSymbol = typeSymbol?.children.find(s => s.range.contains(searchPos));
      const currentProps = nameSymbol?.children.map(s => s.name);
      if (currentProps) {
        const possibleProps = await getProperties(typeSymbol.name);
        const proposedProps = possibleProps.filter(p => !currentProps.includes(p));
        if (proposedProps.length) {
          const enumProps = await getEnumProps();
          return proposedProps.map(p => {
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
          : new SnippetString("[" + nodeType + ".")
              .appendPlaceholder("element name")
              .appendText("]\n");
        return ci;
      });
    }
    const linkProp = validLinks.find((l) => lineStart.split(/\s+|=/).includes(l));
    if (linkProp) {
      const symbols = this.taipyContext.getSymbols(getOriginalUri(document.uri).toString());
        for (const typeSymbol of symbols) {
          const childType = getChildType(typeSymbol.name);
          const childTypeSymbol = childType && getSymbol(symbols, childType);
          if (!childTypeSymbol) {
            continue;
          }
          for (const nameSymbol of typeSymbol.children) {
            for (const propSymbol of nameSymbol.children.filter(s => s.name === linkProp)) {
              if (
                propSymbol.range.contains(position)
              ) {
                const links = ["default", ...getSymbolArrayValue(document, propSymbol).map((name) => getUnsuffixedName(name).toLowerCase())];
                const addTypeSuffix = workspace.getConfiguration(TAIPY_STUDIO_SETTINGS_NAME).get("editor.type.suffix.enabled", true);
                return childTypeSymbol.children.map(s => s.name)
                  .filter((nodeName) => !links.includes(nodeName.toLowerCase()))
                  .map((nodeName) => getCompletionItemInArray(nodeName, lineText, position, addTypeSuffix));
              }
            }
          }
        }
    } else {
      const enumProps = await getEnumProps();
      const enumProp = enumProps.find((l) => lineStart.split(/\s+|=/).includes(l));
      if (enumProp) {
        return (getEnum(enumProp) || []).map((v) => getCompletionItemInString(v, lineText, position));
      }
    }
    return [];
  }
}

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
const getCompletionItemInString = (value: string, line: string, position: Position) => {
  const ci = new CompletionItem(value);
  const matches = line.match(listRe);
  const matchPos = getPosFromMatches(matches, line);
  let val = "";
  let startPos = 0;
  let endPos = line.length - 1;
  if (!matches[2]) {
    startPos = matchPos[1] + matches[1].length;
    val = ' = "' + value + '"';
  } else {
    if (!matches[3]) {
      startPos = matchPos[2] + matches[2].length;
      val = ' "' + value + '"';
    } else {
      startPos = matchPos[3] + matches[3].length;
      if (!matches[5]) {
        val = value + '"';
      } else {
        val = value;
        endPos = matchPos[5];
      }
    }
  }
  ci.additionalTextEdits = [TextEdit.replace(new Range(position.with(undefined, startPos), position.with(undefined, endPos + 1)), val)];
  ci.insertText = "";
  return ci;
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
