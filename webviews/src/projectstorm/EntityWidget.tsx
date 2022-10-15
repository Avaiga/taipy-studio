import { useCallback } from "react";
import { DiagramEngine } from "@projectstorm/react-diagrams-core";
import styled from "@emotion/styled";
import { DefaultNodeModel, DefaultPortLabel, DefaultPortModel } from "@projectstorm/react-diagrams";
import { getNodeContext } from "../utils/diagram";

namespace S {
  export const Node = styled.div<{ background?: string; selected?: boolean }>`
    background-color: ${(p) => p.background};
    border-radius: 5px;
    font-family: sans-serif;
    color: white;
    border: solid 2px black;
    overflow: visible;
    font-size: 11px;
    border: solid 2px ${(p) => (p.selected ? "rgb(0,192,255)" : "black")};
  `;

  export const Title = styled.div`
    background: rgba(0, 0, 0, 0.3);
    display: flex;
    white-space: nowrap;
    justify-items: center;
  `;

  export const TitleName = styled.div`
    flex-grow: 1;
    padding: 5px 5px;
  `;

  export const Ports = styled.div`
    display: flex;
    background-image: linear-gradient(rgba(0, 0, 0, 0.1), rgba(0, 0, 0, 0.2));
  `;

  export const PortsContainer = styled.div`
    flex-grow: 1;
    display: flex;
    flex-direction: column;
    &:first-of-type {
      margin-right: 10px;
    }
    &:only-child {
      margin-right: 0px;
    }
  `;
}

interface EntityProps {
  node: DefaultNodeModel;
  engine: DiagramEngine;
  baseUri: string;
}

const EntityWidget = ({ node, baseUri, engine }: EntityProps) => {
  const generatePort = useCallback(
    (port: DefaultPortModel) => {
      return <DefaultPortLabel engine={engine} port={port} key={port.getID()} />;
    },
    [engine]
  );

  return (
    <S.Node
      data-default-node-name={node.getOptions().name}
      data-vscode-context={getNodeContext(node, baseUri)}
      selected={node.isSelected()}
      background={node.getOptions().color}
    >
      <S.Title>
        <S.TitleName>{node.getOptions().name}</S.TitleName>
      </S.Title>
      <S.Ports>
        <S.PortsContainer>{node.getInPorts().map(generatePort)}</S.PortsContainer>
        <S.PortsContainer>{node.getOutPorts().map(generatePort)}</S.PortsContainer>
      </S.Ports>
    </S.Node>
  );
};

export default EntityWidget;