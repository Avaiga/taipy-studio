import { Fragment, MouseEvent, useCallback } from "react";

import { postEditProperty } from "../utils/messaging";
import { DataNodeDetailsProps } from "../../../shared/views";

const getAsString = (val: string | string[]) => (Array.isArray(val) ? (val as string[]).join(", ") : typeof val == "string" ? val : JSON.stringify(val));

const DataNodePanel = ({ nodeType, nodeName, node }: DataNodeDetailsProps) => {

  const editPropertyValue = useCallback((evt: MouseEvent<HTMLDivElement>) => {
    const propertyName = evt.currentTarget.dataset.propertyName;
    postEditProperty(nodeType, nodeName, propertyName, propertyName && node[propertyName]);
  }, [nodeType, nodeName, node]);

  return (
    <div className="taipy-datanode-panel">
      <h2>
        {nodeType}: {nodeName}
      </h2>
      <div className="property-grid">
        {Object.entries(node).map(([k, n]) => (
          <Fragment key={k}>
            <div>{k}</div>
            <div>{getAsString(n)}</div>
            <div className="panel-button icon" data-property-name={k} title="edit" onClick={editPropertyValue}>
              <i className="codicon codicon-edit"></i>
            </div>
          </Fragment>
        ))}
        <div>New property</div>
        <div></div>
        <div className="panel-button icon" title="edit" onClick={editPropertyValue}>
          <i className="codicon codicon-edit"></i>
        </div>
      </div>
    </div>
  );
};

export default DataNodePanel;
