import { AbstractReactFactory, GenerateModelEvent, GenerateWidgetEvent, AbstractModelFactory } from "@projectstorm/react-canvas-core";
import { DiagramEngine } from "@projectstorm/react-diagrams-core";
import { DefaultNodeModel } from "@projectstorm/react-diagrams";
import { TaipyPortModel } from "./models";
import NodeWidget from "./NodeWidget";

export class TaipyNodeFactory extends AbstractReactFactory<DefaultNodeModel, DiagramEngine> {
  private baseUri: string;
  constructor(nodeType: string) {
    super(nodeType);
    this.baseUri = "";
  }

  setBaseUri(baseUri: string) {
    this.baseUri = baseUri;
  }

  generateReactWidget(event: GenerateWidgetEvent<DefaultNodeModel>): JSX.Element {
    return <NodeWidget engine={this.engine} node={event.model} baseUri={this.baseUri} />;
  }

  generateModel(_: GenerateModelEvent): DefaultNodeModel {
    return new DefaultNodeModel();
  }
}

export class TaipyPortFactory extends AbstractModelFactory<TaipyPortModel, DiagramEngine> {
  constructor() {
    super("taipy-port");
  }

  generateModel(_: GenerateModelEvent): TaipyPortModel {
    return new TaipyPortModel({ type: "taipy-port", name: "fred" });
  }
}
