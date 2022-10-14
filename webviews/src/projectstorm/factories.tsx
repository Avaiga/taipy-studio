import { AbstractReactFactory, GenerateModelEvent, GenerateWidgetEvent, AbstractModelFactory } from "@projectstorm/react-canvas-core";
import { DiagramEngine } from "@projectstorm/react-diagrams-core";
import { DefaultNodeModel, DefaultNodeWidget } from "@projectstorm/react-diagrams";
import { TaipyPortModel } from "./models";

export class TaipyNodeFactory extends AbstractReactFactory<DefaultNodeModel, DiagramEngine> {
  constructor(nodeType: string) {
    super(nodeType);
  }

  generateReactWidget(event: GenerateWidgetEvent<DefaultNodeModel>): JSX.Element {
    return <DefaultNodeWidget engine={this.engine} node={event.model} data-fred="fred" />;
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
