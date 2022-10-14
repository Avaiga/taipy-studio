import { MouseEvent, useEffect, useRef } from "react";
import { DefaultNodeModel } from "@projectstorm/react-diagrams";
import { CanvasWidget } from "@projectstorm/react-canvas-core";
import * as deepEqual from "fast-deep-equal";

import { ConfigEditorProps, perspectiveRootId } from "../../../shared/views";
import { postGetNodeName, postRefreshMessage, postSetExtraEntities } from "../utils/messaging";
import { applyPerspective, getNodeTypes } from "../utils/toml";
import { EditorAddNodeMessage } from "../../../shared/messages";
import { getNodeIcon } from "../utils/config";
import {
  diagramListener,
  getLinkId,
  getModelLinks,
  getModelNodes,
  getNewName,
  getNodeId,
  initDiagram,
  populateModel,
  relayoutDiagram,
  setNodeContext,
  showNode,
} from "../utils/diagram";
import { TaipyDiagramModel } from "../projectstorm/models";
import { applySmallChanges } from "../utils/smallModelChanges";

const [engine, dagreEngine] = initDiagram();

const relayout = () => relayoutDiagram(engine, dagreEngine);

const onCreateNode = (evt: MouseEvent<HTMLDivElement>) => {
  const nodeType = evt.currentTarget.dataset.nodeType;
  nodeType && postGetNodeName(nodeType, getNewName(engine.getModel(), nodeType));
};

const Editor = ({ toml: propsToml, positions, perspectiveId, baseUri, extraEntities: propsExtraEntities }: ConfigEditorProps) => {
  const oldToml = useRef<Record<string, any>>();
  const oldPerspId = useRef<string>();

  const [toml, extraEntities] = applyPerspective(propsToml, perspectiveId, propsExtraEntities);

  useEffect(() => {
    propsExtraEntities && extraEntities && extraEntities != propsExtraEntities  && postSetExtraEntities(extraEntities);
  }, [propsExtraEntities, extraEntities]);

  useEffect(() => {
    // Manage Post Message reception
    const messageListener = (event: MessageEvent) => {
      event.data?.editorMessage && showNode(engine, event.data as EditorAddNodeMessage);
    };
    window.addEventListener("message", messageListener);
    return () => window.removeEventListener("message", messageListener);
  }, []);

  useEffect(() => {
    getModelNodes(engine.getModel()).forEach((node) => setNodeContext(engine, node as DefaultNodeModel, baseUri));
    if (!toml || (perspectiveId == oldPerspId.current && deepEqual(oldToml.current, toml))) {
      return;
    }
    if (oldToml.current  && perspectiveId == oldPerspId.current && applySmallChanges(engine.getModel(), toml, oldToml.current)) {
      oldToml.current = toml;
      return;
    }

    oldToml.current = toml;
    oldPerspId.current = perspectiveId;

    // clear model
    const model = new TaipyDiagramModel();
    // populate model
    populateModel(toml, model);
    // add listener to Model
    model.registerListener(diagramListener);

    if (positions && Object.keys(positions).length) {
      getModelNodes(model).forEach((node) => {
        const dNode = node as DefaultNodeModel;
        const pos = positions[getNodeId(dNode)];
        if (pos && Array.isArray(pos[0])) {
          dNode.setPosition(pos[0][0], pos[0][1]);
        }
      });
      getModelLinks(model).forEach((link) => {
        const linkId = getLinkId(link);
        if (linkId) {
          const pos = positions[linkId];
          if (pos) {
            link.setPoints(pos.map((p) => link.point(p[0], p[1])));
          }
        }
      });
    } else {
      setTimeout(relayout, 500);
    }
    engine.setModel(model);
  }, [toml, positions, baseUri]);

  return (
    <div className="diagram-root">
      <div className="diagram-icon-group">
        <div className="diagram-button icon" title="re-layout" onClick={relayout}>
          <i className="codicon codicon-layout"></i>
        </div>
        <div className="diagram-button icon" title="refresh" onClick={postRefreshMessage}>
          <i className="codicon codicon-refresh"></i>
        </div>
      </div>
      <div>{perspectiveId != perspectiveRootId ? <h2>{perspectiveId}</h2> : ""}</div>
      <div className="diagram-icon-group">
        {getNodeTypes(perspectiveId).map((nodeType) => (
          <div className={"diagram-button icon " + nodeType.toLowerCase()} title={nodeType} key={nodeType} data-node-type={nodeType} onClick={onCreateNode}>
            <i className={"codicon codicon-" + getNodeIcon(nodeType)}></i>
          </div>
        ))}
      </div>
      <div className="diagram-widget">
        <CanvasWidget engine={engine} />
      </div>
    </div>
  );
};

export default Editor;
