import { useCallback, DragEvent } from "react";
import { DataNodeDetailsProps } from "../../../shared/views";

const getAsString = (val: string | string[]) => Array.isArray(val) ? (val as string[]).join(", ") : typeof val == "string" ? val : JSON.stringify(val);

const DataNodePanel = ({ nodeType, name, node }: DataNodeDetailsProps) => {
  const onDragStart = useCallback((e: DragEvent) => {
    const nodeContent = encodeURIComponent(Object.entries(node).filter(([_, n]) => typeof n == "string" || Array.isArray(n)).map(([k, n]) => k + " = " + (typeof n == "string" ? '"' + n + '"' : JSON.stringify(n))).join("\n") + "\n");
    e.dataTransfer.setData("text/uri-list", encodeURI("taipy-perspective://nowhere.fast/?taipy-perspective=" + nodeType + "." + name + "&taipy-node=" + nodeContent));
    console.log("onDragStart", e);
  }, [node]);

  return (
    <div className="taipy-datanode-panel" draggable onDragStart={onDragStart}>
      <h2>{nodeType}: {name}</h2>
      <ul>
        {Object.entries(node).map(([k, n]) => (
          <li key={k}>
            {k}: {getAsString(n)}
          </li>
        ))}
      </ul>
    </div>
  );
};

export default DataNodePanel;
