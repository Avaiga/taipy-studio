import { stringify } from "@iarna/toml";
import {
  CancellationToken,
  commands,
  CustomTextEditorProvider,
  DataTransfer,
  DocumentDropEdit,
  DocumentDropEditProvider,
  ExtensionContext,
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

import { configFilePattern, getCspScriptSrc, getNonce, textUriListMime } from "../utils/utils";
import { revealConfigNodeCmd } from "../utils/commands";
import {
  getCleanPerpsectiveUriString,
  getNodeFromUri,
  getOriginalDocument,
  getOriginalUri,
  getPerspectiveFromUri,
  getPerspectiveUri,
  isUriEqual,
} from "../contentProviders/PerpectiveContentProvider";
import {
  CreateLink,
  CreateNode,
  DeleteLink,
  GetNodeName,
  Refresh,
  RemoveExtraEntities,
  RemoveNode,
  SaveDocument,
  Select,
  SetExtraEntities,
  SetPositions,
  UpdateExtraEntities,
} from "../../shared/commands";
import { EditorAddNodeMessage, ViewMessage } from "../../shared/messages";
import { ConfigEditorId, ConfigEditorProps, containerId, webviewsLibraryDir, webviewsLibraryName } from "../../shared/views";
import { TaipyStudioSettingsName } from "../utils/constants";
import { getInvalidEntityTypeForPerspective, getNewNameInputError, getNewNameInputPrompt, getNewNameInputTitle } from "../utils/l10n";
import { getChildType } from "../../shared/toml";
import { Context } from "../context";
import { getDefaultContent, getDescendantProperties, getParentType, getPropertyToDropType, getPropertyValue, toDisplayModel } from "../utils/toml";
import { Positions } from "../../shared/diagram";

interface EditorCache {
  positions?: Positions;
  extraEntities?: string;
  [key: string]: unknown;
}
interface ProviderCache {
  [key: string]: EditorCache;
}

const nodeTypes = ["datanode", "task", "pipeline", "scenario"];

export class ConfigEditorProvider implements CustomTextEditorProvider, DocumentDropEditProvider {
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

  private readonly extensionPath: Uri;
  // Perspective Uri => cache
  private cache: ProviderCache;
  // original Uri => perspective Id => panels
  private panelsByUri: Record<string, Record<string, WebviewPanel[]>> = {};

  private constructor(private readonly context: ExtensionContext, private readonly taipyContext: Context) {
    this.extensionPath = context.extensionUri;
    this.cache = context.workspaceState.get(ConfigEditorProvider.cacheName, {} as ProviderCache);
    context.subscriptions.push(languages.registerDocumentDropEditProvider({ pattern: configFilePattern }, this));
    commands.registerCommand("taipy.config.clearCache", this.clearCache, this);
    commands.registerCommand("taipy.diagram.addNode", this.addNodeToCurrentDiagram, this);
  }

  async provideDocumentDropEdits(
    document: TextDocument,
    position: Position,
    dataTransfer: DataTransfer,
    token: CancellationToken
  ): Promise<DocumentDropEdit | undefined> {
    const enabled = workspace.getConfiguration(TaipyStudioSettingsName, document).get("editor.drop.enabled", true);
    if (!enabled) {
      return undefined;
    }

    if (!dataTransfer || token.isCancellationRequested) {
      return undefined;
    }
    const urlList = await dataTransfer.get(textUriListMime)?.asString();
    if (!urlList) {
      return undefined;
    }
    const uris: Uri[] = [];
    urlList.split("\n").forEach((u) => {
      try {
        u && uris.push(Uri.parse(u, true));
      } catch {
        console.warn("provideDocumentDropEdits: Cannot parse ", u);
      }
    });
    if (!uris.length) {
      return undefined;
    }
    const dropEdit = new DocumentDropEdit("");
    if (isUriEqual(uris[0], document.uri)) {
      // TODO handle multi-uris case (but you can't drag more than one treeItem ...)
      const [nodeType, nodeName] = getPerspectiveFromUri(uris[0]).split(".", 2);
      const properties = getPropertyToDropType(nodeType);
      if (nodeName) {
        const line = document.lineAt(position.line);
        const lineProperty = line.text.split("=", 2)[0];
        if (properties.some((p) => p == lineProperty.trim())) {
          const endPos = line.text.lastIndexOf("]");
          const startPos = line.text.indexOf("[", lineProperty.length + 1);
          if (position.character <= endPos && position.character > startPos) {
            const lastChar = line.text.substring(0, position.character).trim().at(-1);
            if (lastChar == '"' || lastChar == "'" || lastChar == "[" || lastChar == ",") {
              dropEdit.insertText = (lastChar == '"' || lastChar == "'" ? ", " : "") + '"' + nodeName + '"' + (lastChar == "," ? ", " : "");
            }
          }
        }
      }
    } else {
      const node = getNodeFromUri(uris[0]);
      if (node) {
        const lines: string[] = ["", "[" + getPerspectiveFromUri(uris[0]) + "]"];
        node.split("\n").forEach((l) => lines.push(l && "\t" + l));
        dropEdit.insertText = lines.join("\n");
      }
    }
    return dropEdit;
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

  private addNodeToCurrentDiagram(item: TreeItem) {
    this.addNodeToActiveDiagram(item.contextValue, item.label as string);
  }

  private addNodeToActiveDiagram(nodeType: string, nodeName: string, check = false) {
    for (let pps of Object.values(this.panelsByUri)) {
      for (let [pId, ps] of Object.entries(pps)) {
        const panel = ps.find((p) => p.active);
        if (panel) {
          if (check) {
            const perspType = pId.split(".", 2)[0];
            let childType = perspType;
            while ((childType = getChildType(childType))) {
              if (childType == nodeType) {
                break;
              }
            }
            if (!childType) {
              window.showWarningMessage(getInvalidEntityTypeForPerspective(perspType, nodeType));
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

  async updateWebview(uri: Uri, isDirty = false) {
    const originalUri = getOriginalUri(uri);
    const baseUri = originalUri.toString();
    const panelsByPersp = this.panelsByUri[baseUri];
    const toml = this.taipyContext.getToml(baseUri);
    if (panelsByPersp) {
      Object.entries(panelsByPersp).forEach(([perspectiveId, panels]) => {
        const cache = this.getCache(getPerspectiveUri(originalUri, perspectiveId).toString());
        const model = toDisplayModel(toml, cache.positions);
        panels.forEach((p) => {
          try {
            p.webview.postMessage({
              viewId: ConfigEditorId,
              props: {
                displayModel: model,
                perspectiveId: perspectiveId,
                baseUri: baseUri,
                extraEntities: cache.extraEntities,
                isDirty: isDirty
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
   *
   *
   */
  public async resolveCustomTextEditor(document: TextDocument, webviewPanel: WebviewPanel, token: CancellationToken): Promise<void> {
    // Setup initial content for the webview
    webviewPanel.webview.options = {
      enableScripts: true,
    };
    // retrieve and work with the original document
    const realDocument = await getOriginalDocument(document);

    await this.taipyContext.ReadTomlIfNeeded(realDocument);

    const perspId = getPerspectiveFromUri(document.uri);
    const originalUri = getOriginalUri(document.uri).toString();
    this.panelsByUri[originalUri] = this.panelsByUri[originalUri] || {};
    this.panelsByUri[originalUri][perspId] = this.panelsByUri[originalUri][perspId] || [];
    this.panelsByUri[originalUri][perspId].push(webviewPanel);

    webviewPanel.webview.html = this.getHtmlForWebview(webviewPanel.webview, document);

    const docListener = (textDocument: TextDocument) => {
      if (isUriEqual(document.uri, textDocument.uri)) {
        this.updateWebview(document.uri, textDocument.isDirty);
      }
    }

    // Hook up event handlers so that we can synchronize the webview with the text document.
    this.taipyContext.registerDocChangeListener(docListener, this);

    // Receive message from the webview.
    const receiveMessageSubscription = webviewPanel.webview.onDidReceiveMessage((e) => {
      switch (e.command) {
        case Select:
          this.revealSection(document.uri, e.id, e.msg);
          return;
        case Refresh:
          this.updateWebview(document.uri);
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
          this.getNodeName(realDocument.uri, e.nodeType);
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

  private saveDocument(document: TextDocument) {
    document.isDirty && document.save();
  }

  private applyEdits(uri: Uri, edits: TextEdit[]) {
    if (edits.length) {
      const we = new WorkspaceEdit();
      we.set(uri, edits);
      workspace.applyEdit(we);
    }
  }

  private deleteLink(realDocument: TextDocument, sourceType: string, sourceName: string, targetType: string, targetName: string) {
    this.applyEdits(realDocument.uri, this.createOrDeleteLink(realDocument, sourceType, sourceName, targetType, targetName, false, false));
  }

  private createLink(realDocument: TextDocument, sourceType: string, sourceName: string, targetType: string, targetName: string) {
    this.applyEdits(realDocument.uri, this.createOrDeleteLink(realDocument, sourceType, sourceName, targetType, targetName, true, false));
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

    const toml = this.taipyContext.getToml(realDocument.uri.toString());
    const sectionHead = "[" + nodeType + "." + nodeName + "]";
    const [links, found] = getPropertyValue(toml, [] as string[], nodeType, nodeName, property);
    if (!create && links.length == 0) {
      return edits;
    }
    let sectionFound = false;
    for (let i = 0; i < realDocument.lineCount; i++) {
      const line = realDocument.lineAt(i);
      const text = line.text.trim();
      if (sectionFound) {
        if (text.split("=", 2)[0].trim() == property) {
          const targetFound = (!create && deleteAll) || links.some((n) => n == childName);
          if (create == targetFound || (!found && !create && deleteAll)) {
            break;
          }
          const range = line.range.with({ start: line.range.start.with({ character: line.firstNonWhitespaceCharacterIndex }) });
          const newLinks = create ? [...links, childName] : deleteAll ? [] : links.filter((l) => l != childName);
          edits.push(TextEdit.replace(range, property + " = " + stringify.value(newLinks).trimEnd().split(/\r\n|\n/).map(e => e.trim()).join(" ")));
          break;
        }
        if (text.startsWith("[")) {
          //property not found in section
          break;
        }
      }
      if (!sectionFound && text == sectionHead) {
        if (!found) {
          const start =
            i + 1 < realDocument.lineCount ? realDocument.lineAt(i + 1).text.substring(0, realDocument.lineAt(i + 1).firstNonWhitespaceCharacterIndex) : "";
          edits.push(TextEdit.insert(line.range.end, "\n" + start + property + " = " + stringify.value(create ? [childName] : []).trimEnd()));
          break;
        }
        sectionFound = true;
      }
    }
    return edits;
  }

  private async getNodeName(uri: Uri, nodeType: string) {
    const entity = this.taipyContext.getToml(uri.toString())[nodeType] || {};
    const nodeName = Object.keys(entity).sort().reduce((pv, name) => {
      if (name.toLowerCase() == pv.toLowerCase()) {
        const parts = pv.split("-", 2);
        if (parts.length == 1) {
          return parts[0] + "-1";
        } else {
          return parts[0] + "-" + (parseInt(parts[1]) + 1);
        }
      }
      return pv;
    }, nodeType + "-1");
    const validateNodeName = (value: string) => {
      if (!value || /[\s\.]/.test(value) || value.toLowerCase() == "default") {
        return getNewNameInputError(nodeType, value, true);
      }
      if (Object.keys(entity).some((n) => n.toLowerCase() == value.toLowerCase())) {
        return getNewNameInputError(nodeType, value);
      }
      return undefined as string;
    };
    const newName = await window.showInputBox({
      prompt: getNewNameInputPrompt(nodeType),
      title: getNewNameInputTitle(nodeType),
      validateInput: validateNodeName,
      value: nodeName,
    });
    if (newName) {
      this.addNodeToActiveDiagram(nodeType, newName);
    }
  }

  private createNode(realDocument: TextDocument, perspectiveUri: Uri, nodeType: string, nodeName: string) {
    const perspectiveId = getPerspectiveFromUri(perspectiveUri);
    const [perspType, perspName] = perspectiveId.split(".", 2);
    const uri = realDocument.uri;
    const toml = this.taipyContext.getToml(uri.toString());
    const node = toml[nodeType] && toml[nodeType][nodeName];
    const edits = [] as TextEdit[];
    if (getParentType(nodeType) == perspType && toml[perspType] && toml[perspType][perspName]) {
      this.createOrDeleteLink(realDocument, perspType, perspName, nodeType, nodeName, true, false, edits);
    } else {
      this.updateExtraEntitiesInCache(perspectiveUri, `${nodeType}.${nodeName}`);
    }
    if (!node) {
      edits.push(TextEdit.insert(
        realDocument.lineCount ? realDocument.lineAt(realDocument.lineCount - 1).range.end : new Position(0, 0),
        "\n" + stringify(getDefaultContent(nodeType, nodeName)).trimEnd() + "\n"
      ));
    }
    this.applyEdits(uri, edits);
  }

  private removeNodeFromPerspective(realDocument: TextDocument, nodeType: string, nodeName: string) {
    const uri = realDocument.uri;
    const toml = this.taipyContext.getToml(uri.toString());
    const node = toml[nodeType] && toml[nodeType][nodeName];
    if (!node) {
      return false;
    }
    const edits = [] as TextEdit[];
    getDescendantProperties(nodeType).forEach((p) => p && this.createOrDeleteLink(realDocument, nodeType, nodeName, p, "", false, true, edits));
    const parentType = getParentType(nodeType);
    const pp = getDescendantProperties(parentType);
    toml[parentType] && Object.entries(toml[parentType]).forEach(([parentName, v]) => {
      pp.forEach((property, idx) => {
        if (property && Array.isArray(v[property]) && v[property].some((n: string) => n == nodeName)) {
          if (idx == 0) {
            // input property: reverse order
            this.createOrDeleteLink(realDocument, nodeType, nodeName, parentType, parentName, false, false, edits)
          } else {
            // output property
            this.createOrDeleteLink(realDocument, parentType, parentName, nodeType, nodeName, false, false, edits)
          }
        }
      });
    });
    this.applyEdits(realDocument.uri, edits);
    return true;
  }

  private setPositions(docUri: Uri, positions: Positions) {
    let modified = false;
    const perspUri = getCleanPerpsectiveUriString(docUri)
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
      extraEntities.split(";").forEach((e) => ee.indexOf(e) == -1 && ee.push(e));
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
        p > -1 && ee.splice(p);
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

  private joinPaths(...pathSegments: string[]): Uri {
    // TODO remove dist from production ?
    return Uri.joinPath(this.extensionPath, "dist", ...pathSegments);
  }

  private getHtmlForWebview(webview: Webview, document: TextDocument) {
    // Get the local path to main script run in the webview, then convert it to a uri we can use in the webview.
    // Script to handle user action
    const scriptUri = webview.asWebviewUri(this.joinPaths(webviewsLibraryDir, webviewsLibraryName));
    // CSS file to handle styling
    const styleUri = webview.asWebviewUri(this.joinPaths(webviewsLibraryDir, "config-editor.css"));

    const codiconsUri = webview.asWebviewUri(this.joinPaths("@vscode/codicons", "dist", "codicon.css"));

    const config = workspace.getConfiguration(TaipyStudioSettingsName, document);
    const configObj = nodeTypes.reduce(
      (co, nodeType) => {
        co["icons"][nodeType] = config.get("diagram." + nodeType + ".icon", "refresh");
        return co;
      },
      { icons: {} }
    );

    const cssVars = nodeTypes.map((nodeType) => "--taipy-" + nodeType + "-color:" + config.get("diagram." + nodeType + ".color", "cyan") + ";").join(" ");
    // Use a nonce to only allow a specific script to be run.
    const nonce = getNonce();
    return `<html style="${cssVars}">
              <head>
                  <meta charSet="utf-8"/>
                  <meta http-equiv="Content-Security-Policy" 
                        content="default-src 'none';
                        img-src vscode-resource: https:;
                        font-src ${webview.cspSource};
                        style-src ${webview.cspSource} 'unsafe-inline';
                        script-src ${getCspScriptSrc(nonce)};">             
                  <meta name="viewport" content="width=device-width, initial-scale=1.0">
                  <link href="${styleUri}" rel="stylesheet" />
                  <link href="${codiconsUri}" rel="stylesheet" />
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
