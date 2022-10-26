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
} from "vscode";

import { DataNode, Job, Pipeline, Scenario, Taipy, Task } from "../../shared/names";
import { getChildType } from "../../shared/toml";
import { Context } from "../context";
import { CodePos, PosSymbol } from "../iarna-toml/AsyncParser";
import { getEnum, getEnumProps } from "../schema/validation";
import { getDescendantProperties } from "../utils/toml";
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
    if (!lineStart || lineStart.trimStart() == "[") {
      const toml = this.taipyContext.getToml(getOriginalUri(document.uri).toString());
      const props = toml[Taipy] ? [] : [Taipy];
      toml[Job] || props.push(Job);
      props.push(...nodeTypes);
      return props.map((nodeType) => {
        const ci = new CompletionItem(nodeType);
        ci.insertText = lineStart
          ? new SnippetString(nodeType + ".").appendPlaceholder("element name")
          : new SnippetString("[" + nodeType + ".").appendPlaceholder("element name").appendTabstop().appendText(lineEnd.includes("]") ? "": "]");
        return ci;
      });
    }
    const linkProp = validLinks.find((l) => lineStart.split(/\s+|=/).indexOf(l) != -1);
    if (linkProp) {
      const toml = this.taipyContext.getToml(getOriginalUri(document.uri).toString());
      // @ts-ignore
      if (toml[PosSymbol]) {
        for (let [nodeType, n] of Object.entries(toml)) {
          const childType = getChildType(nodeType);
          if (!childType) {
            continue;
          }
          for (let e of Object.values(n)) {
            for (let [_, val] of Object.entries(e).filter(([p, _]) => p == linkProp)) {
              // @ts-ignore
              const codePoss = val[PosSymbol] as CodePos[];
              if (!Array.isArray(val) || !Array.isArray(codePoss)) {
                continue;
              }
              if (
                position.isAfterOrEqual(new Position(codePoss[0].line, codePoss[0].col)) &&
                position.isBeforeOrEqual(new Position(codePoss.at(-1).line, codePoss.at(-1).col))
              ) {
                const links = ["default", ...val.map((n) => n.toLowerCase())];
                return (
                  toml[childType] &&
                  Object.keys(toml[childType])
                    .filter((nodeName) => links.indexOf(nodeName.toLowerCase()) == -1)
                    .map((nodeName) => getCompletionItem(nodeName, lineStart, lineEnd))
                );
              }
            }
          }
        }
      }
    } else {
      return new Promise<CompletionItem[]>((resolve, reject) => {
        getEnumProps()
          .then((enumProps) => {
            const enumProp = enumProps.find((l) => lineStart.split(/\s+|=/).indexOf(l) != -1);
            if (enumProp) {
              resolve(
                (getEnum(enumProp) || []).map((v) => getCompletionItem(v, lineStart, lineEnd, false))
              );
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

const getCompletionItem = (value: string, lineStart: string, lineEnd: string, inArray = true) => {
  const ci = new CompletionItem(value);
  const st = new SnippetString();
  let quoted = false;
  if (inArray) {
    if (lineStart.endsWith("[") || lineStart.endsWith(",")) {
      st.appendText('"');
      quoted = true;
    }
    if (lineStart.endsWith('"') && !lineEnd.startsWith('"')) {
      st.appendText(", ");
    }  
  } else {
    if (lineStart.endsWith("=")) {
      st.appendText('"');
      quoted = true;
    }
  }
  st.appendText(value);
  if (quoted) {
    inArray ? st.appendText('", ') : st.appendText('"');
  }
  ci.insertText = st;
  // if (inArray && quoted && lineEnd.includes('"')) {
  //   ci.additionalTextEdits = [TextEdit.delete()]
  // }
  return ci;
} 