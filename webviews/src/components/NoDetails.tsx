import { NoDetailsProps } from "../../../shared/views";
import Button from "./Button";

const NoDetails = ({ message }: NoDetailsProps) => {
  return (
    <div className="taipy-panel">
      <div className="icon">
        <i className="codicon codicon-clippy"></i> clippy
      </div>
      <div>
        <span className="taipy-panel-info">{message}</span>
      </div>
      <Button></Button>
      <div className="icon" draggable>
        <i className="codicon codicon-note"></i> note
      </div>
    </div>
  );
};

export default NoDetails;
