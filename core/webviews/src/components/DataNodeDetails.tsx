import { DataNodeDetailsProps } from "../../../shared/views";

const getAsString = (val: string | string[]) => Array.isArray(val) ? (val as string[]).join(", ") : typeof val == "string" ? val : JSON.stringify(val);

const DataNodePanel = ({ nodeType, nodeName, node }: DataNodeDetailsProps) => (
    <div className="taipy-datanode-panel" >
      <h2>{nodeType}: {nodeName}</h2>
      <ul>
        {Object.entries(node).map(([k, n]) => (
          <li key={k}>
            {k}: {getAsString(n)}
          </li>
        ))}
      </ul>
    </div>
  );

export default DataNodePanel;
