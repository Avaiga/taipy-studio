import { useEffect, useRef, useState } from "react";
import createEngine, {
  DefaultNodeModel,
  DefaultLinkModel,
  DiagramModel,
  DagreEngine,
  PathFindingLinkFactory,
  DefaultPortModel,
} from "@projectstorm/react-diagrams";
import { CanvasWidget } from "@projectstorm/react-canvas-core";
import * as deepEqual from "fast-deep-equal";
import { getDiff, rdiffResult } from "recursive-diff";

import { ConfigEditorProps } from "../../../shared/views";

const getNodeColor = (nodeType: string) => {
  switch (nodeType) {
    case "DATA_NODE":
      return "red";
    case "JOB":
      return "pink";
    case "PIPELINE":
      return "purple";
    case "SCENARIO":
      return "blue";
    case "TAIPY":
      return "yellow";
    case "TASK":
      return "green";
    default:
      return "rgb(192,0,255)";
  }
};

const engine = createEngine();
const dagreEngine = new DagreEngine({
  graph: {
    rankdir: "LR",
    ranker: "longest-path",
    marginx: 25,
    marginy: 25,
  },
  includeLinks: true,
});

const Editor = ({ content }: ConfigEditorProps) => {
  const [model, setModel] = useState(new DiagramModel());
  const oldContent = useRef<Record<string, any>>();

  useEffect(() => {
    if (!content || deepEqual(content, oldContent.current)) {
      return;
    }
    if (content && oldContent.current) {
      const diff = getDiff(content, oldContent);
      // try to be clever ...
      if (diff.length == 1) {
        if (diff[0].path[0] == "DATA_NODE" && diff[0].path.length > 1) {
          const node = model.getNode(diff[0].path[1] as string);
        }
      }
    }
    const linkModels: DefaultLinkModel[] = [];
    const nodeModels: Record<string, DefaultNodeModel> = {};

    Object.keys(content).forEach((nodeType, tIdx) => {
      if (nodeType == "TAIPY" || nodeType == "JOB") {
        return;
      }
      Object.keys(content[nodeType]).forEach((key, nIdx) => {
        if (key == "default") {
          return;
        }
        const node = new DefaultNodeModel({
          name: `${nodeType}.${key}`,
          color: getNodeColor(nodeType),
        });
        node.setPosition(150, 100 + 100 * tIdx + 10 * nIdx);
        node.addInPort("In");
        node.addOutPort("Out");
        nodeModels[`${nodeType}.${key}`] = node;
      });
    });
    oldContent.current = content;

    // create links Tasks-dataNodes
    Object.keys(nodeModels)
      .filter((key) => key.startsWith("TASK."))
      .forEach((key) => {
        (content.TASK[key.substring(5)].inputs || []).forEach(
          (dnKey: string) => {
            const node = nodeModels["DATA_NODE." + dnKey];
            if (node) {
              linkModels.push(
                (
                  node.getPort("Out") as DefaultPortModel
                ).link<DefaultLinkModel>(
                  nodeModels[key].getPort("In") as DefaultPortModel
                )
              );
            }
          }
        );
        (content.TASK[key.substring(5)].outputs || []).forEach(
          (dnKey: string) => {
            const node = nodeModels["DATA_NODE." + dnKey];
            if (node) {
              linkModels.push(
                (
                  nodeModels[key].getPort("Out") as DefaultPortModel
                ).link<DefaultLinkModel>(node.getPort("In") as DefaultPortModel)
              );
            }
          }
        );
      });

    // create links Pipeline-Tasks
    Object.keys(nodeModels)
      .filter((key) => key.startsWith("PIPELINE."))
      .forEach((key) => {
        (content.PIPELINE[key.substring(9)].tasks || []).forEach(
          (tskKey: string) => {
            const node = nodeModels["TASK." + tskKey];
            if (node) {
              linkModels.push(
                (
                  nodeModels[key].getPort("Out") as DefaultPortModel
                ).link<DefaultLinkModel>(node.getPort("In") as DefaultPortModel)
              );
            }
          }
        );
      });

    // create links Scenario-Pipelines
    Object.keys(nodeModels)
      .filter((key) => key.startsWith("SCENARIO."))
      .forEach((key) => {
        (content.SCENARIO[key.substring(9)].pipelines || []).forEach(
          (tskKey: string) => {
            const node = nodeModels["PIPELINE." + tskKey];
            if (node) {
              linkModels.push(
                (
                  nodeModels[key].getPort("Out") as DefaultPortModel
                ).link<DefaultLinkModel>(node.getPort("In") as DefaultPortModel)
              );
            }
          }
        );
      });

    const dModel = new DiagramModel();
    dModel.addAll(...Object.values(nodeModels), ...linkModels);
    setModel(dModel);

    setTimeout(() => {
      dagreEngine.redistribute(dModel);
      engine
        .getLinkFactories()
        .getFactory<PathFindingLinkFactory>(PathFindingLinkFactory.NAME)
        .calculateRoutingMatrix();
      engine.repaintCanvas();
    }, 500);
  }, [content]);

  engine.setModel(model);

  return <CanvasWidget engine={engine} className="diagram-root" />;
};

export default Editor;
