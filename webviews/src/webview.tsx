import { useEffect, lazy, useState, Suspense } from "react";

import { ViewMessage } from "../../shared/messages";
import {
  DataNodeDetailsId,
  DataNodeDetailsProps,
  NoDetailsId,
  NoDetailsProps,
} from "../../shared/views";

const NoDetails = lazy(() => import(/* webpackChunkName: "NoDetails" */"./components/NoDetails"));
const DataNodeDetails = lazy(() => import(/* webpackChunkName: "DataNodeDetails" */"./components/DataNodeDetails"));

const Loading = () => <div>Loading...</div>;

const WebView = () => {
  const [message, setMessage] = useState<ViewMessage>();

  useEffect(() => {
    // Manage Post Message reception
    const messageListener = (event: MessageEvent) => setMessage(event.data as ViewMessage);
    window.addEventListener("message", messageListener);
    return () => window.removeEventListener("message", messageListener);
  }, []);

  if (message) {
    switch (message.name) {
      case NoDetailsId:
        return (
          <Suspense fallback={<Loading />}>
            <NoDetails {...(message.props as NoDetailsProps)} />
          </Suspense>
        );
      case DataNodeDetailsId:
        return (
          <Suspense fallback={<Loading />}>
            <DataNodeDetails {...(message.props as DataNodeDetailsProps)} />
          </Suspense>
        );
      default:
        break;
    }
  }
  return (
    <Suspense fallback={<Loading />}>
      <NoDetails message={"No selected element."} />
    </Suspense>
  );
};

export default WebView;
