import { useEffect, useRef, useState } from "react";
import { ViewMessage } from "../../shared/messages";
import {
  DataNodeDetailsId,
  DataNodeDetailsProps,
  NoDetailsId,
  NoDetailsProps,
} from "../../shared/views";
import NoDetails from "./components/NoDetails";
import DataNodeDetails from "./components/DataNodeDetails";

const WebView = () => {
  const [message, setMessage] = useState<ViewMessage>();

  useEffect(() => {
    // Manage Post Message reception
    window.addEventListener("message", (event) => {
      setMessage(event.data as ViewMessage);
    });
  }, []);

  if (message) {
    switch (message.name) {
        case NoDetailsId:
          return <NoDetails {...(message.props as NoDetailsProps)} />;
        case DataNodeDetailsId:
          return (
            <DataNodeDetails {...(message.props as DataNodeDetailsProps)} />
          );
        default:
          break;
    }
  }
  return <NoDetails message={"No selected element."} />;
};

export default WebView;
