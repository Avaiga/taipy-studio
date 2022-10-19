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
} from "vscode";

import { DataNode, Job, Pipeline, Scenario, Taipy, Task } from "../../shared/names";
import { getChildType } from "../../shared/toml";
import { Context } from "../context";
import { CodePos, PosSymbol } from "../iarna-toml/AsyncParser";
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
    const lastChar = document.getText(new Range(position.translate(0, -position.character), position)).trimEnd();
    if (!lastChar || lastChar.trimStart() == "[") {
      const toml = this.taipyContext.getToml(getOriginalUri(document.uri).toString());
      return (toml[Taipy] ? nodeTypes : [Taipy, ...nodeTypes]).map((nodeType) => {
        const ci = new CompletionItem(nodeType);
        ci.insertText = lastChar
          ? new SnippetString(nodeType + ".").appendPlaceholder("element name")
          : new SnippetString("[" + nodeType + ".").appendPlaceholder("element name").appendTabstop().appendText("]");
        return ci;
      });
    }
    const linkProp = validLinks.find((l) => lastChar.split(/\s+|=/).indexOf(l) != -1);
    if (!linkProp) {
      return [];
    }
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
                  .map((nodeName) => {
                    const ci = new CompletionItem(nodeName);
                    const st = new SnippetString();
                    let quoted = false;
                    if (lastChar.endsWith("[") || lastChar.endsWith(",")) {
                      st.appendText('"');
                      quoted = true;
                    } else if (lastChar.endsWith('"')) {
                      st.appendText(", ");
                    }
                    st.appendText(nodeName);
                    if (quoted) {
                      st.appendText('", ');
                    }
                    ci.insertText = st;
                    return ci;
                  })
              );
            }
          }
        }
      }
    }
    return [];
  }
}
