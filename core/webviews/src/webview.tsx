import { useEffect, lazy, useState, Suspense } from "react";
import * as l10n from "@vscode/l10n";

import { ViewMessage } from "../../shared/messages";
import { ConfigEditorId, ConfigEditorProps, DataNodeDetailsId, DataNodeDetailsProps, NoDetailsId, NoDetailsProps } from "../../shared/views";
import { postRefreshMessage } from "./utils/messaging";

const NoDetails = lazy(() => import(/* webpackChunkName: "NoDetails" */ "./components/NoDetails"));
const DataNodeDetails = lazy(() => import(/* webpackChunkName: "DataNodeDetails" */ "./components/DataNodeDetails"));
const Editor = lazy(() => import(/* webpackChunkName: "Editor" */ "./components/Editor"));

const Loading = () => <div>Loading...</div>;

const WebView = () => {
  const [message, setMessage] = useState<ViewMessage>();

  useEffect(() => {
    // Manage Post Message reception
    const messageListener = (event: MessageEvent) => {
      if (event.data.viewId) {
        setMessage(event.data as ViewMessage);
      }
    };
    window.addEventListener("message", messageListener);
    return () => window.removeEventListener("message", messageListener);
  }, []);

  useEffect(() => {
    message || postRefreshMessage();
  }, [message]);

  if (message) {
    switch (message.viewId) {
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
      case ConfigEditorId:
        return (
          <Suspense fallback={<Loading />}>
            <Editor {...(message.props as ConfigEditorProps)} />
          </Suspense>
        );
      default:
        break;
    }
  }
  return (
    <>
      <div className="icon" title={l10n.t("refresh")} onClick={postRefreshMessage}>
        <i className="codicon codicon-refresh"></i>
      </div>
      <Loading />
    </>
  );
};

export default WebView;
