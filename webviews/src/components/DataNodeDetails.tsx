import { DataNodeDetailsProps, NodeType } from "../../../shared/views";

const DataNodePanel = ({ name, node }: DataNodeDetailsProps) => {
  return (
    <div className="taipy-datanode-panel">
      <h2>Data Node: {name}</h2>
      <ul>
        {Object.keys(node).map((key) => (
          <li key={key}>
            {key}: {Array.isArray(node[key]) ? (node[key] as string[]).join(", ") : node[key]}
          </li>
        ))}
      </ul>
    </div>
  );
};

export default DataNodePanel;
