import { stringify } from "@iarna/toml";
import {
  CancellationToken,
  commands,
  CustomTextEditorProvider,
  DocumentSymbol,
  ExtensionContext,
  l10n,
  languages,
  Position,
  TextDocument,
  TextEdit,
  TreeItem,
  Uri,
  Webview,
  WebviewPanel,
  window,
  workspace,
  WorkspaceEdit,
} from "vscode";

import { configFilePattern, getCspScriptSrc, getDefaultConfig, getNonce, joinPaths } from "../utils/utils";
import { revealConfigNodeCmd } from "../utils/commands";
import {
  getCleanPerpsectiveUriString,
  getOriginalDocument,
  getOriginalUri,
  getPerspectiveFromUri,
  getPerspectiveUri,
  isUriEqual,
} from "../providers/PerpectiveContentProvider";
import {
  CreateLink,
  CreateNode,
  DeleteLink,
  GetNodeName,
  Refresh,
  RemoveExtraEntities,
  RemoveNode,
  SaveAsPngUrl,
  SaveDocument,
  Select,
  SetExtraEntities,
  SetPositions,
  UpdateExtraEntities,
} from "../../shared/commands";
import { EditorAddNodeMessage, ViewMessage } from "../../shared/messages";
import { ConfigEditorId, ConfigEditorProps, containerId, webviewsLibraryDir, webviewsLibraryName } from "../../shared/views";
import { TAIPY_STUDIO_SETTINGS_NAME } from "../utils/constants";
import { getChildType } from "../../shared/childtype";
import { Context } from "../context";
import { getDefaultContent, getDescendantProperties, getParentType, getSectionName, getSymbol, getSymbolArrayValue, getUnsuffixedName, toDisplayModel } from "../utils/symbols";
import { Positions } from "../../shared/diagram";
import { ConfigCompletionItemProvider } from "../providers/CompletionItemProvider";
import { ConfigDropEditProvider } from "../providers/DocumentDropEditProvider";

interface EditorCache {
  positions?: Positions;
  extraEntities?: string;
  [key: string]: unknown;
}
interface ProviderCache {
  [key: string]: EditorCache;
}

const nodeTypes4config = ["datanode", "task", "pipeline", "scenario"];

export class ConfigEditorProvider implements CustomTextEditorProvider {
  static register(context: ExtensionContext, taipyContext: Context): ConfigEditorProvider {
    const provider = new ConfigEditorProvider(context, taipyContext);
    const providerRegistration = window.registerCustomEditorProvider(ConfigEditorProvider.viewType, provider, {
      webviewOptions: { enableFindWidget: true },
    });
    context.subscriptions.push(providerRegistration);
    return provider;
  }

  private static readonly cacheName = "taipy.editor.cache";
  static readonly viewType = "taipy.config.editor.diagram";

  private readonly extensionUri: Uri;
  // Perspective Uri => cache
  private cache: ProviderCache;
  // original Uri => perspective Id => panels
  private panelsByUri: Record<string, Record<string, WebviewPanel[]>> = {};

  private constructor(private readonly context: ExtensionContext, private readonly taipyContext: Context) {
    this.extensionUri = context.extensionUri;
    this.cache = context.workspaceState.get(ConfigEditorProvider.cacheName, {} as ProviderCache);
    // Drop Edit Provider
    context.subscriptions.push(languages.registerDocumentDropEditProvider({ pattern: configFilePattern }, ConfigDropEditProvider.register(this.taipyContext)));
    // Completion Item Provider
    context.subscriptions.push(
      languages.registerCompletionItemProvider({ pattern: configFilePattern }, ConfigCompletionItemProvider.register(this.taipyContext))
    );

    commands.registerCommand("taipy.config.clearCache", this.clearCache, this);
    commands.registerCommand("taipy.diagram.addNode", this.addNodeToCurrentDiagram, this);
    commands.registerCommand("taipy.config.deleteNode", this.deleteConfigurationNode, this);
  }

  async createNewElement(uri: Uri, nodeType: string) {
    const doc = await workspace.openTextDocument(getOriginalUri(uri));
    const nodeName = await this.getNodeName(doc, nodeType, false);
    if (nodeName) {
      if (await this.applyEdits(doc.uri, this.doCreateElement(doc, nodeType, nodeName))) {
        this.addNodeToActiveDiagram(nodeType, nodeName, false);
      }
    }
  }

  private doCreateElement(doc: TextDocument, nodeType: string, nodeName: string, edits: TextEdit[] = []) {
    edits.push(
      TextEdit.insert(
        doc.lineCount ? doc.lineAt(doc.lineCount - 1).range.end : new Position(0, 0),
        "\n" + stringify(getDefaultContent(nodeType, nodeName)).trimEnd() + "\n"
      )
    );
    return edits;
  }

  private clearCache() {
    this.cache = {};
    this.context.workspaceState.update(ConfigEditorProvider.cacheName, this.cache);
  }

  private getPositionsCache(perspectiveUri: string): Positions {
    this.cache[perspectiveUri] = this.cache[perspectiveUri] || { positions: {} };
    return this.cache[perspectiveUri].positions || {};
  }

  private getCache(perspectiveUri: string) {
    this.cache[perspectiveUri] = this.cache[perspectiveUri] || {};
    return this.cache[perspectiveUri];
  }

  private async deleteConfigurationNode(item: TreeItem) {
    const nodeType = item.contextValue;
    const nodeName = item.label as string;
    const answer = await window.showWarningMessage(l10n.t("Do you really want to permanently delete {0}:{1} from the configuration?", nodeType, nodeName.toLowerCase()), "Yes", "No");
    if (answer === "Yes") {
      const uri = getOriginalUri(item.resourceUri);
      const realDocument = await this.taipyContext.getDocFromUri(uri);
      const symbols = this.taipyContext.getSymbols(uri.toString());
      const nameSymbol = getSymbol(symbols, nodeType, nodeName);
      if (!nameSymbol) {
        return false;
      }
      const edits: TextEdit[] = [TextEdit.delete(nameSymbol.range)];
      await this.removeNodeLinks(realDocument, nodeType, nodeName, symbols, edits);
      const res = await this.applyEdits(realDocument.uri, edits);
      if (res) {
        await this.taipyContext.refreshSymbols(realDocument);
        this.updateWebview(realDocument, realDocument.isDirty);
      }
      return res;
    }
  }

  private addNodeToCurrentDiagram(item: TreeItem) {
    this.addNodeToActiveDiagram(item.contextValue, item.label as string);
  }

  private addNodeToActiveDiagram(nodeType: string, nodeName: string, check = false) {
    for (const pps of Object.values(this.panelsByUri)) {
      for (const [pId, ps] of Object.entries(pps)) {
        const panel = ps.find((p) => p.active);
        if (panel) {
          if (check) {
            const perspType = pId.split(".", 2)[0];
            let childType = perspType;
            while ((childType = getChildType(childType))) {
              if (childType === nodeType) {
                break;
              }
            }
            if (!childType) {
              window.showWarningMessage(l10n.t("Cannot show a {0} entity in a {1} Perpective.", nodeType, perspType));
              return;
            }
          }
          try {
            panel.webview.postMessage({
              editorMessage: true,
              nodeType: nodeType,
              nodeName: nodeName,
            } as EditorAddNodeMessage);
          } catch (e) {
            console.log("addNodeToCurrentDiagram: ", e.message || e);
          }
          return;
        }
      }
    }
  }

  async updateWebview(doc: TextDocument, isDirty = false) {
    const originalUri = getOriginalUri(doc.uri);
    const baseUri = originalUri.toString();
    const panelsByPersp = this.panelsByUri[baseUri];
    const symbols = this.taipyContext.getSymbols(baseUri);
    if (panelsByPersp) {
      const realDocument = await getOriginalDocument(doc);
      Object.entries(panelsByPersp).forEach(([perspectiveId, panels]) => {
        const cache = this.getCache(getPerspectiveUri(originalUri, perspectiveId).toString());
        const model = toDisplayModel(realDocument, symbols, cache.positions);
        panels.forEach((p) => {
          try {
            p.webview.postMessage({
              viewId: ConfigEditorId,
              props: {
                displayModel: model,
                perspectiveId: perspectiveId,
                baseUri: baseUri,
                extraEntities: cache.extraEntities,
                isDirty: isDirty,
              } as ConfigEditorProps,
            } as ViewMessage);
          } catch (e) {
            console.log("Looks like this panelView was disposed.", e.message || e);
          }
        });
      });
    }
  }

  /**
   * Called when our custom editor is opened.
   */
  public async resolveCustomTextEditor(document: TextDocument, webviewPanel: WebviewPanel, token: CancellationToken): Promise<void> {
    // Setup initial content for the webview
    webviewPanel.webview.options = {
      enableScripts: true,
      localResourceRoots: [joinPaths(this.extensionUri)],
    };

    // retrieve and work with the original document
    const realDocument = await getOriginalDocument(document);

    await this.taipyContext.readSymbolsIfNeeded(realDocument);

    const perspId = getPerspectiveFromUri(document.uri);
    const originalUri = getOriginalUri(document.uri).toString();
    this.panelsByUri[originalUri] = this.panelsByUri[originalUri] || {};
    this.panelsByUri[originalUri][perspId] = this.panelsByUri[originalUri][perspId] || [];
    this.panelsByUri[originalUri][perspId].push(webviewPanel);

    webviewPanel.webview.html = this.getHtmlForWebview(webviewPanel.webview, document);

    const docListener = (textDocument: TextDocument) => {
      if (isUriEqual(document.uri, textDocument.uri)) {
        this.updateWebview(document, textDocument.isDirty);
      }
    };

    // Hook up event handlers so that we can synchronize the webview with the text document.
    this.taipyContext.registerDocChangeListener(docListener, this);

    // Receive message from the webview.
    const receiveMessageSubscription = webviewPanel.webview.onDidReceiveMessage((e) => {
      switch (e.command) {
        case Select:
          this.revealSection(document.uri, e.id, e.msg);
          return;
        case Refresh:
          this.updateWebview(document);
          break;
        case SetPositions:
          this.setPositions(document.uri, e.positions);
          break;
        case CreateLink:
          this.createLink(realDocument, e.sourceType, e.sourceName, e.targetType, e.targetName);
          break;
        case DeleteLink:
          this.deleteLink(realDocument, e.sourceType, e.sourceName, e.targetType, e.targetName);
          break;
        case CreateNode:
          this.createNode(realDocument, document.uri, e.nodeType, e.nodeName);
          break;
        case RemoveNode:
          this.removeNodeFromPerspective(realDocument, e.nodeType, e.nodeName) && this.removeExtraEntitiesInCache(document.uri, `${e.nodeType}.${e.nodeName}`);
          break;
        case GetNodeName:
          this.getNodeName(realDocument, e.nodeType);
          break;
        case SetExtraEntities:
          this.setExtraEntitiesInCache(document.uri, e.extraEntities);
          break;
        case UpdateExtraEntities:
          this.updateExtraEntitiesInCache(document.uri, e.extraEntities);
          break;
        case RemoveExtraEntities:
          this.removeExtraEntitiesInCache(document.uri, e.extraEntities);
          break;
        case SaveDocument:
          this.saveDocument(realDocument);
          break;
        case SaveAsPngUrl:
          this.saveAsPng(e.url);
          break;
      }
    }, this);

    // clean-up when our editor is closed.
    webviewPanel.onDidDispose(() => {
      this.panelsByUri[originalUri] &&
        this.panelsByUri[originalUri][perspId] &&
        (this.panelsByUri[originalUri][perspId] = this.panelsByUri[originalUri][perspId].filter((p) => p !== webviewPanel));
      receiveMessageSubscription.dispose();
      this.taipyContext.unregisterDocChangeListener(docListener, this);
    });
  }

  private async saveDocument(document: TextDocument) {
    return !document.isDirty || document.save();
  }

  private async saveAsPng(url: string) {
    // eslint-disable-next-line @typescript-eslint/naming-convention
    const newFileUri = await window.showSaveDialog({ filters: { Images: ["png"] } });
    newFileUri && workspace.fs.writeFile(newFileUri, Buffer.from(url.split(",", 2).at(-1), "base64url"));
  }

  private async applyEdits(uri: Uri, edits: TextEdit[]) {
    if (edits?.length) {
      const we = new WorkspaceEdit();
      we.set(uri, edits);
      return workspace.applyEdit(we);
    }
    return false;
  }

  private async deleteLink(realDocument: TextDocument, sourceType: string, sourceName: string, targetType: string, targetName: string) {
    return this.applyEdits(realDocument.uri, this.createOrDeleteLink(realDocument, sourceType, sourceName, targetType, targetName, false, false));
  }

  private async createLink(realDocument: TextDocument, sourceType: string, sourceName: string, targetType: string, targetName: string) {
    return this.applyEdits(realDocument.uri, this.createOrDeleteLink(realDocument, sourceType, sourceName, targetType, targetName, true, false));
  }

  private createOrDeleteLink(
    realDocument: TextDocument,
    sourceType: string,
    sourceName: string,
    targetType: string,
    targetName: string,
    create: boolean,
    deleteAll: boolean,
    edits = [] as TextEdit[]
  ) {
    const reverse = !deleteAll && !getChildType(sourceType);
    const nodeType = reverse ? targetType : sourceType;
    const nodeName = reverse ? targetName : sourceName;
    const childName = reverse ? sourceName : targetName;
    const [inputProp, outputProp] = getDescendantProperties(nodeType);
    const property = deleteAll ? targetType : reverse ? inputProp : outputProp;

    const symbols = this.taipyContext.getSymbols(realDocument.uri.toString());
    const linksSymbol = getSymbol(symbols, nodeType, nodeName, property);
    const links = linksSymbol && getSymbolArrayValue(realDocument, linksSymbol);

    if (!create && links.length === 0) {
      return edits;
    }
    if (linksSymbol) {
        const newLinks = create ? [...links, getSectionName(childName)] : deleteAll ? [] : links.filter((l) => getUnsuffixedName(l) !== childName);
        edits.push(TextEdit.replace(linksSymbol.range, stringify.value(newLinks).trimEnd()));
        return edits;
    } else {
      const nameSymbol = getSymbol(symbols, nodeType, nodeName);
      if (nameSymbol) {
        edits.push(
          TextEdit.insert(nameSymbol.range.end, property + " = " + stringify.value(create ? [getSectionName(childName)] : []) + "\n")
        );
        return edits;
      }
    }
  }

  private async getNodeName(doc: TextDocument, nodeType: string, addNodeToActiveDiagram = true) {
    const symbols = this.taipyContext.getSymbols(doc.uri.toString());
    const typeSymbol = getSymbol(symbols, nodeType);
    const nodeName = (typeSymbol?.children || [])
      .filter(s => s.name.toLowerCase().startsWith(nodeType.toLowerCase()))
      .sort()
      .reduce((pv, s) => {
        if (s.name.toLowerCase() === pv.toLowerCase()) {
          const parts = pv.split("-", 2);
          if (parts.length === 1) {
            return parts[0] + "-1";
          } else {
            return parts[0] + "-" + (parseInt(parts[1]) + 1);
          }
        }
        return pv;
      }, nodeType + "-1");
    const validateNodeName = (value: string) => {
      if (!value || /[\s\.]/.test(value) || value.toLowerCase() === "default") {
        return l10n.t("Entity {0} Name should not contain space, '.' or be empty or be default '{1}'", nodeType, value);
      }
      if (typeSymbol?.children.some(s => s.name.toLowerCase() === value.toLowerCase())) {
        return l10n.t("Another {0} entity has the name {1}", nodeType, value);
      }
      return undefined as string;
    };
    const newName = await window.showInputBox({
      prompt: l10n.t("Enter a name for a new {0} entity.", nodeType),
      title: l10n.t("new {0} name", nodeType),
      validateInput: validateNodeName,
      value: nodeName,
    });
    if (newName && addNodeToActiveDiagram) {
      this.addNodeToActiveDiagram(nodeType, newName);
    }
    return newName;
  }

  private async createNode(realDocument: TextDocument, perspectiveUri: Uri, nodeType: string, nodeName: string) {
    const perspectiveId = getPerspectiveFromUri(perspectiveUri);
    const [perspType, perspName] = perspectiveId.split(".", 2);
    const uri = realDocument.uri;
    const symbols = this.taipyContext.getSymbols(uri.toString());
    const nameSymbol = getSymbol(symbols, nodeType, nodeName);
    const edits = [] as TextEdit[];
    if (getParentType(nodeType) === perspType && getSymbol(symbols, perspType, perspName)) {
      this.createOrDeleteLink(realDocument, perspType, perspName, nodeType, nodeName, true, false, edits);
    } else {
      this.updateExtraEntitiesInCache(perspectiveUri, `${nodeType}.${nodeName}`);
    }
    if (!nameSymbol) {
      this.doCreateElement(realDocument, nodeType, nodeName, edits);
    }
    return this.applyEdits(uri, edits);
  }

  private async removeNodeLinks(realDocument: TextDocument, nodeType: string, nodeName: string, symbols: DocumentSymbol[], edits: TextEdit[] = []) {
    const parentType = getParentType(nodeType);
    const pp = getDescendantProperties(parentType);
    const pTypeSymbol = getSymbol(symbols, parentType);
    pTypeSymbol && pTypeSymbol.children.forEach(parentSymbol => {
        pp.forEach((property, idx) => {
          if (property && getSymbolArrayValue(realDocument, parentSymbol, property).some((n: string) => getUnsuffixedName(n) === nodeName)) {
            if (idx === 0) {
              // input property: reverse order
              this.createOrDeleteLink(realDocument, nodeType, nodeName, parentType, parentSymbol.name, false, false, edits);
            } else {
              // output property
              this.createOrDeleteLink(realDocument, parentType, parentSymbol.name, nodeType, nodeName, false, false, edits);
            }
          }
        });
      });
    return edits;
  }

  private async removeNodeFromPerspective(realDocument: TextDocument, nodeType: string, nodeName: string) {
    const uri = realDocument.uri;
    const symbols = this.taipyContext.getSymbols(uri.toString());
    const nameSymbol = getSymbol(symbols, nodeType, nodeName);
    if (!nameSymbol) {
      return false;
    }
    // edit document
    const edits: TextEdit[] = [];
    getDescendantProperties(nodeType).forEach((p) => p && this.createOrDeleteLink(realDocument, nodeType, nodeName, p, "", false, true, edits));
    await this.removeNodeLinks(realDocument, nodeType, nodeName, symbols, edits);
    const ret = await this.applyEdits(realDocument.uri, edits);
    if (!ret) {
      this.updateWebview(realDocument, realDocument.isDirty);
    }
    return ret;
  }

  private setPositions(docUri: Uri, positions: Positions) {
    let modified = false;
    const perspUri = getCleanPerpsectiveUriString(docUri);
    let pos = this.getPositionsCache(perspUri);
    if (positions) {
      pos = Object.entries(positions).reduce((pv, [k, v]) => {
        modified = true;
        pv[k] = v;
        return pv;
      }, pos);
    }
    if (modified) {
      this.cache[perspUri] = this.cache[perspUri];
      this.cache[perspUri].positions = pos;
      this.context.workspaceState.update(ConfigEditorProvider.cacheName, this.cache);
    }
  }

  private setExtraEntitiesInCache(docUri: Uri, extraEntities: string) {
    const editorCache = this.getCache(getCleanPerpsectiveUriString(docUri));
    if (extraEntities !== editorCache.extraEntities) {
      editorCache.extraEntities = extraEntities;
      this.context.workspaceState.update(ConfigEditorProvider.cacheName, this.cache);
    }
  }

  private updateExtraEntitiesInCache(docUri: Uri, extraEntities: string) {
    if (!extraEntities) {
      return;
    }
    let modified = false;
    const editorCache = this.getCache(getCleanPerpsectiveUriString(docUri));
    if (editorCache.extraEntities) {
      const ee = editorCache.extraEntities.split(";");
      const len = ee.length;
      extraEntities.split(";").forEach((e) => !ee.includes(e) && ee.push(e));
      if (len < ee.length) {
        editorCache.extraEntities = ee.join(";");
        modified = true;
      }
    } else {
      editorCache.extraEntities = extraEntities;
      modified = true;
    }
    if (modified) {
      this.context.workspaceState.update(ConfigEditorProvider.cacheName, this.cache);
    }
  }

  private removeExtraEntitiesInCache(docUri: Uri, extraEntities: string) {
    if (!extraEntities) {
      return;
    }
    const editorCache = this.getCache(getCleanPerpsectiveUriString(docUri));
    if (editorCache.extraEntities) {
      let modified = false;
      const ee = editorCache.extraEntities.split(";");
      const len = ee.length;
      extraEntities.split(";").forEach((e) => {
        const p = ee.indexOf(e);
        p > -1 && ee.splice(p, 1);
      });
      if (len > ee.length) {
        editorCache.extraEntities = ee.length ? ee.join(";") : undefined;
        modified = true;
      }
      if (modified) {
        this.context.workspaceState.update(ConfigEditorProvider.cacheName, this.cache);
      }
    }
  }

  private getHtmlForWebview(webview: Webview, document: TextDocument) {
    // Get the local path to main script run in the webview, then convert it to a uri we can use in the webview.
    // Script to handle user action
    const scriptUri = webview.asWebviewUri(joinPaths(this.extensionUri, webviewsLibraryDir, webviewsLibraryName));
    // CSS file to handle styling
    const styleUri = webview.asWebviewUri(joinPaths(this.extensionUri, webviewsLibraryDir, "config-editor.css"));

    const codiconsUri = webview.asWebviewUri(joinPaths(this.extensionUri, "@vscode/codicons", "dist", "codicon.css"));
    const taipyiconsUri = webview.asWebviewUri(joinPaths(this.extensionUri, webviewsLibraryDir, "taipy-icons.css"));

    const config = workspace.getConfiguration(TAIPY_STUDIO_SETTINGS_NAME);
    const configObj = nodeTypes4config.reduce((co, nodeType) => {
      co.icons[nodeType] = config.get("diagram." + nodeType + ".icon", "codicon-refresh");
      return co;
    }, getDefaultConfig(webview, this.extensionUri));

    const cssVars = nodeTypes4config
      .map((nodeType) => "--taipy-" + nodeType + "-color:" + config.get("diagram." + nodeType + ".color", "cyan") + ";")
      .join(" ");
    // Use a nonce to only allow a specific script to be run.
    const nonce = getNonce();
    return `<html style="${cssVars}">
              <head>
                  <meta charSet="utf-8"/>
                  <meta http-equiv="Content-Security-Policy" 
                        content="default-src 'none';
                        connect-src ${webview.cspSource} https:;
                        img-src ${webview.cspSource} https: data:;
                        font-src ${webview.cspSource};
                        style-src ${webview.cspSource} 'unsafe-inline';
                        script-src ${getCspScriptSrc(nonce)};">             
                  <meta name="viewport" content="width=device-width, initial-scale=1.0">
                  <link href="${styleUri}" rel="stylesheet" />
                  <link href="${codiconsUri}" rel="stylesheet" />
                  <link href="${taipyiconsUri}" rel="stylesheet" />
                  <script nonce="${nonce}" defer type="text/javascript" src="${scriptUri}"></script>
                  <script nonce="${nonce}" type="text/javascript">window.taipyConfig=${JSON.stringify(configObj)};</script>
              </head>
              <body>
                <div id="${containerId}"></div>
              </body>
            </html>`;
  }

  private revealSection(uri: Uri, nodeType: string, name: string) {
    commands.executeCommand(revealConfigNodeCmd, getOriginalUri(uri), nodeType, name);
  }
}
