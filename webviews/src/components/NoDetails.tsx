import Button from "./Button";

interface NoDetailsProps {
  message: string;
}

const NoDetails = ({ message }: NoDetailsProps) => {
  return (
    <div className="taipy-panel">
      <div className="icon">
        <i className="codicon codicon-clippy"></i> clippy
      </div>
      <span className="taipy-panel-info">{message}</span>
      <Button></Button>
      <div className="icon">
        <i className="codicon codicon-note"></i> note
      </div>
    </div>
  );
};

export default NoDetails;
