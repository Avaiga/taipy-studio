import { useCallback, DragEvent as ReactDragEvent } from "react";
import { DataNodeDetailsProps } from "../../../shared/views";

const getAsString = (val: string | string[]) => Array.isArray(val) ? (val as string[]).join(", ") : typeof val == "string" ? val : JSON.stringify(val);

const DataNodePanel = ({ nodeType, name, node }: DataNodeDetailsProps) => {
  const onDragStart = useCallback((e: ReactDragEvent) => {
    const nodeContent = encodeURIComponent(Object.keys(node).filter(k => typeof node[k] == "string" || Array.isArray(node[k])).map(k => k + " = " + (typeof node[k] == "string" ? '"' + node[k] + '"' : JSON.stringify(node[k]))).join("\n") + "\n");
    e.dataTransfer.setData("text/uri-list", encodeURI("taipy-perspective://nowhere.fast/?taipy-perspective=" + nodeType + "." + name + "&taipy-node=" + nodeContent));
    console.log("onDragStart", e);
  }, [node]);

  return (
    <div className="taipy-datanode-panel" draggable onDragStart={onDragStart}>
      <h2>{nodeType}: {name}</h2>
      <ul>
        {Object.keys(node).map((key) => (
          <li key={key}>
            {key}: {getAsString(node[key])}
          </li>
        ))}
      </ul>
    </div>
  );
};

export default DataNodePanel;
