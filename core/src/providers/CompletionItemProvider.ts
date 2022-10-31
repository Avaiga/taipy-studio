import {
  CancellationToken,
  CompletionContext,
  CompletionItem,
  CompletionItemKind,
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
import { getChildType } from "../../shared/toml";
import { Context } from "../context";
import { CodePos, PosSymbol } from "../iarna-toml/AsyncParser";
import { getEnum, getEnumProps } from "../schema/validation";
import { TaipyStudioSettingsName } from "../utils/constants";
import { getDescendantProperties, getSectionName, getUnsuffixedName } from "../utils/toml";
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

  provideCompletionItems(
    document: TextDocument,
    position: Position,
    token: CancellationToken,
    context: CompletionContext
  ): ProviderResult<CompletionItem[] | CompletionList<CompletionItem>> {
    if (context.triggerKind != CompletionTriggerKind.Invoke) {
      return [];
    }
    const lineStart = document.getText(new Range(position.translate(0, -position.character), position)).trimEnd();
    const lineEnd = document.lineAt(position.line).text.substring(position.character).trim();
    const lineText = document.lineAt(position.line).text;
    if (!lineStart || lineStart.trimStart() == "[") {
      const toml = this.taipyContext.getToml(getOriginalUri(document.uri).toString());
      const props = toml[Taipy] ? [] : [Taipy];
      toml[Job] || props.push(Job);
      props.push(...nodeTypes);
      return props.map((nodeType) => {
        const ci = new CompletionItem(nodeType);
        ci.insertText = lineStart
          ? new SnippetString(nodeType + ".").appendPlaceholder("element name")
          : new SnippetString("[" + nodeType + ".")
              .appendPlaceholder("element name")
              .appendTabstop()
              .appendText(lineEnd.includes("]") ? "" : "]");
        return ci;
      });
    }
    const linkProp = validLinks.find((l) => lineStart.split(/\s+|=/).includes(l));
    if (linkProp) {
      const toml = this.taipyContext.getToml(getOriginalUri(document.uri).toString());
      // @ts-ignore
      if (toml[PosSymbol]) {
        for (const [nodeType, nodes] of Object.entries(toml)) {
          const childType = getChildType(nodeType);
          if (!childType || !toml[childType]) {
            continue;
          }
          for (const e of Object.values(nodes)) {
            for (const [_, val] of Object.entries(e).filter(([p, _]) => p == linkProp)) {
              // @ts-ignore
              const codePoss = val[PosSymbol] as CodePos[];
              if (!Array.isArray(val) || !Array.isArray(codePoss)) {
                continue;
              }
              if (
                position.isAfterOrEqual(new Position(codePoss[0].line, codePoss[0].col)) &&
                position.isBeforeOrEqual(new Position(codePoss.at(-1).line, codePoss.at(-1).col))
              ) {
                const links = ["default", ...val.map((name) => getUnsuffixedName(name).toLowerCase())];
                const addTypeSuffix = workspace.getConfiguration(TaipyStudioSettingsName).get("editor.type.suffix.enabled", true);
                return Object.keys(toml[childType])
                  .filter((nodeName) => !links.includes(nodeName.toLowerCase()))
                  .map((nodeName) => getCompletionItemInArray(nodeName, lineText, position, addTypeSuffix));
              }
            }
          }
        }
      }
    } else {
      return new Promise<CompletionItem[]>((resolve, reject) => {
        getEnumProps()
          .then((enumProps) => {
            const enumProp = enumProps.find((l) => lineStart.split(/\s+|=/).includes(l));
            if (enumProp) {
              resolve((getEnum(enumProp) || []).map((v) => getCompletionItemInString(v, lineText, position)));
            }
            resolve([]);
          })
          .catch((e) => {
            console.warn(e);
            reject(e);
          });
      });
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
  if (matchIdx == 7) {
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
